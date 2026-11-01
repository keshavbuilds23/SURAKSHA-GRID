import React, { useState, useEffect } from 'react';
import {
  Compass,
  AlertTriangle,
  Building2,
  Phone,
  Mail,
  MapPin,
  ShieldCheck,
  LifeBuoy,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  ExternalLink,
  Info,
  Sparkles,
} from 'lucide-react';
import { RecommendationResult } from '../../types/recommendation';
import { apiGetIncidentRecommendations, apiGetRecommendations } from '../../services/apiClient';

interface NgoRecommendationDeskProps {
  incidentId?: number;
  incidentTitle?: string;
  incidentCategory?: string;
  incidentSeverity?: string;
  incidentLatitude?: number | null;
  incidentLongitude?: number | null;
  incidentDistrict?: string;
  coordinatorToken?: string | null;
  onInspectNgo?: (ngoId: string) => void;
}

export const NgoRecommendationDesk: React.FC<NgoRecommendationDeskProps> = ({
  incidentId,
  incidentTitle,
  incidentCategory,
  incidentSeverity = 'MEDIUM',
  incidentLatitude,
  incidentLongitude,
  incidentDistrict,
  coordinatorToken,
  onInspectNgo,
}) => {
  // Recommendation State
  const [demoMode, setDemoMode] = useState<boolean>(true); // Default to true so user immediately sees assam_relief_demo
  const [personnelRequired, setPersonnelRequired] = useState<number>(5);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<RecommendationResult | null>(null);

  // UI Accordion States
  const [expandedExclusions, setExpandedExclusions] = useState<boolean>(false);
  const [expandedBreakdowns, setExpandedBreakdowns] = useState<Record<string, boolean>>({});

  const fetchRecommendations = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      let res;
      if (incidentId) {
        res = await apiGetIncidentRecommendations(
          incidentId,
          {
            demo_mode: demoMode,
            personnel_required: personnelRequired,
          },
          coordinatorToken || undefined
        );
      } else {
        res = await apiGetRecommendations(
          {
            latitude: incidentLatitude,
            longitude: incidentLongitude,
            district: incidentDistrict,
            severity: incidentSeverity as any,
            demo_mode: demoMode,
            personnel_required: personnelRequired,
          },
          coordinatorToken || undefined
        );
      }

      if (res.success && res.data) {
        setResult(res.data);
      } else {
        setErrorMsg(res.error?.message || 'Unable to retrieve NGO recommendations.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network communication failure occurred.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommendations();
  }, [incidentId, demoMode]);

  const toggleBreakdown = (ngoId: string) => {
    setExpandedBreakdowns(prev => ({
      ...prev,
      [ngoId]: !prev[ngoId],
    }));
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden space-y-0">
      {/* 1. Header Banner */}
      <div className="bg-slate-900 text-white p-5 border-b border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Compass className="w-5 h-5 text-teal-400" />
              <h2 className="text-base font-semibold tracking-tight">
                Explainable Partner NGO Recommendation Engine
              </h2>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-teal-950 text-teal-300 border border-teal-800">
                Phase 4.5
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Multi-criteria spatial, capability, and telemetry matching for disaster response logistics.
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg p-1">
            <button
              onClick={() => setDemoMode(false)}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition cursor-pointer ${
                !demoMode
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Live Operational
            </button>
            <button
              onClick={() => setDemoMode(true)}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition flex items-center space-x-1 cursor-pointer ${
                demoMode
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-200" />
              <span>Demo Simulation</span>
            </button>
          </div>
        </div>

        {/* Demo Mode Isolation Alert */}
        {demoMode ? (
          <div className="mt-4 p-3 bg-amber-950/70 border border-amber-800/80 rounded flex items-center justify-between text-xs text-amber-200">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>
                <strong>DEMO SIMULATION ACTIVE:</strong> Matching against synthetic partners (including <code>assam_relief_demo</code>). Real emergency operational partners are strictly isolated.
              </span>
            </div>
            <span className="font-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-amber-900 border border-amber-700 text-amber-100">
              SIMULATED MATCHING
            </span>
          </div>
        ) : (
          <div className="mt-4 p-3 bg-emerald-950/70 border border-emerald-800/80 rounded flex items-center justify-between text-xs text-emerald-200">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>
                <strong>OPERATIONAL DISPATCH ACTIVE:</strong> Matching against genuine disaster partners verified across all 5 verification dimensions with fresh telemetry.
              </span>
            </div>
            <span className="font-mono text-[10px] uppercase px-1.5 py-0.5 rounded bg-emerald-900 border border-emerald-700 text-emerald-100">
              GROUND TRUTH ONLY
            </span>
          </div>
        )}
      </div>

      {/* 2. Controls & Context Filter Bar */}
      <div className="bg-slate-50 border-b border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <span className="text-slate-500 block text-[10px] uppercase font-semibold">Incident Target</span>
            <span className="font-semibold text-slate-800">
              {incidentTitle ? incidentTitle.substring(0, 40) + '...' : 'Coordinates / District Search'}
            </span>
          </div>

          <div>
            <span className="text-slate-500 block text-[10px] uppercase font-semibold">Location / District</span>
            <span className="font-mono text-slate-800">
              {incidentDistrict || (incidentLatitude ? `${incidentLatitude.toFixed(2)}°N, ${incidentLongitude?.toFixed(2)}°E` : 'Assam State')}
            </span>
          </div>

          {incidentCategory && (
            <div>
              <span className="text-slate-500 block text-[10px] uppercase font-semibold">Incident Category</span>
              <span className="font-semibold text-teal-800">
                {incidentCategory.replace(/_/g, ' ')}
              </span>
            </div>
          )}

          <div>
            <span className="text-slate-500 block text-[10px] uppercase font-semibold">Personnel Target</span>
            <div className="flex items-center space-x-1">
              <input
                type="number"
                min={1}
                max={50}
                value={personnelRequired}
                onChange={e => setPersonnelRequired(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 bg-white border border-slate-300 rounded px-2 py-1 font-mono text-xs text-slate-800 focus:outline-none focus:border-teal-700"
              />
              <span className="text-slate-500">responders</span>
            </div>
          </div>
        </div>

        <button
          onClick={fetchRecommendations}
          disabled={loading}
          className="bg-teal-800 hover:bg-teal-900 text-white font-medium px-4 py-2 rounded text-xs transition flex items-center space-x-2 shadow-xs cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Evaluating...' : 'Re-run Engine'}</span>
        </button>
      </div>

      {/* Error state */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border-b border-rose-200 text-rose-800 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={fetchRecommendations}
            className="underline font-semibold hover:text-rose-900 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Results Header / Summary */}
      {result && (
        <div className="p-5 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-3">
              <span className="text-xs font-semibold text-slate-700">
                Matching Outcomes:
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-50 text-teal-800 border border-teal-200">
                {result.recommended_count} Eligible Recommended
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                {result.excluded_count} Excluded
              </span>
              <span className="text-[11px] text-slate-500 font-mono">
                ({result.total_evaluated} Total Evaluated)
              </span>
            </div>

            <span className="text-[11px] text-slate-500 font-mono">
              Engine: Proximity(30) + Capability(25) + Equipment(20) + Personnel(15) + Freshness(10)
            </span>
          </div>

          {/* 3. Recommended NGO Cards */}
          {result.recommendations.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-lg border border-dashed border-slate-300 space-y-3">
              <Building2 className="w-10 h-10 text-slate-400 mx-auto" />
              <div className="text-sm font-semibold text-slate-700">No qualifying partner NGOs matched</div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {demoMode
                  ? 'No simulated partners matched the active criteria. Verify that demo NGOs are seeded in the database.'
                  : 'No operational partners met all eligibility gates (5/5 verification dimensions, active readiness check-in, capability alignment).'}
              </p>
              {demoMode ? (
                <button
                  onClick={fetchRecommendations}
                  className="bg-amber-700 hover:bg-amber-800 text-white text-xs font-medium px-4 py-2 rounded transition cursor-pointer"
                >
                  Refresh Simulation
                </button>
              ) : (
                <button
                  onClick={() => setDemoMode(true)}
                  className="bg-teal-800 hover:bg-teal-900 text-white text-xs font-medium px-4 py-2 rounded transition cursor-pointer"
                >
                  Switch to Demo Mode to Preview Engine
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {result.recommendations.map((ngo, idx) => {
                const isExpanded = Boolean(expandedBreakdowns[ngo.ngo_id]);

                // Composite score color
                const scoreColor =
                  ngo.composite_score >= 80
                    ? 'bg-emerald-600 text-white ring-emerald-200'
                    : ngo.composite_score >= 60
                    ? 'bg-teal-600 text-white ring-teal-200'
                    : ngo.composite_score >= 40
                    ? 'bg-amber-500 text-white ring-amber-200'
                    : 'bg-slate-500 text-white ring-slate-200';

                return (
                  <div
                    key={ngo.ngo_id}
                    className="border border-slate-200 rounded-lg p-5 bg-white shadow-xs hover:border-teal-700/60 transition space-y-4"
                  >
                    {/* Top Row: Rank, NGO info, Composite Score */}
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex items-start space-x-3.5">
                        <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-300 text-slate-800 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                          #{idx + 1}
                        </div>

                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-bold text-slate-900">{ngo.name}</h3>
                            {ngo.is_simulated ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                DEMO DATA (SIMULATED)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center space-x-1">
                                <ShieldCheck className="w-3 h-3 text-emerald-700" />
                                <span>VERIFIED PARTNER (5/5)</span>
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-mono">
                            <span>ID: {ngo.ngo_id}</span>
                            {ngo.registration_reference && (
                              <span>• Reg: {ngo.registration_reference}</span>
                            )}
                            {ngo.closest_depot && (
                              <span className="text-slate-700 font-semibold flex items-center space-x-1">
                                <MapPin className="w-3.5 h-3.5 text-teal-700" />
                                <span>
                                  {ngo.closest_depot.name} ({ngo.closest_depot.district})
                                  {ngo.closest_depot.distance_km != null && (
                                    <strong className="text-teal-900 ml-1">
                                      [{ngo.closest_depot.distance_km} km]
                                    </strong>
                                  )}
                                </span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Composite Score Meter */}
                      <div className="flex items-center space-x-3 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                        <div className="text-right">
                          <span className="text-[10px] uppercase font-bold text-slate-500 block">
                            Recommendation Score
                          </span>
                          <span className="text-xl font-black text-slate-900 font-mono">
                            {ngo.composite_score}
                            <span className="text-xs text-slate-400 font-normal">/100</span>
                          </span>
                        </div>
                        <div
                          className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm ring-4 ${scoreColor}`}
                        >
                          {ngo.composite_score}%
                        </div>
                      </div>
                    </div>

                    {/* Subscores Bar */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 border-t border-slate-100 text-xs">
                      <div className="bg-slate-50 p-2 rounded border border-slate-200">
                        <span className="text-slate-500 text-[10px] uppercase block">Proximity</span>
                        <span className="font-bold text-slate-800 font-mono">
                          {ngo.scores.proximity_score} / 30
                        </span>
                      </div>
                      <div className="bg-slate-50 p-2 rounded border border-slate-200">
                        <span className="text-slate-500 text-[10px] uppercase block">Capabilities</span>
                        <span className="font-bold text-slate-800 font-mono">
                          {ngo.scores.capability_score} / 25
                        </span>
                      </div>
                      <div className="bg-slate-50 p-2 rounded border border-slate-200">
                        <span className="text-slate-500 text-[10px] uppercase block">Equipment</span>
                        <span className="font-bold text-slate-800 font-mono">
                          {ngo.scores.equipment_score} / 20
                        </span>
                      </div>
                      <div className="bg-slate-50 p-2 rounded border border-slate-200">
                        <span className="text-slate-500 text-[10px] uppercase block">Personnel</span>
                        <span className="font-bold text-slate-800 font-mono">
                          {ngo.scores.personnel_score} / 15
                        </span>
                      </div>
                      <div className="bg-slate-50 p-2 rounded border border-slate-200">
                        <span className="text-slate-500 text-[10px] uppercase block">Freshness</span>
                        <span className="font-bold text-slate-800 font-mono">
                          {ngo.scores.freshness_score} / 10
                        </span>
                      </div>
                    </div>

                    {/* Justification Reasons Bullet Points */}
                    <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2 text-xs">
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide flex items-center space-x-1.5">
                        <Info className="w-3.5 h-3.5 text-teal-700" />
                        <span>Why this partner is recommended:</span>
                      </span>
                      <ul className="space-y-1.5 pl-4 list-disc text-slate-700">
                        {ngo.justification_reasons.map((reason, rIdx) => (
                          <li key={rIdx} className="leading-relaxed">
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Collapsible Deep Breakdown */}
                    <div>
                      <button
                        onClick={() => toggleBreakdown(ngo.ngo_id)}
                        className="text-xs font-semibold text-teal-800 hover:text-teal-900 flex items-center space-x-1 cursor-pointer"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        <span>{isExpanded ? 'Hide Detailed Asset Breakdown' : 'View Field Assets & Capabilities'}</span>
                      </button>

                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-slate-200 space-y-3 text-xs">
                          {/* Capabilities */}
                          <div>
                            <span className="font-semibold text-slate-700 block mb-1">
                              Matched Operational Capabilities ({ngo.matched_capabilities.length})
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {ngo.matched_capabilities.map(cap => (
                                <span
                                  key={cap.capability_id}
                                  className="px-2 py-1 rounded bg-teal-50 border border-teal-200 text-teal-900 text-[11px] font-medium"
                                >
                                  {cap.name} [{cap.certification_level}]
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Equipment */}
                          <div>
                            <span className="font-semibold text-slate-700 block mb-1">
                              Available Serviceable Equipment ({ngo.matched_equipment.length} categories)
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {ngo.matched_equipment.map(eq => (
                                <div
                                  key={eq.equipment_type_id}
                                  className="p-2 bg-slate-50 rounded border border-slate-200 flex justify-between items-center"
                                >
                                  <span className="text-slate-800 font-medium">{eq.name}</span>
                                  <span className="font-mono font-bold text-teal-800">
                                    {eq.available_quantity} available
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Telemetry info */}
                          <div className="p-3 bg-slate-100 rounded text-slate-700 flex flex-wrap justify-between items-center gap-2 font-mono text-[11px]">
                            <span>Readiness Status: <strong className="text-slate-900">{ngo.readiness.status}</strong></span>
                            <span>Freshness: <strong className="text-slate-900">{ngo.readiness.freshness}</strong></span>
                            <span>Reported: {new Date(ngo.readiness.checkin_timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Footer Row: Contact Credentials & Advisory Deployment Action */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
                      {/* Contact Info */}
                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
                        {coordinatorToken && ngo.contact.primary_contact_name ? (
                          <>
                            <span className="font-semibold text-slate-800">
                              Contact: {ngo.contact.primary_contact_name}
                            </span>
                            {ngo.contact.primary_contact_phone && (
                              <span className="flex items-center space-x-1 font-mono text-slate-800">
                                <Phone className="w-3.5 h-3.5 text-teal-700" />
                                <span>{ngo.contact.primary_contact_phone}</span>
                              </span>
                            )}
                            {ngo.contact.primary_contact_email && (
                              <span className="flex items-center space-x-1 font-mono text-slate-800">
                                <Mail className="w-3.5 h-3.5 text-teal-700" />
                                <span>{ngo.contact.primary_contact_email}</span>
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-500 italic">
                            Coordinator credentials active: Deployment contact information unlocked.
                          </span>
                        )}
                      </div>

                      {/* Manual Action Button */}
                      {onInspectNgo && (
                        <button
                          onClick={() => onInspectNgo(ngo.ngo_id)}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 px-3.5 py-1.5 rounded text-xs font-semibold transition flex items-center space-x-1.5 cursor-pointer"
                        >
                          <span>Review Full NGO Dossier</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 4. Excluded NGOs Section */}
          {result.excluded_ngos.length > 0 && (
            <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
              <button
                onClick={() => setExpandedExclusions(!expandedExclusions)}
                className="w-full p-4 flex items-center justify-between text-left text-xs font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-slate-500" />
                  <span>
                    Excluded Partners ({result.excluded_count}) — Transparency & Audit Log
                  </span>
                </div>
                {expandedExclusions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {expandedExclusions && (
                <div className="p-4 pt-0 space-y-2 border-t border-slate-200">
                  <p className="text-[11px] text-slate-500 mb-2">
                    In compliance with the Suraksha verification charter, partners that do not meet mandatory eligibility gates are excluded from recommendation rankings with explicit justifications:
                  </p>

                  <div className="space-y-2">
                    {result.excluded_ngos.map(exc => (
                      <div
                        key={exc.ngo_id}
                        className="p-3 bg-white rounded border border-slate-200 text-xs space-y-1.5 shadow-2xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-slate-800">{exc.name}</span>
                            <span className="text-[11px] font-mono text-slate-500">[{exc.ngo_id}]</span>
                            {exc.is_simulated && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-amber-50 text-amber-800 border border-amber-200">
                                Simulated
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-1">
                            {exc.exclusion_codes.map(code => (
                              <span
                                key={code}
                                className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-50 text-rose-800 border border-rose-200"
                              >
                                {code}
                              </span>
                            ))}
                          </div>
                        </div>

                        <ul className="text-slate-600 text-[11px] list-disc pl-4 space-y-0.5">
                          {exc.reasons.map((r, rIdx) => (
                            <li key={rIdx}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 5. Policy Guardrail Disclaimer */}
          <div className="p-4 bg-teal-50/60 border border-teal-200 rounded-lg text-xs text-teal-900 space-y-1">
            <div className="flex items-center space-x-2 font-bold text-teal-900">
              <LifeBuoy className="w-4 h-4 text-teal-700 flex-shrink-0" />
              <span>Mandatory Advisory Guardrail & Coordinator Protocol</span>
            </div>
            <p className="leading-relaxed text-[11px] text-teal-800">
              {result.disclaimer}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
