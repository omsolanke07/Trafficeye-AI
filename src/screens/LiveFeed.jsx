import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';

// Local webcam stream player
function WebcamStream({ camera }) {
  const videoRef = useRef(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);

  const startWebcam = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setStreaming(true);
      }
    } catch (err) {
      setError('Permission denied or no webcam found');
    }
  };

  const stopWebcam = () => {
    if (videoRef.current?.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setStreaming(false);
    }
  };

  useEffect(() => {
    return () => {
      stopWebcam();
    };
  }, []);

  return (
    <div style={{ position: 'relative', height: '140px', background: '#1F242D', borderRadius: '4px', overflow: 'hidden' }}>
      <video
        ref={videoRef}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: streaming ? 'block' : 'none' }}
        muted
        playsInline
      />
      {!streaming && (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#98A2B3', padding: '10px', textAlign: 'center' }}>
          <svg className="icon" width="24" height="24" viewBox="0 0 24 24" style={{ marginBottom: '6px', opacity: 0.7 }}>
            <path d="M23 7l-7 5 7 5V7z" />
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
          </svg>
          <div style={{ fontSize: '11px', marginBottom: '8px' }}>
            {error || 'Local Webcam Feed'}
          </div>
          <button className="btn btn-primary btn-sm" onClick={startWebcam}>
            Start Stream
          </button>
        </div>
      )}
      {streaming && (
        <>
          <div style={{ position: 'absolute', bottom: '6px', left: '8px', color: '#fff', fontSize: '10px', fontFamily: 'var(--font-mono)', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
            {camera.id} &middot; LIVE WEBCAM
          </div>
          <button
            onClick={stopWebcam}
            style={{ position: 'absolute', top: '6px', right: '6px', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '2px', fontSize: '9px', padding: '2px 6px', cursor: 'pointer' }}
          >
            Stop
          </button>
        </>
      )}
    </div>
  );
}

// Valid Indian 10-digit HSRP format: 2 uppercase letters (State) + 2 digits (RTO) + 2 uppercase letters (Series) + 4 digits (Unique number)
export const is10DigitHsrpPlate = (plate) => {
  if (!plate) return false;
  const clean = String(plate).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return /^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/.test(clean);
};

// General Indian registration (legacy or state variations)
export const isLegacyIndianFormat = (plate) => {
  if (!plate) return false;
  const clean = String(plate).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{1,4}$/.test(clean) && clean.length >= 7 && clean.length <= 11;
};

// Normalize camera name display (CAM 01 -> PVG, CAM 02 -> Shiv Darshan Chowk)
export const formatCameraDisplayName = (cam) => {
  if (!cam) return 'CAM 01';
  const str = String(cam);
  if (str === 'CAM 01' || str === 'CAM01' || str.toLowerCase().includes('pvg')) {
    return 'CAM 01 · PVG';
  }
  if (str === 'CAM 02' || str === 'CAM02' || str.toLowerCase().includes('shiv')) {
    return 'CAM 02 · Shiv Darshan Chowk';
  }
  if (str === 'CAM 03' || str === 'CAM03' || str.toLowerCase().includes('gajan')) {
    return 'CAM 03 · Gajanan Maharaj Temple';
  }
  if (str === 'CAM 04' || str === 'CAM04' || str.toLowerCase().includes('aranyeshwar')) {
    return 'CAM 04 · Aranyeshwar Circle';
  }
  if (str === 'CAM 05' || str === 'CAM05' || str.toLowerCase().includes('taware')) {
    return 'CAM 05 · Taware Colony';
  }
  return str;
};

// Hardcoded camera footage mapping for surveillance camera nodes
export const HARDCODED_CAMERA_FOOTAGE = {
  'CAM 01': '/videos/pvg_college.mp4',
  'CAM01': '/videos/pvg_college.mp4',
  'CAM 02': '/videos/shiv_darshan_chowk.mp4',
  'CAM02': '/videos/shiv_darshan_chowk.mp4',
  'CAM 03': '/videos/gajanan_maharaj_temple.mp4',
  'CAM03': '/videos/gajanan_maharaj_temple.mp4',
  'CAM 04': '/videos/aranyeshwar_circle.mp4',
  'CAM04': '/videos/aranyeshwar_circle.mp4',
  'CAM 05': '/videos/taware_colony.mp4',
  'CAM05': '/videos/taware_colony.mp4',
};

// Fallback resolver by camera ID or name patterns
export const resolveCameraFootage = (camera) => {
  if (!camera) return '/videos/pvg_college.mp4';
  if (camera.id && HARDCODED_CAMERA_FOOTAGE[camera.id]) {
    return HARDCODED_CAMERA_FOOTAGE[camera.id];
  }
  const name = (camera.name || '').toLowerCase();
  const loc = (camera.location || '').toLowerCase();
  const id = (camera.id || '').toLowerCase();
  if (name.includes('pvg') || loc.includes('pvg') || id.includes('cam 01') || id === 'cam01') {
    return '/videos/pvg_college.mp4';
  }
  if (name.includes('shiv') || loc.includes('shiv') || id.includes('cam 02') || id === 'cam02') {
    return '/videos/shiv_darshan_chowk.mp4';
  }
  if (name.includes('gajan') || loc.includes('gajan') || id.includes('cam 03') || id === 'cam03') {
    return '/videos/gajanan_maharaj_temple.mp4';
  }
  if (name.includes('aranyeshwar') || loc.includes('aranyeshwar') || id.includes('cam 04') || id === 'cam04') {
    return '/videos/aranyeshwar_circle.mp4';
  }
  if (name.includes('taware') || loc.includes('taware') || id.includes('cam 05') || id === 'cam05') {
    return '/videos/taware_colony.mp4';
  }
  return camera.source_url || '/videos/pvg_college.mp4';
};

export const DEFAULT_HARDCODED_CAMERAS = [
  {
    id: 'CAM 01',
    name: 'PVG',
    location: "PVG College Gate",
    source_type: 'video_file',
    source_url: '/videos/pvg_college.mp4',
    status: 'online',
    resolution: '4K UHD',
    fps: 30,
    last_plate: 'MH12WJ8198'
  },
  {
    id: 'CAM 02',
    name: 'Shiv Darshan Chowk',
    location: 'Shiv Darshan Chowk',
    source_type: 'video_file',
    source_url: '/videos/shiv_darshan_chowk.mp4',
    status: 'online',
    resolution: '4K UHD',
    fps: 30,
    last_plate: 'MH12YW8668'
  },
  {
    id: 'CAM 03',
    name: 'Gajanan Maharaj Temple',
    location: 'Gajanan Maharaj Temple',
    source_type: 'video_file',
    source_url: '/videos/gajanan_maharaj_temple.mp4',
    status: 'online',
    resolution: '4K UHD',
    fps: 30,
    last_plate: 'MH12FK1080'
  },
  {
    id: 'CAM 04',
    name: 'Aranyeshwar Circle',
    location: 'Aranyeshwar Circle',
    source_type: 'video_file',
    source_url: '/videos/aranyeshwar_circle.mp4',
    status: 'online',
    resolution: '4K UHD',
    fps: 30,
    last_plate: 'MH12DG4020'
  },
  {
    id: 'CAM 05',
    name: 'Taware Colony',
    location: 'Taware Colony',
    source_type: 'video_file',
    source_url: '/videos/taware_colony.mp4',
    status: 'online',
    resolution: '4K UHD',
    fps: 30,
    last_plate: 'MH12SS2009'
  }
];

// Video file stream player with hardcoded footage binding
function VideoFileStream({ camera, onMaximize }) {
  const videoSrc = resolveCameraFootage(camera);

  return (
    <div
      style={{ position: 'relative', height: '150px', background: '#10141C', borderRadius: '4px', overflow: 'hidden', cursor: onMaximize ? 'pointer' : 'default' }}
      onClick={() => onMaximize && onMaximize(camera)}
      title="Click to expand stream"
    >
      <video
        src={videoSrc}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        autoPlay
        loop
        muted
        playsInline
      />
      <div style={{ position: 'absolute', top: '6px', right: '6px', display: 'flex', gap: '4px' }}>
        <span style={{ background: 'rgba(20, 49, 92, 0.85)', color: '#68DBFF', fontSize: '9px', fontWeight: 600, padding: '2px 6px', borderRadius: '2px', backdropFilter: 'blur(4px)', fontFamily: 'var(--font-mono)' }}>
          REC ● LIVE
        </span>
      </div>
      <div style={{ position: 'absolute', bottom: '6px', left: '8px', color: '#fff', fontSize: '10px', fontFamily: 'var(--font-mono)', textShadow: '0 1px 3px rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }}></span>
        <span>{camera.id} &middot; {camera.name}</span>
      </div>
    </div>
  );
}

export const LiveFeed = () => {
  const {
    cameras,
    feedPaused,
    setFeedPaused,
    detections,
    setSelectedTrajectoryPlate,
    setCurrentScreen,
    setAddCameraModalOpen,
    deleteCamera,
    showToast
  } = useApp();

  const [selectedSector, setSelectedSector] = useState('All');
  const [maximizedCamera, setMaximizedCamera] = useState(null);
  const [activeConfidenceTab, setActiveConfidenceTab] = useState('high');

  const displayCameras = cameras && cameras.length > 0 ? cameras : DEFAULT_HARDCODED_CAMERAS;

  const filteredDetections = selectedSector === 'All'
    ? detections
    : detections.filter(d => d.camera.includes(selectedSector));

  return (
    <div className="screen active" id="screen-live">
      <div className="breadcrumb">
        <span>Home</span>
        <span className="sep">/</span>
        <span>Live ANPR Feed</span>
      </div>

      <div className="page-head">
        <div>
          <div className="page-title">Live ANPR / Camera Streams</div>
          <div className="page-sub">Real-time surveillance telemetry and live optical plate recognition across configured nodes</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={() => setAddCameraModalOpen(true)}>
            <svg className="icon" width="14" height="14" viewBox="0 0 24 24">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Camera
          </button>

          <button
            className={`btn ${feedPaused ? 'btn-neutral' : 'btn-outline'}`}
            onClick={() => {
              setFeedPaused(!feedPaused);
              showToast(feedPaused ? 'Live feed resumed' : 'Live feed paused', feedPaused ? 'success' : 'warning');
            }}
          >
            {feedPaused ? (
              <>
                <svg className="icon" width="14" height="14" viewBox="0 0 24 24">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Resume Feed
              </>
            ) : (
              <>
                <svg className="icon" width="14" height="14" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
                Pause Feed
              </>
            )}
          </button>
        </div>
      </div>

      {/* CAMERA FEED GRID */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3>Active Camera Streams</h3>
            {!feedPaused && displayCameras.length > 0 && (
              <span className="live-indicator">
                <span className="live-indicator-dot"></span>
                <span>ONLINE &middot; STREAMING</span>
              </span>
            )}
          </div>
          <span className="card-note">
            {displayCameras.length} camera(s) configured
          </span>
        </div>

        <div className="card-body">
          {displayCameras.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--slate)' }}>
              <svg className="icon" width="36" height="36" viewBox="0 0 24 24" style={{ margin: '0 auto 12px', display: 'block', opacity: 0.4 }}>
                <path d="M23 7l-7 5 7 5V7z" />
                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
              </svg>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--primary)', marginBottom: '4px' }}>
                No Cameras Configured
              </div>
              <div style={{ fontSize: '12px', marginBottom: '16px' }}>
                Connect a local webcam, RTSP stream, or video source to monitor live traffic.
              </div>
              <button className="btn btn-primary" onClick={() => setAddCameraModalOpen(true)}>
                Add Camera Node
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              {displayCameras.map((camera) => (
                <div key={camera.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '10px', background: '#FDFDFD', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  {camera.source_type === 'webcam' ? (
                    <WebcamStream camera={camera} />
                  ) : (
                    <VideoFileStream camera={camera} onMaximize={setMaximizedCamera} />
                  )}

                  <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0, marginRight: '8px' }}>
                      <div style={{ fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{camera.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--slate)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {camera.location || camera.ward || 'Node'} &middot; {camera.resolution || '1080p'}
                      </div>
                      {camera.last_plate && (
                        <div style={{ fontSize: '10.5px', fontFamily: 'var(--font-mono)', color: 'var(--primary)', marginTop: '2px' }}>
                          Last Scan: <strong>{camera.last_plate}</strong>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        className="icon-btn"
                        style={{ color: 'var(--primary)', padding: '4px' }}
                        title="Expand camera stream"
                        onClick={() => setMaximizedCamera(camera)}
                      >
                        <svg className="icon" width="13" height="13" viewBox="0 0 24 24">
                          <polyline points="15 3 21 3 21 9" />
                          <polyline points="9 21 3 21 3 15" />
                          <line x1="21" y1="3" x2="14" y2="10" />
                          <line x1="3" y1="21" x2="10" y2="14" />
                        </svg>
                      </button>
                      <button
                        className="icon-btn"
                        style={{ color: 'var(--red)', padding: '4px' }}
                        title="Remove camera"
                        onClick={() => deleteCamera(camera.id)}
                      >
                        <svg className="icon" width="13" height="13" viewBox="0 0 24 24">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* EXPANDED CAMERA MODAL */}
      {maximizedCamera && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(10, 15, 25, 0.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
          onClick={() => setMaximizedCamera(null)}
        >
          <div
            style={{
              background: '#141822',
              border: '1px solid #2A3346',
              borderRadius: '8px',
              maxWidth: '900px',
              width: '100%',
              overflow: 'hidden',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #2A3346', color: '#fff' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px' }}>{maximizedCamera.name}</div>
                <div style={{ fontSize: '11px', color: '#98A2B3', fontFamily: 'var(--font-mono)' }}>
                  {maximizedCamera.id} &middot; {maximizedCamera.location || 'Pune Command Area'} &middot; {maximizedCamera.resolution || '4K UHD'}
                </div>
              </div>
              <button
                onClick={() => setMaximizedCamera(null)}
                style={{ background: 'transparent', border: 'none', color: '#98A2B3', fontSize: '18px', cursor: 'pointer', padding: '4px 8px' }}
              >
                ✕
              </button>
            </div>
            <div style={{ position: 'relative', width: '100%', background: '#000', maxHeight: '70vh', overflow: 'hidden' }}>
              <video
                src={resolveCameraFootage(maximizedCamera)}
                style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '70vh' }}
                autoPlay
                loop
                muted
                controls
              />
            </div>
            <div style={{ padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0E121B', color: '#98A2B3', fontSize: '11px' }}>
              <span>Status: <strong style={{ color: '#10B981' }}>ONLINE &middot; STREAMING</strong></span>
              <span>Source: <code className="mono">{resolveCameraFootage(maximizedCamera)}</code></span>
            </div>
          </div>
        </div>
      )}

      {/* REAL-TIME DETECTION FEED: 3 CONFIDENCE TIERS */}
      {(() => {
        const categorized = filteredDetections.map(d => {
          const cleanPlate = String(d.plate || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
          const oconf = d.rawConf != null ? d.rawConf : parseFloat(String(d.conf || '').replace('%', '')) || 0;
          const is10 = cleanPlate.length === 10 && /^[A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/.test(cleanPlate);
          const displayCam = formatCameraDisplayName(d.camera);

          let tier = 'low';
          let tierLabel = 'Low Confidence';
          let formatStatus = 'Invalid Indian Format';
          let badgeColor = 'red';

          // MANDATORY RULE: Place all vehicles with digits less than 10 in low confidence section
          if (cleanPlate.length < 10) {
            tier = 'low';
            tierLabel = 'Low Confidence';
            formatStatus = `Digits < 10 (${cleanPlate.length} chars)`;
            badgeColor = 'red';
          } else if (is10 && oconf >= 90 && d.status !== 'Review') {
            tier = 'high';
            tierLabel = 'High Confidence';
            formatStatus = d.status === 'Flagged' ? '🚨 BLACKLIST MATCH — FLAGGED' : '10-Digit HSRP Verified';
            badgeColor = d.status === 'Flagged' ? 'red' : 'green';
          } else if (d.status === 'Review' || (oconf >= 65 && oconf < 90)) {
            tier = 'review';
            tierLabel = 'Needs Review';
            formatStatus = oconf >= 90 ? 'High Conf — Manual Review Flagged' : 'Average OCR Confidence';
            badgeColor = 'amber';
          } else {
            tier = 'low';
            tierLabel = 'Low Confidence';
            formatStatus = !is10 ? 'Invalid 10-Digit HSRP' : 'Low OCR Confidence (<65%)';
            badgeColor = 'red';
          }

          return {
            ...d,
            camera: displayCam,
            rawConf: oconf,
            tier,
            tierLabel,
            formatStatus,
            badgeColor,
            is10Hsrp: is10
          };
        });

        const highList = categorized.filter(d => d.tier === 'high');
        const reviewList = categorized.filter(d => d.tier === 'review');
        const lowList = categorized.filter(d => d.tier === 'low');

        const renderTableForTier = (items, tierKey, title, badgeText, badgeBg, badgeColor, description, emptyMsg) => (
          <div className="card" style={{ marginBottom: '20px', borderLeft: `4px solid ${badgeColor}` }} key={tierKey}>
            <div className="card-head" style={{ flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0 }}>{title}</h3>
                  <span style={{ background: badgeBg, color: badgeColor, fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>
                    {badgeText}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--meta)', marginTop: '4px' }}>
                  {description}
                </div>
              </div>
              <span className="card-note" style={{ fontWeight: 600 }}>
                {items.length} scan(s) recorded
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              {items.length === 0 ? (
                <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--slate)', fontSize: '13px' }}>
                  {emptyMsg}
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Camera Node</th>
                      <th>Detected Plate</th>
                      <th>Format &amp; HSRP Status</th>
                      <th>OCR Confidence</th>
                      <th>Condition</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((d) => (
                      <tr key={d.id}>
                        <td className="mono" style={{ fontSize: '12px' }}>{d.time}</td>
                        <td>
                          <span style={{ fontWeight: 600, color: 'var(--primary)' }}>
                            {formatCameraDisplayName(d.camera)}
                          </span>
                        </td>
                        <td className="mono" style={{ fontWeight: 700, fontSize: '13px', letterSpacing: '0.5px' }}>
                          {d.plate}
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: d.badgeColor === 'green' ? 'var(--green)' : d.badgeColor === 'amber' ? 'var(--amber)' : 'var(--red)',
                            background: d.badgeColor === 'green' ? 'var(--green-bg)' : d.badgeColor === 'amber' ? 'var(--amber-bg)' : 'var(--red-bg)',
                            padding: '2px 7px',
                            borderRadius: '3px'
                          }}>
                            {d.badgeColor === 'green' && '✓ '}
                            {d.badgeColor === 'amber' && '⚠ '}
                            {d.badgeColor === 'red' && '✕ '}
                            {d.formatStatus}
                          </span>
                        </td>
                        <td>
                          <span className="mono" style={{
                            fontWeight: 700,
                            color: d.rawConf >= 90 ? 'var(--green)' : d.rawConf >= 65 ? 'var(--amber)' : 'var(--red)'
                          }}>
                            {d.conf}
                          </span>
                        </td>
                        <td>
                          <span className={`badge badge-${d.condType}`}>{d.condition}</span>
                        </td>
                        <td>
                          <span className={`badge badge-${d.statType}`}>{d.status}</span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="btn btn-neutral btn-sm"
                            onClick={() => {
                              setSelectedTrajectoryPlate(d.plate);
                              setCurrentScreen('trajectory');
                              showToast(`Initiating trajectory reconstruction for ${d.plate}`, 'info');
                            }}
                          >
                            Trajectory
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        );

        return (
          <div style={{ marginTop: '10px' }}>
            {/* 3 SUMMARY KPI TILES */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px', marginBottom: '18px' }}>
              {/* High Confidence Tile */}
              <div
                onClick={() => setActiveConfidenceTab('high')}
                style={{
                  background: activeConfidenceTab === 'high' ? 'var(--green-bg)' : '#FFFFFF',
                  border: activeConfidenceTab === 'high' ? '2px solid var(--green)' : '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '14px 16px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: activeConfidenceTab === 'high' ? '0 2px 8px rgba(46, 125, 50, 0.15)' : 'none'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    🟢 High Confidence
                  </span>
                  <span style={{ fontSize: '11px', background: 'var(--green-bg)', color: 'var(--green)', padding: '1px 6px', borderRadius: '3px', fontWeight: 600 }}>
                    10-Digit HSRP
                  </span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--primary)', lineHeight: 1.2 }}>
                  {highList.length}
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--meta)', marginTop: '4px' }}>
                  Validated 10-digit Indian HSRP plates with optical confidence &gt;90%
                </div>
              </div>

              {/* Needs Review Tile */}
              <div
                onClick={() => setActiveConfidenceTab('review')}
                style={{
                  background: activeConfidenceTab === 'review' ? 'var(--amber-bg)' : '#FFFFFF',
                  border: activeConfidenceTab === 'review' ? '2px solid var(--amber)' : '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '14px 16px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: activeConfidenceTab === 'review' ? '0 2px 8px rgba(199, 119, 0, 0.15)' : 'none'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    🟡 Needs Review
                  </span>
                  <span style={{ fontSize: '11px', background: 'var(--amber-bg)', color: 'var(--amber)', padding: '1px 6px', borderRadius: '3px', fontWeight: 600 }}>
                    Needs Improvement
                  </span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--primary)', lineHeight: 1.2 }}>
                  {reviewList.length}
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--meta)', marginTop: '4px' }}>
                  Average confidence scans from database flagged for manual verification
                </div>
              </div>

              {/* Low Confidence Tile */}
              <div
                onClick={() => setActiveConfidenceTab('low')}
                style={{
                  background: activeConfidenceTab === 'low' ? 'var(--red-bg)' : '#FFFFFF',
                  border: activeConfidenceTab === 'low' ? '2px solid var(--red)' : '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: '14px 16px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: activeConfidenceTab === 'low' ? '0 2px 8px rgba(179, 38, 30, 0.15)' : 'none'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    🔴 Low Confidence
                  </span>
                  <span style={{ fontSize: '11px', background: 'var(--red-bg)', color: 'var(--red)', padding: '1px 6px', borderRadius: '3px', fontWeight: 600 }}>
                    Invalid Plates
                  </span>
                </div>
                <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--primary)', lineHeight: 1.2 }}>
                  {lowList.length}
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--meta)', marginTop: '4px' }}>
                  Invalid Indian plate syntax, truncated characters, or OCR &lt;65%
                </div>
              </div>
            </div>

            {/* TAB SELECTION BAR */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
              <div style={{ display: 'inline-flex', background: '#ECEFF4', padding: '3px', borderRadius: '6px', gap: '3px' }}>
                <button
                  className={`btn btn-sm ${activeConfidenceTab === 'high' ? 'btn-primary' : 'btn-neutral'}`}
                  style={{ fontSize: '11.5px', padding: '5px 12px', borderRadius: '4px' }}
                  onClick={() => setActiveConfidenceTab('high')}
                >
                  🟢 High Confidence ({highList.length})
                </button>
                <button
                  className={`btn btn-sm ${activeConfidenceTab === 'review' ? 'btn-primary' : 'btn-neutral'}`}
                  style={{ fontSize: '11.5px', padding: '5px 12px', borderRadius: '4px' }}
                  onClick={() => setActiveConfidenceTab('review')}
                >
                  🟡 Needs Review ({reviewList.length})
                </button>
                <button
                  className={`btn btn-sm ${activeConfidenceTab === 'low' ? 'btn-primary' : 'btn-neutral'}`}
                  style={{ fontSize: '11.5px', padding: '5px 12px', borderRadius: '4px' }}
                  onClick={() => setActiveConfidenceTab('low')}
                >
                  🔴 Low Confidence ({lowList.length})
                </button>
                <button
                  className={`btn btn-sm ${activeConfidenceTab === 'all' ? 'btn-primary' : 'btn-neutral'}`}
                  style={{ fontSize: '11.5px', padding: '5px 12px', borderRadius: '4px' }}
                  onClick={() => setActiveConfidenceTab('all')}
                >
                  📋 View All 3 Sections
                </button>
              </div>

              <div style={{ fontSize: '11.5px', color: 'var(--slate)', fontFamily: 'var(--font-mono)' }}>
                Total ANPR Scans: <strong>{categorized.length}</strong>
              </div>
            </div>

            {/* SECTION RENDER ACCORDING TO ACTIVE TAB */}
            {activeConfidenceTab === 'high' && (
              renderTableForTier(
                highList,
                'high',
                'High Confidence Plate Scans',
                'HSRP 10-Digit Verified',
                'var(--green-bg)',
                'var(--green)',
                'Only standard 10-digit Indian High Security Registration Plates (HSRP) with confidence ≥90%',
                'No high-confidence 10-digit HSRP plates found matching the current sector filter.'
              )
            )}

            {activeConfidenceTab === 'review' && (
              renderTableForTier(
                reviewList,
                'review',
                'Needs Review & Improvement Scans',
                'Manual Audit Required',
                'var(--amber-bg)',
                'var(--amber)',
                'Average confidence plates from the database requiring operator verification or secondary OCR check',
                'No scans currently flagged for review in this sector.'
              )
            )}

            {activeConfidenceTab === 'low' && (
              renderTableForTier(
                lowList,
                'low',
                'Low Confidence & Invalid Number Plates',
                'Syntax / Quality Failure',
                'var(--red-bg)',
                'var(--red)',
                'Number plates failing standard Indian registration format (non-HSRP, fragmented, or confidence <65%)',
                'No invalid or low confidence plates detected in this sector.'
              )
            )}

            {activeConfidenceTab === 'all' && (
              <div>
                {renderTableForTier(
                  highList,
                  'high',
                  'Section 1: High Confidence (10-Digit HSRP Plates)',
                  'Verified HSRP',
                  'var(--green-bg)',
                  'var(--green)',
                  'Standard 10-digit Indian High Security Registration Plates with optical recognition confidence ≥90%',
                  'No high-confidence 10-digit HSRP plates.'
                )}

                {renderTableForTier(
                  reviewList,
                  'review',
                  'Section 2: Needs Review (Average Confidence Plates)',
                  'Needs Improvement',
                  'var(--amber-bg)',
                  'var(--amber)',
                  'Average confidence detections from active database for operator review',
                  'No scans needing review.'
                )}

                {renderTableForTier(
                  lowList,
                  'low',
                  'Section 3: Low Confidence (Invalid Number Plates)',
                  'Invalid Format',
                  'var(--red-bg)',
                  'var(--red)',
                  'Invalid plate formats, incomplete alphanumeric syntax, or severely degraded optical quality (<65%)',
                  'No invalid plates recorded.'
                )}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};
