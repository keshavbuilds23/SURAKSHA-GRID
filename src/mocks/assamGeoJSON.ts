// GeoJSON boundaries for Brahmaputra Basin & Majuli / Jorhat / Dhemaji / Morigaon
export const ASSAM_DISTRICTS_GEOJSON: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    // Majuli Island Outline
    {
      type: 'Feature',
      properties: {
        id: 'majuli',
        name: 'Majuli District (River Island)',
        zone: 'CRITICAL_FLOOD_ZONE',
        submerged_risk: 'EXTREME',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [94.0200, 26.8800],
            [94.1000, 26.9200],
            [94.2200, 26.9900],
            [94.3400, 27.0500],
            [94.3900, 27.0200],
            [94.3200, 26.9600],
            [94.2000, 26.9100],
            [94.0900, 26.8600],
            [94.0200, 26.8800],
          ],
        ],
      },
    },
    // Brahmaputra River Channel
    {
      type: 'Feature',
      properties: {
        id: 'brahmaputra_channel',
        name: 'Brahmaputra River Corridor',
        water_level: 'DANGER_MARK_+1.8M',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [92.0000, 26.1500],
            [92.8000, 26.4500],
            [93.5000, 26.6500],
            [94.0000, 26.8500],
            [94.5000, 27.1000],
            [94.9000, 27.3500],
            [94.8500, 27.4200],
            [94.4000, 27.1800],
            [93.9000, 26.9200],
            [93.4000, 26.7200],
            [92.7000, 26.5200],
            [91.9500, 26.2200],
            [92.0000, 26.1500],
          ],
        ],
      },
    },
    // Dhemaji Flood Zone
    {
      type: 'Feature',
      properties: {
        id: 'dhemaji',
        name: 'Dhemaji District (North Bank)',
        zone: 'HIGH_FLOOD_ZONE',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [94.4000, 27.3500],
            [94.8000, 27.6000],
            [95.1000, 27.5500],
            [94.9000, 27.2500],
            [94.5000, 27.2000],
            [94.4000, 27.3500],
          ],
        ],
      },
    },
    // Morigaon Inundation Basin
    {
      type: 'Feature',
      properties: {
        id: 'morigaon',
        name: 'Morigaon Flood Basin',
        zone: 'CRITICAL_WATER_SURGE',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [92.1500, 26.1500],
            [92.5000, 26.3500],
            [92.6000, 26.2000],
            [92.2500, 26.0500],
            [92.1500, 26.1500],
          ],
        ],
      },
    },
  ],
};

