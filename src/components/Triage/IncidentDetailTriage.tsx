import React from 'react';
import {
  ShieldAlert,
  CheckCircle,
  AlertTriangle,
  Clock,
  LifeBuoy,
} from 'lucide-react';
import { Incident, IncidentSeverity } from '../../types/incident';
import { DuplicateCandidate } from '../../types/duplicate';
import { IncidentEvent } from '../../types/event';

interface IncidentDetailTriageProps {
  incidents: Incident[];
  selectedIncident: Incident;
  events: IncidentEvent[];
  duplicates: DuplicateCandidate[];
  onSelectIncident: (id: number) => void;
  onVerifyIncident: (id: number) => void;
  onEscalateSeverity: (id: number, sev: IncidentSeverity) => void;
  onNavigateToResources: () => void;
}

export const IncidentDetailTriage: React.FC<IncidentDetailTriageProps> = ({
  incidents,
  selectedIncident,
  events,
  duplicates,
  onSelectIncident,
  onVerifyIncident,
  onEscalateSeverity,
  onNavigateToResources,
}) => {
  const sevBadge =
    selectedIncident.severity === 'CRITICAL'
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : selectedIncident.severity === 'HIGH'
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : selectedIncident.severity === 'MEDIUM'
      ? 'bg-sky-50 text-sky-800 border-sky-200'
      : 'bg-slate-100 text-slate-700 border-slate-200';

  const statusBadge =
    selectedIncident.verification_status === 'VERIFIED'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : 'bg-amber-50 text-amber-800 border-amber-200';

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Selector Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 p-4 rounded-lg shadow-xs">
        <div className="flex items-center space-x-2.5">
          <ShieldAlert className="w-5 h-5 text-teal-800" />
          <h2 className="text-sm font-semibold text-slate-900 tracking-tight">
            Incident Triage & Verification Desk
          </h2>
        </div>

        {/* Quick Incident Switcher */}
        <div className="flex items-center space-x-2 text-xs">
          <span className="text-slate-500 font-medium">Inspecting:</span>
          <select
            value={selectedIncident.id}
            onChange={e => onSelectIncident(Number(e.target.value))}
            className="bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 text-slate-800 font-mono focus:outline-none focus:border-teal-700"
          >
            {incidents.map(inc => (
              <option key={inc.id} value={inc.id}>
                #{inc.id} [{inc.severity}] {inc.title.substring(0, 35)}...
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT 2 COLS: Narrative, Duplicates, and Immutable Audit Log */}
        <div className="lg:col-span-2 space-y-6">
          {/* Main Incident Card */}
          <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <span className={`px-2.5 py-1 rounded text-xs font-semibold uppercase tracking-wider border ${sevBadge}`}>
                  Severity: {selectedIncident.severity}
                </span>

                <span className={`text-xs px-2.5 py-1 rounded border font-semibold ${statusBadge}`}>
                  {selectedIncident.verification_status}
                </span>
              </div>

              <span className="text-xs font-mono text-slate-500">
                UUID: {selectedIncident.client_report_id.substring(0, 18)}...
              </span>
            </div>

            <h1 className="text-xl font-bold text-slate-900 leading-snug">{selectedIncident.title}</h1>
            <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-4 rounded border border-slate-200">
              {selectedIncident.description}
            </p>

            {/* Medical alert */}
            {selectedIncident.medical_required && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded flex items-start space-x-2.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="font-semibold">Critical Medical Alert:</strong> On-site emergency trauma medical supplies or patient evacuation required.
                </div>
              </div>
            )}

            {/* Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 bg-slate-50 rounded border border-slate-200 text-xs font-mono">
              <div>
                <span className="text-slate-500 text-[10px] uppercase block font-sans">Landmark</span>
                <span className="text-slate-800 font-semibold truncate block font-sans">{selectedIncident.landmark}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] uppercase block font-sans">People Affected</span>
                <span className="text-slate-900 font-bold block">{selectedIncident.affected_count}</span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] uppercase block font-sans">Hazard Class</span>
                <span className="text-teal-800 font-semibold block truncate font-sans">
                  {selectedIncident.category.replace(/_/g, ' ')}
                </span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] uppercase block font-sans">Reported Time</span>
                <span className="text-slate-700 block">
                  {new Date(selectedIncident.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} IST
                </span>
              </div>
            </div>
          </div>

          {/* Duplicate Detection Alert Box */}
          {duplicates.length > 0 && (
            <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-5 space-y-3">
              <div className="flex items-center space-x-2 text-amber-900 font-semibold text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-700" />
                <span>Duplicate Report Candidates Detected ({duplicates.length})</span>
              </div>
              <p className="text-xs text-amber-900/80 leading-relaxed">
                The duplicate detection heuristic flagged candidate reports based on spatio-temporal proximity (≤500m & ≤30 mins). In accordance with the Suraksha architectural charter, duplicate reports are <em>never</em> silently merged; they remain distinct records for coordinator discretion.
              </p>

              <div className="space-y-2">
                {duplicates.map(dup => (
                  <div
                    key={dup.duplicate_pair_id}
                    className="p-3 bg-white rounded border border-amber-200 text-xs space-y-1 shadow-xs"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-slate-900">Candidate #{dup.candidate_incident_id}</span>
                      <span className="font-mono text-amber-800 text-[11px]">
                        Proximity: {dup.distance_meters}m • {Math.round(dup.time_delta_seconds / 60)} mins delta
                      </span>
                    </div>
                    <div className="text-slate-700 font-medium">{dup.candidate_title}</div>
                    <div className="text-[11px] text-slate-500">{dup.candidate_landmark}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Immutable Audit Trail */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-slate-600" />
                <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                  Immutable Incident Event Stream ({events.length} Events)
                </h3>
              </div>
              <span className="text-[11px] text-slate-500 font-mono">Append-Only Audit Log</span>
            </div>

            <div className="space-y-4 relative pl-5 border-l-2 border-slate-200">
              {events.map(ev => (
                <div key={ev.id} className="relative text-xs space-y-1">
                  <div className="absolute -left-[27px] top-1 w-2.5 h-2.5 rounded-full bg-teal-700 ring-4 ring-white"></div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-teal-800 text-xs">{ev.event_type}</span>
                    <span className="text-slate-500 font-mono text-[11px]">
                      {new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} IST
                    </span>
                  </div>
                  <div className="text-slate-700">
                    Actor: <strong className="text-slate-900">{ev.actor_name || 'System Heuristic'}</strong>
                  </div>
                  {ev.payload && (
                    <div className="text-[11px] text-slate-600 font-mono bg-slate-50 p-2.5 rounded border border-slate-200">
                      {JSON.stringify(ev.payload)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COL: Coordinator Command Controls & Reporter Card */}
        <div className="space-y-6">
          {/* Action Box */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-2">
              Coordinator Verification Gate
            </h3>

            {/* Verification Button */}
            <div>
              <span className="text-xs font-medium text-slate-700 block mb-1.5">Verification Status</span>
              {selectedIncident.verification_status === 'VERIFIED' ? (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-900 space-y-1">
                  <div className="flex items-center space-x-1.5 font-semibold text-emerald-800">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>Ground Truth Confirmed</span>
                  </div>
                  <div className="text-[11px] text-slate-700">
                    Verified by: {selectedIncident.verified_by?.full_name}
                  </div>
                  {selectedIncident.verification_notes && (
                    <p className="text-[10px] text-slate-500 italic">"{selectedIncident.verification_notes}"</p>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => onVerifyIncident(selectedIncident.id)}
                  className="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-medium py-2.5 rounded text-xs transition flex items-center justify-center space-x-2 shadow-xs cursor-pointer"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Verify Incident as Coordinator</span>
                </button>
              )}
            </div>

            {/* Severity Adjustment */}
            <div className="pt-2 border-t border-slate-100 space-y-2">
              <span className="text-xs font-medium text-slate-700 block">Override Operational Severity</span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  onClick={() => onEscalateSeverity(selectedIncident.id, 'CRITICAL')}
                  className="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 py-2 rounded font-medium transition cursor-pointer"
                >
                  Set CRITICAL
                </button>
                <button
                  onClick={() => onEscalateSeverity(selectedIncident.id, 'HIGH')}
                  className="bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 py-2 rounded font-medium transition cursor-pointer"
                >
                  Set HIGH
                </button>
              </div>
            </div>

            {/* Dispatch Relief Shortcut */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <span className="text-xs font-medium text-slate-700 block">Logistics Allocation</span>
              <button
                onClick={onNavigateToResources}
                className="w-full bg-teal-800 hover:bg-teal-900 text-white font-medium py-2.5 rounded text-xs transition flex items-center justify-center space-x-2 shadow-xs cursor-pointer"
              >
                <LifeBuoy className="w-4 h-4" />
                <span>Open Resource Allocation Desk ➔</span>
              </button>
            </div>
          </div>

          {/* Reporter Identification Card */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-3 text-xs">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-700 block border-b border-slate-100 pb-2">
              Reporting Source Metadata
            </span>

            <div className="flex justify-between items-center">
              <span className="text-slate-500">Reporter:</span>
              <span className="font-semibold text-slate-900">
                {selectedIncident.reporter?.full_name || 'Anonymous Citizen Intake'}
              </span>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-slate-500">Credential Role:</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-100 text-slate-700 border border-slate-200">
                {selectedIncident.reporter?.role || 'Citizen'}
              </span>
            </div>

            {selectedIncident.reporter?.phone && (
              <div className="flex justify-between items-center font-mono">
                <span className="text-slate-500 font-sans">Contact:</span>
                <span className="text-slate-800">{selectedIncident.reporter.phone}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
