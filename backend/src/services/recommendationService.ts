import Database from 'better-sqlite3';
import { RecommendationQueryInput } from '../validators/recommendationValidators.js';
import {
  RecommendationResult,
  RecommendedNgo,
  ExcludedNgo,
  RecommendationScoreBreakdown,
  RecommendedDepot,
  MatchedCapability,
  MatchedEquipment,
} from '../types/recommendation.js';
import { AppError } from '../types/index.js';

export const ALL_VERIFICATION_DIMENSIONS = [
  'DOCUMENTED_IN_DDMP',
  'IDENTITY_VERIFIED',
  'CURRENTLY_OPERATIONAL',
  'AVAILABILITY_CONFIRMED',
  'EQUIPMENT_INDEPENDENTLY_VERIFIED',
] as const;

/**
 * Calculates great-circle distance between two geographic coordinates in kilometers
 * using the Haversine formula.
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (isNaN(lat1) || isNaN(lon1) || isNaN(lat2) || isNaN(lon2)) {
    return NaN;
  }
  const R = 6371; // Earth radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Calculates freshness of availability checkin using server timestamp.
 */
export function computeFreshness(
  checkinTimestamp?: string | null,
  status?: string | null,
  validUntil?: string | null
): 'FRESH' | 'AGING' | 'STALE' {
  if (!checkinTimestamp || status === 'INACTIVE_STALE') {
    return 'STALE';
  }

  const now = Date.now();
  const checkinTime = new Date(checkinTimestamp).getTime();
  if (isNaN(checkinTime)) return 'STALE';

  const hoursSince = (now - checkinTime) / (1000 * 60 * 60);

  if (validUntil) {
    const expiry = new Date(validUntil).getTime();
    if (!isNaN(expiry) && expiry < now) {
      return 'STALE';
    }
  }

  if (hoursSince <= 24) return 'FRESH';
  if (hoursSince <= 48) return 'AGING';
  return 'STALE';
}

/**
 * Suggests default capabilities based on incident category.
 */
export function inferCapabilitiesFromCategory(category?: string | null): string[] {
  switch (category) {
    case 'MAROONED_RESCUE':
      return ['WATER_SEARCH_AND_RESCUE', 'EVACUATION_ASSISTANCE'];
    case 'MEDICAL_EMERGENCY':
      return ['MOBILE_MEDICAL_TRIAGE'];
    case 'FOOD_WATER_CRISIS':
      return ['WATER_SANITATION_WASH', 'FOOD_RATION_DISTRIBUTION'];
    case 'INFRASTRUCTURE_BREACH':
      return ['WATER_SEARCH_AND_RESCUE', 'EVACUATION_ASSISTANCE'];
    case 'GENERAL_RELIEF':
      return ['RELIEF_CAMP_LOGISTICS', 'FOOD_RATION_DISTRIBUTION'];
    default:
      return [];
  }
}

/**
 * Suggests default equipment based on incident category.
 */
export function inferEquipmentFromCategory(
  category?: string | null
): Array<{ equipment_type_id: string; min_quantity: number }> {
  switch (category) {
    case 'MAROONED_RESCUE':
      return [
        { equipment_type_id: 'INFLATABLE_BOAT', min_quantity: 1 },
        { equipment_type_id: 'LIFEJACKET', min_quantity: 4 },
      ];
    case 'MEDICAL_EMERGENCY':
      return [{ equipment_type_id: 'MOBILE_MEDICAL_KIT', min_quantity: 1 }];
    case 'FOOD_WATER_CRISIS':
      return [{ equipment_type_id: 'WATER_PURIFIER_RO', min_quantity: 1 }];
    case 'INFRASTRUCTURE_BREACH':
      return [
        { equipment_type_id: 'DEWATERING_PUMP', min_quantity: 1 },
        { equipment_type_id: 'INFLATABLE_BOAT', min_quantity: 1 },
      ];
    case 'GENERAL_RELIEF':
      return [{ equipment_type_id: 'RELIEF_TENT', min_quantity: 2 }];
    default:
      return [];
  }
}

export function createRecommendationService(db: Database.Database) {
  /**
   * Main recommendation engine function.
   * Evaluates all non-deleted NGOs against operational eligibility, calculates explainable
   * composite scores, generates human-readable justification reasons, and captures
   * explicit exclusion reasons for non-matching NGOs.
   */
  function getRecommendations(
    query: RecommendationQueryInput,
    isCoordinator: boolean
  ): RecommendationResult {
    const isDemoMode = Boolean(query.demo_mode);

    // Fetch all non-deleted NGOs
    const allNgos = db
      .prepare(
        `SELECT id, name, legal_name, registration_reference, description,
                primary_contact_name, primary_contact_phone, primary_contact_email,
                is_simulated, created_at
         FROM ngos
         WHERE deleted_at IS NULL
         ORDER BY name ASC`
      )
      .all() as Array<{
        id: string;
        name: string;
        legal_name: string | null;
        registration_reference: string | null;
        description: string | null;
        primary_contact_name: string;
        primary_contact_phone: string;
        primary_contact_email: string | null;
        is_simulated: number;
        created_at: string;
      }>;

    // Prepared statements for associated data
    const getVerificationRecordsStmt = db.prepare(`
      SELECT dimension
      FROM ngo_verification_records
      WHERE ngo_id = ?
        AND is_current = 1
        AND is_verified = 1
        AND (valid_until IS NULL OR valid_until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    `);

    const getLatestAvailabilityStmt = db.prepare(`
      SELECT status, available_personnel_count, certified_helmsmen_count,
             reporting_person_name, reporting_person_phone, operational_notes,
             checkin_timestamp, valid_until
      FROM ngo_availability_logs
      WHERE ngo_id = ?
      ORDER BY checkin_timestamp DESC, id DESC
      LIMIT 1
    `);

    const getOperatingAreasStmt = db.prepare(`
      SELECT id, district, revenue_circle, administrative_scope,
             depot_location_name, depot_latitude, depot_longitude, is_primary_depot
      FROM ngo_operating_areas
      WHERE ngo_id = ?
      ORDER BY is_primary_depot DESC, id ASC
    `);

    const getCapabilitiesStmt = db.prepare(`
      SELECT nc.capability_id, c.name, c.category, nc.certification_level, nc.is_verified
      FROM ngo_capabilities nc
      JOIN capabilities c ON nc.capability_id = c.id
      WHERE nc.ngo_id = ?
      ORDER BY c.name ASC
    `);

    const getEquipmentInventoryStmt = db.prepare(`
      SELECT eq.equipment_type_id, cat.name, cat.category,
             eq.available_quantity, eq.total_quantity, eq.operational_condition,
             eq.storage_location_name, eq.storage_latitude, eq.storage_longitude
      FROM ngo_equipment_inventory eq
      JOIN equipment_catalogue cat ON eq.equipment_type_id = cat.id
      WHERE eq.ngo_id = ? AND eq.operational_condition = 'SERVICEABLE' AND eq.available_quantity > 0
    `);

    const recommendations: RecommendedNgo[] = [];
    const excludedNgos: ExcludedNgo[] = [];

    for (const ngo of allNgos) {
      const exclusionCodes: string[] = [];
      const exclusionReasons: string[] = [];
      const ngoIsSimulated = ngo.is_simulated === 1;

      // 1. Simulation Isolation Gate
      if (!isDemoMode && ngoIsSimulated) {
        exclusionCodes.push('SIMULATION_ISOLATION');
        exclusionReasons.push(
          'Simulated partner excluded from live operational dispatch. Enable Demo Mode to view simulated NGO matching.'
        );
      } else if (isDemoMode && !ngoIsSimulated) {
        exclusionCodes.push('OPERATIONAL_EXCLUDED_IN_DEMO');
        exclusionReasons.push(
          'Operational partner excluded in Demo Mode to ensure strict isolation between synthetic demonstration records and live response assets.'
        );
      }

      // 2. Multi-Dimensional Verification Gate (Enforced strictly in operational mode)
      const verifRows = getVerificationRecordsStmt.all(ngo.id) as Array<{ dimension: string }>;
      const verifiedDimensions = verifRows.map(r => r.dimension);
      const missingDimensions = ALL_VERIFICATION_DIMENSIONS.filter(
        d => !verifiedDimensions.includes(d)
      );
      const isFullyVerified = missingDimensions.length === 0;

      if (!isDemoMode && !isFullyVerified) {
        exclusionCodes.push('UNVERIFIED_GATE_FAILED');
        exclusionReasons.push(
          `Verification gate failed: ${verifiedDimensions.length}/5 dimensions verified. Missing: ${missingDimensions.join(', ')}.`
        );
      }

      // 3. Availability Telemetry Gate
      const latestAvail = getLatestAvailabilityStmt.get(ngo.id) as
        | {
            status: string;
            available_personnel_count: number;
            certified_helmsmen_count: number;
            reporting_person_name: string;
            reporting_person_phone: string;
            operational_notes: string | null;
            checkin_timestamp: string;
            valid_until: string | null;
          }
        | undefined;

      if (!latestAvail) {
        exclusionCodes.push('NO_AVAILABILITY_TELEMETRY');
        exclusionReasons.push('No availability check-in log on record for this partner.');
      } else {
        if (latestAvail.status === 'UNAVAILABLE') {
          exclusionCodes.push('STATUS_UNAVAILABLE');
          exclusionReasons.push('Partner reported current readiness status as UNAVAILABLE.');
        }

        const freshness = computeFreshness(
          latestAvail.checkin_timestamp,
          latestAvail.status,
          latestAvail.valid_until
        );

        if (!isDemoMode && freshness === 'STALE') {
          exclusionCodes.push('STALE_TELEMETRY');
          exclusionReasons.push(
            'Availability check-in is stale (>48 hours old or validity expired). Fresh confirmation required for operational recommendation.'
          );
        }
      }

      // 4. Capability Mismatch Gate
      const capabilities = getCapabilitiesStmt.all(ngo.id) as Array<{
        capability_id: string;
        name: string;
        category: string;
        certification_level: string;
        is_verified: number;
      }>;

      const matchedCaps: MatchedCapability[] = [];
      if (query.required_capabilities && query.required_capabilities.length > 0) {
        for (const reqCap of query.required_capabilities) {
          const match = capabilities.find(
            c => c.capability_id.toLowerCase() === reqCap.toLowerCase()
          );
          if (match) {
            matchedCaps.push({
              capability_id: match.capability_id,
              name: match.name,
              category: match.category,
              certification_level: match.certification_level,
              is_verified: match.is_verified === 1,
            });
          }
        }

        if (matchedCaps.length === 0) {
          exclusionCodes.push('CAPABILITY_MISMATCH');
          exclusionReasons.push(
            `Partner does not possess any of the required capabilities: ${query.required_capabilities.join(', ')}.`
          );
        }
      } else {
        // If no required capabilities specified, all partner capabilities are considered matched
        for (const c of capabilities) {
          matchedCaps.push({
            capability_id: c.capability_id,
            name: c.name,
            category: c.category,
            certification_level: c.certification_level,
            is_verified: c.is_verified === 1,
          });
        }
      }

      // If any exclusion code was triggered, record exclusion and continue
      if (exclusionCodes.length > 0) {
        excludedNgos.push({
          ngo_id: ngo.id,
          name: ngo.name,
          is_simulated: ngoIsSimulated,
          reasons: exclusionReasons,
          exclusion_codes: exclusionCodes,
        });
        continue;
      }

      // -------------------------------------------------------------
      // ELIGIBLE NGO SCORING & EXPLAINABILITY
      // -------------------------------------------------------------
      const operatingAreas = getOperatingAreasStmt.all(ngo.id) as Array<{
        id: number;
        district: string;
        revenue_circle: string | null;
        administrative_scope: string;
        depot_location_name: string;
        depot_latitude: number | null;
        depot_longitude: number | null;
        is_primary_depot: number;
      }>;

      const serviceableInventory = getEquipmentInventoryStmt.all(ngo.id) as Array<{
        equipment_type_id: string;
        name: string;
        category: string;
        available_quantity: number;
        total_quantity: number;
        operational_condition: string;
        storage_location_name: string | null;
        storage_latitude: number | null;
        storage_longitude: number | null;
      }>;

      // A. Proximity Score (Max 30)
      let proximityScore = 0;
      let closestDepot: RecommendedDepot | null = null;
      let minDistanceKm = Infinity;

      const hasQueryCoords =
        query.latitude != null &&
        query.longitude != null &&
        !isNaN(query.latitude) &&
        !isNaN(query.longitude);

      if (hasQueryCoords) {
        for (const area of operatingAreas) {
          if (area.depot_latitude != null && area.depot_longitude != null) {
            const dist = calculateHaversineDistanceKm(
              query.latitude!,
              query.longitude!,
              area.depot_latitude,
              area.depot_longitude
            );
            if (!isNaN(dist) && dist < minDistanceKm) {
              minDistanceKm = dist;
              closestDepot = {
                id: area.id,
                name: area.depot_location_name,
                district: area.district,
                revenue_circle: area.revenue_circle,
                latitude: area.depot_latitude,
                longitude: area.depot_longitude,
                distance_km: dist,
                is_primary: area.is_primary_depot === 1,
              };
            }
          }
        }

        // Also check equipment storage coordinates if no depot coords were found
        if (!closestDepot) {
          for (const item of serviceableInventory) {
            if (item.storage_latitude != null && item.storage_longitude != null) {
              const dist = calculateHaversineDistanceKm(
                query.latitude!,
                query.longitude!,
                item.storage_latitude,
                item.storage_longitude
              );
              if (!isNaN(dist) && dist < minDistanceKm) {
                minDistanceKm = dist;
                closestDepot = {
                  name: item.storage_location_name || 'Storage Depot',
                  district: query.district || 'Assam',
                  latitude: item.storage_latitude,
                  longitude: item.storage_longitude,
                  distance_km: dist,
                  is_primary: false,
                };
              }
            }
          }
        }

        if (closestDepot && minDistanceKm !== Infinity) {
          if (minDistanceKm <= 5) proximityScore = 30;
          else if (minDistanceKm <= 15) proximityScore = 26;
          else if (minDistanceKm <= 30) proximityScore = 21;
          else if (minDistanceKm <= 50) proximityScore = 16;
          else if (minDistanceKm <= 80) proximityScore = 11;
          else if (minDistanceKm <= 120) proximityScore = 6;
          else proximityScore = 2;

          // Bonus if depot is in the same district
          if (
            query.district &&
            closestDepot.district.toLowerCase() === query.district.toLowerCase()
          ) {
            proximityScore = Math.min(30, proximityScore + 3);
          }
        } else {
          // Coords were provided but no depot had coordinates
          const districtMatch = operatingAreas.some(
            a => query.district && a.district.toLowerCase() === query.district.toLowerCase()
          );
          proximityScore = districtMatch ? 20 : 10;
          if (operatingAreas.length > 0) {
            closestDepot = {
              id: operatingAreas[0].id,
              name: operatingAreas[0].depot_location_name,
              district: operatingAreas[0].district,
              latitude: null,
              longitude: null,
              distance_km: null,
              is_primary: operatingAreas[0].is_primary_depot === 1,
            };
          }
        }
      } else if (query.district) {
        // District provided, no coordinates
        const match = operatingAreas.find(
          a => a.district.toLowerCase() === query.district!.toLowerCase()
        );
        if (match) {
          proximityScore = 25;
          closestDepot = {
            id: match.id,
            name: match.depot_location_name,
            district: match.district,
            latitude: match.depot_latitude,
            longitude: match.depot_longitude,
            distance_km: null,
            is_primary: match.is_primary_depot === 1,
          };
        } else {
          proximityScore = 10;
          if (operatingAreas.length > 0) {
            closestDepot = {
              id: operatingAreas[0].id,
              name: operatingAreas[0].depot_location_name,
              district: operatingAreas[0].district,
              latitude: operatingAreas[0].depot_latitude,
              longitude: operatingAreas[0].depot_longitude,
              distance_km: null,
              is_primary: operatingAreas[0].is_primary_depot === 1,
            };
          }
        }
      } else {
        // General proximity baseline
        proximityScore = 15;
        if (operatingAreas.length > 0) {
          closestDepot = {
            id: operatingAreas[0].id,
            name: operatingAreas[0].depot_location_name,
            district: operatingAreas[0].district,
            latitude: operatingAreas[0].depot_latitude,
            longitude: operatingAreas[0].depot_longitude,
            distance_km: null,
            is_primary: operatingAreas[0].is_primary_depot === 1,
          };
        }
      }

      // B. Capability Score (Max 25)
      let capabilityScore = 0;
      if (query.required_capabilities && query.required_capabilities.length > 0) {
        const ratio = matchedCaps.length / query.required_capabilities.length;
        const base = Math.round(ratio * 20);

        // Quality bonus: advanced certifications & verified status
        let bonus = 0;
        for (const cap of matchedCaps) {
          if (['ADVANCED', 'SPECIALIST'].includes(cap.certification_level)) bonus += 2;
          if (cap.is_verified) bonus += 1;
        }
        capabilityScore = Math.min(25, base + Math.min(5, bonus));
      } else {
        // Evaluate general depth of capabilities
        capabilityScore = Math.min(25, 10 + matchedCaps.length * 3);
      }

      // C. Equipment Availability Score (Max 20)
      let equipmentScore = 0;
      const matchedEquipment: MatchedEquipment[] = [];

      if (query.equipment_required && query.equipment_required.length > 0) {
        let satisfiedCount = 0;
        for (const reqEq of query.equipment_required) {
          const matchingItems = serviceableInventory.filter(
            item => item.equipment_type_id.toLowerCase() === reqEq.equipment_type_id.toLowerCase()
          );
          const totalAvail = matchingItems.reduce((acc, curr) => acc + curr.available_quantity, 0);
          const itemName = matchingItems[0]?.name || reqEq.equipment_type_id;
          const itemCat = matchingItems[0]?.category || 'LOGISTICS_SUPPLY';
          const isSatisfied = totalAvail >= reqEq.min_quantity;

          if (isSatisfied) {
            satisfiedCount += 1.0;
          } else if (totalAvail > 0) {
            satisfiedCount += (totalAvail / reqEq.min_quantity) * 0.5;
          }

          matchedEquipment.push({
            equipment_type_id: reqEq.equipment_type_id,
            name: itemName,
            category: itemCat,
            available_quantity: totalAvail,
            requested_quantity: reqEq.min_quantity,
            is_satisfied: isSatisfied,
          });
        }
        equipmentScore = Math.min(
          20,
          Math.round((satisfiedCount / query.equipment_required.length) * 20)
        );
      } else {
        // Evaluate overall serviceable equipment inventory breadth
        const totalUnits = serviceableInventory.reduce(
          (acc, curr) => acc + curr.available_quantity,
          0
        );
        for (const item of serviceableInventory) {
          matchedEquipment.push({
            equipment_type_id: item.equipment_type_id,
            name: item.name,
            category: item.category,
            available_quantity: item.available_quantity,
            requested_quantity: 0,
            is_satisfied: true,
          });
        }
        if (totalUnits >= 20) equipmentScore = 20;
        else if (totalUnits >= 10) equipmentScore = 16;
        else if (totalUnits >= 4) equipmentScore = 12;
        else if (totalUnits > 0) equipmentScore = 8;
        else equipmentScore = 0;
      }

      // D. Personnel Availability Score (Max 15)
      let personnelScore = 0;
      const availPersonnel = latestAvail?.available_personnel_count ?? 0;
      const certifiedHelmsmen = latestAvail?.certified_helmsmen_count ?? 0;
      const requestedPersonnel = query.personnel_required ?? 5;
      const personnelSatisfied = availPersonnel >= requestedPersonnel;

      if (personnelSatisfied) {
        personnelScore = 13;
      } else if (availPersonnel > 0) {
        personnelScore = Math.max(1, Math.round((availPersonnel / requestedPersonnel) * 12));
      } else {
        personnelScore = 0;
      }

      // Specialist Helmsmen bonus
      if (certifiedHelmsmen > 0) {
        personnelScore = Math.min(15, personnelScore + 2);
      }

      // E. Readiness Freshness Score (Max 10)
      const freshness = computeFreshness(
        latestAvail?.checkin_timestamp,
        latestAvail?.status,
        latestAvail?.valid_until
      );

      let freshnessScore = 0;
      if (freshness === 'FRESH') freshnessScore = 10;
      else if (freshness === 'AGING') freshnessScore = 5;
      else freshnessScore = 0;

      // Composite Score (0-100)
      const totalScore = Math.min(
        100,
        proximityScore + capabilityScore + equipmentScore + personnelScore + freshnessScore
      );

      const scoreBreakdown: RecommendationScoreBreakdown = {
        proximity_score: proximityScore,
        capability_score: capabilityScore,
        equipment_score: equipmentScore,
        personnel_score: personnelScore,
        freshness_score: freshnessScore,
        total_score: totalScore,
      };

      // Generate Human-Readable Justification Reasons
      const justificationReasons: string[] = [];

      // Proximity bullet
      if (closestDepot && closestDepot.distance_km != null) {
        justificationReasons.push(
          `Nearest staging depot: "${closestDepot.name}" in ${closestDepot.district} is ${closestDepot.distance_km} km from the incident location.`
        );
      } else if (closestDepot) {
        justificationReasons.push(
          `Registered staging depot: "${closestDepot.name}" operates in ${closestDepot.district}.`
        );
      } else {
        justificationReasons.push('General administrative coverage in Assam region.');
      }

      // Capability bullet
      if (query.required_capabilities && query.required_capabilities.length > 0) {
        const names = matchedCaps.map(c => c.name);
        justificationReasons.push(
          `Capability alignment: Possesses ${matchedCaps.length}/${query.required_capabilities.length} requested capabilities (${names.join(', ')}).`
        );
      } else {
        justificationReasons.push(
          `Broad disaster response profile with ${matchedCaps.length} registered operational capabilities.`
        );
      }

      // Equipment bullet
      if (query.equipment_required && query.equipment_required.length > 0) {
        const satisfied = matchedEquipment.filter(e => e.is_satisfied);
        justificationReasons.push(
          `Equipment readiness: ${satisfied.length}/${query.equipment_required.length} required equipment categories are available and serviceable.`
        );
      } else {
        const distinctTypes = new Set(serviceableInventory.map(e => e.equipment_type_id)).size;
        const totalUnits = serviceableInventory.reduce((acc, c) => acc + c.available_quantity, 0);
        justificationReasons.push(
          `Field assets: ${totalUnits} serviceable units across ${distinctTypes} equipment categories on active standby.`
        );
      }

      // Personnel bullet
      justificationReasons.push(
        `Personnel standby: ${availPersonnel} responder personnel available (${certifiedHelmsmen} certified helmsmen), ${
          personnelSatisfied ? 'meeting' : 'partially meeting'
        } target requirement of ${requestedPersonnel}.`
      );

      // Freshness bullet
      const checkinDateStr = latestAvail?.checkin_timestamp
        ? new Date(latestAvail.checkin_timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
        : 'Unknown';
      justificationReasons.push(
        `Readiness confirmation: Status ${latestAvail?.status || 'UNKNOWN'} (${freshness}) recorded at ${checkinDateStr}.`
      );

      // Simulation / Verification bullet
      if (ngoIsSimulated) {
        justificationReasons.push(
          'DEMO DATA (SIMULATED): Synthetic partner profile for exercise demonstration. Verification gates relaxed in demo mode.'
        );
      } else {
        justificationReasons.push(
          'Fully Verified Partner: Authenticated across all 5 disaster management verification dimensions.'
        );
      }

      recommendations.push({
        ngo_id: ngo.id,
        name: ngo.name,
        legal_name: ngo.legal_name,
        registration_reference: ngo.registration_reference,
        is_simulated: ngoIsSimulated,
        simulated_watermark: ngoIsSimulated ? 'DEMO DATA (SIMULATED)' : null,
        composite_score: totalScore,
        scores: scoreBreakdown,
        closest_depot: closestDepot,
        matched_capabilities: matchedCaps,
        matched_equipment: matchedEquipment,
        personnel_metrics: {
          available_personnel: availPersonnel,
          certified_helmsmen: certifiedHelmsmen,
          requested_personnel: requestedPersonnel,
          is_satisfied: personnelSatisfied,
        },
        readiness: {
          status: latestAvail?.status || 'UNKNOWN',
          freshness: freshness,
          checkin_timestamp: latestAvail?.checkin_timestamp || new Date().toISOString(),
          reporting_person_name: isCoordinator ? latestAvail?.reporting_person_name || null : null,
          operational_notes: latestAvail?.operational_notes || null,
        },
        verification: {
          is_fully_verified: isFullyVerified,
          verified_count: verifiedDimensions.length,
          total_dimensions: ALL_VERIFICATION_DIMENSIONS.length,
          verified_dimensions: verifiedDimensions,
          missing_dimensions: missingDimensions,
        },
        contact: {
          primary_contact_name: isCoordinator ? ngo.primary_contact_name : null,
          primary_contact_phone: isCoordinator ? ngo.primary_contact_phone : null,
          primary_contact_email: isCoordinator ? ngo.primary_contact_email : null,
        },
        justification_reasons: justificationReasons,
      });
    }

    // Sort recommended NGOs descending by composite score, then by proximity score, then by capability score
    recommendations.sort((a, b) => {
      if (b.composite_score !== a.composite_score) {
        return b.composite_score - a.composite_score;
      }
      if (b.scores.proximity_score !== a.scores.proximity_score) {
        return b.scores.proximity_score - a.scores.proximity_score;
      }
      return b.scores.capability_score - a.scores.capability_score;
    });

    const maxResults = query.max_results ?? 10;
    const finalRecommendations = recommendations.slice(0, maxResults);

    return {
      query: {
        latitude: query.latitude ?? null,
        longitude: query.longitude ?? null,
        district: query.district,
        severity: query.severity,
        required_capabilities: query.required_capabilities ?? [],
        personnel_required: query.personnel_required ?? 5,
        equipment_required: query.equipment_required ?? [],
        demo_mode: isDemoMode,
      },
      is_demo_mode: isDemoMode,
      is_advisory_only: true,
      coordinator_approval_required: true,
      disclaimer:
        'Advisory NGO recommendation only. Automatic resource assignment or dispatch is disabled by strict system policy. An authenticated coordinator must independently evaluate, contact, and authorize deployment.',
      total_evaluated: allNgos.length,
      recommended_count: finalRecommendations.length,
      excluded_count: excludedNgos.length,
      recommendations: finalRecommendations,
      excluded_ngos: excludedNgos,
    };
  }

  /**
   * Generates recommendations tailored to a specific incident stored in SQLite.
   */
  function getIncidentRecommendations(
    incidentId: number,
    overrides: Partial<RecommendationQueryInput>,
    isCoordinator: boolean
  ): RecommendationResult {
    const incident = db
      .prepare(
        `SELECT id, title, category, severity, latitude, longitude, landmark, affected_count
         FROM incidents
         WHERE id = ? AND deleted_at IS NULL`
      )
      .get(incidentId) as
      | {
          id: number;
          title: string;
          category: string;
          severity: string;
          latitude: number | null;
          longitude: number | null;
          landmark: string;
          affected_count: number;
        }
      | undefined;

    if (!incident) {
      throw new AppError(
        `Incident with ID ${incidentId} was not found or has been deleted.`,
        404,
        'NOT_FOUND'
      );
    }

    const defaultCapabilities = inferCapabilitiesFromCategory(incident.category);
    const defaultEquipment = inferEquipmentFromCategory(incident.category);
    const defaultPersonnel = Math.max(5, Math.min(25, Math.ceil((incident.affected_count || 1) / 5)));

    // Derive district hint from landmark if available
    let districtHint: string | undefined = undefined;
    const commonDistricts = [
      'Nagaon',
      'Kamrup Metropolitan',
      'Kamrup',
      'Cachar',
      'Dhubri',
      'Barpeta',
      'Dibrugarh',
      'Jorhat',
      'Sonitpur',
      'Morigaon',
    ];
    for (const d of commonDistricts) {
      if (incident.landmark.toLowerCase().includes(d.toLowerCase())) {
        districtHint = d;
        break;
      }
    }

    const mergedQuery: RecommendationQueryInput = {
      latitude: overrides.latitude !== undefined ? overrides.latitude : incident.latitude,
      longitude: overrides.longitude !== undefined ? overrides.longitude : incident.longitude,
      district: overrides.district || districtHint,
      severity: (overrides.severity as any) || (incident.severity as any) || 'MEDIUM',
      required_capabilities:
        overrides.required_capabilities && overrides.required_capabilities.length > 0
          ? overrides.required_capabilities
          : defaultCapabilities,
      personnel_required:
        overrides.personnel_required !== undefined ? overrides.personnel_required : defaultPersonnel,
      equipment_required:
        overrides.equipment_required && overrides.equipment_required.length > 0
          ? overrides.equipment_required
          : defaultEquipment,
      demo_mode: overrides.demo_mode ?? false,
      max_results: overrides.max_results ?? 10,
    };

    return getRecommendations(mergedQuery, isCoordinator);
  }

  return {
    getRecommendations,
    getIncidentRecommendations,
  };
}

