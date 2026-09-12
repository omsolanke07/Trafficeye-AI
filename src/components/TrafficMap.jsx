import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  Polyline,
  useMap,
  useMapEvents
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon paths in bundlers if standard icons are referenced
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Default Pune, Maharashtra Coordinates
export const PUNE_COORDINATES = {
  lat: 18.5204,
  lng: 73.8567,
  zoom: 13
};

// Convenient Pune Area Quick Selection Landmarks
export const PUNE_HOTSPOTS = [
  { name: 'Shivajinagar', lat: 18.5314, lng: 73.8446 },
  { name: 'Swargate', lat: 18.5018, lng: 73.8587 },
  { name: "PVG's College of Eng.", lat: 18.490428, lng: 73.854266 },
  { name: 'Kothrud', lat: 18.5074, lng: 73.8077 },
  { name: 'Hadapsar', lat: 18.5089, lng: 73.9260 },
  { name: 'Hinjawadi', lat: 18.5913, lng: 73.7389 },
  { name: 'Viman Nagar', lat: 18.5679, lng: 73.9143 },
  { name: 'Pune Station', lat: 18.5284, lng: 73.8739 },
  { name: 'Katraj', lat: 18.4575, lng: 73.8677 },
  { name: 'Baner', lat: 18.5590, lng: 73.7868 },
  { name: 'PCMC', lat: 18.6298, lng: 73.7997 }
];

// Helper: Custom SVG DivIcon Generator for Camera Nodes
const createCameraIcon = (status = 'online', isSelected = false) => {
  const color =
    status === 'online' ? '#2E7D32' :
    status === 'alert' ? '#B3261E' : '#64748B';
  const pulseClass = status === 'alert' ? 'cam-marker-pulse' : '';
  const selectedBorder = isSelected ? 'border: 2px solid #FFFFFF; box-shadow: 0 0 12px rgba(20,49,92,0.6);' : '';

  return L.divIcon({
    className: 'custom-camera-marker-container',
    html: `
      <div class="cam-marker-wrapper ${pulseClass}" style="background-color: ${color}; ${selectedBorder}">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
          <circle cx="12" cy="13" r="4"></circle>
        </svg>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14]
  });
};

// Helper: Custom SVG DivIcon for the Location Picker Pin
const createPickerIcon = () => {
  return L.divIcon({
    className: 'custom-picker-marker-container',
    html: `
      <div class="picker-pin-wrapper">
        <svg viewBox="0 0 24 24" width="34" height="34" fill="#14315C" stroke="#FFFFFF" stroke-width="1.5">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
          <circle cx="12" cy="9" r="3" fill="#FFFFFF"/>
        </svg>
        <span class="picker-pin-target-dot"></span>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -34]
  });
};

// Helper: Custom SVG DivIcon for Trajectory Waypoints with Order Badge and Timestamps
const createWaypointIcon = (index, total, isAlert, time) => {
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const bg = isAlert ? '#B3261E' : isFirst ? '#027A48' : isLast ? '#D92D20' : '#14315C';
  const label = isFirst ? 'START' : isLast ? 'END' : `#${index + 1}`;

  return L.divIcon({
    className: 'custom-waypoint-marker-container',
    html: `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        transform: translate(-50%, -100%);
        pointer-events: auto;
      ">
        <div style="
          background: ${bg};
          color: #ffffff;
          font-weight: 700;
          font-size: 10px;
          font-family: var(--font-mono, monospace);
          padding: 2px 7px;
          border-radius: 12px;
          border: 2px solid #ffffff;
          box-shadow: 0 3px 8px rgba(0,0,0,0.35);
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 4px;
        ">
          <span>${label}</span>
          ${time ? `<span style="font-size: 9px; opacity: 0.9; border-left: 1px solid rgba(255,255,255,0.4); padding-left: 4px;">${time}</span>` : ''}
        </div>
        <div style="
          width: 0;
          height: 0;
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-top: 6px solid ${bg};
        "></div>
      </div>
    `,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -32]
  });
};

// Map View Controller: Handles programmatic pans, zooms, and container resizing
const MapViewController = ({ center, zoom }) => {
  const map = useMap();

  useEffect(() => {
    if (center && !isNaN(center[0]) && !isNaN(center[1])) {
      map.flyTo(center, zoom || map.getZoom(), { duration: 1.2 });
    }
  }, [center, zoom, map]);

  useEffect(() => {
    // Invalidate map size after DOM mount to prevent gray tiles in modals/tabs
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);
    return () => clearTimeout(timer);
  }, [map]);

  return null;
};

// Location Click Handler for Picker Mode
const MapClickHandler = ({ onMapClick }) => {
  useMapEvents({
    click(e) {
      if (onMapClick) {
        onMapClick(e.latlng);
      }
    }
  });
  return null;
};

/**
 * TrafficMap: Unified Reusable Mapping Component for TrafficEye AI
 *
 * @param {string} mode - 'network' | 'picker' | 'analytics'
 * @param {Array} cameras - List of camera objects [{ id, name, lat, lng, status, ... }]
 * @param {Object} selectedCamera - Currently active/selected camera node
 * @param {Function} onSelectCamera - Callback when a camera marker is clicked
 * @param {Object} pickerCoords - { lat, lng } for the active picker pin
 * @param {Function} onLocationChange - Callback ({ lat, lng }) when picker pin is placed or dragged
 * @param {Function} onConfirmLocation - Callback when user confirms location in picker
 * @param {Function} onCancel - Callback to cancel location picking
 * @param {Function} onEditLocation - Callback to open location editor for a camera
 * @param {Function} onViewFeed - Callback to view live feed of selected camera
 * @param {Array} trajectories - Chronological waypoints for trajectory polylines [{ lat, lng, camera_id, time }]
 * @param {Object} analyticsData - Density and volume info for analytics overlays
 * @param {string} height - CSS height string (default '100%')
 */
export const TrafficMap = ({
  mode = 'network',
  cameras = [],
  selectedCamera = null,
  onSelectCamera,
  pickerCoords = null,
  onLocationChange,
  onConfirmLocation,
  onCancel,
  onEditLocation,
  onViewFeed,
  onDeleteCamera,
  trajectories = [],
  analyticsData = null,
  height = '100%',
  style = {}
}) => {
  // Derive active focal point from props or default to Pune
  const activeCenter = useMemo(() => {
    if (trajectories && trajectories.length > 0) {
      const validTraj = trajectories.filter(t => t.lat && t.lng);
      if (validTraj.length > 0) {
        const avgLat = validTraj.reduce((s, t) => s + parseFloat(t.lat), 0) / validTraj.length;
        const avgLng = validTraj.reduce((s, t) => s + parseFloat(t.lng), 0) / validTraj.length;
        return [avgLat, avgLng];
      }
    }
    if (mode === 'analytics' && cameras.length > 0) {
      const validCams = cameras.filter(c => parseFloat(c.lat) && parseFloat(c.lng));
      if (validCams.length > 0) {
        const avgLat = validCams.reduce((s, c) => s + parseFloat(c.lat), 0) / validCams.length;
        const avgLng = validCams.reduce((s, c) => s + parseFloat(c.lng), 0) / validCams.length;
        return [avgLat, avgLng];
      }
    }
    if (mode === 'picker' && pickerCoords?.lat && pickerCoords?.lng) {
      const pLat = parseFloat(pickerCoords.lat);
      const pLng = parseFloat(pickerCoords.lng);
      if (!isNaN(pLat) && !isNaN(pLng)) return [pLat, pLng];
    }
    if (selectedCamera?.lat && selectedCamera?.lng) {
      const cLat = parseFloat(selectedCamera.lat);
      const cLng = parseFloat(selectedCamera.lng);
      if (!isNaN(cLat) && !isNaN(cLng) && (cLat !== 0 || cLng !== 0)) {
        return [cLat, cLng];
      }
    }
    return [PUNE_COORDINATES.lat, PUNE_COORDINATES.lng];
  }, [mode, pickerCoords, selectedCamera, trajectories, cameras]);

  const [overrideCenter, setOverrideCenter] = useState(null);
  const [overrideZoom, setOverrideZoom] = useState(null);

  const currentCenter = overrideCenter || activeCenter;
  const currentZoom = overrideZoom || (
    mode === 'picker' && pickerCoords?.lat ? 15 :
    selectedCamera ? 15 :
    trajectories && trajectories.length > 0 ? 14 :
    mode === 'analytics' ? 14 :
    PUNE_COORDINATES.zoom
  );

  // Search State for Picker Mode
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState(null);
  const searchTimeoutRef = useRef(null);
  const pickerMarkerRef = useRef(null);

  // Filter cameras that have valid coordinates
  const validCameras = useMemo(() => {
    return cameras.filter(c => {
      const lat = parseFloat(c.lat);
      const lng = parseFloat(c.lng);
      return !isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0);
    });
  }, [cameras]);

  // Handle Free OpenStreetMap Nominatim Geocoding Search (user-triggered / debounced)
  const executeSearch = useCallback(async (queryText) => {
    if (!queryText || !queryText.trim()) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }
    setIsSearching(true);
    setSearchError(null);

    try {
      // Free Nominatim API query restricted to Pune / India
      const queryWithContext = queryText.toLowerCase().includes('pune')
        ? queryText
        : `${queryText}, Pune, Maharashtra`;

      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryWithContext)}&countrycodes=in&limit=5`;
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Search service responded with status ${response.status}`);
      }

      const results = await response.json();
      if (Array.isArray(results) && results.length > 0) {
        setSearchResults(results);
      } else {
        setSearchResults([]);
        setSearchError('No matching locations found in Pune.');
      }
    } catch (err) {
      console.warn('[Nominatim Search Error]:', err);
      setSearchError('Location search unavailable. You can still click directly on the map.');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearchSubmit = (e) => {
    e?.preventDefault();
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    executeSearch(searchQuery);
  };

  const handleSelectSearchResult = (item) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    if (!isNaN(lat) && !isNaN(lng)) {
      setOverrideCenter([lat, lng]);
      setOverrideZoom(16);
      setSearchResults([]);
      if (onLocationChange) {
        onLocationChange({ lat, lng });
      }
    }
  };

  const handleHotspotClick = (spot) => {
    setOverrideCenter([spot.lat, spot.lng]);
    setOverrideZoom(15);
    setSearchResults([]);
    if (mode === 'picker' && onLocationChange) {
      onLocationChange({ lat: spot.lat, lng: spot.lng });
    }
  };

  // Draggable Marker Event Handlers for Picker Mode
  const pickerEventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = pickerMarkerRef.current;
        if (marker != null) {
          const latLng = marker.getLatLng();
          if (onLocationChange) {
            onLocationChange({
              lat: parseFloat(latLng.lat.toFixed(6)),
              lng: parseFloat(latLng.lng.toFixed(6))
            });
          }
        }
      },
      drag() {
        const marker = pickerMarkerRef.current;
        if (marker != null) {
          const latLng = marker.getLatLng();
          if (onLocationChange) {
            onLocationChange({
              lat: parseFloat(latLng.lat.toFixed(6)),
              lng: parseFloat(latLng.lng.toFixed(6))
            });
          }
        }
      }
    }),
    [onLocationChange]
  );

  const handleMapClick = (latlng) => {
    if (mode === 'picker' && onLocationChange) {
      onLocationChange({
        lat: parseFloat(latlng.lat.toFixed(6)),
        lng: parseFloat(latlng.lng.toFixed(6))
      });
    }
  };

  return (
    <div className="traffic-map-wrapper" style={{ position: 'relative', width: '100%', height, ...style }}>
      {/* PICKER MODE: Nominatim Search Bar & Pune Area Shortcuts */}
      {mode === 'picker' && (
        <div className="map-picker-toolbar">
          <form className="map-search-bar" onSubmit={handleSearchSubmit}>
            <input
              type="text"
              placeholder="Search Pune area, street or landmark (e.g. Shivajinagar, FC Road)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="map-search-input"
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={isSearching}>
              {isSearching ? 'Searching...' : 'Search'}
            </button>
            {searchQuery && (
              <button
                type="button"
                className="btn btn-neutral btn-sm"
                onClick={() => {
                  setSearchQuery('');
                  setSearchResults([]);
                  setSearchError(null);
                }}
              >
                Clear
              </button>
            )}
          </form>

          {/* Search Results Dropdown */}
          {searchResults.length > 0 && (
            <div className="map-search-results">
              {searchResults.map((item, idx) => (
                <div
                  key={idx}
                  className="map-search-item"
                  onClick={() => handleSelectSearchResult(item)}
                >
                  <span className="search-item-title">{item.display_name.split(',')[0]}</span>
                  <span className="search-item-sub">{item.display_name}</span>
                </div>
              ))}
            </div>
          )}

          {searchError && (
            <div className="map-search-error">{searchError}</div>
          )}

          {/* Quick Pune Area Shortcuts */}
          <div className="map-hotspots-container">
            <span className="hotspot-label">Quick Jump:</span>
            <div className="hotspot-chips">
              {PUNE_HOTSPOTS.map((spot) => (
                <button
                  type="button"
                  key={spot.name}
                  className="hotspot-chip"
                  onClick={() => handleHotspotClick(spot)}
                >
                  {spot.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* LEAFLET MAP CONTAINER */}
      <MapContainer
        center={currentCenter}
        zoom={currentZoom}
        style={{ height: '100%', width: '100%', borderRadius: 'var(--radius)' }}
        zoomControl={true}
        scrollWheelZoom={true}
      >
        <MapViewController center={currentCenter} zoom={currentZoom} />
        {mode === 'picker' && <MapClickHandler onMapClick={handleMapClick} />}

        {/* Free OpenStreetMap Standard TileLayer with Attribution */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        {/* NETWORK & ANALYTICS MODE: Existing Camera Markers */}
        {(mode === 'network' || mode === 'analytics') &&
          validCameras.map((camera) => {
            const isSelected = selectedCamera?.id === camera.id;
            const lat = parseFloat(camera.lat);
            const lng = parseFloat(camera.lng);
            const icon = createCameraIcon(camera.status, isSelected);

            return (
              <Marker
                key={camera.id}
                position={[lat, lng]}
                icon={icon}
                eventHandlers={{
                  click: () => {
                    if (onSelectCamera) onSelectCamera(camera);
                  }
                }}
              >
                <Popup className="traffic-camera-popup">
                  <div className="camera-popup-content">
                    <div className="popup-header">
                      <span className="popup-cam-id">{camera.id}</span>
                      <span className={`badge badge-${camera.status === 'online' ? 'green' : camera.status === 'alert' ? 'red' : 'neutral'}`}>
                        {camera.status}
                      </span>
                    </div>
                    <div className="popup-cam-name">{camera.name}</div>
                    <div className="popup-details">
                      <div className="popup-row">
                        <span className="label">Location:</span>
                        <span>{camera.location || camera.ward || 'Pune Metro Sector'}</span>
                      </div>
                      <div className="popup-row">
                        <span className="label">Coords:</span>
                        <span className="mono">{lat.toFixed(4)}, {lng.toFixed(4)}</span>
                      </div>
                      <div className="popup-row">
                        <span className="label">Spec:</span>
                        <span>{camera.resolution || '1080p'} @ {camera.fps || 30}fps</span>
                      </div>
                      {camera.last_plate && (
                        <div className="popup-row">
                          <span className="label">Last Plate:</span>
                          <span className="mono bold">{camera.last_plate}</span>
                        </div>
                      )}
                    </div>

                    <div className="popup-actions">
                      {onViewFeed && (
                        <button
                          type="button"
                          className="btn btn-primary btn-xs"
                          onClick={() => onViewFeed(camera)}
                        >
                          View Feed
                        </button>
                      )}
                      {onEditLocation && (
                        <button
                          type="button"
                          className="btn btn-neutral btn-xs"
                          onClick={() => onEditLocation(camera)}
                        >
                          Edit Location
                        </button>
                      )}
                      {onDeleteCamera && (
                        <button
                          type="button"
                          className="btn btn-neutral btn-xs"
                          style={{ color: 'var(--red)' }}
                          onClick={() => onDeleteCamera(camera)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

        {/* ANALYTICS MODE: Traffic Density / Activity Heat Rings */}
        {mode === 'analytics' && analyticsData && (
          <>
            {validCameras.map((camera) => {
              const lat = parseFloat(camera.lat);
              const lng = parseFloat(camera.lng);
              // Calculate intensity matching camera name, ID, or location
              const corridor = analyticsData.corridors?.find(
                c => (c.name || c.corridor || '')?.toLowerCase().includes(camera.name.toLowerCase()) ||
                     (c.name || c.corridor || '')?.toLowerCase().includes(camera.id.toLowerCase()) ||
                     (camera.location && (c.name || c.corridor || '')?.toLowerCase().includes(camera.location.toLowerCase()))
              );
              const volume = corridor?.volume || 0;
              const radius = Math.min(650, Math.max(160, Math.sqrt(volume) * 16));
              const circleColor =
                camera.status === 'alert' ? '#B3261E' :
                (corridor?.severity === 'congested' || volume > 400) ? '#B3261E' :
                (corridor?.severity === 'warning' || volume > 150) ? '#C77700' : '#027A48';

              return (
                <Circle
                  key={`density-${camera.id}`}
                  center={[lat, lng]}
                  radius={radius}
                  pathOptions={{
                    color: circleColor,
                    fillColor: circleColor,
                    fillOpacity: 0.22,
                    weight: 2,
                    dashArray: volume > 400 ? undefined : '5, 5'
                  }}
                >
                  <Popup>
                    <div style={{ fontSize: '11px', textAlign: 'center' }}>
                      <strong>{camera.name}</strong><br />
                      Traffic Volume: <strong>{volume} vehicles</strong><br />
                      Status: <span style={{ color: circleColor, fontWeight: 700, textTransform: 'uppercase' }}>{corridor?.severity || 'Normal'}</span>
                    </div>
                  </Popup>
                </Circle>
              );
            })}
          </>
        )}

        {/* TRAJECTORY MODE: Sequential Route Polyline & Waypoint Sighting Markers */}
        {(mode === 'trajectory' || trajectories?.length > 0) && trajectories && (
          <>
            {trajectories.filter(t => t.lat && t.lng).length > 1 && (
              <Polyline
                positions={trajectories.filter(t => t.lat && t.lng).map(t => [parseFloat(t.lat), parseFloat(t.lng)])}
                pathOptions={{
                  color: '#14315C',
                  weight: 4,
                  opacity: 0.9,
                  dashArray: '8, 6'
                }}
              />
            )}
            {trajectories.filter(t => t.lat && t.lng).map((w, idx) => {
              const lat = parseFloat(w.lat);
              const lng = parseFloat(w.lng);
              const total = trajectories.filter(t => t.lat && t.lng).length;
              const icon = createWaypointIcon(idx, total, w.alert, w.time);

              return (
                <Marker
                  key={`waypoint-${w.id || idx}`}
                  position={[lat, lng]}
                  icon={icon}
                >
                  <Popup className="traffic-camera-popup">
                    <div className="camera-popup-content">
                      <div className="popup-header">
                        <span className="popup-cam-id">Sighting #{idx + 1} of {total}</span>
                        <span className={`badge badge-${w.alert ? 'red' : 'green'}`}>
                          {w.alert ? 'Alert' : 'Verified'}
                        </span>
                      </div>
                      <div className="popup-cam-name">{w.location || w.cam}</div>
                      <div className="popup-details">
                        <div className="popup-row">
                          <span className="label">Time:</span>
                          <span className="mono bold" style={{ color: 'var(--primary)', fontSize: '12px' }}>{w.time}</span>
                        </div>
                        <div className="popup-row">
                          <span className="label">Camera:</span>
                          <span>{w.cam}</span>
                        </div>
                        <div className="popup-row">
                          <span className="label">Confidence:</span>
                          <span>{w.confidence ? `${(parseFloat(w.confidence) > 1 ? w.confidence : parseFloat(w.confidence) * 100).toFixed(1)}%` : 'Verified'}</span>
                        </div>
                        <div className="popup-row">
                          <span className="label">Coordinates:</span>
                          <span className="mono">{lat.toFixed(4)}, {lng.toFixed(4)}</span>
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </>
        )}

        {/* PICKER MODE: Selected Draggable Location Marker */}
        {mode === 'picker' && pickerCoords?.lat && pickerCoords?.lng && (
          <Marker
            ref={pickerMarkerRef}
            position={[parseFloat(pickerCoords.lat), parseFloat(pickerCoords.lng)]}
            icon={createPickerIcon()}
            draggable={true}
            eventHandlers={pickerEventHandlers}
          >
            <Popup autoClose={false} closeOnClick={false}>
              <div style={{ textAlign: 'center', fontSize: '11px', fontWeight: 600, color: 'var(--primary)' }}>
                Drag pin or click map to reposition
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>

      {/* PICKER MODE: Live Coordinate Floating Indicator & Confirmation Actions */}
      {mode === 'picker' && (
        <div className="map-picker-status-panel">
          <div className="coords-info">
            <div className="coords-title">Selected Camera Location</div>
            {pickerCoords?.lat && pickerCoords?.lng ? (
              <div className="coords-display">
                <div className="coord-row">
                  <span className="coord-label">Latitude:</span>
                  <span className="coord-val mono">{parseFloat(pickerCoords.lat).toFixed(6)}</span>
                </div>
                <div className="coord-row">
                  <span className="coord-label">Longitude:</span>
                  <span className="coord-val mono">{parseFloat(pickerCoords.lng).toFixed(6)}</span>
                </div>
              </div>
            ) : (
              <div className="coords-empty">
                Click anywhere on the map or search to place camera pin
              </div>
            )}
          </div>

          <div className="picker-actions">
            {onCancel && (
              <button
                type="button"
                className="btn btn-neutral btn-sm"
                onClick={onCancel}
              >
                Cancel
              </button>
            )}
            {onConfirmLocation && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!pickerCoords?.lat || !pickerCoords?.lng}
                onClick={onConfirmLocation}
              >
                Confirm Location
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TrafficMap;
