import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { TrafficMap } from '../components/TrafficMap';

export const TrajectorySearch = () => {
  const { selectedTrajectoryPlate, setSelectedTrajectoryPlate, apiFetch, showToast, generateReport } = useApp();
  const [searchInput, setSearchInput] = useState(selectedTrajectoryPlate || '');
  const [isSearching, setIsSearching] = useState(false);
  const [trajectoryData, setTrajectoryData] = useState(null);

  const fetchTrajectory = async (plate) => {
    if (!plate || !plate.trim()) return;
    setIsSearching(true);
    try {
      const res = await apiFetch(`/api/trajectory/${encodeURIComponent(plate.trim())}`);
      setTrajectoryData(res.data);
      if (res.data?.totalDetections > 0) {
        showToast(`Located ${res.data.totalDetections} sighting(s) for ${plate}`, 'success');
      } else {
        showToast(`No sightings recorded for ${plate}`, 'info');
      }
    } catch (err) {
      showToast(`Error querying trajectory: ${err.message}`, 'danger');
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    if (selectedTrajectoryPlate) {
      setSearchInput(selectedTrajectoryPlate);
      fetchTrajectory(selectedTrajectoryPlate);
    }
  }, [selectedTrajectoryPlate]);

  const handleSearch = (e) => {
    e?.preventDefault();
    if (!searchInput.trim()) {
      showToast('Please enter a license plate number', 'warning');
      return;
    }
    const clean = searchInput.trim().toUpperCase();
    setSelectedTrajectoryPlate(clean);
    fetchTrajectory(clean);
  };

  const handleExportPDF = async () => {
    if (!trajectoryData?.plate) return;
    try {
      await generateReport(`Trajectory Audit — ${trajectoryData.plate}`, 'Trajectory Audit');
    } catch (err) {
      // Handled in context
    }
  };

  const waypoints = trajectoryData?.waypoints || [];
  const speedAnalysis = trajectoryData?.speedAnalysis;

  return (
    <div className="screen active" id="screen-trajectory">
      <div className="breadcrumb">
        <span>Home</span>
        <span className="sep">/</span>
        <span>Plate Trajectory Search</span>
      </div>

      <div className="page-head">
        <div>
          <div className="page-title">Single Plate Trajectory &amp; Speed Telemetry</div>
          <div className="page-sub">Reconstruct chronological movement and compute corridor velocity across calibrated camera nodes</div>
        </div>
      </div>

      {/* SEARCH FORM */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <form onSubmit={handleSearch}>
          <div
            className="card-body"
            style={{
              display: 'flex',
              gap: '14px',
              alignItems: 'flex-end'
            }}
          >
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: '5px' }}>
                License Plate Number
              </label>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Enter plate number (e.g. MH12JJ6917)"
                style={{
                  width: '100%',
                  padding: '9px 10px',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '13.5px',
                  fontWeight: 600,
                  textTransform: 'uppercase'
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                <span style={{ fontSize: '11px', color: 'var(--meta)' }}>Common Transit Vehicle:</span>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    background: '#EEF4FF',
                    color: '#14315C',
                    border: '1px solid #C7D7FE',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                  onClick={() => {
                    setSearchInput('MH12JJ6917');
                    setSelectedTrajectoryPlate('MH12JJ6917');
                    fetchTrajectory('MH12JJ6917');
                  }}
                >
                  MH12JJ6917 &bull; 5 Cameras (Speed: 2.68 km/h &middot; 2.50 km)
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ justifyContent: 'center', minWidth: '120px', marginBottom: '32px' }}
              disabled={isSearching}
            >
              <svg className="icon" width="14" height="14" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              {isSearching ? 'Searching...' : 'Search Plate'}
            </button>
          </div>
        </form>
      </div>

      {!trajectoryData ? (
        <div className="card" style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--slate)' }}>
          <svg className="icon" width="40" height="40" viewBox="0 0 24 24" style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }}>
            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
            <line x1="8" y1="2" x2="8" y2="18" />
            <line x1="16" y1="6" x2="16" y2="22" />
          </svg>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--primary)', marginBottom: '4px' }}>
            No Plate Query Active
          </div>
          <div style={{ fontSize: '12px' }}>
            Enter a vehicle plate number above to reconstruct its movement and speed across real camera sightings.
          </div>
        </div>
      ) : waypoints.length === 0 ? (
        <div className="card" style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--slate)' }}>
          <svg className="icon" width="40" height="40" viewBox="0 0 24 24" style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }}>
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--primary)', marginBottom: '4px' }}>
            No Sightings Recorded for {trajectoryData.plate}
          </div>
          <div style={{ fontSize: '12px' }}>
            This license plate has not been detected by any active camera node or uploaded media in the database.
          </div>
        </div>
      ) : (
        <>
          {/* SPEED DETECTION & VELOCITY TELEMETRY SECTION */}
          {speedAnalysis && (
            <div className="card" style={{ marginBottom: '20px', borderLeft: '4px solid #10B981' }}>
              <div className="card-head" style={{ borderBottom: '1px solid #EEF2F6', paddingBottom: '12px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', background: '#E6F4EA', color: '#137333' }}>
                      <svg className="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                      </svg>
                    </span>
                    <h3 style={{ margin: 0, fontSize: '16px', color: '#14315C' }}>
                      Corridor Speed Detection &amp; Velocity Analysis
                    </h3>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--slate)', marginTop: '4px' }}>
                    Speed calculated via calibrated physical node baselines: <code className="mono" style={{ background: '#F2F4F7', padding: '1px 6px', borderRadius: '3px' }}>Speed = Distance / Time</code>
                  </div>
                </div>
                <span className="badge badge-green" style={{ fontSize: '11px', padding: '4px 8px' }}>
                  {speedAnalysis.trafficClassification}
                </span>
              </div>

              {/* OVERALL METRICS CARDS */}
              <div style={{ padding: '16px', background: '#FAFCFF', borderBottom: '1px solid #EEF2F6' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  <div style={{ background: '#fff', padding: '12px 14px', borderRadius: '6px', border: '1px solid #E4E7EC', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--slate)', textTransform: 'uppercase', fontWeight: 600 }}>Average Velocity</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#14315C', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                      {speedAnalysis.averageSpeedKmh} <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--meta)' }}>km/h</span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#10B981', fontWeight: 600, marginTop: '2px' }}>
                      {speedAnalysis.averageSpeedMps} m/s
                    </div>
                  </div>

                  <div style={{ background: '#fff', padding: '12px 14px', borderRadius: '6px', border: '1px solid #E4E7EC', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--slate)', textTransform: 'uppercase', fontWeight: 600 }}>Total Corridor Distance</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#14315C', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                      {speedAnalysis.totalDistanceKm} <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--meta)' }}>km</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--slate)', marginTop: '2px' }}>
                      {speedAnalysis.totalDistanceMeters.toLocaleString()} meters traversed
                    </div>
                  </div>

                  <div style={{ background: '#fff', padding: '12px 14px', borderRadius: '6px', border: '1px solid #E4E7EC', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--slate)', textTransform: 'uppercase', fontWeight: 600 }}>Total Transit Time</div>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#14315C', fontFamily: 'var(--font-mono)', marginTop: '4px' }}>
                      {speedAnalysis.totalDurationFormatted}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--slate)', marginTop: '2px' }}>
                      {speedAnalysis.totalDurationSeconds} seconds ({speedAnalysis.startTime} &rarr; {speedAnalysis.endTime})
                    </div>
                  </div>

                  <div style={{ background: '#fff', padding: '12px 14px', borderRadius: '6px', border: '1px solid #E4E7EC', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                    <div style={{ fontSize: '11px', color: 'var(--slate)', textTransform: 'uppercase', fontWeight: 600 }}>Speed Formula Verification</div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#14315C', fontFamily: 'var(--font-mono)', marginTop: '6px', lineHeight: '1.4' }}>
                      v = d &divide; t
                    </div>
                    <div style={{ fontSize: '10.5px', color: 'var(--slate)', marginTop: '4px' }}>
                      {speedAnalysis.totalDistanceMeters}m &divide; {speedAnalysis.totalDurationSeconds}s = <strong>{speedAnalysis.averageSpeedKmh} km/h</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* SEGMENT-BY-SEGMENT TELEMETRY BREAKDOWN */}
              <div style={{ padding: '16px' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 600, color: '#14315C', marginBottom: '10px' }}>
                  Camera Node Segment Telemetry &amp; Leg Speeds
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                  {speedAnalysis.segments.map((seg) => (
                    <div
                      key={seg.segmentNumber}
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #E4E7EC',
                        borderRadius: '6px',
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#14315C', background: '#F0F4F9', padding: '2px 6px', borderRadius: '3px', textTransform: 'uppercase' }}>
                            Leg {seg.segmentNumber}
                          </span>
                          <span className="mono" style={{ fontSize: '13px', fontWeight: 700, color: '#137333' }}>
                            {seg.speedKmh} km/h
                          </span>
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--navy)' }}>
                          {seg.fromLocation} &rarr; {seg.toLocation}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--slate)', marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                          {seg.fromTime} &rarr; {seg.toTime} ({seg.durationFormatted})
                        </div>
                      </div>

                      <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #EAECF0', display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                        <span style={{ color: 'var(--meta)' }}>Distance: <strong>{seg.distanceMeters}m</strong></span>
                        <span style={{ color: 'var(--meta)' }}>Velocity: <strong>{seg.speedMps} m/s</strong></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* REAL INTERACTIVE TRAJECTORY MAP */}
          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="card-head">
              <div>
                <h3>Movement Path Reconstruction &mdash; {trajectoryData.plate}</h3>
                <span className="card-note">
                  {waypoints.length} verified sightings &bull; OpenStreetMap Pune Route Reconstruction
                  {trajectoryData.blacklisted && (
                    <span style={{ color: 'var(--red)', fontWeight: 600, marginLeft: '8px' }}>
                      &middot; MATCHES BLACKLIST ({trajectoryData.flagReason})
                    </span>
                  )}
                </span>
              </div>
              <button className="btn btn-neutral btn-sm" onClick={handleExportPDF}>
                Export PDF
              </button>
            </div>
            <div className="card-body" style={{ padding: '12px' }}>
              <TrafficMap
                mode="trajectory"
                trajectories={trajectoryData.waypoints}
                height="440px"
              />
            </div>
          </div>

          {/* CHRONOLOGICAL SIGHTINGS TABLE WITH SPEED */}
          <div className="card">
            <div className="card-head">
              <h3>Chronological Node Sightings &amp; Velocity Log</h3>
              <span className="card-note">{waypoints.length} node sightings</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Timestamp</th>
                    <th>Camera Node / Location</th>
                    <th>Leg Distance</th>
                    <th>Transit Time</th>
                    <th>Calculated Speed</th>
                    <th>OCR Confidence</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {waypoints.map((w) => (
                    <tr key={w.id}>
                      <td className="mono">{w.id}</td>
                      <td className="mono">{w.time}</td>
                      <td>
                        <strong>{w.cam}</strong> &mdash; {w.location}
                      </td>
                      <td className="mono">{w.legDistance || 'Origin'}</td>
                      <td className="mono">{w.legDuration || '—'}</td>
                      <td>
                        {w.speedKmh != null ? (
                          <span style={{ fontWeight: 700, color: '#137333', fontFamily: 'var(--font-mono)' }}>
                            {w.speedKmh} km/h <span style={{ fontSize: '10px', color: 'var(--slate)', fontWeight: 400 }}>({w.speedMps} m/s)</span>
                          </span>
                        ) : (
                          <span style={{ color: 'var(--meta)' }}>Initial Point</span>
                        )}
                      </td>
                      <td>{w.confidence ? `${(w.confidence * (w.confidence <= 1.0 ? 100 : 1)).toFixed(1)}%` : '—'}</td>
                      <td>
                        <span className={`badge ${w.alert ? 'badge-red' : 'badge-green'}`}>
                          {w.alert ? 'Flagged / Alert' : 'Verified'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
