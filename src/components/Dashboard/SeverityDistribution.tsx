import React from 'react';
import { ShieldAlert, Users } from 'lucide-react';
import { Incident } from '../../types/incident';

interface SeverityDistributionProps {
  incidents: Incident[];
}

export const SeverityDistribution: React.FC<SeverityDistributionProps> = ({ incidents }) => {
  const total = incidents.length || 1;

  // Severity counts
  const critical = incidents.filter(i => i.severity === 'CRITICAL');
  const high = incidents.filter(i => i.severity === 'HIGH');
  const medium = incidents.filter(i => i.severity === 'MEDIUM');
  const low = incidents.filter(i => i.severity === 'LOW');

  const criticalAffected = critical.reduce((acc, i) => acc + i.affected_count, 0);
  const highAffected = high.reduce((acc, i) => acc + i.affected_count, 0);
  const mediumAffected = medium.reduce((acc, i) => acc + i.affected_count, 0);
  const lowAffected = low.reduce((acc, i) => acc + i.affected_count, 0);
  const totalAffected = incidents.reduce((acc, i) => acc + i.affected_count, 0);

  // Category counts
  const categoryCounts = {
    MAROONED_RESCUE: incidents.filter(i => i.category === 'MAROONED_RESCUE').length,
    MEDICAL_EMERGENCY: incidents.filter(i => i.category === 'MEDICAL_EMERGENCY').length,
    FOOD_WATER_CRISIS: incidents.filter(i => i.category === 'FOOD_WATER_CRISIS').length,
    INFRASTRUCTURE_BREACH: incidents.filter(i => i.category === 'INFRASTRUCTURE_BREACH').length,
    GENERAL_RELIEF: incidents.filter(i => i.category === 'GENERAL_RELIEF').length,
  };

  const severityItems = [
    {
      label: 'Critical',
      count: critical.length,
      affected: criticalAffected,
      pct: Math.round((critical.length / total) * 100),
      colorBar: 'bg-rose-600',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
      description: 'Marooned / high casualty risk',
    },
    {
      label: 'High',
      count: high.length,
      affected: highAffected,
      pct: Math.round((high.length / total) * 100),
      colorBar: 'bg-amber-600',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
      description: 'Rising water / cut off access',
    },
    {
      label: 'Medium',
      count: medium.length,
      affected: mediumAffected,
      pct: Math.round((medium.length / total) * 100),
      colorBar: 'bg-sky-600',
      badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
      description: 'Potable water / food shortage',
    },
    {
      label: 'Low',
      count: low.length,
      affected: lowAffected,
      pct: Math.round((low.length / total) * 100),
      colorBar: 'bg-slate-400',
      badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
      description: 'Relief camps / monitoring',
    },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
              Severity & Hazard Triage Split
            </h3>
          </div>
          <span className="text-xs text-slate-500 flex items-center space-x-1">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            <span>
              Total: <strong className="text-slate-900">{totalAffected}</strong> people affected
            </span>
          </span>
        </div>

        <p className="text-xs text-slate-500 mb-4">
          Breakdown of active incidents weighted by operational urgency and affected population.
        </p>

        {/* Severity Progress Rows */}
        <div className="space-y-3.5">
          {severityItems.map(item => (
            <div key={item.label} className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <div className="flex items-center space-x-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${item.badgeClass}`}
                  >
                    {item.label}
                  </span>
                  <span className="text-slate-500 text-[11px] hidden sm:inline">
                    {item.description}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-slate-700">
                  <span className="font-bold">{item.count}</span> incident{item.count !== 1 ? 's' : ''} (
                  {item.pct}%) • <span className="text-slate-500">{item.affected} people</span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div
                  className={`${item.colorBar} h-2 rounded-full transition-all duration-300`}
                  style={{ width: `${Math.max(item.pct, item.count > 0 ? 4 : 0)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Category Pills Footer */}
      <div className="mt-5 pt-3 border-t border-slate-100">
        <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-2">
          Hazard Category Distribution
        </span>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="px-2.5 py-1 rounded bg-slate-100 border border-slate-200 text-slate-700 text-[11px]">
            Marooned Rescue: <strong className="text-slate-900">{categoryCounts.MAROONED_RESCUE}</strong>
          </span>
          <span className="px-2.5 py-1 rounded bg-slate-100 border border-slate-200 text-slate-700 text-[11px]">
            Medical Emergencies: <strong className="text-slate-900">{categoryCounts.MEDICAL_EMERGENCY}</strong>
          </span>
          <span className="px-2.5 py-1 rounded bg-slate-100 border border-slate-200 text-slate-700 text-[11px]">
            Water & Food: <strong className="text-slate-900">{categoryCounts.FOOD_WATER_CRISIS}</strong>
          </span>
          <span className="px-2.5 py-1 rounded bg-slate-100 border border-slate-200 text-slate-700 text-[11px]">
            Infrastructure: <strong className="text-slate-900">{categoryCounts.INFRASTRUCTURE_BREACH}</strong>
          </span>
          <span className="px-2.5 py-1 rounded bg-slate-100 border border-slate-200 text-slate-700 text-[11px]">
            General Relief: <strong className="text-slate-900">{categoryCounts.GENERAL_RELIEF}</strong>
          </span>
        </div>
      </div>
    </div>
  );
};
