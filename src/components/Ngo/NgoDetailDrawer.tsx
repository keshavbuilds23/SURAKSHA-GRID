import React, { useState, useEffect } from 'react';
import {
  X,
  Shield,
  ShieldCheck,
  AlertTriangle,
  Phone,
  Mail,
  User,
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  Lock,
  Plus,
  Trash2,
  Edit2,
  Check,
  Warehouse,
  Boxes,
  Zap,
} from 'lucide-react';
import {
  NgoDetail,
  VerificationDimension,
  VERIFICATION_DIMENSIONS,
  ASSAM_DISTRICTS,
  CapabilityCatalogueItem,
  EquipmentCatalogueItem,
  NgoEquipmentDetail,
} from '../../types/ngo';
import {
  apiGetNgoById,
  apiVerifyNgoDimension,
  apiPromoteNgoToOperational,
  apiCheckinNgoAvailability,
  apiGetCapabilityCatalog,
  apiGetEquipmentCatalog,
  apiSyncNgoCapabilities,
  apiCreateNgoOperatingArea,
  apiDeleteNgoOperatingArea,
  apiCreateNgoEquipment,
  apiPatchNgoEquipment,
  apiDeleteNgoEquipment,
} from '../../services/apiClient';
import { parseJwtPayload } from './NgoNetwork';

interface NgoDetailDrawerProps {
  ngoId: string | null;
  isCoordinator: boolean;
  coordinatorToken: string | null;
  onClose: () => void;
  onRefreshList: () => void;
  onOpenLogin?: () => void;
}

export const NgoDetailDrawer: React.FC<NgoDetailDrawerProps> = ({
  ngoId,
  isCoordinator,
  coordinatorToken,
  onClose,
  onRefreshList,
  onOpenLogin,
}) => {
  const [ngo, setNgo] = useState<NgoDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'verifications' | 'depots' | 'equipment' | 'availability'>('overview');

  // Shared feedback state
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [actionErrorMsg, setActionErrorMsg] = useState<string | null>(null);

  // Catalogues state
  const [capabilityCatalog, setCapabilityCatalog] = useState<CapabilityCatalogueItem[]>([]);
  const [equipmentCatalog, setEquipmentCatalog] = useState<EquipmentCatalogueItem[]>([]);

  // 1. Capabilities workflow state
  const [isEditingCapabilities, setIsEditingCapabilities] = useState<boolean>(false);
  const [stagedCapabilities, setStagedCapabilities] = useState<
    {
      capability_id: string;
      certification_level: 'BASIC' | 'INTERMEDIATE' | 'ADVANCED' | 'SPECIALIST';
      certified_by: string;
      is_verified: boolean;
    }[]
  >([]);
  const [newCapId, setNewCapId] = useState<string>('');
  const [newCertLevel, setNewCertLevel] = useState<'BASIC' | 'INTERMEDIATE' | 'ADVANCED' | 'SPECIALIST'>('BASIC');
  const [newCertifiedBy, setNewCertifiedBy] = useState<string>('');
  const [savingCapabilities, setSavingCapabilities] = useState<boolean>(false);

  // 2. Staging Depots / Operating Areas workflow state
  const [isAddingDepot, setIsAddingDepot] = useState<boolean>(false);
  const [savingDepot, setSavingDepot] = useState<boolean>(false);
  const [deletingDepotId, setDeletingDepotId] = useState<number | null>(null);
  const [depotDistrict, setDepotDistrict] = useState<string>('Nagaon');
  const [depotRevenueCircle, setDepotRevenueCircle] = useState<string>('');
  const [depotScope, setDepotScope] = useState<'STATE' | 'DISTRICT' | 'REVENUE_CIRCLE' | 'BLOCK' | 'GRAM_PANCHAYAT'>('REVENUE_CIRCLE');
  const [depotLocationName, setDepotLocationName] = useState<string>('');
  const [depotGeoIdentifier, setDepotGeoIdentifier] = useState<string>('');
  const [depotLatitude, setDepotLatitude] = useState<string>('');
  const [depotLongitude, setDepotLongitude] = useState<string>('');
  const [depotIsPrimary, setDepotIsPrimary] = useState<boolean>(false);

  // 3. Equipment Inventory workflow state
  const [isAddingEquipment, setIsAddingEquipment] = useState<boolean>(false);
  const [editingEquipmentId, setEditingEquipmentId] = useState<number | null>(null);
  const [savingEquipment, setSavingEquipment] = useState<boolean>(false);
  const [deletingEquipmentId, setDeletingEquipmentId] = useState<number | null>(null);
  const [eqTypeId, setEqTypeId] = useState<string>('');
  const [eqDepotId, setEqDepotId] = useState<string>('');
  const [eqTotalQty, setEqTotalQty] = useState<number>(1);
  const [eqAvailQty, setEqAvailQty] = useState<number>(1);
  const [eqReservedQty, setEqReservedQty] = useState<number>(0);
  const [eqCondition, setEqCondition] = useState<'SERVICEABLE' | 'NEEDS_MAINTENANCE' | 'UNDER_REPAIR' | 'UNSERVICEABLE'>('SERVICEABLE');
  const [eqInspectionStatus, setEqInspectionStatus] = useState<'SELF_REPORTED' | 'PHYSICALLY_INSPECTED' | 'AUDIT_EXPIRED'>('SELF_REPORTED');
  const [eqStorageName, setEqStorageName] = useState<string>('');
  const [eqLatitude, setEqLatitude] = useState<string>('');
  const [eqLongitude, setEqLongitude] = useState<string>('');

  // 4. Verification form state
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [selectedDimension, setSelectedDimension] = useState<VerificationDimension>('DOCUMENTED_IN_DDMP');
  const [isVerifiedValue, setIsVerifiedValue] = useState<boolean>(true);
  const [evidenceRef, setEvidenceRef] = useState<string>('');
  const [verificationNotes, setVerificationNotes] = useState<string>('');
  const [validUntil, setValidUntil] = useState<string>('');

  // 5. Availability check-in form state
  const [isCheckingIn, setIsCheckingIn] = useState<boolean>(false);
  const [checkinStatus, setCheckinStatus] = useState<string>('ACTIVE_STANDBY');
  const [checkinPersonnel, setCheckinPersonnel] = useState<number>(10);
  const [checkinHelmsmen, setCheckinHelmsmen] = useState<number>(2);
  const [checkinReporterName, setCheckinReporterName] = useState<string>('');
  const [checkinReporterPhone, setCheckinReporterPhone] = useState<string>('');
  const [checkinNotes, setCheckinNotes] = useState<string>('');

  // 6. Operational promotion state
  const [isPromoting, setIsPromoting] = useState<boolean>(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Load catalogues once
  useEffect(() => {
    apiGetCapabilityCatalog(coordinatorToken || undefined)
      .then(res => {
        if (res.success && Array.isArray(res.data)) {
          setCapabilityCatalog(res.data);
          if (res.data.length > 0) setNewCapId(res.data[0].id);
        }
      })
      .catch(() => {});

    apiGetEquipmentCatalog(coordinatorToken || undefined)
      .then(res => {
        if (res.success && Array.isArray(res.data)) {
          setEquipmentCatalog(res.data);
          if (res.data.length > 0) setEqTypeId(res.data[0].id);
        }
      })
      .catch(() => {});
  }, [coordinatorToken]);

  const loadNgoDetail = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGetNgoById(id, coordinatorToken || undefined);
      if (res.success && res.data) {
        setNgo(res.data);
        // Prepopulate reporting identity from active session or NGO contact
        const tokenUser = parseJwtPayload(coordinatorToken);
        const defaultName = tokenUser?.full_name || tokenUser?.username || res.data.primary_contact_name || '';
        const defaultPhone = res.data.primary_contact_phone || '+919435012345';
        setCheckinReporterName(prev => (prev ? prev : defaultName));
        setCheckinReporterPhone(prev => (prev ? prev : defaultPhone));
      } else {
        setError(res.error?.message || 'Failed to load NGO dossier.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error fetching NGO details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ngoId) {
      loadNgoDetail(ngoId);
    }
  }, [ngoId, coordinatorToken]);

  if (!ngoId) return null;

  // -----------------------------------------------------------
  // Verification Handlers
  // -----------------------------------------------------------
  const handleAddVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ngo || !coordinatorToken) return;

    setActionSuccessMsg(null);
    setActionErrorMsg(null);
    setIsVerifying(true);

    try {
      const res = await apiVerifyNgoDimension(
        ngo.id,
        {
          dimension: selectedDimension,
          is_verified: isVerifiedValue,
          evidence_reference: evidenceRef.trim() || undefined,
          notes: verificationNotes.trim() || undefined,
          valid_until: validUntil ? new Date(validUntil).toISOString() : undefined,
        },
        coordinatorToken
      );

      if (res.success) {
        setActionSuccessMsg(`Verification audit record added for ${selectedDimension}.`);
        setEvidenceRef('');
        setVerificationNotes('');
        setValidUntil('');
        await loadNgoDetail(ngo.id);
        onRefreshList();
      } else {
        setActionErrorMsg(res.error?.message || 'Failed to append verification record.');
      }
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Error communicating with verification ledger.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handlePromoteToOperational = async () => {
    if (!ngo || !coordinatorToken) return;

    setActionSuccessMsg(null);
    setActionErrorMsg(null);
    setIsPromoting(true);

    try {
      const res = await apiPromoteNgoToOperational(ngo.id, coordinatorToken);
      if (res.success) {
        setActionSuccessMsg(`SUCCESS: "${ngo.name}" promoted to live OPERATIONAL status (is_simulated = 0).`);
        await loadNgoDetail(ngo.id);
        onRefreshList();
      } else {
        setActionErrorMsg(res.error?.message || 'Promotion failed. Verification requirements unmet.');
      }
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Operational promotion failed.');
    } finally {
      setIsPromoting(false);
    }
  };

  // -----------------------------------------------------------
  // Availability Handlers
  // -----------------------------------------------------------
  const handleCheckinAvailability = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ngo || !coordinatorToken) return;

    setActionSuccessMsg(null);
    setActionErrorMsg(null);

    const cleanReporterName = checkinReporterName.trim();
    const cleanReporterPhone = checkinReporterPhone.trim();

    if (!cleanReporterName || cleanReporterName.length < 2) {
      setActionErrorMsg('Reporting person name is required (minimum 2 characters).');
      return;
    }

    if (!cleanReporterPhone || cleanReporterPhone.length < 7) {
      setActionErrorMsg('Reporting person phone is required (minimum 7 characters).');
      return;
    }

    if (checkinPersonnel < 0 || checkinHelmsmen < 0) {
      setActionErrorMsg('Personnel and certified helmsmen counts cannot be negative.');
      return;
    }

    if (checkinHelmsmen > checkinPersonnel) {
      setActionErrorMsg('Certified helmsmen count cannot exceed total available personnel count.');
      return;
    }

    setIsCheckingIn(true);

    try {
      const res = await apiCheckinNgoAvailability(
        ngo.id,
        {
          status: checkinStatus,
          available_personnel_count: checkinPersonnel,
          certified_helmsmen_count: checkinHelmsmen,
          reporting_person_name: cleanReporterName,
          reporting_person_phone: cleanReporterPhone,
          operational_notes: checkinNotes.trim() || undefined,
        },
        coordinatorToken
      );

      if (res.success) {
        setActionSuccessMsg(`Availability check-in recorded successfully for "${ngo.name}" (${checkinStatus}: ${checkinPersonnel} personnel, ${checkinHelmsmen} helmsmen).`);
        setCheckinNotes('');
        await loadNgoDetail(ngo.id);
        onRefreshList();
      } else {
        const detailsMsg = Array.isArray(res.error?.details)
          ? res.error?.details.map((d: any) => `${d.field ? d.field + ': ' : ''}${d.issue || d.message}`).join('; ')
          : null;
        setActionErrorMsg(detailsMsg || res.error?.message || 'Availability check-in failed.');
      }
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Failed to submit availability check-in.');
    } finally {
      setIsCheckingIn(false);
    }
  };

  // -----------------------------------------------------------
  // Capabilities Management Handlers
  // -----------------------------------------------------------
  const handleOpenManageCapabilities = () => {
    const initial: {
      capability_id: string;
      certification_level: 'BASIC' | 'INTERMEDIATE' | 'ADVANCED' | 'SPECIALIST';
      certified_by: string;
      is_verified: boolean;
    }[] = [];

    if (Array.isArray(ngo?.capabilities)) {
      ngo.capabilities.forEach((c: any) => {
        if (typeof c === 'object' && c !== null) {
          initial.push({
            capability_id: c.capability_id,
            certification_level: c.certification_level || 'BASIC',
            certified_by: c.certified_by || '',
            is_verified: !!c.is_verified,
          });
        } else if (typeof c === 'string') {
          initial.push({
            capability_id: c,
            certification_level: 'BASIC',
            certified_by: '',
            is_verified: false,
          });
        }
      });
    }

    setStagedCapabilities(initial);
    setIsEditingCapabilities(true);
  };

  const handleAddStagedCapability = () => {
    if (!newCapId) return;
    if (stagedCapabilities.some(c => c.capability_id === newCapId)) {
      setActionErrorMsg(`Capability "${newCapId}" is already assigned to this partner.`);
      return;
    }
    setStagedCapabilities(prev => [
      ...prev,
      {
        capability_id: newCapId,
        certification_level: newCertLevel,
        certified_by: newCertifiedBy.trim(),
        is_verified: false,
      },
    ]);
    setNewCertifiedBy('');
  };

  const handleRemoveStagedCapability = (capId: string) => {
    setStagedCapabilities(prev => prev.filter(c => c.capability_id !== capId));
  };

  const handleSaveCapabilities = async () => {
    if (!ngo || !coordinatorToken) return;
    setSavingCapabilities(true);
    setActionErrorMsg(null);
    try {
      const res = await apiSyncNgoCapabilities(
        ngo.id,
        { capabilities: stagedCapabilities },
        coordinatorToken
      );
      if (res.success) {
        setActionSuccessMsg(`Updated operational capabilities for "${ngo.name}" (${stagedCapabilities.length} capabilities saved).`);
        setIsEditingCapabilities(false);
        await loadNgoDetail(ngo.id);
        onRefreshList();
      } else {
        setActionErrorMsg(res.error?.message || 'Failed to save capabilities.');
      }
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Error saving capabilities.');
    } finally {
      setSavingCapabilities(false);
    }
  };

  // -----------------------------------------------------------
  // Staging Depots / Operating Areas Handlers
  // -----------------------------------------------------------
  const handleCreateDepot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ngo || !coordinatorToken) return;

    if (!depotLocationName.trim() || depotLocationName.trim().length < 2) {
      setActionErrorMsg('Depot location / facility name is required (min 2 characters).');
      return;
    }

    const latNum = depotLatitude.trim() ? parseFloat(depotLatitude.trim()) : null;
    const lngNum = depotLongitude.trim() ? parseFloat(depotLongitude.trim()) : null;

    if (latNum !== null && (isNaN(latNum) || latNum < -90 || latNum > 90)) {
      setActionErrorMsg('Depot latitude must be a valid number between -90 and 90.');
      return;
    }

    if (lngNum !== null && (isNaN(lngNum) || lngNum < -180 || lngNum > 180)) {
      setActionErrorMsg('Depot longitude must be a valid number between -180 and 180.');
      return;
    }

    setSavingDepot(true);
    setActionErrorMsg(null);
    try {
      const res = await apiCreateNgoOperatingArea(
        ngo.id,
        {
          state: 'Assam',
          district: depotDistrict,
          revenue_circle: depotRevenueCircle.trim() || undefined,
          administrative_scope: depotScope,
          geographic_identifier: depotGeoIdentifier.trim() || undefined,
          depot_location_name: depotLocationName.trim(),
          depot_latitude: latNum,
          depot_longitude: lngNum,
          is_primary_depot: depotIsPrimary,
        },
        coordinatorToken
      );

      if (res.success) {
        setActionSuccessMsg(`Staging depot "${depotLocationName}" created successfully.`);
        setIsAddingDepot(false);
        setDepotLocationName('');
        setDepotRevenueCircle('');
        setDepotGeoIdentifier('');
        setDepotLatitude('');
        setDepotLongitude('');
        setDepotIsPrimary(false);
        await loadNgoDetail(ngo.id);
        onRefreshList();
      } else {
        setActionErrorMsg(res.error?.message || 'Failed to create staging depot.');
      }
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Error creating staging depot.');
    } finally {
      setSavingDepot(false);
    }
  };

  const handleDeleteDepot = async (depotId: number, name: string) => {
    if (!ngo || !coordinatorToken) return;
    if (!window.confirm(`Are you sure you want to remove depot "${name}"?`)) return;

    setDeletingDepotId(depotId);
    setActionErrorMsg(null);
    try {
      const res = await apiDeleteNgoOperatingArea(ngo.id, depotId, coordinatorToken);
      if (res.success) {
        setActionSuccessMsg(`Depot "${name}" removed successfully.`);
        await loadNgoDetail(ngo.id);
        onRefreshList();
      } else {
        setActionErrorMsg(res.error?.message || 'Failed to remove depot.');
      }
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Error removing depot.');
    } finally {
      setDeletingDepotId(null);
    }
  };

  // -----------------------------------------------------------
  // Equipment Inventory Handlers
  // -----------------------------------------------------------
  const handleConditionChange = (newCond: 'SERVICEABLE' | 'NEEDS_MAINTENANCE' | 'UNDER_REPAIR' | 'UNSERVICEABLE') => {
    setEqCondition(newCond);
    if (newCond !== 'SERVICEABLE') {
      setEqAvailQty(0);
    }
  };

  const handleStartEditEquipment = (item: NgoEquipmentDetail) => {
    setEditingEquipmentId(item.id);
    setIsAddingEquipment(true);
    setEqTypeId(item.equipment_type_id || '');
    setEqDepotId(item.operating_area_id ? item.operating_area_id.toString() : '');
    setEqTotalQty(item.total_quantity);
    setEqAvailQty(item.available_quantity);
    setEqReservedQty(item.reserved_quantity || 0);
    setEqCondition(item.operational_condition);
    setEqInspectionStatus((item.inspection_status as any) || 'SELF_REPORTED');
    setEqStorageName(item.storage_location_name || '');
    setEqLatitude(item.storage_latitude ? item.storage_latitude.toString() : '');
    setEqLongitude(item.storage_longitude ? item.storage_longitude.toString() : '');
  };

  const handleCancelEquipmentForm = () => {
    setIsAddingEquipment(false);
    setEditingEquipmentId(null);
    setEqTypeId(equipmentCatalog[0]?.id || '');
    setEqDepotId('');
    setEqTotalQty(1);
    setEqAvailQty(1);
    setEqReservedQty(0);
    setEqCondition('SERVICEABLE');
    setEqStorageName('');
    setEqLatitude('');
    setEqLongitude('');
  };

  const handleSaveEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ngo || !coordinatorToken) return;

    if (!editingEquipmentId && !eqTypeId) {
      setActionErrorMsg('Please select an equipment type from the catalogue.');
      return;
    }

    if (eqTotalQty < 0 || eqAvailQty < 0 || eqReservedQty < 0) {
      setActionErrorMsg('Equipment quantities must be non-negative integers.');
      return;
    }

    if (eqAvailQty + eqReservedQty > eqTotalQty) {
      setActionErrorMsg(`Balance violation: Available (${eqAvailQty}) + Reserved (${eqReservedQty}) cannot exceed Total (${eqTotalQty}).`);
      return;
    }

    if (eqCondition !== 'SERVICEABLE' && eqAvailQty > 0) {
      setActionErrorMsg(`Non-serviceable equipment (${eqCondition}) must have available quantity equal to 0.`);
      return;
    }

    const latNum = eqLatitude.trim() ? parseFloat(eqLatitude.trim()) : null;
    const lngNum = eqLongitude.trim() ? parseFloat(eqLongitude.trim()) : null;

    if (latNum !== null && (isNaN(latNum) || latNum < -90 || latNum > 90)) {
      setActionErrorMsg('Latitude must be a valid number between -90 and 90.');
      return;
    }
    if (lngNum !== null && (isNaN(lngNum) || lngNum < -180 || lngNum > 180)) {
      setActionErrorMsg('Longitude must be a valid number between -180 and 180.');
      return;
    }

    setSavingEquipment(true);
    setActionErrorMsg(null);
    try {
      if (editingEquipmentId) {
        // PATCH
        const res = await apiPatchNgoEquipment(
          ngo.id,
          editingEquipmentId,
          {
            operating_area_id: eqDepotId ? parseInt(eqDepotId, 10) : null,
            total_quantity: eqTotalQty,
            available_quantity: eqAvailQty,
            reserved_quantity: eqReservedQty,
            operational_condition: eqCondition,
            inspection_status: eqInspectionStatus,
            storage_location_name: eqStorageName.trim() || null,
            storage_latitude: latNum,
            storage_longitude: lngNum,
          },
          coordinatorToken
        );
        if (res.success) {
          setActionSuccessMsg('Equipment record updated successfully.');
          handleCancelEquipmentForm();
          await loadNgoDetail(ngo.id);
          onRefreshList();
        } else {
          setActionErrorMsg(res.error?.message || 'Failed to update equipment.');
        }
      } else {
        // CREATE
        const res = await apiCreateNgoEquipment(
          ngo.id,
          {
            equipment_type_id: eqTypeId,
            operating_area_id: eqDepotId ? parseInt(eqDepotId, 10) : null,
            total_quantity: eqTotalQty,
            available_quantity: eqAvailQty,
            reserved_quantity: eqReservedQty,
            operational_condition: eqCondition,
            inspection_status: eqInspectionStatus,
            storage_location_name: eqStorageName.trim() || undefined,
            storage_latitude: latNum,
            storage_longitude: lngNum,
          },
          coordinatorToken
        );
        if (res.success) {
          setActionSuccessMsg('Equipment inventory record added successfully.');
          handleCancelEquipmentForm();
          await loadNgoDetail(ngo.id);
          onRefreshList();
        } else {
          setActionErrorMsg(res.error?.message || 'Failed to add equipment.');
        }
      }
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Error saving equipment record.');
    } finally {
      setSavingEquipment(false);
    }
  };

  const handleDeleteEquipment = async (equipId: number, name: string) => {
    if (!ngo || !coordinatorToken) return;
    if (!window.confirm(`Are you sure you want to remove "${name}" from inventory?`)) return;

    setDeletingEquipmentId(equipId);
    setActionErrorMsg(null);
    try {
      const res = await apiDeleteNgoEquipment(ngo.id, equipId, coordinatorToken);
      if (res.success) {
        setActionSuccessMsg(`Equipment "${name}" removed from inventory.`);
        await loadNgoDetail(ngo.id);
        onRefreshList();
      } else {
        setActionErrorMsg(res.error?.message || 'Failed to remove equipment.');
      }
    } catch (err: any) {
      setActionErrorMsg(err.message || 'Error removing equipment.');
    } finally {
      setDeletingEquipmentId(null);
    }
  };

  const verifiedDims = new Set(Array.isArray(ngo?.active_verification_dimensions) ? ngo.active_verification_dimensions : []);
  const allFiveVerified = VERIFICATION_DIMENSIONS.every(d => verifiedDims.has(d.key));

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end transition-opacity">
      <div className="absolute inset-0" onClick={onClose}></div>

      <aside className="relative w-full max-w-2xl bg-white border-l border-slate-200 shadow-2xl flex flex-col h-full z-10">
        {/* Drawer Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2.5">
            <span className="font-mono text-xs text-teal-800 font-bold bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
              #{ngo?.id || ngoId}
            </span>
            <span className="text-xs uppercase tracking-wider text-slate-600 font-semibold">
              NGO Partner Dossier
            </span>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded hover:bg-slate-100 transition"
            title="Close Drawer (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Loading / Error States */}
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-3">
            <div className="w-8 h-8 border-3 border-teal-800 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs font-semibold text-slate-700">Loading partner dossier from backend...</span>
          </div>
        )}

        {error && !loading && (
          <div className="flex-1 p-6 space-y-4">
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-xs text-rose-800">
              <strong className="font-bold">Error loading NGO:</strong> {error}
            </div>
            <button
              onClick={() => loadNgoDetail(ngoId)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Content View */}
        {!loading && !error && ngo && (
          <>
            {/* NGO Title & Status Badges */}
            <div className="p-5 border-b border-slate-100 space-y-3 bg-white">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{ngo.name}</h2>
                  {ngo.legal_name && (
                    <p className="text-xs text-slate-500 italic">{ngo.legal_name}</p>
                  )}
                  {ngo.registration_reference && (
                    <p className="text-[11px] font-mono text-slate-500 mt-0.5">
                      Reg Ref: {ngo.registration_reference}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end space-y-1">
                  {/* SIMULATION STATUS: Prominent DEMO DATA Badge */}
                  {ngo.is_simulated ? (
                    <span className="px-2.5 py-1 rounded bg-amber-50 text-amber-900 border border-amber-300 font-bold text-xs flex items-center space-x-1.5 shadow-2xs">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                      <span>DEMO DATA (SIMULATED)</span>
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold text-xs flex items-center space-x-1.5 shadow-2xs">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>OPERATIONAL PARTNER</span>
                    </span>
                  )}

                  {/* Verification Dimension Counter */}
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${
                    allFiveVerified
                      ? 'bg-teal-50 text-teal-800 border-teal-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}>
                    {verifiedDims.size} of 5 Dimensions Verified
                  </span>
                </div>
              </div>

              {/* Action Banners */}
              {actionSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded flex items-center justify-between">
                  <span>{actionSuccessMsg}</span>
                  <button onClick={() => setActionSuccessMsg(null)} className="text-emerald-600 hover:text-emerald-900 font-bold ml-2">×</button>
                </div>
              )}
              {actionErrorMsg && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded flex items-center justify-between">
                  <span>{actionErrorMsg}</span>
                  <button onClick={() => setActionErrorMsg(null)} className="text-rose-600 hover:text-rose-900 font-bold ml-2">×</button>
                </div>
              )}
            </div>

            {/* Navigation Tabs */}
            <div className="border-b border-slate-200 px-5 flex space-x-2 text-xs font-medium bg-slate-50/70 overflow-x-auto">
              <button
                onClick={() => setActiveTab('overview')}
                className={`py-2.5 px-2 border-b-2 font-medium whitespace-nowrap transition ${
                  activeTab === 'overview'
                    ? 'border-teal-800 text-teal-900 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                Overview & Capabilities
              </button>
              <button
                onClick={() => setActiveTab('verifications')}
                className={`py-2.5 px-2 border-b-2 font-medium whitespace-nowrap transition flex items-center space-x-1 ${
                  activeTab === 'verifications'
                    ? 'border-teal-800 text-teal-900 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>5-D Verification</span>
                <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded-full font-mono">
                  {verifiedDims.size}/5
                </span>
              </button>
              <button
                onClick={() => setActiveTab('depots')}
                className={`py-2.5 px-2 border-b-2 font-medium whitespace-nowrap transition flex items-center space-x-1 ${
                  activeTab === 'depots'
                    ? 'border-teal-800 text-teal-900 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>Staging Depots</span>
                <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded-full font-mono">
                  {Array.isArray(ngo.depots) ? ngo.depots.length : 0}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('equipment')}
                className={`py-2.5 px-2 border-b-2 font-medium whitespace-nowrap transition flex items-center space-x-1 ${
                  activeTab === 'equipment'
                    ? 'border-teal-800 text-teal-900 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>Equipment</span>
                <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded-full font-mono">
                  {Array.isArray(ngo.equipment) ? ngo.equipment.length : 0}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('availability')}
                className={`py-2.5 px-2 border-b-2 font-medium whitespace-nowrap transition flex items-center space-x-1 ${
                  activeTab === 'availability'
                    ? 'border-teal-800 text-teal-900 font-semibold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>Readiness</span>
                {ngo.availability_summary && (
                  <span className={`w-2 h-2 rounded-full ${
                    ngo.availability_summary.freshness === 'FRESH'
                      ? 'bg-emerald-500'
                      : ngo.availability_summary.freshness === 'AGING'
                      ? 'bg-amber-500'
                      : 'bg-slate-400'
                  }`} />
                )}
              </button>
            </div>

            {/* Scrollable Content Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* TAB 1: OVERVIEW, CONTACTS & CAPABILITIES */}
              {activeTab === 'overview' && (
                <div className="space-y-5 text-xs">
                  {/* Description */}
                  {ngo.description && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                        Mandate & Mission Statement
                      </h4>
                      <p className="text-slate-700 leading-relaxed">{ngo.description}</p>
                    </div>
                  )}

                  {/* Operational Capabilities Workflow */}
                  <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                        <Zap className="w-3.5 h-3.5 text-teal-800" />
                        <span>Operational Capabilities</span>
                      </h4>
                      {isCoordinator && !isEditingCapabilities && (
                        <button
                          onClick={handleOpenManageCapabilities}
                          className="text-xs text-teal-800 hover:text-teal-900 font-semibold flex items-center space-x-1 bg-teal-50 px-2 py-0.5 rounded border border-teal-200"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Manage Capabilities</span>
                        </button>
                      )}
                    </div>

                    {!isEditingCapabilities ? (
                      <div className="space-y-2">
                        {Array.isArray(ngo.capabilities) && ngo.capabilities.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {ngo.capabilities.map((c: any, idx) => {
                              const capName = typeof c === 'object' && c !== null ? c.name || c.capability_id : String(c);
                              const capLevel = typeof c === 'object' && c !== null ? c.certification_level : null;
                              return (
                                <span
                                  key={idx}
                                  className="bg-teal-50 text-teal-900 border border-teal-200 px-2.5 py-1 rounded text-xs font-medium flex items-center space-x-1.5"
                                >
                                  <span>{capName}</span>
                                  {capLevel && (
                                    <span className="text-[10px] font-mono bg-teal-200/60 text-teal-900 px-1 py-0.2 rounded font-bold">
                                      {capLevel}
                                    </span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">No specific capability tags registered.</span>
                        )}
                      </div>
                    ) : (
                      /* Coordinator Capabilities Management Mode */
                      <div className="space-y-4 pt-1">
                        <p className="text-[11px] text-slate-600">
                          Select standard capabilities from the state catalogue and configure accreditation levels for this partner.
                        </p>

                        {/* Staged list */}
                        <div className="space-y-2 border border-slate-200 rounded p-3 bg-slate-50">
                          <span className="font-semibold text-slate-700 text-[11px] block">
                            Assigned Capabilities ({stagedCapabilities.length})
                          </span>
                          {stagedCapabilities.length > 0 ? (
                            <div className="space-y-1.5">
                              {stagedCapabilities.map(sc => {
                                const catItem = capabilityCatalog.find(c => c.id === sc.capability_id);
                                return (
                                  <div
                                    key={sc.capability_id}
                                    className="flex items-center justify-between bg-white border border-slate-200 rounded px-2.5 py-1.5 text-xs"
                                  >
                                    <div>
                                      <span className="font-semibold text-slate-900">
                                        {catItem?.name || sc.capability_id}
                                      </span>
                                      <span className="text-[10px] font-mono ml-2 text-teal-800 bg-teal-50 px-1 py-0.2 rounded border border-teal-100">
                                        {sc.certification_level}
                                      </span>
                                      {sc.certified_by && (
                                        <span className="text-[10px] text-slate-400 ml-2">
                                          via {sc.certified_by}
                                        </span>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveStagedCapability(sc.capability_id)}
                                      className="text-rose-500 hover:text-rose-700 p-1"
                                      title="Remove Capability"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-400 italic">No capabilities currently staged.</p>
                          )}
                        </div>

                        {/* Add capability form row */}
                        <div className="border border-slate-200 rounded p-3 bg-white space-y-2.5">
                          <span className="font-semibold text-slate-700 text-[11px] block">Add from Catalogue</span>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Capability</label>
                              <select
                                value={newCapId}
                                onChange={e => setNewCapId(e.target.value)}
                                className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs bg-white text-slate-800"
                              >
                                {capabilityCatalog.map(cap => (
                                  <option key={cap.id} value={cap.id}>
                                    {cap.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Certification Level</label>
                              <select
                                value={newCertLevel}
                                onChange={e => setNewCertLevel(e.target.value as any)}
                                className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs bg-white text-slate-800"
                              >
                                <option value="BASIC">BASIC</option>
                                <option value="INTERMEDIATE">INTERMEDIATE</option>
                                <option value="ADVANCED">ADVANCED</option>
                                <option value="SPECIALIST">SPECIALIST</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Certifying Body</label>
                              <input
                                type="text"
                                placeholder="e.g. ASDMA / NDRF"
                                value={newCertifiedBy}
                                onChange={e => setNewCertifiedBy(e.target.value)}
                                className="w-full border border-slate-300 rounded px-2 py-1.5 text-xs"
                              />
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={handleAddStagedCapability}
                            className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium flex items-center space-x-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add to Staged List</span>
                          </button>
                        </div>

                        {/* Save / Cancel buttons */}
                        <div className="flex items-center space-x-2 pt-2">
                          <button
                            type="button"
                            onClick={handleSaveCapabilities}
                            disabled={savingCapabilities}
                            className="bg-teal-800 hover:bg-teal-900 text-white px-4 py-1.5 rounded font-medium text-xs transition flex items-center space-x-1.5"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{savingCapabilities ? 'Saving...' : 'Save Capabilities to Backend'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsEditingCapabilities(false)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded font-medium text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Contact Information (PII Safe Projection) */}
                  <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                        <User className="w-3.5 h-3.5 text-teal-800" />
                        <span>Command & Coordination Contact</span>
                      </h4>
                      {!isCoordinator && (
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200 flex items-center space-x-1">
                          <Lock className="w-3 h-3 text-slate-400" />
                          <span>PII Protected</span>
                        </span>
                      )}
                    </div>

                    {isCoordinator ? (
                      <div className="space-y-2 text-slate-700">
                        <div className="flex items-center space-x-2">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-semibold">{ngo.primary_contact_name || 'Not provided'}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-mono">{ngo.primary_contact_phone || 'Not provided'}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span>{ngo.primary_contact_email || 'Not provided'}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-slate-50 border border-slate-200 rounded p-3 text-slate-600 space-y-1">
                        <p className="font-medium text-slate-700">Contact details redacted for public security.</p>
                        <p className="text-[11px] text-slate-500">
                          Direct phone numbers, email addresses, and authorized representative names require a verified EOC Coordinator JWT token.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Operational Coverage Districts */}
                  <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                      <MapPin className="w-3.5 h-3.5 text-teal-800" />
                      <span>Operational Coverage Area</span>
                    </h4>
                    {Array.isArray(ngo.operating_coverage) && ngo.operating_coverage.length > 0 ? (
                      <div className="divide-y divide-slate-100">
                        {ngo.operating_coverage.map((area, idx) => (
                          <div key={idx} className="py-2 flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-800">{area.district}</span>
                            <span className="text-slate-500">
                              {area.revenue_circle ? `Circle: ${area.revenue_circle}` : 'District-wide'}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic">No operational areas logged.</span>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: 5-DIMENSIONAL VERIFICATION LEDGER */}
              {activeTab === 'verifications' && (
                <div className="space-y-5 text-xs">
                  {/* Status Banner */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-slate-900">5-Dimensional Verification Gate</h4>
                      <p className="text-slate-500 text-[11px] mt-0.5">
                        Operational promotion strictly requires all 5 verification dimensions to be active and non-expired.
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-base font-bold text-slate-900 font-mono">
                        {verifiedDims.size} / 5
                      </span>
                      <p className="text-[10px] text-slate-500">Dimensions</p>
                    </div>
                  </div>

                  {/* Promotion Button (Coordinator only) */}
                  {ngo.is_simulated && (
                    <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-amber-900">Operational Promotion Readiness</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                          allFiveVerified ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {allFiveVerified ? 'READY FOR PROMOTION' : 'LOCKED (INCOMPLETE)'}
                        </span>
                      </div>
                      <p className="text-[11px] text-amber-800">
                        {allFiveVerified
                          ? 'All 5 verification dimensions are verified and active. You may promote this partner to live operational status.'
                          : 'Promotion to operational status requires completing all 5 verification dimensions.'}
                      </p>

                      {isCoordinator ? (
                        <button
                          onClick={handlePromoteToOperational}
                          disabled={!allFiveVerified || isPromoting}
                          className={`w-full py-2 px-3 rounded font-medium text-xs transition flex items-center justify-center space-x-1.5 ${
                            allFiveVerified && !isPromoting
                              ? 'bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer shadow-xs'
                              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                          <ShieldCheck className="w-4 h-4" />
                          <span>{isPromoting ? 'Promoting...' : 'Promote to Operational (is_simulated = 0)'}</span>
                        </button>
                      ) : (
                        <div className="text-[11px] text-slate-500 italic bg-white p-2.5 rounded border border-amber-200 flex items-center justify-between">
                          <div className="flex items-center space-x-1.5">
                            <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>Coordinator login required to execute operational promotion.</span>
                          </div>
                          {onOpenLogin && (
                            <button
                              onClick={onOpenLogin}
                              className="text-teal-800 font-semibold underline hover:text-teal-900 ml-2 cursor-pointer not-italic"
                            >
                              Sign In
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Dimension Checklist Cards */}
                  <div className="space-y-2.5">
                    {VERIFICATION_DIMENSIONS.map(dim => {
                      const isVerified = verifiedDims.has(dim.key);
                      return (
                        <div
                          key={dim.key}
                          className={`border rounded-lg p-3.5 flex items-start space-x-3 transition ${
                            isVerified
                              ? 'bg-teal-50/40 border-teal-200'
                              : 'bg-white border-slate-200'
                          }`}
                        >
                          <div className="mt-0.5 shrink-0">
                            {isVerified ? (
                              <CheckCircle2 className="w-4 h-4 text-teal-700" />
                            ) : (
                              <XCircle className="w-4 h-4 text-slate-300" />
                            )}
                          </div>

                          <div className="flex-1 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-900">{dim.label}</span>
                              <span
                                className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                                  isVerified
                                    ? 'bg-teal-100 text-teal-800 border border-teal-200'
                                    : 'bg-slate-100 text-slate-500 border border-slate-200'
                                }`}
                              >
                                {isVerified ? 'VERIFIED' : 'UNVERIFIED'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500">{dim.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Coordinator Audit Append Form */}
                  {isCoordinator ? (
                    <form
                      onSubmit={handleAddVerification}
                      className="bg-white border border-slate-200 rounded-lg p-4 space-y-3 mt-6"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <h4 className="font-bold text-slate-900 flex items-center space-x-1.5">
                          <Shield className="w-4 h-4 text-teal-800" />
                          <span>Append Verification Audit Record</span>
                        </h4>
                        <span className="text-[10px] font-mono bg-teal-50 text-teal-800 px-2 py-0.5 rounded border border-teal-200">
                          Coordinator Privileged
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Dimension
                          </label>
                          <select
                            value={selectedDimension}
                            onChange={e => setSelectedDimension(e.target.value as VerificationDimension)}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white text-slate-800"
                          >
                            {VERIFICATION_DIMENSIONS.map(d => (
                              <option key={d.key} value={d.key}>
                                {d.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Verification Decision
                          </label>
                          <select
                            value={isVerifiedValue ? 'true' : 'false'}
                            onChange={e => setIsVerifiedValue(e.target.value === 'true')}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white text-slate-800"
                          >
                            <option value="true">Confirmed / Verified (1)</option>
                            <option value="false">Unconfirmed / Revoked (0)</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Evidence Reference
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. DDMP-2026-NAG-SEC4"
                            value={evidenceRef}
                            onChange={e => setEvidenceRef(e.target.value)}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Valid Until (Optional Expiration)
                          </label>
                          <input
                            type="date"
                            value={validUntil}
                            onChange={e => setValidUntil(e.target.value)}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Audit Notes
                        </label>
                        <textarea
                          placeholder="Document verification ground truth observations..."
                          value={verificationNotes}
                          onChange={e => setVerificationNotes(e.target.value)}
                          rows={2}
                          className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isVerifying}
                        className="bg-teal-800 hover:bg-teal-900 text-white px-4 py-2 rounded font-medium text-xs transition flex items-center justify-center space-x-1.5 shadow-xs cursor-pointer w-full"
                      >
                        <Shield className="w-3.5 h-3.5" />
                        <span>{isVerifying ? 'Recording...' : 'Commit Verification to Immutable Ledger'}</span>
                      </button>
                    </form>
                  ) : (
                    <div className="bg-slate-50 border border-slate-200 rounded p-3 text-slate-600 text-center space-y-1">
                      <p className="font-semibold text-slate-700">Verification Ledger Audit Actions Restricted</p>
                      <p className="text-[11px] text-slate-500">
                        Coordinator JWT authentication is required to record verification evidence or modify audit dimensions.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: STAGING DEPOTS & OPERATING COVERAGE */}
              {activeTab === 'depots' && (
                <div className="space-y-4 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div>
                      <h4 className="font-bold text-slate-900">Registered Staging Depots</h4>
                      <p className="text-[11px] text-slate-500">
                        Field logistics depots, warehousing, and operational coverage facilities.
                      </p>
                    </div>
                    {isCoordinator && (
                      <button
                        onClick={() => setIsAddingDepot(!isAddingDepot)}
                        className="text-xs text-teal-800 hover:text-teal-900 font-semibold flex items-center space-x-1 bg-teal-50 px-2.5 py-1 rounded border border-teal-200"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{isAddingDepot ? 'Close Form' : 'Add Staging Depot'}</span>
                      </button>
                    )}
                  </div>

                  {/* Add Staging Depot Form */}
                  {isAddingDepot && (
                    <form
                      onSubmit={handleCreateDepot}
                      className="bg-slate-50 border border-slate-300 rounded-lg p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <span className="font-bold text-slate-800 flex items-center space-x-1.5">
                          <Warehouse className="w-4 h-4 text-teal-800" />
                          <span>Register New Staging Depot</span>
                        </span>
                        {ngo.is_simulated && (
                          <span className="text-[10px] font-mono bg-amber-100 text-amber-900 px-2 py-0.5 rounded border border-amber-300 font-bold">
                            DEMO / SIMULATED
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            District *
                          </label>
                          <select
                            value={depotDistrict}
                            onChange={e => setDepotDistrict(e.target.value)}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white text-slate-800"
                          >
                            {ASSAM_DISTRICTS.map(d => (
                              <option key={d} value={d}>
                                {d}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Administrative Scope
                          </label>
                          <select
                            value={depotScope}
                            onChange={e => setDepotScope(e.target.value as any)}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white text-slate-800"
                          >
                            <option value="REVENUE_CIRCLE">REVENUE_CIRCLE</option>
                            <option value="DISTRICT">DISTRICT</option>
                            <option value="STATE">STATE</option>
                            <option value="BLOCK">BLOCK</option>
                            <option value="GRAM_PANCHAYAT">GRAM_PANCHAYAT</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Depot Location / Facility Name *
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Kampur Central Staging Depot"
                            value={depotLocationName}
                            onChange={e => setDepotLocationName(e.target.value)}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Revenue Circle (Optional)
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Kampur"
                            value={depotRevenueCircle}
                            onChange={e => setDepotRevenueCircle(e.target.value)}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Landmark / Geo Identifier
                          </label>
                          <input
                            type="text"
                            placeholder="Near Railway Station"
                            value={depotGeoIdentifier}
                            onChange={e => setDepotGeoIdentifier(e.target.value)}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Latitude (Optional)
                          </label>
                          <input
                            type="number"
                            step="any"
                            placeholder="26.1523"
                            value={depotLatitude}
                            onChange={e => setDepotLatitude(e.target.value)}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Longitude (Optional)
                          </label>
                          <input
                            type="number"
                            step="any"
                            placeholder="92.8341"
                            value={depotLongitude}
                            onChange={e => setDepotLongitude(e.target.value)}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white"
                          />
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 pt-1">
                        <input
                          type="checkbox"
                          id="is_primary_depot"
                          checked={depotIsPrimary}
                          onChange={e => setDepotIsPrimary(e.target.checked)}
                          className="rounded border-slate-300 text-teal-800 focus:ring-teal-700"
                        />
                        <label htmlFor="is_primary_depot" className="text-xs text-slate-700 font-medium cursor-pointer">
                          Designate as Primary Operations Depot for this partner
                        </label>
                      </div>

                      <div className="flex items-center space-x-2 pt-2">
                        <button
                          type="submit"
                          disabled={savingDepot}
                          className="bg-teal-800 hover:bg-teal-900 text-white px-4 py-1.5 rounded font-medium text-xs transition flex items-center space-x-1.5"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{savingDepot ? 'Registering...' : 'Save Staging Depot'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsAddingDepot(false)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded font-medium text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Depot list */}
                  {Array.isArray(ngo.depots) && ngo.depots.length > 0 ? (
                    <div className="space-y-3">
                      {ngo.depots.map(depot => (
                        <div
                          key={depot.id}
                          className="border border-slate-200 rounded-lg p-4 bg-white space-y-2 hover:border-slate-300 transition"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-slate-900 text-sm">
                                  {depot.depot_name || depot.depot_location_name || 'Operational Depot'}
                                </span>
                                {depot.is_primary_depot && (
                                  <span className="bg-teal-50 text-teal-800 border border-teal-200 font-mono text-[10px] px-2 py-0.5 rounded font-bold">
                                    PRIMARY DEPOT
                                  </span>
                                )}
                              </div>
                              <p className="text-slate-500 text-[11px] mt-0.5">
                                {depot.district} {depot.revenue_circle ? `• Circle: ${depot.revenue_circle}` : ''}
                              </p>
                            </div>

                            {isCoordinator && (
                              <button
                                type="button"
                                onClick={() => handleDeleteDepot(depot.id, depot.depot_name || depot.depot_location_name || 'Depot')}
                                disabled={deletingDepotId === depot.id}
                                className="text-slate-400 hover:text-rose-600 p-1.5 rounded hover:bg-slate-50 transition"
                                title="Remove Depot"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-[11px] pt-1.5 border-t border-slate-100">
                            <div>
                              <span className="text-slate-400">Scope:</span>{' '}
                              <span className="text-slate-700 font-medium">{depot.administrative_scope}</span>
                            </div>
                            <div>
                              <span className="text-slate-400">GPS Coordinates:</span>{' '}
                              {isCoordinator && depot.depot_latitude && depot.depot_longitude ? (
                                <span className="font-mono text-teal-800">
                                  {depot.depot_latitude.toFixed(4)}, {depot.depot_longitude.toFixed(4)}
                                </span>
                              ) : (
                                <span className="text-slate-400 italic">Masked (Coordinator only)</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-slate-400 italic bg-slate-50 rounded-lg border border-slate-200">
                      No staging depots registered.
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: EQUIPMENT INVENTORY & FIELD ASSETS */}
              {activeTab === 'equipment' && (
                <div className="space-y-4 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div>
                      <h4 className="font-bold text-slate-900">Relief Equipment & Field Assets</h4>
                      <p className="text-[11px] text-slate-500">
                        Rescue boats, dewatering pumps, lifejackets and medical equipment.
                      </p>
                    </div>
                    {isCoordinator && !isAddingEquipment && (
                      <button
                        onClick={() => {
                          setEditingEquipmentId(null);
                          setIsAddingEquipment(true);
                        }}
                        className="text-xs text-teal-800 hover:text-teal-900 font-semibold flex items-center space-x-1 bg-teal-50 px-2.5 py-1 rounded border border-teal-200"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Equipment Asset</span>
                      </button>
                    )}
                  </div>

                  {/* Add / Edit Equipment Form */}
                  {isAddingEquipment && (
                    <form
                      onSubmit={handleSaveEquipment}
                      className="bg-slate-50 border border-slate-300 rounded-lg p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <span className="font-bold text-slate-800 flex items-center space-x-1.5">
                          <Boxes className="w-4 h-4 text-teal-800" />
                          <span>{editingEquipmentId ? 'Edit Equipment Asset' : 'Add Equipment Asset'}</span>
                        </span>
                        {ngo.is_simulated && (
                          <span className="text-[10px] font-mono bg-amber-100 text-amber-900 px-2 py-0.5 rounded border border-amber-300 font-bold">
                            DEMO / SIMULATED
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Equipment Type (Catalogue) *
                          </label>
                          <select
                            value={eqTypeId}
                            disabled={!!editingEquipmentId}
                            onChange={e => setEqTypeId(e.target.value)}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white text-slate-800 disabled:bg-slate-100"
                          >
                            {equipmentCatalog.map(eq => (
                              <option key={eq.id} value={eq.id}>
                                {eq.name} ({eq.category}) {eq.is_critical ? '[CRITICAL]' : ''}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Staging Depot Facility
                          </label>
                          <select
                            value={eqDepotId}
                            onChange={e => setEqDepotId(e.target.value)}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white text-slate-800"
                          >
                            <option value="">Unassigned / Central Storage</option>
                            {Array.isArray(ngo.depots) &&
                              ngo.depots.map(depot => (
                                <option key={depot.id} value={depot.id}>
                                  {depot.depot_name || depot.depot_location_name} ({depot.district})
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>

                      {/* Quantities Row */}
                      <div className="grid grid-cols-3 gap-3 bg-white p-3 rounded border border-slate-200">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                            Total Quantity *
                          </label>
                          <input
                            type="number"
                            min="0"
                            required
                            value={eqTotalQty}
                            onChange={e => setEqTotalQty(Math.max(0, parseInt(e.target.value, 10) || 0))}
                            className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                            Available *
                          </label>
                          <input
                            type="number"
                            min="0"
                            required
                            disabled={eqCondition !== 'SERVICEABLE'}
                            value={eqAvailQty}
                            onChange={e => setEqAvailQty(Math.max(0, parseInt(e.target.value, 10) || 0))}
                            className="w-full border border-slate-300 rounded px-2 py-1 text-xs disabled:bg-slate-100 disabled:text-slate-400"
                          />
                          {eqCondition !== 'SERVICEABLE' && (
                            <span className="text-[9px] text-amber-700 font-mono block mt-0.5">Locked to 0</span>
                          )}
                        </div>

                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                            Reserved
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={eqReservedQty}
                            onChange={e => setEqReservedQty(Math.max(0, parseInt(e.target.value, 10) || 0))}
                            className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Operational Condition *
                          </label>
                          <select
                            value={eqCondition}
                            onChange={e => handleConditionChange(e.target.value as any)}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white text-slate-800"
                          >
                            <option value="SERVICEABLE">SERVICEABLE (Ready for deployment)</option>
                            <option value="NEEDS_MAINTENANCE">NEEDS_MAINTENANCE (Requires tuning)</option>
                            <option value="UNDER_REPAIR">UNDER_REPAIR (Currently in workshop)</option>
                            <option value="UNSERVICEABLE">UNSERVICEABLE (Damaged / Retired)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Inspection Status
                          </label>
                          <select
                            value={eqInspectionStatus}
                            onChange={e => setEqInspectionStatus(e.target.value as any)}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white text-slate-800"
                          >
                            <option value="SELF_REPORTED">SELF_REPORTED</option>
                            <option value="PHYSICALLY_INSPECTED">PHYSICALLY_INSPECTED</option>
                            <option value="AUDIT_EXPIRED">AUDIT_EXPIRED</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Storage Location Name
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Shed B, Racks 1-4"
                            value={eqStorageName}
                            onChange={e => setEqStorageName(e.target.value)}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Latitude (Optional)
                          </label>
                          <input
                            type="number"
                            step="any"
                            placeholder="26.1523"
                            value={eqLatitude}
                            onChange={e => setEqLatitude(e.target.value)}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Longitude (Optional)
                          </label>
                          <input
                            type="number"
                            step="any"
                            placeholder="92.8341"
                            value={eqLongitude}
                            onChange={e => setEqLongitude(e.target.value)}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white"
                          />
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 pt-2">
                        <button
                          type="submit"
                          disabled={savingEquipment}
                          className="bg-teal-800 hover:bg-teal-900 text-white px-4 py-1.5 rounded font-medium text-xs transition flex items-center space-x-1.5"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{savingEquipment ? 'Saving...' : editingEquipmentId ? 'Update Asset' : 'Add to Inventory'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEquipmentForm}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded font-medium text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Equipment list */}
                  {Array.isArray(ngo.equipment) && ngo.equipment.length > 0 ? (
                    <div className="space-y-3">
                      {ngo.equipment.map(item => (
                        <div
                          key={item.id}
                          className="border border-slate-200 rounded-lg p-4 bg-white space-y-3 hover:border-slate-300 transition"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-slate-900 text-sm">{item.equipment_name}</span>
                                {item.is_critical && (
                                  <span className="bg-rose-50 text-rose-700 border border-rose-200 font-mono text-[9px] px-1.5 py-0.2 rounded font-bold">
                                    CRITICAL
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                                Category: {item.category} {item.depot_name ? `• Depot: ${item.depot_name}` : ''}
                              </p>
                            </div>

                            <div className="flex items-center space-x-1.5">
                              <span
                                className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${
                                  item.operational_condition === 'SERVICEABLE'
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                    : item.operational_condition === 'NEEDS_MAINTENANCE'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : item.operational_condition === 'UNDER_REPAIR'
                                    ? 'bg-orange-50 text-orange-800 border-orange-200'
                                    : 'bg-rose-50 text-rose-800 border-rose-200'
                                }`}
                              >
                                {item.operational_condition}
                              </span>

                              {isCoordinator && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleStartEditEquipment(item)}
                                    className="text-slate-400 hover:text-teal-800 p-1 rounded hover:bg-slate-50"
                                    title="Edit Equipment Asset"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteEquipment(item.id, item.equipment_name)}
                                    disabled={deletingEquipmentId === item.id}
                                    className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-slate-50"
                                    title="Delete Equipment Asset"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2 text-center bg-slate-50 p-2.5 rounded border border-slate-100">
                            <div>
                              <span className="block text-[10px] text-slate-400 uppercase font-semibold">Total</span>
                              <span className="font-bold text-slate-800 text-sm">{item.total_quantity}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-slate-400 uppercase font-semibold">Available</span>
                              <span className="font-bold text-teal-800 text-sm">{item.available_quantity}</span>
                            </div>
                            <div>
                              <span className="block text-[10px] text-slate-400 uppercase font-semibold">Reserved</span>
                              <span className="font-bold text-slate-600 text-sm">{item.reserved_quantity || 0}</span>
                            </div>
                          </div>

                          {item.storage_location_name && (
                            <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-100 flex items-center justify-between">
                              <span>Storage: {item.storage_location_name}</span>
                              {isCoordinator && item.storage_latitude && item.storage_longitude && (
                                <span className="font-mono text-teal-800 text-[10px]">
                                  {item.storage_latitude.toFixed(4)}, {item.storage_longitude.toFixed(4)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-slate-400 italic bg-slate-50 rounded-lg border border-slate-200">
                      No physical equipment inventory reported.
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: AVAILABILITY & READINESS CHECK-IN */}
              {activeTab === 'availability' && (
                <div className="space-y-5 text-xs">
                  {/* Latest Check-in Snapshot */}
                  <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <h4 className="font-bold text-slate-900 flex items-center space-x-1.5">
                        <Clock className="w-4 h-4 text-teal-800" />
                        <span>Current Standby & Readiness Snapshot</span>
                      </h4>
                      {ngo.is_simulated && (
                        <span className="text-[10px] font-mono bg-amber-50 text-amber-900 border border-amber-300 px-2 py-0.5 rounded font-bold">
                          [DEMO DATA (SIMULATED)]
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Readiness Status</span>
                        <span className="font-bold text-slate-800">
                          {ngo.latest_availability?.status || 'INACTIVE_STALE'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">Telemetry Freshness</span>
                        <span className="font-bold text-slate-800">
                          {ngo.latest_availability?.freshness || 'STALE'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                      <div>
                        <span className="text-slate-400 block text-[10px]">
                          {ngo.is_simulated ? 'Simulated Field Personnel' : 'Available Field Personnel'}
                        </span>
                        <span className="font-bold text-teal-800 text-sm">
                          {ngo.latest_availability?.available_personnel_count ?? 0}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[10px]">
                          {ngo.is_simulated ? 'Simulated Certified Helmsmen' : 'Certified Helmsmen'}
                        </span>
                        <span className="font-bold text-teal-800 text-sm">
                          {ngo.latest_availability?.certified_helmsmen_count ?? 0}
                        </span>
                      </div>
                    </div>

                    {isCoordinator && ngo.latest_availability && (
                      <div className="pt-2 border-t border-slate-100 space-y-1 text-[11px] text-slate-600">
                        {ngo.latest_availability.reporting_person_name && (
                          <div>
                            <span className="text-slate-400">Reporter:</span>{' '}
                            <span className="font-semibold text-slate-700">
                              {ngo.latest_availability.reporting_person_name} ({ngo.latest_availability.reporting_person_phone})
                            </span>
                          </div>
                        )}
                        {ngo.latest_availability.checkin_timestamp && (
                          <div>
                            <span className="text-slate-400">Timestamp:</span>{' '}
                            <span className="font-mono text-slate-700">
                              {new Date(ngo.latest_availability.checkin_timestamp).toLocaleString()}
                            </span>
                          </div>
                        )}
                        {ngo.latest_availability.operational_notes && (
                          <div className="bg-slate-50 p-2 rounded border border-slate-100 mt-1 italic text-slate-700">
                            "{ngo.latest_availability.operational_notes}"
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Availability Check-in Form */}
                  {isCoordinator ? (
                    <form
                      onSubmit={handleCheckinAvailability}
                      className="bg-white border border-slate-200 rounded-lg p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <h4 className="font-bold text-slate-900 flex items-center space-x-1.5">
                          <CheckCircle2 className="w-4 h-4 text-teal-800" />
                          <span>Submit Readiness Check-In</span>
                        </h4>
                        <span className="text-[10px] font-mono bg-teal-50 text-teal-800 px-2 py-0.5 rounded border border-teal-200">
                          Coordinator Privileged
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Operational Standby Status *
                          </label>
                          <select
                            value={checkinStatus}
                            onChange={e => setCheckinStatus(e.target.value)}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white text-slate-800"
                          >
                            <option value="ACTIVE_STANDBY">ACTIVE_STANDBY (Immediate Response)</option>
                            <option value="DEPLOYED">DEPLOYED (Active in Field)</option>
                            <option value="PARTIALLY_AVAILABLE">PARTIALLY_AVAILABLE (Limited Crew)</option>
                            <option value="UNAVAILABLE">UNAVAILABLE (Off-duty / Depleted)</option>
                            <option value="INACTIVE_STALE">INACTIVE_STALE (No Signal)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Available Personnel Count *
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="5000"
                            required
                            value={checkinPersonnel}
                            onChange={e => setCheckinPersonnel(Math.max(0, parseInt(e.target.value, 10) || 0))}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white text-slate-800"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Certified Helmsmen *
                          </label>
                          <input
                            type="number"
                            min="0"
                            max={checkinPersonnel}
                            required
                            value={checkinHelmsmen}
                            onChange={e => setCheckinHelmsmen(Math.max(0, parseInt(e.target.value, 10) || 0))}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white text-slate-800"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Reporter Name *
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="Full Name"
                            value={checkinReporterName}
                            onChange={e => setCheckinReporterName(e.target.value)}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white text-slate-800"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Reporter Phone *
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="+919435012345"
                            value={checkinReporterPhone}
                            onChange={e => setCheckinReporterPhone(e.target.value)}
                            className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs bg-white text-slate-800 font-mono"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Operational Notes (Optional)
                        </label>
                        <textarea
                          placeholder="Team location, boat readiness, local water levels..."
                          value={checkinNotes}
                          onChange={e => setCheckinNotes(e.target.value)}
                          rows={2}
                          className="w-full border border-slate-300 rounded px-2.5 py-1.5 text-xs"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isCheckingIn}
                        className="bg-teal-800 hover:bg-teal-900 text-white px-4 py-2 rounded font-medium text-xs transition flex items-center justify-center space-x-1.5 shadow-xs cursor-pointer w-full"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>{isCheckingIn ? 'Logging...' : 'Submit Availability Check-In'}</span>
                      </button>
                    </form>
                  ) : (
                    <div className="bg-slate-50 border border-slate-200 rounded p-3 text-slate-600 text-center space-y-1">
                      <p className="font-semibold text-slate-700">Availability Telemetry Restricted</p>
                      <p className="text-[11px] text-slate-500">
                        Coordinator authentication required to submit field availability and readiness check-ins.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
};
