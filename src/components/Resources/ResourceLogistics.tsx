import React, { useState } from 'react';
import { Box, LifeBuoy, RotateCcw, AlertTriangle, PlusCircle, X, ShieldCheck } from 'lucide-react';
import { Resource, Assignment, AssignmentStatus } from '../../types/resource';
import { Incident } from '../../types/incident';

interface ResourceLogisticsProps {
  resources: Resource[];
  assignments: Assignment[];
  incidents: Incident[];
  onUpdateAssignmentStatus: (assignmentId: number, newStatus: AssignmentStatus) => void;
  onCreateAssignment: (incidentId: number, resourceId: number, quantity: number, notes: string) => void;
}

export const ResourceLogistics: React.FC<ResourceLogisticsProps> = ({
  resources,
  assignments,
  incidents,
  onUpdateAssignmentStatus,
  onCreateAssignment,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedIncidentId, setSelectedIncidentId] = useState<number>(incidents[0]?.id || 101);
  const [selectedResourceId, setSelectedResourceId] = useState<number>(resources[0]?.id || 1);
  const [dispatchQuantity, setDispatchQuantity] = useState<number>(1);
  const [dispatchNotes, setDispatchNotes] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedResource = resources.find(r => r.id === selectedResourceId);

  const handleOpenModal = () => {
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const handleModalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResource) return;

    if (dispatchQuantity <= 0) {
      setErrorMessage('Quantity must be greater than zero.');
      return;
    }

    if (dispatchQuantity > selectedResource.available_quantity) {
      setErrorMessage(
        `Insufficient availability. Depot currently has only ${selectedResource.available_quantity} ${selectedResource.unit} ready.`
      );
      return;
    }

    onCreateAssignment(selectedIncidentId, selectedResourceId, dispatchQuantity, dispatchNotes);
    setIsModalOpen(false);
    setDispatchQuantity(1);
    setDispatchNotes('');
    setErrorMessage(null);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header and Quick Stats */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-200 p-5 rounded-lg shadow-xs">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
            <Box className="w-5 h-5 text-teal-800" />
            <span>Relief Depot Inventory & Tactical Dispatch Logistics</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Pre-seeded relief staging depots across Assam districts. All dispatch actions enforce atomic inventory transitions.
          </p>
        </div>

        <button
          onClick={handleOpenModal}
          className="bg-teal-800 hover:bg-teal-900 text-white px-4 py-2 rounded font-medium text-xs transition flex items-center space-x-2 shadow-xs cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Dispatch Relief Asset</span>
        </button>
      </div>

      {/* Main Grid: Depot Stock & Missions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Depots Inventory */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
              Staging Depot Inventory ({resources.length} Depots)
            </h3>
            <span className="text-xs font-mono text-slate-600">
              Total Units Ready:{' '}
              <strong className="text-slate-900">
                {resources.reduce((sum, r) => sum + r.available_quantity, 0)}
              </strong>
            </span>
          </div>

          <div className="space-y-3">
            {resources.map(res => {
              const pct = Math.round((res.available_quantity / res.total_quantity) * 100);
              const barColor = pct < 25 ? 'bg-rose-500' : pct < 50 ? 'bg-amber-500' : 'bg-teal-700';
              const textColor = pct < 25 ? 'text-rose-700' : pct < 50 ? 'text-amber-800' : 'text-teal-800';

              return (
                <div key={res.id} className="bg-slate-50 p-3.5 rounded border border-slate-200 space-y-2">
                  <div className="flex justify-between items-start text-xs">
                    <div>
                      <div className="font-semibold text-slate-900 text-sm">{res.name}</div>
                      <div className="text-[11px] text-slate-500 flex items-center space-x-1 mt-0.5">
                        <span>📍 {res.location_name}</span>
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <span className={`text-sm font-bold ${textColor}`}>
                        {res.available_quantity}
                      </span>
                      <span className="text-slate-500 text-xs"> / {res.total_quantity} {res.unit}</span>
                      <div className="text-[10px] text-slate-400 font-sans">{pct}% Ready</div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div
                      className={`${barColor} h-2 rounded-full transition-all duration-300`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Active Dispatch Missions */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
              Relief Dispatch Missions ({assignments.length})
            </h3>
            <span className="text-xs font-mono text-amber-800">
              In-Flight:{' '}
              <strong className="text-slate-900">
                {assignments.filter(a => a.status === 'ASSIGNED' || a.status === 'IN_TRANSIT').length}
              </strong>
            </span>
          </div>

          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
            {assignments.map(asgn => {
              const isAssigned = asgn.status === 'ASSIGNED';
              const isInTransit = asgn.status === 'IN_TRANSIT';
              const isDelivered = asgn.status === 'DELIVERED';
              const isReturned = asgn.status === 'RETURNED';
              const isCancelled = asgn.status === 'CANCELLED';

              const statusBadge =
                isInTransit
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : isDelivered
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : isAssigned
                  ? 'bg-sky-50 text-sky-800 border-sky-200'
                  : isReturned
                  ? 'bg-slate-100 text-slate-700 border-slate-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200';

              return (
                <div key={asgn.id} className="p-3.5 bg-slate-50 rounded border border-slate-200 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-mono text-teal-800 font-semibold">Mission #{asgn.id}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase border ${statusBadge}`}>
                      {asgn.status}
                    </span>
                  </div>

                  <div className="font-semibold text-slate-900">
                    {asgn.assigned_quantity} × {asgn.resource_name}
                  </div>

                  <div className="text-slate-600 text-[11px] truncate">
                    Incident: <strong className="text-slate-800">{asgn.incident_title}</strong>
                  </div>

                  {asgn.notes && (
                    <div className="text-[11px] text-slate-500 italic bg-white p-2 rounded border border-slate-200">
                      "{asgn.notes}"
                    </div>
                  )}

                  {/* Mission State Transition Actions */}
                  <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-500 font-mono">
                      By: {asgn.assigned_by_name || 'Coordinator'}
                    </span>

                    <div className="flex items-center space-x-1.5">
                      {isAssigned && (
                        <>
                          <button
                            onClick={() => onUpdateAssignmentStatus(asgn.id, 'IN_TRANSIT')}
                            className="bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer"
                          >
                            Mark In-Transit
                          </button>
                          <button
                            onClick={() => onUpdateAssignmentStatus(asgn.id, 'CANCELLED')}
                            className="bg-white hover:bg-rose-50 border border-slate-300 text-slate-700 hover:text-rose-800 px-2.5 py-1 rounded text-[11px] transition cursor-pointer"
                            title="Cancels undispatched asset and restores depot inventory"
                          >
                            Cancel (Undispatched)
                          </button>
                        </>
                      )}

                      {isInTransit && (
                        <>
                          <button
                            onClick={() => onUpdateAssignmentStatus(asgn.id, 'DELIVERED')}
                            className="bg-emerald-700 hover:bg-emerald-800 text-white px-2.5 py-1 rounded text-[11px] font-medium transition cursor-pointer shadow-xs"
                          >
                            Confirm Delivery
                          </button>
                          <button
                            onClick={() => onUpdateAssignmentStatus(asgn.id, 'CANCELLED')}
                            className="bg-white hover:bg-rose-50 border border-rose-300 text-rose-800 px-2.5 py-1 rounded text-[11px] transition cursor-pointer"
                            title="Cancels while in transit. Assets are still in the field; stock will not be restored until physically checked into depot via Return."
                          >
                            Abort (In-Transit)
                          </button>
                        </>
                      )}

                      {isDelivered && (
                        <button
                          onClick={() => onUpdateAssignmentStatus(asgn.id, 'RETURNED')}
                          className="bg-teal-800 hover:bg-teal-900 text-white px-2.5 py-1 rounded text-[11px] font-medium transition flex items-center space-x-1 shadow-xs cursor-pointer"
                          title="Returns durable equipment back to depot stock"
                        >
                          <RotateCcw className="w-3 h-3 text-teal-200" />
                          <span>Return to Depot</span>
                        </button>
                      )}

                      {isCancelled && asgn.inventory_restored === 0 && (
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] text-amber-800 font-mono">
                            Field Recalled (Stock Deducted)
                          </span>
                          <button
                            onClick={() => onUpdateAssignmentStatus(asgn.id, 'RETURNED')}
                            className="bg-teal-800 hover:bg-teal-900 text-white px-2 py-0.5 rounded text-[11px] font-medium transition flex items-center space-x-1 shadow-xs cursor-pointer"
                            title="Physically check returned asset into depot and restore inventory"
                          >
                            <RotateCcw className="w-3 h-3 text-teal-200" />
                            <span>Check-In to Depot</span>
                          </button>
                        </div>
                      )}

                      {isCancelled && asgn.inventory_restored === 1 && (
                        <span className="text-[10px] text-slate-500 italic">
                          Cancelled • Stock restored to depot
                        </span>
                      )}

                      {isReturned && (
                        <span className="text-[10px] text-emerald-800 font-mono">
                          ✓ Checked in • Stock restored
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* DISPATCH ALLOCATION MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-lg w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center space-x-2">
                <LifeBuoy className="w-5 h-5 text-teal-800" />
                <h3 className="text-base font-bold text-slate-900">Allocate & Dispatch Relief Resource</h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMessage && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleModalSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Target Flood Incident</label>
                <select
                  value={selectedIncidentId}
                  onChange={e => setSelectedIncidentId(Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-900 focus:outline-none focus:border-teal-700"
                >
                  {incidents.map(inc => (
                    <option key={inc.id} value={inc.id}>
                      #{inc.id} [{inc.severity}] {inc.title.substring(0, 40)}... ({inc.landmark})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Select Relief Resource Depot</label>
                <select
                  value={selectedResourceId}
                  onChange={e => setSelectedResourceId(Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-900 focus:outline-none focus:border-teal-700"
                >
                  {resources.map(res => (
                    <option key={res.id} value={res.id}>
                      {res.name} — Available: {res.available_quantity} {res.unit} ({res.location_name})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">
                  Dispatch Quantity (Available: {selectedResource?.available_quantity} {selectedResource?.unit})
                </label>
                <input
                  type="number"
                  min="1"
                  max={selectedResource?.available_quantity || 1}
                  value={dispatchQuantity}
                  onChange={e => setDispatchQuantity(Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-900 font-mono focus:outline-none focus:border-teal-700"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Mission Operational Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Assigned to SDRF Boat Team Delta departing Nimati Ghat"
                  value={dispatchNotes}
                  onChange={e => setDispatchNotes(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-900 focus:outline-none focus:border-teal-700"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-teal-800 hover:bg-teal-900 text-white rounded font-medium transition flex items-center space-x-1.5 shadow-xs cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4 text-teal-200" />
                  <span>Authorize & Dispatch</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
