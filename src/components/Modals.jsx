import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { TrafficMap } from './TrafficMap';

// Sub-component for Editing Existing Camera Geolocation with Map Pin
const EditCameraLocationModal = ({ camera, onClose, onSave, isSaving }) => {
  const initialLat = camera.lat ? parseFloat(camera.lat).toFixed(6) : '18.520400';
  const initialLng = camera.lng ? parseFloat(camera.lng).toFixed(6) : '73.856700';
  const [editLat, setEditLat] = useState(initialLat);
  const [editLng, setEditLng] = useState(initialLng);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card-lg" onClick={(e) => e.stopPropagation()}>
        <div className="card-head">
          <div>
            <h3>Edit Camera Location</h3>
            <div style={{ fontSize: '11px', color: 'var(--meta)' }}>
              {camera.name} &middot; <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{camera.id}</span>
            </div>
          </div>
          <button
            className="icon-btn"
            style={{ color: 'var(--slate)' }}
            onClick={onClose}
          >
            <svg className="icon" width="16" height="16" viewBox="0 0 24 24">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8F9FA', padding: '8px 12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--meta)', fontWeight: 700 }}>
                Stored Coordinates
              </div>
              <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--slate)' }}>
                Lat: {parseFloat(camera.lat || 0).toFixed(6)} | Lng: {parseFloat(camera.lng || 0).toFixed(6)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--green)', fontWeight: 700 }}>
                New Selected Coordinates
              </div>
              <div style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--primary)' }}>
                Lat: {editLat} | Lng: {editLng}
              </div>
            </div>
          </div>

          <TrafficMap
            mode="picker"
            pickerCoords={{
              lat: parseFloat(editLat) || 18.5204,
              lng: parseFloat(editLng) || 73.8567
            }}
            onLocationChange={(coords) => {
              setEditLat(coords.lat.toFixed(6));
              setEditLng(coords.lng.toFixed(6));
            }}
            onConfirmLocation={() => onSave(editLat, editLng)}
            onCancel={onClose}
            height="360px"
          />

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '6px' }}>
            <button
              type="button"
              className="btn btn-neutral"
              onClick={onClose}
            >
              Cancel (Keep Existing)
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={isSaving}
              onClick={() => onSave(editLat, editLng)}
            >
              {isSaving ? 'Saving to Database...' : 'Confirm & Save Location'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const Modals = () => {
  const {
    addBlacklistModalOpen,
    setAddBlacklistModalOpen,
    addBlacklistEntry,
    addCameraModalOpen,
    setAddCameraModalOpen,
    addCamera,
    updateCamera,
    editLocationModalOpen,
    setEditLocationModalOpen,
    cameraToEdit,
    setCameraToEdit,
    dispatchModalData,
    setDispatchModalData,
    dispatchUnit,
    loginModalOpen,
    setLoginModalOpen,
    currentUser,
    login,
    logout,
    showToast
  } = useApp();

  // New Blacklist form state
  const [plate, setPlate] = useState('');
  const [reason, setReason] = useState('Wanted — Criminal Case');
  const [category, setCategory] = useState('wanted');
  const [priority, setPriority] = useState('Critical');
  const [firRef, setFirRef] = useState('');
  const [addedBy, setAddedBy] = useState(currentUser?.name || 'Insp. R. Deshmukh, PCR-04');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New Camera form state
  const [camId, setCamId] = useState('');
  const [camName, setCamName] = useState('');
  const [camSourceType, setCamSourceType] = useState('webcam'); // 'webcam' | 'rtsp' | 'video_file' | 'local_stream'
  const [camSourceUrl, setCamSourceUrl] = useState('');
  const [camLocation, setCamLocation] = useState('');
  const [camLat, setCamLat] = useState('18.520400');
  const [camLng, setCamLng] = useState('73.856700');
  const [camResolution, setCamResolution] = useState('1080p');
  const [camFps, setCamFps] = useState('30');
  const [isSavingCam, setIsSavingCam] = useState(false);

  // Edit Camera Location state
  const [isUpdatingCam, setIsUpdatingCam] = useState(false);

  // Login form state
  const [loginUsername, setLoginUsername] = useState('deshmukh');
  const [loginPassword, setLoginPassword] = useState('police123');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Tactical Dispatch form state
  const [patrolUnit, setPatrolUnit] = useState('PCR-18 (Hinjewadi Sector 7)');
  const [tacticalDirective, setTacticalDirective] = useState('Intercept & Detain Vehicle Safely');

  const handleSaveBlacklist = async (e) => {
    e.preventDefault();
    if (!plate.trim()) {
      showToast('Please enter a valid license plate number', 'warning');
      return;
    }
    setIsSubmitting(true);
    try {
      await addBlacklistEntry({
        plate: plate.trim().toUpperCase(),
        reason,
        fir_ref: firRef.trim(),
        addedBy,
        category,
        priority,
        notes: notes.trim()
      });
      setPlate('');
      setFirRef('');
      setNotes('');
      setAddBlacklistModalOpen(false);
    } catch (err) {
      // error handled in context
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveCamera = async (e) => {
    e.preventDefault();
    if (!camName.trim()) {
      showToast('Camera name is required', 'warning');
      return;
    }
    const finalLat = parseFloat(camLat) || 18.5204;
    const finalLng = parseFloat(camLng) || 73.8567;
    setIsSavingCam(true);
    try {
      await addCamera({
        id: camId.trim() || undefined,
        name: camName.trim(),
        source_type: camSourceType,
        source_url: camSourceUrl.trim(),
        location: camLocation.trim() || camName.trim(),
        lat: finalLat,
        lng: finalLng,
        fps: parseInt(camFps, 10) || 30,
        resolution: camResolution,
        status: 'online'
      });
      setCamId('');
      setCamName('');
      setCamSourceUrl('');
      setCamLocation('');
      setCamLat('18.520400');
      setCamLng('73.856700');
      setAddCameraModalOpen(false);
    } catch (err) {
      // error handled in context
    } finally {
      setIsSavingCam(false);
    }
  };

  const handleUpdateCameraLocation = async (e) => {
    e?.preventDefault();
    if (!cameraToEdit) return;
    const finalLat = parseFloat(editLat);
    const finalLng = parseFloat(editLng);
    if (isNaN(finalLat) || isNaN(finalLng)) {
      showToast('Invalid coordinates selected', 'warning');
      return;
    }
    setIsUpdatingCam(true);
    try {
      await updateCamera(cameraToEdit.id, {
        lat: finalLat,
        lng: finalLng
      });
      setEditLocationModalOpen(false);
      setCameraToEdit(null);
    } catch (err) {
      // Handled in context
    } finally {
      setIsUpdatingCam(false);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      await login(loginUsername, loginPassword);
    } catch (err) {
      // error handled in context
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleConfirmDispatch = async () => {
    if (!dispatchModalData) return;
    await dispatchUnit({
      id: dispatchModalData.id,
      plate: dispatchModalData.plate_number || dispatchModalData.plate,
      patrol_unit: patrolUnit,
      directive: tacticalDirective
    });
  };

  return (
    <>
      {/* AUTH / OFFICER SIGN IN MODAL */}
      {loginModalOpen && (
        <div className="modal-overlay" onClick={() => setLoginModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="card-head" style={{ background: 'var(--primary)', color: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="emblem" style={{ width: '24px', height: '24px', fontSize: '11px' }}>GT</div>
                <h3 style={{ color: '#fff' }}>Authorized Personnel Sign In</h3>
              </div>
              <button
                className="icon-btn"
                style={{ color: '#fff' }}
                onClick={() => setLoginModalOpen(false)}
              >
                <svg className="icon" width="16" height="16" viewBox="0 0 24 24">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleLoginSubmit}>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: '5px' }}>
                    Officer Call-sign / Username *
                  </label>
                  <input
                    type="text"
                    required
                    value={loginUsername}
                    onChange={(e) => setLoginUsername(e.target.value)}
                    style={{ width: '100%', padding: '9px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '13px' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: '5px' }}>
                    Passcode / Security PIN *
                  </label>
                  <input
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    style={{ width: '100%', padding: '9px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '13px' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                  {currentUser ? (
                    <button
                      type="button"
                      className="btn btn-neutral btn-sm"
                      style={{ color: 'var(--red)' }}
                      onClick={() => {
                        logout();
                        setLoginModalOpen(false);
                      }}
                    >
                      Sign Out
                    </button>
                  ) : <span />}

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn btn-neutral"
                      onClick={() => setLoginModalOpen(false)}
                    >
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={isLoggingIn}>
                      {isLoggingIn ? 'Authenticating...' : 'Sign In'}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD CAMERA MODAL */}
      {addCameraModalOpen && (
        <div className="modal-overlay" onClick={() => setAddCameraModalOpen(false)}>
          <div className="modal-card-lg" onClick={(e) => e.stopPropagation()}>
            <div className="card-head">
              <div>
                <h3>Configure Real Camera Node</h3>
                <div style={{ fontSize: '11px', color: 'var(--meta)' }}>
                  Add a real camera stream and position it on the Pune City Map
                </div>
              </div>
              <button
                className="icon-btn"
                style={{ color: 'var(--slate)' }}
                onClick={() => setAddCameraModalOpen(false)}
              >
                <svg className="icon" width="16" height="16" viewBox="0 0 24 24">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSaveCamera}>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: '5px' }}>
                      Camera Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Swargate Chowk South"
                      value={camName}
                      onChange={(e) => setCamName(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '13px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: '5px' }}>
                      Camera ID (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. CAM-SWG-01"
                      value={camId}
                      onChange={(e) => setCamId(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: '5px' }}>
                      Source Type *
                    </label>
                    <select
                      value={camSourceType}
                      onChange={(e) => setCamSourceType(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '13px' }}
                    >
                      <option value="webcam">Local Webcam</option>
                      <option value="rtsp">RTSP IP Camera Stream</option>
                      <option value="video_file">Uploaded Video File</option>
                      <option value="local_stream">Local Stream / URL</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: camSourceType !== 'webcam' ? '1.5fr 1fr 1fr' : '2fr 1fr', gap: '10px' }}>
                  {camSourceType !== 'webcam' && (
                    <div>
                      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: '5px' }}>
                        Source URL / Path *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder={camSourceType === 'rtsp' ? 'rtsp://192.168.1.100:554/stream' : '/videos/filename.mp4'}
                        value={camSourceUrl}
                        onChange={(e) => setCamSourceUrl(e.target.value)}
                        style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                      />
                      {camSourceType === 'video_file' && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px', alignItems: 'center' }}>
                          <span style={{ fontSize: '10px', color: 'var(--meta)' }}>Polli Footages:</span>
                          {[
                            { name: 'PVG College', url: '/videos/pvg_college.mp4' },
                            { name: 'Shiv Darshan', url: '/videos/shiv_darshan_chowk.mp4' },
                            { name: 'Gajanan Maharaj', url: '/videos/gajanan_maharaj_temple.mp4' },
                            { name: 'Aranyeshwar', url: '/videos/aranyeshwar_circle.mp4' },
                            { name: 'Taware Colony', url: '/videos/taware_colony.mp4' }
                          ].map(f => (
                            <button
                              key={f.url}
                              type="button"
                              onClick={() => {
                                setCamSourceUrl(f.url);
                                if (!camName) setCamName(f.name);
                              }}
                              style={{
                                fontSize: '10px',
                                padding: '1px 6px',
                                background: camSourceUrl === f.url ? '#14315C' : '#EEF2F6',
                                color: camSourceUrl === f.url ? '#fff' : '#14315C',
                                border: '1px solid var(--border)',
                                borderRadius: '3px',
                                cursor: 'pointer'
                              }}
                            >
                              {f.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: '5px' }}>
                      Location Description
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Swargate Flyover Exit"
                      value={camLocation}
                      onChange={(e) => setCamLocation(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '13px' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: '5px' }}>
                      Resolution / FPS
                    </label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <select
                        value={camResolution}
                        onChange={(e) => setCamResolution(e.target.value)}
                        style={{ width: '60%', padding: '8px 6px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '12px' }}
                      >
                        <option value="1080p">1080p HD</option>
                        <option value="4K">4K Ultra</option>
                        <option value="720p">720p</option>
                      </select>
                      <input
                        type="number"
                        placeholder="FPS"
                        value={camFps}
                        onChange={(e) => setCamFps(e.target.value)}
                        style={{ width: '40%', padding: '8px 6px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '12px' }}
                      />
                    </div>
                  </div>
                </div>

                {/* INTERACTIVE PUNE LOCATION PICKER MAP */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <div>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                        Camera Location on Pune Map
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--meta)', marginLeft: '8px' }}>
                        Search or click exact road/intersection &bull; Drag marker to fine-tune
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--primary)' }}>
                      Lat: {camLat} | Lng: {camLng}
                    </div>
                  </div>

                  <TrafficMap
                    mode="picker"
                    pickerCoords={{
                      lat: parseFloat(camLat) || 18.5204,
                      lng: parseFloat(camLng) || 73.8567
                    }}
                    onLocationChange={(coords) => {
                      setCamLat(coords.lat.toFixed(6));
                      setCamLng(coords.lng.toFixed(6));
                    }}
                    onConfirmLocation={() => {
                      showToast(`Location set to Lat: ${camLat}, Lng: ${camLng}`, 'success');
                    }}
                    height="320px"
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
                  <button
                    type="button"
                    className="btn btn-neutral"
                    onClick={() => setAddCameraModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={isSavingCam}>
                    {isSavingCam ? 'Saving Camera...' : 'Save Camera'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT CAMERA LOCATION MODAL */}
      {editLocationModalOpen && cameraToEdit && (
        <EditCameraLocationModal
          key={cameraToEdit.id}
          camera={cameraToEdit}
          onClose={() => {
            setEditLocationModalOpen(false);
            setCameraToEdit(null);
          }}
          onSave={handleUpdateCameraLocation}
          isSaving={isUpdatingCam}
        />
      )}

      {/* ADD BLACKLIST ENTRY MODAL */}
      {addBlacklistModalOpen && (
        <div className="modal-overlay" onClick={() => setAddBlacklistModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="card-head">
              <h3>Register Flagged / Blacklisted Vehicle</h3>
              <button
                className="icon-btn"
                style={{ color: 'var(--slate)' }}
                onClick={() => setAddBlacklistModalOpen(false)}
              >
                <svg className="icon" width="16" height="16" viewBox="0 0 24 24">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleSaveBlacklist}>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: '5px' }}>
                    License Plate Number *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. MH 12 AB 1234"
                    value={plate}
                    onChange={(e) => setPlate(e.target.value)}
                    style={{ width: '100%', padding: '9px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: '5px' }}>
                      Category *
                    </label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      style={{ width: '100%', padding: '9px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '13px' }}
                    >
                      <option value="wanted">Wanted</option>
                      <option value="stolen">Stolen Vehicle</option>
                      <option value="suspicious">Suspicious</option>
                      <option value="watchlist">Watchlist</option>
                      <option value="other">Other Violation</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: '5px' }}>
                      Alert Priority *
                    </label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      style={{ width: '100%', padding: '9px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '13px' }}
                    >
                      <option value="Critical">Critical</option>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: '5px' }}>
                    Reason for Flag *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Wanted — FIR Ref 2291/24 or Stolen Vehicle"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    style={{ width: '100%', padding: '9px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: '5px' }}>
                    FIR / Case Reference (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. FIR-2291/2026"
                    value={firRef}
                    onChange={(e) => setFirRef(e.target.value)}
                    style={{ width: '100%', padding: '9px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: '5px' }}>
                    Officer / Department *
                  </label>
                  <input
                    type="text"
                    required
                    value={addedBy}
                    onChange={(e) => setAddedBy(e.target.value)}
                    style={{ width: '100%', padding: '9px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '13px' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '6px' }}>
                  <button
                    type="button"
                    className="btn btn-neutral"
                    onClick={() => setAddBlacklistModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? 'Registering...' : 'Register Vehicle'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DISPATCH UNIT MODAL */}
      {dispatchModalData && (
        <div className="modal-overlay" onClick={() => setDispatchModalData(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="card-head" style={{ borderBottomColor: 'var(--red-bg)', background: 'var(--red-bg)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--red)', fontWeight: 600 }}>
                <svg className="icon" width="18" height="18" viewBox="0 0 24 24">
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                  <path d="M10.3 3.9L2.7 18a1.8 1.8 0 0 0 1.6 2.6h15.4a1.8 1.8 0 0 0 1.6-2.6L13.7 3.9a1.8 1.8 0 0 0-3.4 0z" />
                </svg>
                <span>Dispatch Interception Unit</span>
              </div>
              <button
                className="icon-btn"
                style={{ color: 'var(--red)' }}
                onClick={() => setDispatchModalData(null)}
              >
                <svg className="icon" width="16" height="16" viewBox="0 0 24 24">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ background: '#F8F9FB', padding: '12px', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--meta)' }}>Target Plate:</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '14px', color: 'var(--primary)' }}>
                    {dispatchModalData.plate_number || dispatchModalData.plate}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--meta)' }}>Last Sighted Node:</span>
                  <span style={{ fontSize: '12px', fontWeight: 500 }}>{dispatchModalData.camera_id || dispatchModalData.camera} ({dispatchModalData.location})</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', color: 'var(--meta)' }}>Reason:</span>
                  <span className="badge badge-red">{dispatchModalData.alert_type || dispatchModalData.type || 'High Priority Alert'}</span>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: '5px' }}>
                  Assign Patrol Intercept Unit
                </label>
                <select
                  value={patrolUnit}
                  onChange={(e) => setPatrolUnit(e.target.value)}
                  style={{ width: '100%', padding: '9px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '13px' }}
                >
                  <option value="PCR-18 (Hinjewadi Sector 7)">PCR-18 (Hinjewadi Sector 7)</option>
                  <option value="PCR-04 (Control Van Wakad)">PCR-04 (Control Van Wakad)</option>
                  <option value="Hawk Squad 09 (Baner Corridor)">Hawk Squad 09 (Baner Corridor)</option>
                  <option value="Station Mobile Unit - Hinjewadi">Station Mobile Unit - Hinjewadi</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: '5px' }}>
                  Tactical Order Directive
                </label>
                <select
                  value={tacticalDirective}
                  onChange={(e) => setTacticalDirective(e.target.value)}
                  style={{ width: '100%', padding: '9px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: '13px' }}
                >
                  <option value="Intercept & Detain Vehicle Safely">Intercept & Detain Vehicle Safely</option>
                  <option value="Trail Discreetly / Monitor Route">Trail Discreetly / Monitor Route</option>
                  <option value="Deploy Spike Strip / Barricade Checkpoint">Deploy Spike Strip / Barricade Checkpoint</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '6px' }}>
                <button className="btn btn-neutral" onClick={() => setDispatchModalData(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ background: 'var(--red)' }}
                  onClick={handleConfirmDispatch}
                >
                  Confirm Tactical Dispatch
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
