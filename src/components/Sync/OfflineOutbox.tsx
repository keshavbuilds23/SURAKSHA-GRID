import React from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2, ShieldAlert, Database, AlertTriangle, GitFork, Trash2 } from 'lucide-react';
import { QueuedOfflineReport } from '../../types/sync';

interface OfflineOutboxProps {
  outbox: QueuedOfflineReport[];
  isOnline: boolean;
  onToggleOnlineSimulation: () => void;
  onSyncOutbox: () => void;
  onForkConflict: (report: QueuedOfflineReport) => void;
  onDiscardConflict: (client_report_id: string) => void;
  syncSuccessMessage: string | null;
  syncErrorMessage?: string | null;
}

export const OfflineOutbox: React.FC<OfflineOutboxProps> = ({
  outbox,
  isOnline,
  onToggleOnlineSimulation,
  onSyncOutbox,
  onForkConflict,
  onDiscardConflict,
  syncSuccessMessage,
  syncErrorMessage,
}) => {
  const pendingCount = outbox.filter(i => i.status === 'QUEUED' || i.status === 'FAILED').length;
  const conflictCount = outbox.filter(i => i.status === 'CONFLICT').length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-xs space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
              <Database className="w-5 h-5 text-teal-800" />
              <span>Offline Outbox & Persistent Spatio-Temporal Queue</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              IndexedDB persistent client buffer (`suraksha_grid_offline_db`). Reports survive browser refresh and sync safely via UUIDv4 `client_report_id`.
            </p>
          </div>

          {/* Network Simulation Toggle */}
          <div className="flex items-center space-x-3">
            <button
              onClick={onToggleOnlineSimulation}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition flex items-center space-x-1.5 cursor-pointer ${
                isOnline
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                  : 'bg-rose-50 border-rose-200 text-rose-800 hover:bg-rose-100'
              }`}
            >
              {isOnline ? <Wifi className="w-3.5 h-3.5 text-emerald-700" /> : <WifiOff className="w-3.5 h-3.5 text-rose-700" />}
              <span>{isOnline ? 'Network: Online (Simulate Blackout)' : 'Network: Offline (Simulate Uplink)'}</span>
            </button>
          </div>
        </div>

        {/* Sync Status Banner */}
        <div className="flex items-center space-x-2 text-xs bg-slate-50 p-3 rounded border border-slate-200 font-mono text-slate-600">
          <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
          <span>
            Sync Engine Mode: <strong className="text-slate-900">Live Express REST API</strong> (POST /api/v1/sync/batch &rarr; SQLite WAL)
          </span>
        </div>

        {syncSuccessMessage && (
          <div className="p-3.5 bg-teal-50 border border-teal-200 text-teal-900 rounded-md text-xs flex items-center space-x-2 shadow-xs">
            <CheckCircle2 className="w-4 h-4 text-teal-700 flex-shrink-0" />
            <span className="font-medium">{syncSuccessMessage}</span>
          </div>
        )}

        {syncErrorMessage && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-900 rounded-md text-xs flex items-center space-x-2 shadow-xs">
            <AlertTriangle className="w-4 h-4 text-rose-700 flex-shrink-0" />
            <span className="font-medium">{syncErrorMessage}</span>
          </div>
        )}

        {/* Queue Status Box */}
        <div className="p-4 bg-slate-50 rounded border border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold block">
              IndexedDB Local Storage State
            </span>
            <div className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <span>{outbox.length} Total Report{outbox.length !== 1 ? 's' : ''} in IndexedDB</span>
              {pendingCount > 0 && (
                <span className="text-xs text-amber-800 font-medium">
                  ({pendingCount} pending sync)
                </span>
              )}
              {conflictCount > 0 && (
                <span className="text-xs text-rose-700 font-medium">
                  ({conflictCount} conflict detected)
                </span>
              )}
            </div>
          </div>

          <button
            disabled={pendingCount === 0 || !isOnline}
            onClick={onSyncOutbox}
            className="bg-teal-800 hover:bg-teal-900 disabled:bg-slate-200 disabled:text-slate-400 text-white font-medium px-4 py-2.5 rounded text-xs transition flex items-center space-x-2 shadow-xs cursor-pointer disabled:cursor-not-allowed"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>
              {!isOnline
                ? 'Network Offline (Reconnect to Sync)'
                : pendingCount === 0
                ? 'No Pending Reports'
                : 'Flush Queue to Command Server ➔'}
            </span>
          </button>
        </div>

        {/* Idempotency Safe Guarantee Note */}
        <div className="p-3.5 bg-slate-50 rounded border border-slate-200 text-xs text-slate-600 space-y-1">
          <div className="text-slate-800 font-semibold flex items-center space-x-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-teal-800" />
            <span>API Contract Idempotency & Conflict Policy</span>
          </div>
          <p className="leading-relaxed text-[11px] text-slate-500">
            In strict compliance with the architecture contract, duplicate sync requests with matching payloads return `already_synced: true` without creating redundant incidents. If an existing `client_report_id` UUID is sent with conflicting data, the server returns `IDEMPOTENCY_CONFLICT` to protect original ground truth.
          </p>
        </div>

        {/* Queued Items List */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
            Persistent Records in IndexedDB ({outbox.length})
          </h3>

          {outbox.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-500 border border-dashed border-slate-200 rounded bg-slate-50/50">
              IndexedDB queue is clean. All field reports have been acknowledged or synchronized.
            </div>
          ) : (
            <div className="space-y-3">
              {outbox.map(item => {
                const isConflict = item.status === 'CONFLICT';
                const isSyncing = item.status === 'SYNCING';

                const statusBadge = isConflict
                  ? 'bg-rose-50 text-rose-700 border-rose-300'
                  : isSyncing
                  ? 'bg-sky-50 text-sky-800 border-sky-300 animate-pulse'
                  : 'bg-amber-50 text-amber-800 border-amber-300';

                return (
                  <div
                    key={item.client_report_id}
                    className={`p-4 bg-white rounded border text-xs space-y-2.5 transition shadow-xs ${
                      isConflict ? 'border-rose-300 bg-rose-50/20' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-slate-900 text-sm block">{item.title}</span>
                          {item.follow_up_to_incident_id && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-teal-50 text-teal-800 border border-teal-200">
                              Follow-up to Incident #{item.follow_up_to_incident_id}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500">{item.landmark}</span>
                      </div>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-semibold ${statusBadge}`}>
                        {item.status}
                      </span>
                    </div>

                    <div className="text-slate-700 text-[11px] bg-slate-50 p-2.5 rounded border border-slate-200">
                      {item.description || 'No additional situation description.'}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] text-slate-600 font-mono">
                      <div>
                        <span className="font-sans text-slate-400">Category:</span>{' '}
                        <strong className="text-slate-800 font-sans">{item.category}</strong>
                      </div>
                      <div>
                        <span className="font-sans text-slate-400">People Affected:</span>{' '}
                        <strong className="text-slate-900 font-sans">{item.affected_count}</strong>
                      </div>
                      <div>
                        <span className="font-sans text-slate-400">Urgency:</span>{' '}
                        <strong className="text-amber-800 font-sans">{item.reported_urgency || 'HIGH'}</strong>
                      </div>
                      <div>
                        <span className="font-sans text-slate-400">Queued:</span>{' '}
                        <strong className="text-slate-700">
                          {new Date(item.queued_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </strong>
                      </div>
                    </div>

                    {/* Conflict Resolution Actions */}
                    {isConflict && (
                      <div className="p-3.5 bg-rose-50 rounded border border-rose-200 space-y-2">
                        <div className="flex items-center space-x-1.5 text-rose-800 font-medium text-[11px]">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-600 flex-shrink-0" />
                          <span>{item.last_error || 'IDEMPOTENCY_CONFLICT: Payload differs from server record.'}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            onClick={() => onForkConflict(item)}
                            className="bg-teal-800 hover:bg-teal-900 text-white px-3 py-1.5 rounded text-[11px] font-medium transition flex items-center space-x-1 shadow-xs cursor-pointer"
                            title="Generate a new UUIDv4 and enqueue as a follow-up report"
                          >
                            <GitFork className="w-3 h-3 text-teal-200" />
                            <span>Option A: Fork as New Report (Fresh UUID)</span>
                          </button>
                          <button
                            onClick={() => onDiscardConflict(item.client_report_id)}
                            className="bg-white hover:bg-rose-100 text-rose-800 px-3 py-1.5 rounded text-[11px] transition flex items-center space-x-1 border border-rose-200 cursor-pointer"
                            title="Discard local draft and preserve existing server report"
                          >
                            <Trash2 className="w-3 h-3 text-rose-600" />
                            <span>Option B: Discard Local Draft</span>
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="text-[10px] text-teal-800 font-mono pt-1 flex items-center justify-between border-t border-slate-100">
                      <span>client_report_id: {item.client_report_id}</span>
                      <span className="text-slate-400">IndexedDB: suraksha_grid_offline_db</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
