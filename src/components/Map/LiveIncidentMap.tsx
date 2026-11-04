import React, { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MapLibreMap, Marker, NavigationControl } from 'maplibre-gl';
import { Search, Filter, Layers, Navigation, ExternalLink, AlertTriangle, LifeBuoy, Map as MapIcon, Satellite } from 'lucide-react';
import { Incident } from '../../types/incident';
import { Resource } from '../../types/resource';
import { ASSAM_DISTRICTS_GEOJSON } from '../../mocks/assamGeoJSON';

interface LiveIncidentMapProps {
  incidents: Incident[];
  resources: Resource[];
  selectedIncidentId: number;
  onSelectIncident: (id: number) => void;
  onNavigateToDetails: (id: number) => void;
  onNavigateToResources: () => void;
}

export const LiveIncidentMap: React.FC<LiveIncidentMapProps> = ({
  incidents,
  resources,
  selectedIncidentId,
  onSelectIncident,
  onNavigateToDetails,
  onNavigateToResources,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<{ [id: number]: Marker }>({});

  const [basemapMode, setBasemapMode] = useState<'normal' | 'satellite'>('normal');
  const [satelliteLoadError, setSatelliteLoadError] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [showDepots, setShowDepots] = useState<boolean>(true);
  const [showFloodPolygons, setShowFloodPolygons] = useState<boolean>(true);

  // Helper to distinguish simulated mock test records from verified operational field reports
  const isIncidentSimulated = (inc: Incident): boolean => {
    return Boolean(
      inc.is_simulated ||
      (inc.landmark && inc.landmark.includes('[SIMULATED DEMO]')) ||
      (inc.id >= 101 && inc.id <= 108)
    );
  };

  // Filtered incidents
  const filteredIncidents = incidents.filter(i => {
    const matchSeverity = severityFilter === 'ALL' || i.severity === severityFilter;
    const matchStatus = statusFilter === 'ALL' || i.verification_status === statusFilter;
    const matchSearch =
      searchQuery === '' ||
      i.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.landmark.toLowerCase().includes(searchQuery.toLowerCase());
    return matchSeverity && matchStatus && matchSearch;
  });

  const selectedIncident = incidents.find(i => i.id === selectedIncidentId) || incidents[0];

  // Initialize MapLibre GL
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Cartographic style supporting both Normal OpenStreetMap and Esri World Imagery Satellite basemaps
    const mapStyle: maplibregl.StyleSpecification = {
      version: 8,
      name: 'Suraksha Professional Cartography',
      sources: {
        osm_raster: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors',
          maxzoom: 19,
        },
        esri_satellite_raster: {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          attribution:
            'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community',
          maxzoom: 18,
        },
        assam_basin: {
          type: 'geojson',
          data: ASSAM_DISTRICTS_GEOJSON,
        },
      },
      layers: [
        {
          id: 'map_bg',
          type: 'background',
          paint: {
            'background-color': '#f8fafc',
          },
        },
        {
          id: 'osm_tiles_layer',
          type: 'raster',
          source: 'osm_raster',
          layout: {
            visibility: 'visible',
          },
          paint: {
            'raster-opacity': 0.88,
            'raster-saturation': -0.15,
          },
        },
        {
          id: 'esri_satellite_layer',
          type: 'raster',
          source: 'esri_satellite_raster',
          layout: {
            visibility: 'none',
          },
          paint: {
            'raster-opacity': 1.0,
          },
        },
        {
          id: 'assam_flood_fill',
          type: 'fill',
          source: 'assam_basin',
          paint: {
            'fill-color': [
              'match',
              ['get', 'id'],
              'brahmaputra_channel',
              '#0284c7',
              'majuli',
              '#0f766e',
              'dhemaji',
              '#475569',
              'morigaon',
              '#334155',
              '#64748b',
            ],
            'fill-opacity': 0.25,
          },
        },
        {
          id: 'assam_flood_stroke',
          type: 'line',
          source: 'assam_basin',
          paint: {
            'line-color': [
              'match',
              ['get', 'id'],
              'brahmaputra_channel',
              '#0369a1',
              'majuli',
              '#0f766e',
              'dhemaji',
              '#475569',
              'morigaon',
              '#334155',
              '#64748b',
            ],
            'line-width': 2,
            'line-opacity': 0.85,
          },
        },
      ],
    };

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: mapStyle,
      center: [94.1741, 26.9532], // Upper Assam / Majuli Island center ([longitude, latitude])
      zoom: 8.4,
      pitch: 0,
      attributionControl: false,
    });

    // Gracefully handle satellite tile loading failures
    map.on('error', (e) => {
      const errStr = String(e?.error?.message || e?.error || '');
      const sourceId = (e as any)?.sourceId;
      if (
        sourceId === 'esri_satellite_raster' ||
        errStr.toLowerCase().includes('arcgisonline') ||
        errStr.toLowerCase().includes('world_imagery')
      ) {
        setSatelliteLoadError(true);
      }
    });

    map.addControl(new NavigationControl({ showCompass: true, visualizePitch: true }), 'top-right');

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update Basemap mode (Normal vs Satellite) by toggling raster layers without recreating the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyBasemap = () => {
      if (map.getLayer('osm_tiles_layer')) {
        map.setLayoutProperty('osm_tiles_layer', 'visibility', basemapMode === 'normal' ? 'visible' : 'none');
      }
      if (map.getLayer('esri_satellite_layer')) {
        map.setLayoutProperty('esri_satellite_layer', 'visibility', basemapMode === 'satellite' ? 'visible' : 'none');
      }
      if (map.getLayer('map_bg')) {
        map.setPaintProperty('map_bg', 'background-color', basemapMode === 'satellite' ? '#0b132b' : '#f8fafc');
      }
    };

    if (map.isStyleLoaded()) {
      applyBasemap();
    } else {
      map.once('load', applyBasemap);
    }
  }, [basemapMode]);

  // Handle switching basemaps
  const handleBasemapChange = (mode: 'normal' | 'satellite') => {
    if (mode === basemapMode) return;
    setBasemapMode(mode);
    if (mode === 'normal') {
      setSatelliteLoadError(false);
    }
  };

  // Update Flood Polygons visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer('assam_flood_fill')) {
      map.setLayoutProperty('assam_flood_fill', 'visibility', showFloodPolygons ? 'visible' : 'none');
    }
    if (map.getLayer('assam_flood_stroke')) {
      map.setLayoutProperty('assam_flood_stroke', 'visibility', showFloodPolygons ? 'visible' : 'none');
    }
  }, [showFloodPolygons]);

  // Synchronize Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove existing markers
    Object.values(markersRef.current).forEach(marker => marker.remove());
    markersRef.current = {};

    // Add Incident Markers
    filteredIncidents.forEach(inc => {
      if (inc.latitude == null || inc.longitude == null) return;

      const isSelected = inc.id === selectedIncidentId;
      const el = document.createElement('div');
      el.className = 'group relative cursor-pointer';

      // Clean enterprise pin styling
      const sevColor =
        inc.severity === 'CRITICAL'
          ? 'bg-rose-600 text-white border-white'
          : inc.severity === 'HIGH'
          ? 'bg-amber-600 text-white border-white'
          : inc.severity === 'MEDIUM'
          ? 'bg-sky-600 text-white border-white'
          : 'bg-slate-600 text-white border-white';

      const ringClass = isSelected
        ? 'ring-3 ring-teal-700 ring-offset-2 scale-110 shadow-md'
        : 'shadow-sm';

      el.innerHTML = `
        <div class="relative flex items-center justify-center">
          <div class="w-6 h-6 rounded-full border-2 ${sevColor} flex items-center justify-center font-mono font-bold text-[10px] transform transition-transform group-hover:scale-115 ${ringClass}">
            ${inc.id}
          </div>
        </div>
      `;

      el.addEventListener('click', () => {
        onSelectIncident(inc.id);
      });

      const marker = new Marker({ element: el })
        .setLngLat([inc.longitude, inc.latitude])
        .addTo(map);

      markersRef.current[inc.id] = marker;
    });

    // Add Staging Depot Markers if enabled
    if (showDepots) {
      resources.forEach(res => {
        if (res.latitude == null || res.longitude == null) return;

        const el = document.createElement('div');
        el.className = 'group relative cursor-pointer';
        el.innerHTML = `
          <div class="relative flex items-center justify-center">
            <div class="w-6 h-6 rounded bg-teal-800 text-white border border-teal-600 flex items-center justify-center shadow-xs text-[10px] font-bold">
              ⚓
            </div>
            <span class="absolute -bottom-5 bg-white text-slate-800 border border-slate-200 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap shadow-xs opacity-0 group-hover:opacity-100 transition-opacity">
              ${res.name.split(' ')[0]} (${res.available_quantity})
            </span>
          </div>
        `;

        el.addEventListener('click', () => {
          onNavigateToResources();
        });

        new Marker({ element: el })
          .setLngLat([res.longitude, res.latitude])
          .addTo(map);
      });
    }
  }, [filteredIncidents, resources, selectedIncidentId, showDepots, onSelectIncident, onNavigateToResources]);

  // Center on selected incident (only if coordinates were actually submitted)
  const handleFlyToIncident = (inc: Incident) => {
    onSelectIncident(inc.id);
    const map = mapRef.current;
    if (map && inc.longitude != null && inc.latitude != null) {
      map.flyTo({
        center: [inc.longitude, inc.latitude],
        zoom: 11,
        duration: 1200,
        essential: true,
      });
    }
  };

  // Reset to full Assam Basin view
  const handleResetExtent = () => {
    const map = mapRef.current;
    if (map) {
      map.flyTo({
        center: [94.1741, 26.9532],
        zoom: 8.4,
        pitch: 0,
        duration: 1000,
      });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 h-[800px] max-w-7xl mx-auto">
      {/* LEFT COLUMN: Triage Incident Queue & Filters */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col h-full shadow-xs">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-slate-600" />
            <h2 className="text-sm font-semibold text-slate-900 tracking-tight">Triage Incident Queue</h2>
          </div>
          <span className="text-xs font-mono text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
            {filteredIncidents.length} of {incidents.length}
          </span>
        </div>

        {/* Search input */}
        <div className="relative mb-3">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search landmark, village, keyword..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-teal-700 focus:bg-white"
          />
        </div>

        {/* Filters bar */}
        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
          <div>
            <label className="text-[10px] uppercase font-semibold text-slate-500 block mb-1">Severity</label>
            <select
              value={severityFilter}
              onChange={e => setSeverityFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs text-slate-700 focus:outline-none focus:border-teal-700"
            >
              <option value="ALL">All Severities</option>
              <option value="CRITICAL">Critical Only</option>
              <option value="HIGH">High Urgency</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low / Monitoring</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] uppercase font-semibold text-slate-500 block mb-1">Verification</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded p-1.5 text-xs text-slate-700 focus:outline-none focus:border-teal-700"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending Human Triage</option>
              <option value="VERIFIED">Verified Ground Truth</option>
              <option value="RESOLVED">Resolved / Rescued</option>
            </select>
          </div>
        </div>

        {/* Linked Scrollable Incident List */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {filteredIncidents.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded">
              No matching incidents found for current filter criteria.
            </div>
          ) : (
            filteredIncidents.map(inc => {
              const isSelected = inc.id === selectedIncidentId;
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
                  : 'bg-amber-50 text-amber-800 border-amber-200';

              return (
                <div
                  key={inc.id}
                  onClick={() => handleFlyToIncident(inc)}
                  className={`p-3 rounded border transition cursor-pointer ${
                    isSelected
                      ? 'bg-teal-50/60 border-teal-700 shadow-xs'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-slate-100/60'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1">
                    <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                      <span className={`px-1.5 py-0.5 rounded font-semibold text-[10px] border ${sevBadge}`}>
                        {inc.severity}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded border ${statusBadge}`}>
                        {inc.verification_status}
                      </span>
                      {isIncidentSimulated(inc) && (
                        <span className="text-[9px] px-1 py-0.2 rounded bg-purple-50 text-purple-700 border border-purple-200 font-mono font-medium">
                          SIMULATED
                        </span>
                      )}
                    </div>
                    <span className="text-slate-500 font-mono text-[11px]">#{inc.id}</span>
                  </div>

                  <div className="font-medium text-xs text-slate-900 line-clamp-1">{inc.title}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{inc.landmark}</div>

                  <div className="flex justify-between items-center text-[11px] text-slate-500 mt-2 pt-2 border-t border-slate-200 font-mono">
                    <span>Affected: <strong className="text-slate-800">{inc.affected_count}</strong></span>
                    {inc.latitude != null && inc.longitude != null ? (
                      <span className="text-teal-800 flex items-center space-x-1 font-medium">
                        <Navigation className="w-2.5 h-2.5" />
                        <span>Fly to marker</span>
                      </span>
                    ) : (
                      <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 text-[10px] font-sans font-medium flex items-center space-x-0.5">
                        <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                        <span>No GPS Coords</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT 2 COLS: MapLibre Interactive Map Canvas */}
      <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-4 flex flex-col h-full shadow-xs relative overflow-hidden">
        {/* Top Map Action Bar */}
        <div className="flex flex-wrap justify-between items-center mb-3 gap-2">
          <div className="flex items-center space-x-2">
            <h2 className="text-sm font-semibold text-slate-900 tracking-tight">Geospatial Tactical Map</h2>
            <span className="text-[11px] px-2.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-mono">
              Brahmaputra Basin Mode
            </span>
          </div>

          {/* Layer toggles, Basemap Switcher and controls */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Basemap Switcher (Normal Map vs Satellite View) */}
            <div className="inline-flex rounded bg-slate-100 p-0.5 border border-slate-200" role="group" aria-label="Basemap selection">
              <button
                type="button"
                onClick={() => handleBasemapChange('normal')}
                className={`px-2.5 py-1 text-xs rounded transition flex items-center space-x-1.5 ${
                  basemapMode === 'normal'
                    ? 'bg-white text-slate-900 font-semibold shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900 font-medium'
                }`}
                title="Switch to standard cartographic normal map"
                aria-pressed={basemapMode === 'normal'}
              >
                <MapIcon className="w-3.5 h-3.5 text-slate-600" />
                <span>Normal Map</span>
              </button>

              <button
                type="button"
                onClick={() => handleBasemapChange('satellite')}
                className={`px-2.5 py-1 text-xs rounded transition flex items-center space-x-1.5 ${
                  basemapMode === 'satellite'
                    ? 'bg-teal-800 text-white font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 font-medium'
                }`}
                title="Switch to satellite earth observation imagery"
                aria-pressed={basemapMode === 'satellite'}
              >
                <Satellite className="w-3.5 h-3.5" />
                <span>Satellite View</span>
              </button>
            </div>

            <button
              onClick={() => setShowFloodPolygons(prev => !prev)}
              className={`px-2 py-1 rounded border transition flex items-center space-x-1 ${
                showFloodPolygons
                  ? 'bg-teal-50 border-teal-300 text-teal-900 font-medium'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-teal-700" />
              <span>Flood Basin Zones</span>
            </button>

            <button
              onClick={() => setShowDepots(prev => !prev)}
              className={`px-2 py-1 rounded border transition flex items-center space-x-1 ${
                showDepots
                  ? 'bg-teal-50 border-teal-300 text-teal-900 font-medium'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span>⚓ Staging Depots</span>
            </button>

            <button
              onClick={handleResetExtent}
              className="px-2 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded transition font-medium"
              title="Reset View Extent"
            >
              Reset View
            </button>
          </div>
        </div>

        {/* MapLibre DOM Container */}
        <div className="flex-1 relative rounded-lg border border-slate-200 overflow-hidden bg-slate-100">
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* Offline/Online Map Capability Disclosure Callout */}
          <div className="absolute top-3 left-3 bg-white/95 border border-slate-200 px-3 py-1.5 rounded backdrop-blur text-[11px] text-slate-600 flex items-center space-x-2 z-10 shadow-xs font-mono max-w-[80%] sm:max-w-none">
            <span className={`w-2 h-2 rounded-full ${basemapMode === 'satellite' ? 'bg-indigo-600' : 'bg-teal-600'}`}></span>
            {basemapMode === 'satellite' ? (
              <span>Basemap: Satellite Imagery (Archival Earth Observation — Not Real-Time)</span>
            ) : (
              <span>Vector GeoJSON Basin: Local & Offline-Ready | Basemap: Normal (OSM)</span>
            )}
          </div>

          {/* Satellite Tile Loading Failure Alert with graceful fallback */}
          {satelliteLoadError && basemapMode === 'satellite' && (
            <div className="absolute top-12 left-3 right-3 sm:right-auto sm:max-w-md bg-amber-50/95 border border-amber-300 text-amber-900 p-2.5 rounded shadow-md text-xs flex items-start space-x-2 z-20 backdrop-blur">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-amber-950">Satellite Imagery Tile Load Warning</p>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  Some satellite tiles could not be fetched (network offline or tile server unreachable). The normal cartographic basemap and offline vector basin polygons remain fully functional.
                </p>
                <div className="mt-2 flex items-center space-x-2">
                  <button
                    onClick={() => {
                      handleBasemapChange('normal');
                    }}
                    className="px-2 py-0.5 bg-amber-200 hover:bg-amber-300 text-amber-950 rounded font-medium text-[11px] transition"
                  >
                    Fallback to Normal Map
                  </button>
                  <button
                    onClick={() => setSatelliteLoadError(false)}
                    className="text-[11px] text-slate-600 hover:text-slate-800 underline"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Floating Selected Incident Card */}
          {selectedIncident && (
            <div className="absolute bottom-10 left-3 right-3 sm:bottom-4 sm:left-4 sm:right-auto sm:max-w-md bg-white/95 border border-slate-200 p-4 rounded-lg shadow-lg backdrop-blur z-10 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center space-x-2">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                      selectedIncident.severity === 'CRITICAL'
                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                        : selectedIncident.severity === 'HIGH'
                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                        : 'bg-sky-50 text-sky-800 border border-sky-200'
                    }`}
                  >
                    {selectedIncident.severity}
                  </span>
                  <span className="text-xs font-bold text-slate-900 font-mono">#{selectedIncident.id}</span>
                  <span className="text-xs text-slate-600 truncate max-w-[160px] sm:max-w-[200px]">
                    {selectedIncident.landmark}
                  </span>
                </div>
                {selectedIncident.latitude != null && selectedIncident.longitude != null ? (
                  <span className="text-[11px] font-mono text-slate-500 whitespace-nowrap">
                    {selectedIncident.latitude.toFixed(4)}°N, {selectedIncident.longitude.toFixed(4)}°E
                    {isIncidentSimulated(selectedIncident) && (
                      <span className="ml-1 text-[9px] text-purple-700 bg-purple-50 px-1 py-0.2 rounded border border-purple-200">
                        SIMULATED
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-[10px] font-sans text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 flex items-center space-x-1">
                    <AlertTriangle className="w-2.5 h-2.5 text-amber-600" />
                    <span>No Coordinates Submitted</span>
                  </span>
                )}
              </div>

              <div className="text-xs font-semibold text-slate-900 leading-snug">
                {selectedIncident.title}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                <div className="flex items-center space-x-1.5 text-slate-600">
                  <span>People Affected: <strong className="text-slate-900">{selectedIncident.affected_count}</strong></span>
                  {selectedIncident.medical_required && (
                    <span className="text-rose-700 font-medium flex items-center space-x-0.5">
                      <AlertTriangle className="w-3 h-3 text-rose-600" />
                      <span>Medical Req.</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => onNavigateToDetails(selectedIncident.id)}
                    className="bg-white hover:bg-slate-100 text-slate-800 px-2.5 py-1 rounded text-xs transition flex items-center space-x-1 border border-slate-200 font-medium"
                  >
                    <ExternalLink className="w-3 h-3 text-slate-500" />
                    <span>Triage</span>
                  </button>
                  <button
                    onClick={onNavigateToResources}
                    className="bg-teal-800 hover:bg-teal-900 text-white px-2.5 py-1 rounded text-xs transition flex items-center space-x-1 font-medium shadow-xs"
                  >
                    <LifeBuoy className="w-3 h-3 text-teal-200" />
                    <span>Dispatch</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Map Legend */}
          <div className="absolute top-3 right-12 bg-white/95 border border-slate-200 p-3 rounded text-[11px] space-y-1.5 backdrop-blur shadow-xs z-10 hidden sm:block">
            <span className="font-semibold text-slate-900 block text-[10px] uppercase tracking-wider">
              Map Elements
            </span>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-600"></span>
              <span className="text-slate-600">Critical Distress</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-600"></span>
              <span className="text-slate-600">High Urgency</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-600"></span>
              <span className="text-slate-600">Medium / General</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded bg-teal-800"></span>
              <span className="text-slate-600">Relief Staging Depot</span>
            </div>
          </div>

          {/* Dynamic Basemap & Source Attribution Bar */}
          <div className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2 bg-white/90 border border-slate-200/80 px-2 py-0.5 rounded text-[10px] text-slate-600 backdrop-blur z-10 shadow-xs max-w-[85%] sm:max-w-md pointer-events-auto leading-tight truncate">
            {basemapMode === 'satellite' ? (
              <span>
                Satellite: <strong>Tiles © Esri</strong> — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community | Archival Earth Observation (Not Real-Time)
              </span>
            ) : (
              <span>
                Basemap: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline hover:text-slate-900">OpenStreetMap</a> contributors | Vector: Local Basin GeoJSON
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
