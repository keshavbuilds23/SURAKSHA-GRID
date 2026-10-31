import React, { useState } from 'react';
import {
  AlertTriangle,
  Clock,
  LifeBuoy,
  ArrowRight,
  Search,
  Users,
  Activity,
  Box,
} from 'lucide-react';
import { Incident, IncidentSeverity } from '../../types/incident';
import { Resource, Assignment } from '../../types/resource';
import { IncidentTrendChart } from './IncidentTrendChart';
import { SeverityDistribution } from './SeverityDistribution';
import { IncidentDrawer } from './IncidentDrawer';

interface OperationsDashboardProps {
  incidents: Incident[];
  resources: Resource[];
  assignments: Assignment[];
  onVerifyIncident: (id: number) => void;
  onEscalateSeverity: (id: number, sev: IncidentSeverity) => void;
  onNavigateToMap: (id?: number) => void;
  onNavigateToDetails: (id: number) => void;
  onNavigateToResources: () => void;
  onNavigateToReport: () => void;
}

export const OperationsDashboard: React.FC<OperationsDashboardProps> = ({
  incidents,
  resources,
  assignments,
  onVerifyIncident,
  onEscalateSeverity,
  onNavigateToMap,
  onNavigateToDetails,
  onNavigateToResources,
  onNavigateToReport,
}) => {
  const [selectedIncidentForDrawer, setSelectedIncidentForDrawer] = useState<Incident | null>(null);
  const [streamSearchQuery, setStreamSearchQuery] = useState<string>('');
  const [streamSeverityFilter, setStreamSeverityFilter] = useState<string>('ALL');

  // Single Source of Truth Metrics
  const totalIncidents = incidents.length;
  const criticalIncidents = incidents.filter(i => i.severity === 'CRITICAL');
  const criticalCount = criticalIncidents.length;
  const pendingIncidents = incidents.filter(i => i.verification_status === 'PENDING');
  const pendingCount = pendingIncidents.length;
  const activeAssignmentsCount = assignments.filter(
    a => a.status === 'ASSIGNED' || a.status === 'IN_TRANSIT'
  ).length;
  const totalAffected = incidents.reduce((sum, i) => sum + i.affected_count, 0);
  const totalAvailableStock = resources.reduce((sum, r) => sum + r.available_quantity, 0);
  const totalDepotsCount = resources.length;

  // Urgent alerts list: unverified critical/high reports
  const urgentAlerts = incidents
    .filter(i => i.severity === 'CRITICAL' || (i.severity === 'HIGH' && i.verification_status === 'PENDING'))
    .slice(0, 3);

  // Filtered incident stream
  const filteredStream = incidents.filter(i => {
    const matchSev = streamSeverityFilter === 'ALL' || i.severity === streamSeverityFilter;
    const matchSearch =
      streamSearchQuery === '' ||
      i.title.toLowerCase().includes(streamSearchQuery.toLowerCase()) ||
      i.landmark.toLowerCase().includes(streamSearchQuery.toLowerCase());
    return matchSev && matchSearch;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* 1. SITUATION OVERVIEW KPI BAR */}
      <section>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {/* Total Reports */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] uppercase tracking-wider font-semibold">TOTAL REPORTS</span>
              <Activity className="w-4 h-4 text-slate-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 font-mono">{totalIncidents}</div>
            <div className="mt-0.5 text-xs text-slate-500">Assam River Basin</div>
          </div>

          {/* Critical Distress */}
          <div
            className={`rounded-lg p-4 border shadow-xs transition ${
              criticalCount > 0
                ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-rose-800">
                CRITICAL DISTRESS
              </span>
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-rose-700">{criticalCount}</div>
            <div className="mt-0.5 text-xs text-rose-600">Immediate threat to life</div>
          </div>

          {/* Pending Triage */}
          <div
            className={`rounded-lg p-4 border shadow-xs ${
              pendingCount > 0
                ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-amber-800">
                PENDING TRIAGE
              </span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-amber-700">{pendingCount}</div>
            <div className="mt-0.5 text-xs text-amber-600">Requires verification</div>
          </div>

          {/* Active Missions */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] uppercase tracking-wider font-semibold">ACTIVE MISSIONS</span>
              <LifeBuoy className="w-4 h-4 text-teal-700" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 font-mono">{activeAssignmentsCount}</div>
            <div className="mt-0.5 text-xs text-slate-500">In-flight / deployed</div>
          </div>

          {/* People Affected (Replaces Affected Souls) */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] uppercase tracking-wider font-semibold">PEOPLE AFFECTED</span>
              <Users className="w-4 h-4 text-slate-400" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 font-mono">{totalAffected}</div>
            <div className="mt-0.5 text-xs text-slate-500">Estimated across basin</div>
          </div>

          {/* Depot Ready / Staging Depots (Resolves Discrepancy) */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs">
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-[11px] uppercase tracking-wider font-semibold">DEPOT READY</span>
              <Box className="w-4 h-4 text-teal-700" />
            </div>
            <div className="mt-2 text-2xl font-bold text-slate-900 font-mono">{totalAvailableStock}</div>
            <div className="mt-0.5 text-xs text-slate-500">
              Units across {totalDepotsCount} staging depots
            </div>
          </div>
        </div>
      </section>

      {/* 2. CRITICAL INCIDENTS REQUIRING ATTENTION */}
      {urgentAlerts.length > 0 && (
        <section className="bg-rose-50/50 border border-rose-200 rounded-lg p-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center space-x-2 text-rose-900 font-semibold text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-700" />
              <span>Priority Action Queue ({urgentAlerts.length} Critical & Urgent Reports)</span>
            </div>
            <span className="text-[11px] text-rose-700">Immediate EOC action recommended</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {urgentAlerts.map(inc => (
              <div
                key={inc.id}
                onClick={() => setSelectedIncidentForDrawer(inc)}
                className="bg-white p-3.5 rounded border border-rose-200/80 hover:border-rose-400 cursor-pointer shadow-xs transition space-y-2 group"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                    {inc.severity}
                  </span>
                  <span className="text-slate-500 text-[11px] font-mono">
                    {new Date(inc.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div className="font-semibold text-xs text-slate-900 group-hover:text-teal-800 transition line-clamp-1">
                  {inc.title}
                </div>

                <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100">
                  <span className="truncate max-w-[150px]">{inc.landmark}</span>
                  <span className="font-medium text-slate-700">{inc.affected_count} people</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3. INCIDENT DISTRIBUTION & PROGRESSION TIMELINE */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <IncidentTrendChart incidents={incidents} />
        <SeverityDistribution incidents={incidents} />
      </section>

      {/* 4. LIVE INCIDENT STREAM & RELIEF DEPOT INVENTORY */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Live Incident Stream (2 Cols) */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                  Live Emergency Incident Stream
                </h3>
                <p className="text-xs text-slate-500">
                  Click any incident to open the operational triage drawer.
                </p>
              </div>

              {/* Stream filters */}
              <div className="flex items-center space-x-2 text-xs">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search stream..."
                    value={streamSearchQuery}
                    onChange={e => setStreamSearchQuery(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded pl-8 pr-2.5 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-700 focus:bg-white"
                  />
                </div>

                <select
                  value={streamSeverityFilter}
                  onChange={e => setStreamSeverityFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs text-slate-700 focus:outline-none focus:border-teal-700"
                >
                  <option value="ALL">All Severities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>
            </div>

            {/* Stream List */}
            <div className="divide-y divide-slate-100 max-h-[460px] overflow-y-auto pr-1">
              {filteredStream.map(inc => {
                const sevBadge =
                  inc.severity === 'CRITICAL'
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : inc.severity === 'HIGH'
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : inc.severity === 'MEDIUM'
                    ? 'bg-sky-50 text-sky-800 border-sky-200'
                    : 'bg-slate-100 text-slate-700 border-slate-200';

                const statusBadge =
                  inc.verification_status === 'VERIFIED'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : inc.verification_status === 'RESOLVED'
                    ? 'bg-slate-100 text-slate-600 border-slate-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200';

                return (
                  <div
                    key={inc.id}
                    onClick={() => setSelectedIncidentForDrawer(inc)}
                    className="py-3 px-3 cursor-pointer hover:bg-slate-50 rounded-md transition flex items-center justify-between group"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${sevBadge}`}>
                          {inc.severity}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded border ${statusBadge}`}>
                          {inc.verification_status}
                        </span>
                        <span className="font-medium text-xs text-slate-900 group-hover:text-teal-800 transition">
                          {inc.title}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-500 truncate max-w-xl">
                        {inc.landmark} • <strong className="text-slate-700">{inc.affected_count}</strong> people
                        affected
                      </p>
                    </div>

                    <div className="text-right flex items-center space-x-3">
                      <span className="text-[11px] text-slate-500 font-mono">
                        {new Date(inc.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-teal-700 group-hover:translate-x-0.5 transition" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 text-[11px]">
              Showing {filteredStream.length} of {incidents.length} incidents
            </span>
            <div className="flex space-x-2">
              <button
                onClick={() => onNavigateToMap()}
                className="text-teal-800 hover:text-teal-900 text-xs font-semibold flex items-center space-x-1"
              >
                <span>Full Geospatial Map</span>
                <span>➔</span>
              </button>
            </div>
          </div>
        </div>

        {/* Relief Depot Quick Stock (1 Col) */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                  Relief Staging Inventory
                </h3>
                <span className="text-xs text-slate-500">{totalDepotsCount} Depots Managed</span>
              </div>
              <button
                onClick={onNavigateToResources}
                className="text-xs text-teal-800 hover:text-teal-900 font-medium hover:underline"
              >
                Logistics Console ➔
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Real-time available staging depot reserves across Brahmaputra clusters.
            </p>

            <div className="space-y-3">
              {resources.map(res => {
                const pct = Math.round((res.available_quantity / res.total_quantity) * 100);
                const barColor = pct < 25 ? 'bg-rose-500' : pct < 50 ? 'bg-amber-500' : 'bg-teal-700';

                return (
                  <div key={res.id} className="bg-slate-50 p-3 rounded border border-slate-200">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-medium text-slate-800 truncate pr-2">{res.name}</span>
                      <span className="text-slate-900 font-mono font-semibold whitespace-nowrap">
                        {res.available_quantity} / {res.total_quantity} {res.unit}
                      </span>
                    </div>

                    <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2 overflow-hidden">
                      <div
                        className={`${barColor} h-1.5 rounded-full transition-all duration-300`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-slate-500 mt-1.5">
                      <span>{res.location_name.split(' ')[0]} Hub</span>
                      <span>{pct}% ready</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100">
            <button
              onClick={onNavigateToReport}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 font-medium py-2 rounded text-xs transition flex items-center justify-center space-x-1.5 shadow-xs"
            >
              <span>+ Log Field Incident</span>
            </button>
          </div>
        </div>
      </section>

      {/* Interactive Incident Side Drawer */}
      <IncidentDrawer
        incident={selectedIncidentForDrawer}
        onClose={() => setSelectedIncidentForDrawer(null)}
        onVerify={id => {
          onVerifyIncident(id);
          if (selectedIncidentForDrawer && selectedIncidentForDrawer.id === id) {
            setSelectedIncidentForDrawer({
              ...selectedIncidentForDrawer,
              verification_status: 'VERIFIED',
              verified_by: { id: 4, full_name: 'Dr. N. Sarma (Current User)' },
              verification_notes: 'Human verified via coordinator command console.',
            });
          }
        }}
        onEscalateSeverity={(id, sev) => {
          onEscalateSeverity(id, sev);
          if (selectedIncidentForDrawer && selectedIncidentForDrawer.id === id) {
            setSelectedIncidentForDrawer({ ...selectedIncidentForDrawer, severity: sev });
          }
        }}
        onNavigateToMap={id => onNavigateToMap(id)}
        onNavigateToDetails={id => onNavigateToDetails(id)}
      />
    </div>
  );
};
