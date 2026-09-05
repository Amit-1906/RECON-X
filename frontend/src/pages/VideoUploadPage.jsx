/**
 * Phase 1 — Video Ingestion & Frame Extraction Page
 *
 * Light Geospatial Photogrammetry Workstation Design
 * Preserves 100% of existing functionality, state, API calls, and validation.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload, Video, FileText, CheckCircle2, AlertCircle,
  Play, Cpu, ArrowRight, Film, Clock, Layers, Zap,
  BarChart2, RefreshCw, AlertTriangle, ChevronRight,
  Grid, Info, Navigation, Sliders, ChevronDown
} from 'lucide-react';
import { apiClient } from '../api/client';

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_META = {
  UPLOADED:   { color: '#0284c7', bg: 'rgba(2, 132, 199, 0.08)',  label: 'Uploaded',   icon: CheckCircle2 },
  VALIDATING: { color: '#d97706', bg: 'rgba(217, 119, 6, 0.08)',  label: 'Validating', icon: RefreshCw },
  EXTRACTING: { color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.08)', label: 'Extracting', icon: Layers },
  COMPLETED:  { color: '#059669', bg: 'rgba(5, 150, 105, 0.08)',  label: 'Completed',  icon: CheckCircle2 },
  FAILED:     { color: '#e11d48', bg: 'rgba(225, 29, 72, 0.08)',   label: 'Failed',     icon: AlertTriangle },
};

function StatusBadge({ status }) {
  if (!status) return null;
  const meta = STATUS_META[status] || { color: '#64748b', bg: 'rgba(100, 116, 139, 0.08)', label: status, icon: Info };
  const Icon = meta.icon;
  const isSpinning = status === 'VALIDATING' || status === 'EXTRACTING';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '5px 12px', borderRadius: '999px',
      background: meta.bg, border: `1px solid ${meta.color}33`,
      color: meta.color, fontSize: '0.78rem', fontWeight: 700,
      letterSpacing: '0.04em',
    }}>
      <Icon size={13} style={{ animation: isSpinning ? 'spin 1.2s linear infinite' : 'none' }} />
      {meta.label}
    </span>
  );
}

function fmt(n, unit) {
  if (n == null) return '—';
  return `${typeof n === 'number' ? n.toLocaleString() : n}${unit ? ' ' + unit : ''}`;
}

function fmtBytes(b) {
  if (b == null || b === 0) return '—';
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(2)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024).toFixed(0)} KB`;
}

function fmtDuration(sec) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── Stat card helper ──────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, color = '#0284c7' }) {
  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid rgba(14, 165, 233, 0.16)',
      borderRadius: '12px',
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: '9px',
        background: `${color}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={18} color={color} />
      </div>
      <div>
        <div style={{ fontSize: '0.72rem', color: '#64748b', marginBottom: '2px', fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>{value}</div>
      </div>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ value, max, color = '#7c3aed' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.8rem' }}>
        <span style={{ color: '#64748b', fontWeight: 600 }}>Frames extracted</span>
        <span style={{ color, fontWeight: 700 }}>{value.toLocaleString()} / {max > 0 ? max.toLocaleString() : '?'} ({pct}%)</span>
      </div>
      <div style={{ height: '8px', background: 'rgba(226, 232, 240, 0.8)', borderRadius: '999px', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: `linear-gradient(90deg, ${color}, #0284c7)`,
          borderRadius: '999px',
          transition: 'width 0.4s ease',
          boxShadow: `0 0 10px ${color}44`,
        }} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Main Page Component
// ══════════════════════════════════════════════════════════════════════════════

const POLL_INTERVAL_MS = 1500;

export default function VideoUploadPage({
  activeMissionId,
  setActiveMissionId,
  setActivePage,
  setActiveJobId,
}) {
  const [missions, setMissions] = useState([]);
  const [selectedMission, setSelectedMission] = useState(null);

  // Upload state
  const [dragOver, setDragOver] = useState(false);
  const [localVideoUrl, setLocalVideoUrl] = useState(null);  // object URL for <video> preview
  const [uploadProgress, setUploadProgress] = useState(0);   // 0–100
  const [uploadPhase, setUploadPhase] = useState('idle');    // idle | uploading | probing | done | error

  // Extraction config
  const [intervalSec, setIntervalSec] = useState(0.5);
  const [maxDimension, setMaxDimension] = useState(1920);
  const [jpegQuality, setJpegQuality] = useState(90);
  const [extracting, setExtracting] = useState(false);

  // Live status (polled from backend)
  const [ingestionStatus, setIngestionStatus] = useState(null);
  const [error, setError] = useState(null);

  const videoInputRef = useRef(null);
  const pollRef = useRef(null);
  const localUrlRef = useRef(null);

  // ── Mission loading ─────────────────────────────────────────────────────────

  useEffect(() => {
    apiClient.listMissions()
      .then((list) => {
        setMissions(list);
        if (activeMissionId) {
          const found = list.find((m) => m.id === activeMissionId);
          const m = found || list[0];
          setSelectedMission(m);
          if (m?.ingestion_status) setIngestionStatus(m.ingestion_status);
        } else if (list.length > 0) {
          setSelectedMission(list[0]);
          setActiveMissionId(list[0].id);
          if (list[0].ingestion_status) setIngestionStatus(list[0].ingestion_status);
        }
      })
      .catch((err) => setError(err.message || 'Failed to fetch missions'));
  }, [activeMissionId]);

  // ── Polling ─────────────────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback((missionId) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const status = await apiClient.getMissionStatus(missionId);
        setSelectedMission((prev) => ({ ...prev, ...status }));
        setIngestionStatus(status.ingestion_status);
        if (status.ingestion_status === 'COMPLETED' || status.ingestion_status === 'FAILED') {
          stopPolling();
          setExtracting(false);
          if (status.ingestion_status === 'FAILED') {
            setError(status.extraction_error || 'Frame extraction failed.');
          }
        }
      } catch (err) {
        // Non-fatal — keep polling
      }
    }, POLL_INTERVAL_MS);
  }, [stopPolling]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  // ── Mission selection ───────────────────────────────────────────────────────

  const handleMissionChange = (e) => {
    const m = missions.find((x) => x.id === e.target.value);
    setSelectedMission(m);
    setActiveMissionId(m?.id);
    setIngestionStatus(m?.ingestion_status || null);
    setUploadPhase('idle');
    setError(null);
    stopPolling();
  };

  // ── Local video preview cleanup ─────────────────────────────────────────────

  const setLocalVideo = (file) => {
    if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
    const url = URL.createObjectURL(file);
    localUrlRef.current = url;
    setLocalVideoUrl(url);
  };

  // ── Video upload ────────────────────────────────────────────────────────────

  const handleVideoFile = async (file) => {
    if (!file || !selectedMission) return;
    setError(null);
    setLocalVideo(file);
    setUploadPhase('uploading');
    setUploadProgress(0);
    setIngestionStatus(null);

    try {
      const updated = await apiClient.uploadMissionVideo(
        selectedMission.id,
        file,
        (pct) => setUploadProgress(pct)
      );
      setSelectedMission(updated);
      setIngestionStatus(updated.ingestion_status);
      setUploadPhase('done');
    } catch (err) {
      setError(err.message);
      setUploadPhase('error');
    }
  };

  const handleDropzoneClick = () => videoInputRef.current?.click();

  const handleFileInput = (e) => {
    const file = e.target.files?.[0];
    if (file) handleVideoFile(file);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleVideoFile(file);
  };

  // ── Frame extraction ────────────────────────────────────────────────────────

  const handleExtract = async () => {
    if (!selectedMission?.id) return;
    setError(null);
    setExtracting(true);
    setIngestionStatus('EXTRACTING');

    try {
      await apiClient.extractFrames(selectedMission.id, {
        intervalSec,
        maxDimension,
        jpegQuality,
      });
      startPolling(selectedMission.id);
    } catch (err) {
      setError(err.message);
      setExtracting(false);
      setIngestionStatus('FAILED');
    }
  };

  // ── Derived values ──────────────────────────────────────────────────────────

  const hasVideo = !!(selectedMission?.video_path || selectedMission?.video_filename);
  const hasProbeData = !!(selectedMission?.video_fps);
  const estimatedFrames = selectedMission?.video_duration_seconds
    ? Math.max(1, Math.ceil(selectedMission.video_duration_seconds / intervalSec))
    : null;
  const isTerminal = ingestionStatus === 'COMPLETED' || ingestionStatus === 'FAILED';
  const isExtracting = ingestionStatus === 'EXTRACTING';

  return (
    <div className="geospatial-canvas" style={{ minHeight: '100vh', position: 'relative', overflowX: 'hidden' }}>
      {/* Topographic Contour Line Overlay Background */}
      <div className="topographic-overlay" />

      <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '32px 24px 64px 24px', position: 'relative', zIndex: 2 }}>
        
        {/* ── HERO SECTION ───────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '24px',
          marginBottom: '32px',
          paddingBottom: '24px',
          borderBottom: '1px solid rgba(14, 165, 233, 0.16)'
        }}>
          {/* Left Title & Subtitle */}
          <div style={{ maxWidth: '640px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span className="telemetry-chip">
                PHASE 1 OF 7
              </span>
              <span className="telemetry-chip" style={{ color: '#0d9488', borderColor: 'rgba(13, 148, 136, 0.25)', background: 'rgba(13, 148, 136, 0.08)' }}>
                UAV INGESTION ENGINE
              </span>
            </div>

            <h1 style={{
              fontSize: '2.35rem',
              fontWeight: 800,
              color: '#0f172a',
              letterSpacing: '-0.025em',
              lineHeight: 1.18,
              margin: 0
            }}>
              Video Ingestion &amp; <span style={{ color: '#0284c7' }}>Frame Extraction</span>
            </h1>

            <p style={{ fontSize: '0.94rem', color: '#64748b', marginTop: '8px', lineHeight: 1.5, margin: '8px 0 0 0' }}>
              Phase 1 — Upload your drone footage, inspect video metadata, and extract keyframes at a configurable interval.
            </p>
          </div>

          {/* Right Header: Decorative Surveying UAV + Digital Terrain Mesh */}
          <div style={{
            position: 'relative',
            width: '340px',
            height: '130px',
            borderRadius: '16px',
            overflow: 'hidden',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.7) 0%, rgba(224,242,254,0.5) 100%)',
            border: '1px solid rgba(14, 165, 233, 0.2)',
            boxShadow: '0 4px 18px rgba(2, 132, 199, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <img 
              src="/uav_survey_hero.jpg" 
              alt="UAV Photogrammetry Surveying" 
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity: 0.94,
                mixBlendMode: 'multiply'
              }}
            />
            {/* GPS Location & Telemetry Badge */}
            <div style={{
              position: 'absolute',
              bottom: '8px',
              left: '10px',
              background: 'rgba(255, 255, 255, 0.92)',
              backdropFilter: 'blur(8px)',
              padding: '3px 9px',
              borderRadius: '6px',
              border: '1px solid rgba(14, 165, 233, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
              <span style={{ fontSize: '0.68rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#0369a1' }}>
                GPS FIX · 4K TELEMETRY READY
              </span>
            </div>
          </div>
        </div>

        {/* ── ERROR MESSAGE ALERT ────────────────────────────────────────────── */}
        {error && (
          <div style={{
            background: '#fff5f5',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            borderRadius: '12px',
            padding: '14px 18px',
            color: '#b91c1c',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 2px 8px rgba(244, 63, 94, 0.05)'
          }}>
            <AlertTriangle size={18} color="#e11d48" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>{error}</span>
          </div>
        )}

        {/* ── ONE MAIN CARD: SELECT MISSION & UPLOAD FLIGHT VIDEO ──────────── */}
        <div className="geo-card" style={{ padding: '32px 36px', marginBottom: '28px' }}>
          
          {/* Card Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '24px' }}>
            <div className="uav-section-num">01</div>
            <div>
              <h2 style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: '#0f172a',
                letterSpacing: '-0.01em',
                margin: 0
              }}>
                Select Mission &amp; Upload Flight Video
              </h2>
              <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '3px', margin: '3px 0 0 0' }}>
                Choose the target survey mission and ingest the raw aerial footage for frame extraction.
              </p>
            </div>
          </div>

          {/* Mission Dropdown */}
          <div style={{ marginBottom: '24px', maxWidth: '520px' }}>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
              Target Mission
            </label>
            <div className="uav-field-wrapper">
              <select
                value={selectedMission?.id || ''}
                onChange={handleMissionChange}
                className="uav-input"
                style={{
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  paddingRight: '40px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                {missions.length === 0 && <option value="">No missions — create one first</option>}
                {missions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} · {m.drone_model} · {m.flight_altitude_m}m
                  </option>
                ))}
              </select>
              <ChevronDown size={18} color="#0284c7" style={{ position: 'absolute', right: '14px', pointerEvents: 'none' }} />
            </div>
          </div>

          {/* Hidden file input */}
          <input
            ref={videoInputRef}
            type="file"
            accept=".mp4,.mov,.avi,.mkv,.webm,.ts,.mts"
            style={{ display: 'none' }}
            onChange={handleFileInput}
          />

          {/* ── DRAG & DROP UPLOAD AREA ── */}
          <div
            onClick={handleDropzoneClick}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            style={{
              border: dragOver
                ? '2.5px dashed #0284c7'
                : hasVideo
                  ? '2px solid rgba(16, 185, 129, 0.45)'
                  : '2px dashed rgba(2, 132, 199, 0.35)',
              borderRadius: '16px',
              padding: '48px 32px',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragOver
                ? 'rgba(2, 132, 199, 0.08)'
                : hasVideo
                  ? 'rgba(16, 185, 129, 0.03)'
                  : 'linear-gradient(180deg, rgba(240, 249, 255, 0.7) 0%, rgba(224, 242, 254, 0.35) 100%)',
              boxShadow: dragOver
                ? '0 0 28px rgba(2, 132, 199, 0.18)'
                : '0 2px 8px rgba(15, 23, 42, 0.03)',
              transition: 'all 0.22s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {uploadPhase === 'uploading' ? (
              <div>
                <RefreshCw size={44} color="#0284c7" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 14px auto' }} />
                <p style={{ color: '#0f172a', fontWeight: 700, fontSize: '1.08rem', marginBottom: '8px' }}>
                  Uploading &amp; probing video…
                </p>
                {/* Upload progress bar */}
                <div style={{ width: '100%', maxWidth: '380px', margin: '0 auto' }}>
                  <div style={{ height: '8px', background: 'rgba(226, 232, 240, 0.8)', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${uploadProgress}%`,
                      background: 'linear-gradient(90deg, #0284c7, #0d9488)',
                      borderRadius: '999px',
                      transition: 'width 0.2s',
                    }} />
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '8px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {uploadProgress}% transferred
                  </div>
                </div>
              </div>
            ) : hasVideo ? (
              <div>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 14px auto'
                }}>
                  <CheckCircle2 size={32} color="#059669" />
                </div>
                <p style={{ color: '#065f46', fontWeight: 700, fontSize: '1.1rem', marginBottom: '6px' }}>
                  {selectedMission?.video_filename || 'Video attached'}
                </p>
                <p style={{ color: '#0284c7', fontSize: '0.84rem', fontWeight: 600 }}>
                  Click to replace with a different video file
                </p>
              </div>
            ) : (
              <div>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'rgba(2, 132, 199, 0.1)',
                  border: '1px solid rgba(2, 132, 199, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px auto',
                  boxShadow: '0 4px 14px rgba(2, 132, 199, 0.15)'
                }}>
                  <Upload size={30} color="#0284c7" />
                </div>
                <p style={{ color: '#0f172a', fontWeight: 700, fontSize: '1.15rem', marginBottom: '6px' }}>
                  Drag &amp; drop your drone flight video here
                </p>
                <p style={{ color: '#64748b', fontSize: '0.84rem', fontWeight: 500 }}>
                  MP4, MOV, AVI, MKV, WEBM, TS, MTS • up to 4K resolution
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── PANEL 2: VIDEO INFO (SHOWN AFTER PROBE) ───────────────────────── */}
        {hasProbeData && (
          <div className="geo-card" style={{ padding: '28px 32px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Film size={20} color="#0284c7" />
                <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                  Video Telemetry &amp; Codec Profile
                </h2>
              </div>
              <StatusBadge status={ingestionStatus} />
            </div>

            {/* Local video preview */}
            {localVideoUrl && (
              <div style={{ marginBottom: '20px', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(14, 165, 233, 0.2)', boxShadow: '0 4px 14px rgba(15, 23, 42, 0.04)' }}>
                <video
                  src={localVideoUrl}
                  controls
                  style={{ width: '100%', maxHeight: '340px', display: 'block', background: '#0f172a' }}
                />
              </div>
            )}

            {/* Probe stats grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '14px' }}>
              <StatCard icon={Zap}      label="Frame Rate"     value={fmt(selectedMission?.video_fps, 'FPS')}         color="#d97706" />
              <StatCard icon={Grid}     label="Resolution"
                value={selectedMission?.video_width && selectedMission?.video_height
                  ? `${selectedMission.video_width} × ${selectedMission.video_height}`
                  : '—'}
                color="#0284c7"
              />
              <StatCard icon={Clock}    label="Duration"       value={fmtDuration(selectedMission?.video_duration_seconds)} color="#059669" />
              <StatCard icon={Film}     label="Total Frames"   value={fmt(selectedMission?.video_total_frames)}      color="#7c3aed" />
              <StatCard icon={BarChart2} label="File Size"     value={fmtBytes(selectedMission?.video_size_bytes)}   color="#db2777" />
              <StatCard icon={Info}     label="Codec"          value={selectedMission?.video_codec || '—'}           color="#475569" />
            </div>
          </div>
        )}

        {/* ── PANEL 3: EXTRACTION CONTROLS ─────────────────────────────────── */}
        {hasVideo && !isTerminal && (
          <div className="geo-card" style={{ padding: '28px 32px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <Sliders size={20} color="#0284c7" />
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                Configure Frame Extraction
              </h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '24px' }}>
              {/* Interval slider */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '10px' }}>
                  <span>Extraction Interval</span>
                  <span style={{ color: '#7c3aed', fontWeight: 700 }}>{intervalSec.toFixed(1)}s</span>
                </label>
                <input
                  type="range"
                  min="0.1" max="5.0" step="0.1"
                  value={intervalSec}
                  onChange={(e) => setIntervalSec(parseFloat(e.target.value))}
                  style={{ width: '100%', accentColor: '#7c3aed' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8', marginTop: '6px' }}>
                  <span>0.1s (dense)</span><span>5.0s (sparse)</span>
                </div>
              </div>

              {/* Max dimension */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '10px' }}>
                  <span>Max Frame Dimension</span>
                  <span style={{ color: '#0284c7', fontWeight: 700 }}>{maxDimension === 0 ? 'No resize' : `${maxDimension}px`}</span>
                </label>
                <input
                  type="range"
                  min="0" max="4096" step="64"
                  value={maxDimension}
                  onChange={(e) => setMaxDimension(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: '#0284c7' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8', marginTop: '6px' }}>
                  <span>0 (no resize)</span><span>4096px</span>
                </div>
              </div>

              {/* JPEG quality */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '10px' }}>
                  <span>JPEG Quality</span>
                  <span style={{ color: '#059669', fontWeight: 700 }}>{jpegQuality}%</span>
                </label>
                <input
                  type="range"
                  min="50" max="100" step="5"
                  value={jpegQuality}
                  onChange={(e) => setJpegQuality(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: '#059669' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#94a3b8', marginTop: '6px' }}>
                  <span>50 (small)</span><span>100 (lossless)</span>
                </div>
              </div>

              {/* Estimated frame count preview */}
              <div style={{
                background: 'rgba(124, 58, 237, 0.05)', border: '1px solid rgba(124, 58, 237, 0.2)',
                borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'center',
              }}>
                <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600, marginBottom: '6px' }}>Estimated Frames</div>
                <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#7c3aed', lineHeight: 1 }}>
                  {estimatedFrames != null ? estimatedFrames.toLocaleString() : '—'}
                </div>
                <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '6px' }}>
                  {selectedMission?.video_duration_seconds
                    ? `${fmtDuration(selectedMission.video_duration_seconds)} ÷ ${intervalSec.toFixed(1)}s interval`
                    : 'Upload video to see estimate'}
                </div>
              </div>
            </div>

            {/* Extract button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleExtract}
                disabled={extracting || !hasVideo || uploadPhase === 'uploading'}
                className="geo-btn-primary"
                style={{ padding: '12px 30px', fontSize: '0.92rem' }}
              >
                <Layers size={17} />
                <span>{extracting ? 'Extracting…' : 'Extract Frames'}</span>
              </button>
            </div>
          </div>
        )}

        {/* ── PANEL 4: LIVE PROCESSING PROGRESS ─────────────────────────────── */}
        {ingestionStatus && ingestionStatus !== 'UPLOADED' && (
          <div className="geo-card" style={{
            padding: '28px 32px',
            marginBottom: '24px',
            border: isTerminal
              ? ingestionStatus === 'COMPLETED'
                ? '1.5px solid rgba(16, 185, 129, 0.35)'
                : '1.5px solid rgba(244, 63, 94, 0.35)'
              : '1.5px solid rgba(2, 132, 199, 0.35)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Cpu size={20} color="#0284c7" />
                <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                  Processing &amp; Keyframe Ingestion Pipeline
                </h2>
              </div>
              <StatusBadge status={ingestionStatus} />
            </div>

            {/* Progress bar (only while extracting) */}
            {(isExtracting || ingestionStatus === 'COMPLETED') && (
              <div style={{ marginBottom: '22px' }}>
                <ProgressBar
                  value={selectedMission?.extracted_frame_count || 0}
                  max={selectedMission?.estimated_frame_count || estimatedFrames || 0}
                  color={ingestionStatus === 'COMPLETED' ? '#059669' : '#7c3aed'}
                />
              </div>
            )}

            {/* Status stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '14px', marginBottom: '18px' }}>
              <StatCard
                icon={Layers}
                label="Frames Extracted"
                value={fmt(selectedMission?.extracted_frame_count)}
                color="#7c3aed"
              />
              <StatCard
                icon={Film}
                label="Interval Used"
                value={fmt(selectedMission?.extraction_interval_sec, 's')}
                color="#0284c7"
              />
              <StatCard
                icon={Grid}
                label="Max Dimension"
                value={selectedMission?.extraction_max_dimension === 0
                  ? 'No resize'
                  : fmt(selectedMission?.extraction_max_dimension, 'px')}
                color="#d97706"
              />
            </div>

            {/* Error detail */}
            {ingestionStatus === 'FAILED' && selectedMission?.extraction_error && (
              <div style={{
                background: '#fff5f5', border: '1px solid rgba(244, 63, 94, 0.3)',
                borderRadius: '10px', padding: '14px 16px', color: '#b91c1c', fontSize: '0.84rem',
                marginBottom: '18px',
              }}>
                <strong>Error:</strong> {selectedMission.extraction_error}
              </div>
            )}

            {/* Success actions */}
            {ingestionStatus === 'COMPLETED' && (
              <div style={{
                background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '12px', padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px'
              }}>
                <div>
                  <div style={{ color: '#065f46', fontWeight: 700, fontSize: '0.95rem', marginBottom: '4px' }}>
                    ✓ {(selectedMission?.extracted_frame_count || 0).toLocaleString()} frames extracted successfully
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    Stored in: <code style={{ color: '#0369a1', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', background: '#ffffff', padding: '2px 6px', borderRadius: '4px' }}>
                      storage/frames/{selectedMission?.id?.slice(0, 8)}…/
                    </code>
                  </div>
                </div>
                <button
                  onClick={() => setActivePage('dashboard')}
                  className="geo-btn-primary"
                  style={{ padding: '10px 22px', fontSize: '0.88rem' }}
                >
                  <span>Pipeline Monitor</span> <ChevronRight size={16} />
                </button>
              </div>
            )}

            {/* Retry on failure */}
            {ingestionStatus === 'FAILED' && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setIngestionStatus('UPLOADED');
                    setError(null);
                  }}
                  className="geo-btn-secondary"
                  style={{ padding: '10px 22px', fontSize: '0.88rem' }}
                >
                  <RefreshCw size={15} /> <span>Retry Extraction</span>
                </button>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── spin keyframe ── */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
