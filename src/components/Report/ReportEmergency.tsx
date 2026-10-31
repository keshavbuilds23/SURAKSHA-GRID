import React, { useState } from 'react';
import { AlertTriangle, Send, MapPin, CheckCircle2 } from 'lucide-react';
import { IncidentCategory, ReportedUrgency } from '../../types/incident';

interface ReportEmergencyProps {
  isOnline: boolean;
  onSubmitReport: (report: {
    title: string;
    description: string;
    category: IncidentCategory;
    reported_urgency: ReportedUrgency;
    landmark: string;
    affected_count: number;
    medical_required: boolean;
    latitude: number;
    longitude: number;
  }) => void;
  successMessage: string | null;
  onClearSuccessMessage: () => void;
}

export const ReportEmergency: React.FC<ReportEmergencyProps> = ({
  isOnline,
  onSubmitReport,
  successMessage,
  onClearSuccessMessage,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<IncidentCategory>('MAROONED_RESCUE');
  const [reportedUrgency, setReportedUrgency] = useState<ReportedUrgency>('HIGH');
  const [landmark, setLandmark] = useState('');
  const [affectedCount, setAffectedCount] = useState<number>(6);
  const [medicalRequired, setMedicalRequired] = useState<boolean>(false);
  const [latitude, setLatitude] = useState<number>(26.9532);
  const [longitude, setLongitude] = useState<number>(94.1741);

  // Quick Preset Locations for rapid reporting during flood simulation
  const locationPresets = [
    { name: 'Kamalabari, Majuli', lat: 26.9532, lng: 94.1741, landmark: 'Kamalabari Ghat Primary School, 200m North of PWD Road' },
    { name: 'Dhemaji Market', lat: 27.4812, lng: 94.5714, landmark: 'Opposite Central Post Office, Dhemaji' },
    { name: 'Morigaon Culvert', lat: 26.2511, lng: 92.3422, landmark: 'Morigaon PWD Bridge Km 14' },
    { name: 'Ahatguri Char', lat: 26.892, lng: 94.0812, landmark: 'Ahatguri Riverine Char Southern Bank' },
    { name: 'Bhuragaon, Morigaon', lat: 26.259, lng: 92.349, landmark: 'Bhuragaon High School Embankment' },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !landmark.trim()) {
      alert('Please fill in both the Incident Headline and Landmark.');
      return;
    }

    onSubmitReport({
      title,
      description,
      category,
      reported_urgency: reportedUrgency,
      landmark,
      affected_count: Number(affectedCount),
      medical_required: medicalRequired,
      latitude,
      longitude,
    });

    // Reset Form
    setTitle('');
    setDescription('');
    setLandmark('');
    setAffectedCount(5);
    setMedicalRequired(false);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-white border border-slate-200 rounded-lg p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 mb-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-teal-800" />
              <span>Distress Report Intake (Field Volunteers & Citizens)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Structured distress report capture. If offline, the report buffers locally in browser IndexedDB.
            </p>
          </div>

          <span
            className={`px-3 py-1 rounded-full text-xs font-medium border ${
              isOnline
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {isOnline ? '● Uplink Active' : '○ Offline Mode'}
          </span>
        </div>

        {successMessage && (
          <div className="mb-5 p-3.5 bg-teal-50 border border-teal-200 text-teal-900 rounded-md text-xs flex items-center justify-between shadow-xs">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-teal-700 flex-shrink-0" />
              <span className="font-medium">{successMessage}</span>
            </div>
            <button
              onClick={onClearSuccessMessage}
              className="text-teal-700 hover:text-teal-900 font-bold ml-2 p-1"
            >
              ✕
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Title */}
          <div>
            <label className="block text-slate-700 font-medium mb-1">
              Incident Headline / Situation Summary *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. 14 people marooned on temple rooftop due to sudden bund breach"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-teal-700 focus:ring-1 focus:ring-teal-700"
            />
          </div>

          {/* Hazard Class & Subjective Urgency */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 font-medium mb-1">Hazard Classification *</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as IncidentCategory)}
                className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-800 focus:outline-none focus:border-teal-700"
              >
                <option value="MAROONED_RESCUE">Marooned Rescue (Trapped by Floodwaters)</option>
                <option value="MEDICAL_EMERGENCY">Medical Emergency (Trauma / Illness / Pregnant)</option>
                <option value="FOOD_WATER_CRISIS">Drinking Water & Food Ration Crisis</option>
                <option value="INFRASTRUCTURE_BREACH">Embankment / Culvert Washout</option>
                <option value="GENERAL_RELIEF">General Camp Relief & Shelter Supplies</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-medium mb-1">
                Reported Urgency Level (Subjective)
              </label>
              <select
                value={reportedUrgency}
                onChange={e => setReportedUrgency(e.target.value as ReportedUrgency)}
                className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-800 focus:outline-none focus:border-teal-700"
              >
                <option value="CRITICAL">Critical (Immediate Life Danger / Rising Rapidly)</option>
                <option value="HIGH">High (Submerged Road / Cut Off)</option>
                <option value="MEDIUM">Medium (Rising Water Level / Potable Shortage)</option>
                <option value="LOW">Low (Stable Inundation / Supplies Needed)</option>
              </select>
              <span className="text-[10px] text-slate-400 mt-1 block">
                * Note: Final operational severity is strictly computed by the server heuristic.
              </span>
            </div>
          </div>

          {/* Affected Count & Medical Alert */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-700 font-medium mb-1">Estimated People Affected</label>
              <input
                type="number"
                min="1"
                required
                value={affectedCount}
                onChange={e => setAffectedCount(Math.max(1, Number(e.target.value)))}
                className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-900 font-mono focus:outline-none focus:border-teal-700"
              />
            </div>

            <div className="flex items-center pt-5 space-x-2">
              <input
                type="checkbox"
                id="medCheckbox"
                checked={medicalRequired}
                onChange={e => setMedicalRequired(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-teal-800 focus:ring-teal-700"
              />
              <label htmlFor="medCheckbox" className="font-medium text-slate-800 cursor-pointer">
                Immediate On-Site Medical Attention Required
              </label>
            </div>
          </div>

          {/* Landmark & Village Description */}
          <div>
            <label className="block text-slate-700 font-medium mb-1">
              Landmark & Village Description *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Near Kamalabari Ghat Primary School, 200m North of PWD Road"
              value={landmark}
              onChange={e => setLandmark(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-teal-700 focus:ring-1 focus:ring-teal-700"
            />
          </div>

          {/* Location Presets & Coordinates */}
          <div className="bg-slate-50 p-4 rounded border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800 flex items-center space-x-1.5">
                <MapPin className="w-3.5 h-3.5 text-teal-800" />
                <span>Geographic Coordinates (Assam Basin)</span>
              </span>
              <span className="text-[11px] text-slate-500">Quick-populate presets:</span>
            </div>

            {/* Presets */}
            <div className="flex flex-wrap gap-1.5">
              {locationPresets.map(preset => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    setLatitude(preset.lat);
                    setLongitude(preset.lng);
                    setLandmark(preset.landmark);
                  }}
                  className="px-2.5 py-1 rounded bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-medium transition shadow-xs"
                >
                  📍 {preset.name}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">Latitude (°N)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={latitude}
                  onChange={e => setLatitude(Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 font-mono text-xs focus:outline-none focus:border-teal-700"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">Longitude (°E)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={longitude}
                  onChange={e => setLongitude(Number(e.target.value))}
                  className="w-full bg-white border border-slate-300 rounded px-2.5 py-1.5 text-slate-900 font-mono text-xs focus:outline-none focus:border-teal-700"
                />
              </div>
            </div>
          </div>

          {/* Situation Narrative */}
          <div>
            <label className="block text-slate-700 font-medium mb-1">Detailed Situation Narrative</label>
            <textarea
              rows={3}
              placeholder="Indicate floodwater depth, presence of infants/elderly, nearest dry landmark, accessible boat approaches..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded px-3 py-2 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-teal-700 focus:ring-1 focus:ring-teal-700 text-xs"
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full bg-teal-800 hover:bg-teal-900 text-white font-semibold py-2.5 rounded transition flex items-center justify-center space-x-2 shadow-sm cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>{isOnline ? 'Submit Distress Report to Command EOC' : 'Buffer Report in Local Offline Outbox'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
