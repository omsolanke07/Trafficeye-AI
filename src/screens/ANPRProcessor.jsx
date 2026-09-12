import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useApp } from '../context/AppContext';

// ── constants ─────────────────────────────────────────────────────────────
const API_BASE      = 'http://localhost:5000';
const IMAGE_EXTS    = ['jpg', 'jpeg', 'png', 'webp'];
const VIDEO_EXTS    = ['mp4', 'avi', 'mov', 'mkv', 'webm'];
const MAX_IMG_MB    = 50;
const MAX_VID_MB    = 500;
const BBOX_COLORS   = ['#00C853', '#00B0FF', '#FF6D00', '#D500F9', '#FF1744'];

function fmtBytes(b) {
  if (b < 1024)        return `${b} B`;
  if (b < 1048576)     return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function fmtSec(s) {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(1);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function confColor(conf) {
  return conf >= 0.9 ? '' : conf >= 0.75 ? 'low' : 'low';
}

// ── drop-zone helper component ────────────────────────────────────────────
function DropZone({ accept, onFile, label, hint }) {
  const [drag, setDrag] = useState(false);
  const ref = useRef();

  const handleFiles = (files) => {
    if (files && files[0]) onFile(files[0]);
  };

  return (
    <div
      className={`anpr-drop-zone${drag ? ' drag-over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
      onClick={() => ref.current?.click()}
    >
      <input
        ref={ref}
        type="file"
        accept={accept}
        onChange={(e) => handleFiles(e.target.files)}
        onClick={(e) => e.stopPropagation()}
        id="anpr-file-input"
      />
      <div className="anpr-drop-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      </div>
      <h3>{label}</h3>
      <p>{hint}</p>
    </div>
  );
}

// ── bbox canvas overlay ───────────────────────────────────────────────────
function PlateCanvas({ src, plates, naturalWidth, naturalHeight }) {
  const canvasRef = useRef();

  useEffect(() => {
    if (!src || !canvasRef.current) return;
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const maxW  = canvas.parentElement?.clientWidth || 800;
      const scale = Math.min(1, maxW / img.naturalWidth);
      canvas.width  = img.naturalWidth  * scale;
      canvas.height = img.naturalHeight * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const sw = canvas.width  / (naturalWidth  || img.naturalWidth);
      const sh = canvas.height / (naturalHeight || img.naturalHeight);

      (plates || []).forEach((ev, i) => {
        // 1. Draw vehicle bounding box
        const vBbox = ev.vehicleBbox;
        if (vBbox && Array.isArray(vBbox) && vBbox.length === 4) {
          const vx1 = vBbox[0] * sw, vy1 = vBbox[1] * sh, vx2 = vBbox[2] * sw, vy2 = vBbox[3] * sh;
          const vw = vx2 - vx1, vh = vy2 - vy1;
          ctx.strokeStyle = '#00E5FF';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 2]);
          ctx.strokeRect(vx1, vy1, vw, vh);
          ctx.setLineDash([]);

          const vClass = ev.vehicleClass || ev.vehicle_class || 'Vehicle';
          const vConfVal = ev.vehicleConfidence || ev.detectionConfidence || 0;
          const vConfPct = ((vConfVal > 1 ? vConfVal : vConfVal * 100)).toFixed(0);
          const vLabel = `${vClass} ${vConfPct}%`;
          ctx.font = 'bold 11px Inter, sans-serif';
          const vTextW = ctx.measureText(vLabel).width + 8;
          ctx.fillStyle = 'rgba(0, 229, 255, 0.85)';
          ctx.fillRect(vx1, Math.max(0, vy1 - 18), vTextW, 18);
          ctx.fillStyle = '#000';
          ctx.fillText(vLabel, vx1 + 4, Math.max(12, vy1 - 4));
        }

        // 2. Draw plate bounding box
        const pBbox = ev.bbox;
        if (pBbox && Array.isArray(pBbox) && pBbox.length === 4 && (!vBbox || pBbox[0] !== vBbox[0] || pBbox[1] !== vBbox[1])) {
          const px1 = pBbox[0] * sw, py1 = pBbox[1] * sh, px2 = pBbox[2] * sw, py2 = pBbox[3] * sh;
          const pw = px2 - px1, ph = py2 - py1;
          const color = ev.validationStatus === 'valid' ? '#00C853' : '#FF9100';
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.strokeRect(px1, py1, pw, ph);

          if (ev.plateText || ev.plateNumber) {
            const pText = ev.plateText || ev.plateNumber;
            const oconfVal = ev.ocrConfidence || 0;
            const oconfPct = ((oconfVal > 1 ? oconfVal : oconfVal * 100)).toFixed(0);
            const pLabel = `${pText} (${oconfPct}%)`;
            ctx.font = 'bold 11px IBM Plex Mono, monospace';
            const pTextW = ctx.measureText(pLabel).width + 8;
            ctx.fillStyle = color;
            ctx.fillRect(px1, Math.max(0, py1 - 18), pTextW, 18);
            ctx.fillStyle = '#000';
            ctx.fillText(pLabel, px1 + 4, Math.max(12, py1 - 4));
          }
        }
      });
    };
    img.src = src;
  }, [src, plates, naturalWidth, naturalHeight]);

  return (
    <div className="anpr-result-image-wrap">
      <canvas ref={canvasRef} className="anpr-result-canvas" />
    </div>
  );
}

// ── image tab ─────────────────────────────────────────────────────────────
function ImageTab({ token, anprReady, onProcessed }) {
  const [file, setFile]           = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult]       = useState(null);
  const [error, setError]         = useState(null);

  const onFile = useCallback((f) => {
    const ext = f.name.split('.').pop().toLowerCase();
    if (!IMAGE_EXTS.includes(ext)) {
      setError(`Unsupported file type: .${ext}. Supported: ${IMAGE_EXTS.join(', ')}`);
      return;
    }
    if (f.size > MAX_IMG_MB * 1048576) {
      setError(`File too large (max ${MAX_IMG_MB} MB)`);
      return;
    }
    setFile(f);
    setResult(null);
    setError(null);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
  }, []);

  const onRemove = () => {
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setResult(null);
    setError(null);
  };

  const onProcess = async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    setResult(null);

    try {
      // Step 1 — upload
      const fd = new FormData();
      fd.append('file', file);
      const upRes = await fetch(`${API_BASE}/api/ai/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const upData = await upRes.json();
      if (!upData.success) throw new Error(upData.error?.message || upData.error || 'Upload failed');

      // Step 2 — create job
      const jobRes = await fetch(`${API_BASE}/api/ai/jobs`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId: upData.uploadId,
          filename: upData.filename,
          filePath: upData.filePath,
          type:     'image',
        }),
      });
      const jobData = await jobRes.json();
      if (!jobData.success) throw new Error(jobData.error?.message || jobData.error || 'Job failed');

      const jobId = jobData.jobId;

      // Step 3 — poll for results (image jobs complete quickly)
      let attempts = 0;
      while (attempts < 60) {
        await new Promise(r => setTimeout(r, 1000));
        attempts++;
        const rRes  = await fetch(`${API_BASE}/api/ai/jobs/${jobId}/results`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const rData = await rRes.json();
        if (rData.success) {
          setResult({ ...rData, jobId });
          onProcessed?.();
          break;
        }
        if (rData.status === 'failed') throw new Error(rData.error || 'Processing failed');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div>
      {!file ? (
        <DropZone
          accept=".jpg,.jpeg,.png,.webp"
          onFile={onFile}
          label="Drop an image here, or click to browse"
          hint={`Supported: JPG, PNG, WEBP — max ${MAX_IMG_MB} MB`}
        />
      ) : (
        <div className="anpr-file-card">
          <div className="anpr-file-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </div>
          <div className="anpr-file-meta">
            <strong>{file.name}</strong>
            <span>{fmtBytes(file.size)}</span>
          </div>
          <button className="anpr-file-remove" onClick={onRemove} disabled={processing}>Remove</button>
        </div>
      )}

      {file && (
        <button
          className="anpr-process-btn"
          onClick={onProcess}
          disabled={processing || !anprReady}
          id="anpr-image-process-btn"
        >
          {processing ? <><span className="anpr-spinner"/>&nbsp;Processing…</> : '▶  Process Image'}
        </button>
      )}

      {!anprReady && file && (
        <p style={{ marginTop: 8, fontSize: 11, color: 'var(--amber)' }}>
          ⚠ ANPR pipeline is starting up. Please wait a moment…
        </p>
      )}

      {error && (
        <div style={{ marginTop: 12, background: 'var(--red-bg)', color: 'var(--red)', padding: '10px 14px', borderRadius: 6, fontSize: 12 }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 20 }}>
          <div className="anpr-section-title">Detection Result</div>

          {/* Canvas with bbox overlays */}
          {previewUrl && (
            <PlateCanvas
              src={previewUrl}
              plates={result.events || []}
              naturalWidth={result.job?.imageWidth}
              naturalHeight={result.job?.imageHeight}
            />
          )}

          {/* Plate cards */}
          <div className="anpr-section-title" style={{ marginTop: 16 }}>
            Detected Vehicles & Plates ({result.events?.length ?? 0})
          </div>
          {result.events?.length > 0 ? (
            <div className="anpr-plate-cards">
              {result.events.map((ev, i) => {
                const valid = ev.validationStatus === 'valid';
                const oconf = ev.ocrConfidence ?? 0;
                const dconf = ev.detectionConfidence ?? 0;
                const vconf = ev.vehicleConfidence ?? dconf ?? 0;
                const oconfPct = (oconf > 1 ? oconf : oconf * 100).toFixed(1);
                const vconfPct = (vconf > 1 ? vconf : vconf * 100).toFixed(1);
                const vClass = ev.vehicleClass || ev.vehicle_class || 'Vehicle';
                return (
                  <div key={ev.id || i} className={`anpr-plate-card ${valid ? 'valid' : 'invalid'}`}>
                    {ev.snapshotPath && (
                      <img src={`${API_BASE}${ev.snapshotPath}`} alt="Vehicle" className="anpr-card-thumb" />
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span className="anpr-veh-pill">{vClass}</span>
                      <span style={{ fontSize: 10, color: 'var(--meta)' }}>Conf {vconfPct}%</span>
                    </div>
                    <div className="anpr-plate-number">{ev.plateText || '—'}</div>
                    <div className="anpr-plate-meta">
                      {ev.plateText && <span className={`anpr-conf-pill ${confColor(oconf)}`}>OCR {oconfPct}%</span>}
                      <span className={`anpr-valid-pill ${valid ? '' : 'invalid'}`}>{ev.validationStatus}</span>
                      {ev.trackId && <span className="anpr-conf-pill det">Track #{ev.trackId}</span>}
                    </div>
                    {ev.rawOcrText && ev.rawOcrText !== ev.plateText && (
                      <div style={{ fontSize: 10, color: 'var(--meta)', marginTop: 6 }}>
                        Raw: <code>{ev.rawOcrText}</code>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="anpr-no-plates">No vehicles or license plates detected in this image.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── video tab ─────────────────────────────────────────────────────────────
function VideoTab({ token, anprReady, anprJobState, onProcessed }) {
  const [file, setFile]             = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [jobId, setJobId]           = useState(null);
  const [progress, setProgress]     = useState({ pct: 0, processed: 0, total: 0, fps: 0, elapsedTime: 0, detectionsCount: 0, tracksCount: 0, platesCount: 0 });
  const [results, setResults]       = useState(null);
  const [error, setError]           = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);
  const jobIdRef = useRef(null);

  // Watch WS job state updates
  useEffect(() => {
    if (!jobIdRef.current) return;
    const wsJob = anprJobState?.[jobIdRef.current];
    if (!wsJob) return;

    if (wsJob.type === 'JOB_PROGRESS') {
      setProgress({
        pct:             wsJob.progressPercent ?? wsJob.progress ?? 0,
        processed:       wsJob.processedFrames ?? 0,
        total:           wsJob.totalFrames ?? 0,
        fps:             wsJob.fps ?? 0,
        elapsedTime:     wsJob.elapsedTime ?? 0,
        detectionsCount: wsJob.detectionsCount ?? 0,
        tracksCount:     wsJob.tracksCount ?? 0,
        platesCount:     wsJob.platesCount ?? 0,
      });
    } else if (wsJob.type === 'JOB_COMPLETED') {
      fetchResults(jobIdRef.current);
    } else if (wsJob.type === 'JOB_FAILED') {
      setError(wsJob.error || 'Processing failed');
      setProcessing(false);
    } else if (wsJob.type === 'JOB_CANCELLED') {
      setError('Job was cancelled');
      setProcessing(false);
    }
  }, [anprJobState]);

  const fetchResults = async (jid) => {
    try {
      let attempts = 0;
      while (attempts < 30) {
        const res  = await fetch(`${API_BASE}/api/ai/jobs/${jid}/results`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) {
          setResults(data);
          setProcessing(false);
          setProgress(p => ({ ...p, pct: 100 }));
          onProcessed?.();
          return;
        }
        if (data.status === 'failed') {
          setError(data.error || 'Processing failed');
          setProcessing(false);
          return;
        }
        await new Promise(r => setTimeout(r, 2000));
        attempts++;
      }
    } catch (e) {
      setError(e.message);
      setProcessing(false);
    }
  };

  const onFile = useCallback((f) => {
    const ext = f.name.split('.').pop().toLowerCase();
    if (!VIDEO_EXTS.includes(ext)) {
      setError(`Unsupported file type: .${ext}. Supported: ${VIDEO_EXTS.join(', ')}`);
      return;
    }
    if (f.size > MAX_VID_MB * 1048576) {
      setError(`File too large (max ${MAX_VID_MB} MB)`);
      return;
    }
    setFile(f);
    setResults(null);
    setError(null);
    setJobId(null);
    setProgress({ pct: 0, processed: 0, total: 0, fps: 0, elapsedTime: 0, detectionsCount: 0, tracksCount: 0, platesCount: 0 });
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
  }, []);

  const onRemove = () => {
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setResults(null);
    setError(null);
    setJobId(null);
    jobIdRef.current = null;
    setProgress({ pct: 0, processed: 0, total: 0, fps: 0, elapsedTime: 0, detectionsCount: 0, tracksCount: 0, platesCount: 0 });
  };

  const [debugVideo, setDebugVideo] = useState(true);

  // Step 2 — create job
  const onProcess = async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    setResults(null);
    setProgress({ pct: 0, processed: 0, total: 0, fps: 0, elapsedTime: 0, detectionsCount: 0, tracksCount: 0, platesCount: 0 });

    try {
      // Step 1 — upload
      const fd = new FormData();
      fd.append('file', file);
      const upRes  = await fetch(`${API_BASE}/api/ai/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const upData = await upRes.json();
      if (!upData.success) throw new Error(upData.error?.message || upData.error || 'Upload failed');

      // Step 2 — create job
      const jobRes  = await fetch(`${API_BASE}/api/ai/jobs`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId:   upData.uploadId,
          filename:   upData.filename,
          filePath:   upData.filePath,
          type:       'video',
          debugVideo: debugVideo,
        }),
      });
      const jobData = await jobRes.json();
      if (!jobData.success) throw new Error(jobData.error?.message || jobData.error || 'Job creation failed');

      const jid = jobData.jobId;
      setJobId(jid);
      jobIdRef.current = jid;

      // Fallback polling
      let poll = setInterval(async () => {
        const statusRes = await fetch(`${API_BASE}/api/ai/jobs/${jid}`, {
          headers: { Authorization: `Bearer ${token}` },
        }).then(r => r.json()).catch(() => null);
        if (!statusRes) return;
        const job = statusRes.data;
        if (!job) return;
        if (job.progress) setProgress(p => ({ ...p, pct: job.progress, processed: job.processedFrames ?? p.processed, total: job.totalFrames ?? p.total }));
        if (job.status === 'completed') {
          clearInterval(poll);
          fetchResults(jid);
        } else if (job.status === 'failed' || job.status === 'cancelled') {
          clearInterval(poll);
          setError(job.error || `Job ${job.status}`);
          setProcessing(false);
        }
      }, 3000);

    } catch (e) {
      setError(e.message);
      setProcessing(false);
    }
  };

  const onCancel = async () => {
    if (!jobId) return;
    await fetch(`${API_BASE}/api/ai/jobs/${jobId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  };

  const stats = results?.job || results?.stats;

  return (
    <div>
      {!file ? (
        <DropZone
          accept=".mp4,.avi,.mov,.mkv,.webm"
          onFile={onFile}
          label="Drop a video here, or click to browse"
          hint={`Supported: MP4, AVI, MOV, MKV, WEBM — max ${MAX_VID_MB} MB`}
        />
      ) : (
        <div className="anpr-file-card">
          <div className="anpr-file-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="6" width="15" height="12" rx="1"/>
              <path d="M17 10l5-3v10l-5-3"/>
            </svg>
          </div>
          <div className="anpr-file-meta">
            <strong>{file.name}</strong>
            <span>{fmtBytes(file.size)}</span>
          </div>
          <button className="anpr-file-remove" onClick={onRemove} disabled={processing}>Remove</button>
        </div>
      )}

      {/* Video preview */}
      {previewUrl && !processing && !results && (
        <video
          src={previewUrl}
          style={{ marginTop: 12, maxWidth: '100%', maxHeight: 200, borderRadius: 6, border: '1px solid var(--border)' }}
          controls
          muted
        />
      )}

      {file && !processing && !results && (
        <div style={{ marginTop: 12, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={debugVideo}
              onChange={(e) => setDebugVideo(e.target.checked)}
              id="anpr-debug-video-toggle"
            />
            <strong>Generate Annotated Production Debug Video</strong>
          </label>
        </div>
      )}

      {file && !processing && !results && (
        <button
          className="anpr-process-btn"
          onClick={onProcess}
          disabled={!anprReady}
          id="anpr-video-process-btn"
        >
          ▶  Process Video
        </button>
      )}

      {/* Progress */}
      {processing && (
        <div className="anpr-progress-wrap">
          <div className="anpr-progress-label">
            <strong>Processing video…</strong>
            <span>{progress.pct}%</span>
          </div>
          <div className="anpr-progress-bar-bg">
            <div className="anpr-progress-bar-fill" style={{ width: `${progress.pct}%` }} />
          </div>
          <div className="anpr-progress-badges">
            <div className="anpr-progress-badge">Frames: <strong>{progress.processed.toLocaleString()} / {progress.total.toLocaleString()}</strong></div>
            {progress.fps > 0 && <div className="anpr-progress-badge">Speed: <strong>{progress.fps} fps</strong></div>}
            {progress.elapsedTime > 0 && <div className="anpr-progress-badge">Elapsed: <strong>{progress.elapsedTime}s</strong></div>}
            {progress.tracksCount > 0 && <div className="anpr-progress-badge">Vehicles: <strong>{progress.tracksCount}</strong></div>}
            {progress.platesCount > 0 && <div className="anpr-progress-badge">Plates: <strong>{progress.platesCount}</strong></div>}
            {jobId && <div className="anpr-progress-badge">Job: <strong style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{jobId.slice(0, 8)}…</strong></div>}
          </div>
          <button
            onClick={onCancel}
            style={{ marginTop: 12, background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 12px', fontSize: 11, color: 'var(--slate)', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      )}

      {!anprReady && file && !processing && (
        <p style={{ marginTop: 8, fontSize: 11, color: 'var(--amber)' }}>⚠ ANPR pipeline starting…</p>
      )}

      {error && (
        <div style={{ marginTop: 12, background: 'var(--red-bg)', color: 'var(--red)', padding: '10px 14px', borderRadius: 6, fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* Results */}
      {results && (
        <div style={{ marginTop: 20 }}>
          {/* Summary stats */}
          {stats && (
            <>
              <div className="anpr-section-title">Processing Summary</div>
              <div className="anpr-summary-row">
                <div className="anpr-summary-card">
                  <div className="label">Vehicles Tracked</div>
                  <div className="value">{results.events?.length ?? 0}</div>
                </div>
                <div className="anpr-summary-card">
                  <div className="label">Plates Detected</div>
                  <div className="value">{results.events?.filter(e => e.plateText)?.length ?? 0}</div>
                </div>
                <div className="anpr-summary-card">
                  <div className="label">Duration</div>
                  <div className="value">{fmtSec(stats.totalFrames && stats.sourceFps ? stats.totalFrames / stats.sourceFps : null)}</div>
                </div>
                <div className="anpr-summary-card">
                  <div className="label">Source FPS</div>
                  <div className="value">{stats.sourceFps ?? '—'}</div>
                </div>
                <div className="anpr-summary-card">
                  <div className="label">Frames Processed</div>
                  <div className="value">{stats.processedFrames?.toLocaleString() ?? '—'}</div>
                </div>
              </div>

              {/* Debug Video Player */}
              {(results.stats?.debugVideoUrl || results.debugVideoUrl) && (
                <div style={{ marginTop: 16, marginBottom: 16, padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <strong style={{ fontSize: 13, color: 'var(--text)' }}>🎥 Annotated Production Video (Tracking & Plates Overlay)</strong>
                    <a
                      href={`${API_BASE}${results.stats?.debugVideoUrl || results.debugVideoUrl}`}
                      download
                      style={{ fontSize: 11, color: 'var(--primary)', textDecoration: 'underline' }}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Download Video ↗
                    </a>
                  </div>
                  <video
                    controls
                    src={`${API_BASE}${results.stats?.debugVideoUrl || results.debugVideoUrl}`}
                    style={{ width: '100%', maxHeight: 380, borderRadius: 6, background: '#000' }}
                  />
                </div>
              )}
            </>
          )}

          {/* Results table */}
          <div className="anpr-section-title">Detected Vehicles ({results.events?.length ?? 0})</div>
          {results.events?.length > 0 ? (
            <div className="anpr-results-table-wrap">
              <table className="anpr-results-table">
                <thead>
                  <tr>
                    <th>Snapshot</th>
                    <th>Track</th>
                    <th>Vehicle Class</th>
                    <th>Veh %</th>
                    <th>Plate</th>
                    <th>OCR %</th>
                    <th>First Seen</th>
                    <th>Last Seen</th>
                    <th>Obs</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.events.map((ev) => {
                    const valid = ev.validationStatus === 'valid';
                    const expanded = expandedRow === ev.id;
                    const obsForEvent = results.observations?.filter(o => o.eventId === ev.id) || ev.observations || [];
                    const vClass = ev.vehicleClass || ev.vehicle_class || 'Others';
                    const vconf = ev.vehicleConfidence ?? ev.detectionConfidence ?? 0;
                    const vconfPct = (vconf > 1 ? vconf : vconf * 100).toFixed(0);
                    const oconf = ev.ocrConfidence ?? ev.plateConfidence ?? 0;
                    const oconfPct = (oconf > 1 ? oconf : oconf * 100).toFixed(0);

                    return (
                      <React.Fragment key={ev.id || ev.trackId}>
                        <tr
                          className="clickable"
                          onClick={() => setExpandedRow(expanded ? null : (ev.id || ev.trackId))}
                        >
                          <td>
                            {ev.snapshotPath ? (
                              <img src={`${API_BASE}${ev.snapshotPath}`} alt="snap" className="anpr-thumb" />
                            ) : (
                              <span style={{ color: 'var(--meta)', fontSize: 10 }}>—</span>
                            )}
                          </td>
                          <td><strong>#{ev.trackId || ev.id}</strong></td>
                          <td><span className="anpr-veh-pill">{vClass}</span></td>
                          <td>{vconf > 0 ? `${vconfPct}%` : '—'}</td>
                          <td><span className="anpr-mono">{ev.plateText || '—'}</span></td>
                          <td>{ev.plateText && oconf > 0 ? `${oconfPct}%` : '—'}</td>
                          <td>{ev.firstSeen != null ? fmtSec(ev.firstSeen) : '—'}</td>
                          <td>{ev.lastSeen  != null ? fmtSec(ev.lastSeen)  : '—'}</td>
                          <td>{ev.observationCount ?? obsForEvent.length}</td>
                          <td>
                            <span className={`anpr-valid-pill ${valid ? '' : 'invalid'}`}>
                              {ev.validationStatus}
                            </span>
                          </td>
                        </tr>
                        {expanded && (
                          <tr>
                            <td colSpan={10} style={{ padding: 0 }}>
                              <div className="anpr-obs-panel">
                                <h4>Frame Observations ({obsForEvent.length}) — Class: {vClass}</h4>
                                {obsForEvent.length > 0 ? (
                                  <div className="anpr-obs-list">
                                    {obsForEvent.map((obs, idx) => (
                                      <div key={obs.id || idx} className="anpr-obs-chip">
                                        Frame <span>{obs.frameNumber ?? obs.frame_number}</span>
                                        &nbsp;@&nbsp;<span>{fmtSec(obs.timestamp)}</span>
                                        &nbsp;·&nbsp;Plate&nbsp;<span>{obs.ocr_text ?? obs.text ?? '—'}</span>
                                        &nbsp;·&nbsp;OCR&nbsp;<span>{(((obs.ocr_confidence ?? obs.ocrConfidence ?? obs.confidence) ?? 0) * (obs.ocr_confidence <= 1 ? 100 : 1)).toFixed(0)}%</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span style={{ fontSize: 11, color: 'var(--meta)' }}>No observation details available.</span>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="anpr-no-plates">No vehicles or license plates detected in this video.</div>
          )}

          <button
            className="anpr-process-btn"
            onClick={onRemove}
            style={{ marginTop: 16, background: 'var(--surface)', color: 'var(--primary)', border: '1px solid var(--primary)' }}
          >
            Process Another Video
          </button>
        </div>
      )}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────
export const ANPRProcessor = () => {
  const { token, anprJobState, loadInitialData } = useApp();
  const [activeTab, setActiveTab] = useState('image');
  const [anprStatus, setAnprStatus] = useState(null);

  // Poll ANPR service status on mount
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res  = await fetch(`${API_BASE}/api/ai/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setAnprStatus(data.anpr);
      } catch {
        setAnprStatus(null);
      }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 10_000);
    return () => clearInterval(interval);
  }, [token]);

  const anprReady = anprStatus?.ready === true;

  return (
    <div className="anpr-screen">
      {/* Header */}
      <div className="anpr-header">
        <div className={`anpr-status-dot ${anprReady ? 'ready' : anprStatus === null ? '' : 'error'}`} />
        <h1>ANPR Processor</h1>
        <span className="anpr-badge">Local AI</span>
        {anprStatus && (
          <span style={{ fontSize: 11, color: 'var(--meta)', marginLeft: 'auto' }}>
            YOLO: <strong>{anprStatus.detectorDevice || '…'}</strong>
            &nbsp;·&nbsp;
            OCR: <strong>{anprStatus.ocrDevice || '…'}</strong>
          </span>
        )}
      </div>

      {/* Tab selector */}
      <div className="anpr-tabs">
        <button
          id="anpr-tab-image"
          className={`anpr-tab${activeTab === 'image' ? ' active' : ''}`}
          onClick={() => setActiveTab('image')}
        >
          📷&nbsp; Image
        </button>
        <button
          id="anpr-tab-video"
          className={`anpr-tab${activeTab === 'video' ? ' active' : ''}`}
          onClick={() => setActiveTab('video')}
        >
          🎬&nbsp; Video
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'image' ? (
        <ImageTab token={token} anprReady={anprReady} onProcessed={loadInitialData} />
      ) : (
        <VideoTab token={token} anprReady={anprReady} anprJobState={anprJobState} onProcessed={loadInitialData} />
      )}
    </div>
  );
};
