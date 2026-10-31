import React, { useEffect } from 'react';
import { X, MapPin, Users, Phone, AlertTriangle, ExternalLink, CheckCircle, Navigation } from 'lucide-react';
import { Incident, IncidentSeverity } from '../../types/incident';

interface IncidentDrawerProps {
  incident: Incident | null;
  onClose: () => void;
  onVerify: (id: number) => void;
  onEscalateSeverity: (id: number, sev: IncidentSeverity) => void;
  onNavigateToMap: (id: number) => void;
  onNavigateToDetails: (id: number) => void;
}

export const IncidentDrawer: React.FC<IncidentDrawerProps> = ({
  incident,
  onClose,
  onVerify,
  onEscalateSeverity,
  onNavigateToMap,
  onNavigateToDetails,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!incident) return null;

  const sevBadge =
    incident.severity === 'CRITICAL'
      ? 'bg-rose-50 text-rose-700 border-rose-200'
      : incident.severity === 'HIGH'
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : incident.severity === 'MEDIUM'
      ? 'bg-sky-50 text-sky-800 border-sky-200'
      : 'bg-slate-100 text-slate-700 border-slate-200';

  const statusBadge =
    incident.verification_status === 'VERIFIED'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : incident.verification_status === 'RESOLVED'
      ? 'bg-slate-100 text-slate-600 border-slate-200'
      : 'bg-amber-50 text-amber-800 border-amber-200';

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end transition-opacity">
      {/* Backdrop click to close */}
      <div className="absolute inset-0" onClick={onClose}></div>

      {/* Slide-over panel */}
      <aside className="relative w-full max-w-lg bg-white border-l border-slate-200 shadow-2xl flex flex-col h-full z-10">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2.5">
            <span className="font-mono text-xs text-teal-800 font-bold bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
              #{incident.id}
            </span>
            <span className="text-xs uppercase tracking-wider text-slate-600 font-semibold">
              Incident Quick Action Dossier
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-100 transition"
            title="Close Drawer (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Severity & Status Bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className={`px-2.5 py-1 rounded text-xs font-semibold uppercase tracking-wider border ${sevBadge}`}>
                Severity: {incident.severity}
              </span>
              <span className={`text-xs px-2.5 py-1 rounded border font-semibold ${statusBadge}`}>
                {incident.verification_status}
              </span>
            </div>
            <span className="text-[11px] font-mono text-slate-500">
              {new Date(incident.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} IST
            </span>
          </div>

          {/* Title & Description */}
          <div>
            <h2 className="text-lg font-bold text-slate-900 leading-snug">{incident.title}</h2>
            <p className="mt-2 text-xs text-slate-700 leading-relaxed bg-slate-50 p-3.5 rounded border border-slate-200">
              {incident.description}
            </p>
          </div>

          {/* Key Facts Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-50 p-3 rounded border border-slate-200">
              <div className="flex items-center space-x-1.5 text-slate-500 mb-1">
                <MapPin className="w-3.5 h-3.5 text-teal-700" />
                <span className="text-[10px] uppercase font-semibold">Location / Landmark</span>
              </div>
              <span className="font-semibold text-slate-800 block truncate">{incident.landmark}</span>
              <span className="text-[10px] text-slate-500 font-mono">
                {incident.latitude != null ? `${incident.latitude.toFixed(4)}°N` : 'N/A'},{' '}
                {incident.longitude != null ? `${incident.longitude.toFixed(4)}°E` : 'N/A'}
              </span>
            </div>

            <div className="bg-slate-50 p-3 rounded border border-slate-200">
              <div className="flex items-center space-x-1.5 text-slate-500 mb-1">
                <Users className="w-3.5 h-3.5 text-teal-700" />
                <span className="text-[10px] uppercase font-semibold">People Affected</span>
              </div>
              <span className="font-bold text-slate-900 text-base">{incident.affected_count}</span>
              <span className="text-[10px] text-slate-500 block">Ground verified count</span>
            </div>
          </div>

          {/* Medical Notice */}
          {incident.medical_required && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded flex items-start space-x-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong className="font-semibold">Urgent Medical Attention Required:</strong> On-site emergency trauma,
                infant nutrition or patient evacuation needed.
              </div>
            </div>
          )}

          {/* Reporter Information */}
          <div className="bg-slate-50 p-3.5 rounded border border-slate-200 text-xs space-y-1.5">
            <span className="text-[10px] uppercase font-semibold text-slate-500 block">Report Origin</span>
            <div className="flex justify-between items-center">
              <span className="font-medium text-slate-800">{incident.reporter?.full_name || 'Ground Volunteer'}</span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                {incident.reporter?.role || 'field'}
              </span>
            </div>
            {incident.reporter?.phone && (
              <div className="flex items-center space-x-1 text-slate-600 text-[11px]">
                <Phone className="w-3 h-3 text-slate-400" />
                <span>{incident.reporter.phone}</span>
              </div>
            )}
          </div>

          {/* Verification Status */}
          {incident.verification_status === 'VERIFIED' ? (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded text-xs space-y-1 text-emerald-900">
              <div className="flex items-center space-x-1.5 font-semibold text-emerald-800">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <span>Verified by {incident.verified_by?.full_name || 'Assam EOC'}</span>
              </div>
              <p className="text-[11px] text-emerald-800/90 italic">
                "{incident.verification_notes || 'Confirmed via VHF radio contact with circle officer.'}"
              </p>
            </div>
          ) : (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-900 space-y-1">
              <div className="flex items-center space-x-1.5 font-semibold text-amber-800">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Pending Coordinator Verification</span>
              </div>
              <p className="text-[11px] text-amber-800/90">
                Field telemetry requires cross-verification with circle revenue officer before high-capacity asset deployment.
              </p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-slate-200 bg-slate-50 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            {incident.verification_status !== 'VERIFIED' && (
              <button
                onClick={() => onVerify(incident.id)}
                className="bg-emerald-700 hover:bg-emerald-800 text-white font-medium py-2 px-3 rounded text-xs transition flex items-center justify-center space-x-1.5 shadow-xs"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Confirm Verification</span>
              </button>
            )}

            {incident.severity !== 'CRITICAL' && (
              <button
                onClick={() => onEscalateSeverity(incident.id, 'CRITICAL')}
                className="bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 font-medium py-2 px-3 rounded text-xs transition flex items-center justify-center space-x-1.5"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                <span>Escalate to Critical</span>
              </button>
            )}

            <button
              onClick={() => {
                onClose();
                onNavigateToMap(incident.id);
              }}
              className="bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-medium py-2 px-3 rounded text-xs transition flex items-center justify-center space-x-1.5"
            >
              <Navigation className="w-3.5 h-3.5 text-teal-700" />
              <span>View on Live Map</span>
            </button>

            <button
              onClick={() => {
                onClose();
                onNavigateToDetails(incident.id);
              }}
              className="bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-medium py-2 px-3 rounded text-xs transition flex items-center justify-center space-x-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              <span>Full Triage Dossier</span>
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
};
