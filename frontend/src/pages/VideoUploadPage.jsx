/**
 * Phase 1 — Video Ingestion & Frame Extraction Page
 *
 * 4-panel progressive flow:
 *   1. Mission selector + drag-and-drop video dropzone
 *   2. Video Info panel  — FPS, resolution, duration, codec (from backend probe)
 *   3. Extraction Controls — interval slider, estimated frame count, Extract button
 *   4. Live Progress panel — status badge, animated progress bar, frame count, error display
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload, Video, FileText, CheckCircle2, AlertCircle,
  Play, Cpu, ArrowRight, Film, Clock, Layers, Zap,
  BarChart2, RefreshCw, AlertTriangle, ChevronRight,
  Grid, Info,
} from 'lucide-react';
import { apiClient } from '../api/client';

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_META = {
  UPLOADED:   { color: '#38bdf8', bg: 'rgba(56,189,248,0.12)',  label: 'Uploaded',   icon: CheckCircle2 },
  VALIDATING: { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  label: 'Validating', icon: RefreshCw },
  EXTRACTING: { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)', label: 'Extracting', icon: Layers },
  COMPLETED:  { color: '#34d399', bg: 'rgba(52,211,153,0.12)',  label: 'Completed',  icon: CheckCircle2 },
  FAILED:     { color: '#f87171', bg: 'rgba(248,113,113,0.12)', label: 'Failed',     icon: AlertTriangle },
};

function StatusBadge({ status }) {
  if (!status) return null;
  const meta = STATUS_META[status] || { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', label: status, icon: Info };
  const Icon = meta.icon;
  const isSpinning = status === 'VALIDATING' || status === 'EXTRACTING';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      padding: '5px 12px', borderRadius: '999px',
      background: meta.bg, border: `1px solid ${meta.color}22`,
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

function StatCard({ icon: Icon, label, value, color = '#38bdf8' }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '10px', padding: '14px 16px',
      display: 'flex', alignItems: 'center', gap: '12px',
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: '9px',
        background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={18} color={color} />
      </div>
      <div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '2px' }}>{label}</div>
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#e2e8f0' }}>{value}</div>
      </div>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ value, max, color = '#a78bfa' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.8rem' }}>
        <span style={{ color: 'var(--text-muted)' }}>Frames extracted</span>
        <span style={{ color, fontWeight: 700 }}>{value.toLocaleString()} / {max > 0 ? max.toLocaleString() : '?'} ({pct}%)</span>
      </div>
      <div style={{ height: '8px', background: 'rgba(255,255,255,0.07)', borderRadius: '999px', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: `linear-gradient(90deg, ${color}, #38bdf8)`,
          borderRadius: '999px',
          transition: 'width 0.4s ease',
          boxShadow: `0 0 12px ${color}55`,
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
      .catch((err) => setError(err.message));
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

  // ── Styles ──────────────────────────────────────────────────────────────────

  const panelStyle = {
    background: 'rgba(255,255,255,0.025)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '14px',
    padding: '24px',
    marginBottom: '20px',
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '40px 24px' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <Film size={28} color="#38bdf8" />
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#fff', margin: 0 }}>
            Video Ingestion &amp; Frame Extraction
          </h1>
        </div>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: 0 }}>
          Phase 1 — Upload your drone footage, inspect video metadata, and extract keyframes at a configurable interval.
        </p>
      </div>

      {/* ── Global error ── */}
      {error && (
        <div style={{
          background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)',
          borderRadius: '10px', padding: '12px 16px', color: '#fca5a5',
          marginBottom: '20px', display: 'flex', alignItems: 'flex-start', gap: '10px',
          fontSize: '0.875rem',
        }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
          <span>{error}</span>
        </div>
      )}

      {/* ── Panel 1: Mission + Dropzone ── */}
      <div style={panelStyle}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', marginBottom: '16px' }}>
          1 · Select Mission &amp; Upload Flight Video
        </h2>

        {/* Mission selector */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
            Target Mission
          </label>
          <select
            value={selectedMission?.id || ''}
            onChange={handleMissionChange}
            className="form-select"
            style={{ width: '100%', maxWidth: '480px' }}
          >
            {missions.length === 0 && <option value="">No missions — create one first</option>}
            {missions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.drone_model} · {m.flight_altitude_m}m
              </option>
            ))}
          </select>
        </div>

        {/* Drag & drop dropzone */}
        <input
          ref={videoInputRef}
          type="file"
          accept=".mp4,.mov,.avi,.mkv,.webm,.ts,.mts"
          style={{ display: 'none' }}
          onChange={handleFileInput}
        />

        <div
          onClick={handleDropzoneClick}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          style={{
            border: dragOver
              ? '2px dashed #38bdf8'
              : hasVideo
                ? '1px solid rgba(52,211,153,0.5)'
                : '2px dashed rgba(255,255,255,0.12)',
            borderRadius: '12px',
            padding: '32px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragOver
              ? 'rgba(56,189,248,0.06)'
              : hasVideo
                ? 'rgba(52,211,153,0.04)'
                : 'rgba(255,255,255,0.015)',
            transition: 'all 0.2s',
          }}
        >
          {uploadPhase === 'uploading' ? (
            <div>
              <RefreshCw size={36} color="#a78bfa" style={{ animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
              <p style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: '8px' }}>
                Uploading &amp; probing video…
              </p>
              {/* Upload progress bar */}
              <div style={{ width: '100%', maxWidth: '360px', margin: '0 auto' }}>
                <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${uploadProgress}%`,
                    background: 'linear-gradient(90deg, #a78bfa, #38bdf8)',
                    borderRadius: '999px',
                    transition: 'width 0.2s',
                  }} />
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                  {uploadProgress}% transferred
                </div>
              </div>
            </div>
          ) : hasVideo ? (
            <div>
              <CheckCircle2 size={36} color="#34d399" style={{ marginBottom: '10px' }} />
              <p style={{ color: '#34d399', fontWeight: 700, fontSize: '1rem', marginBottom: '4px' }}>
                {selectedMission?.video_filename || 'Video attached'}
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                Click to replace with a different video file
              </p>
            </div>
          ) : (
            <div>
              <Upload size={36} color="#38bdf8" style={{ marginBottom: '12px', opacity: 0.7 }} />
              <p style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '1rem', marginBottom: '4px' }}>
                Drag &amp; drop your drone flight video here
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                MP4, MOV, AVI, MKV, WEBM, TS, MTS · up to 4K resolution
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Panel 2: Video Info (shown after probe) ── */}
      {hasProbeData && (
        <div style={panelStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', margin: 0 }}>
              2 · Video Information
            </h2>
            <StatusBadge status={ingestionStatus} />
          </div>

          {/* Local video preview */}
          {localVideoUrl && (
            <div style={{ marginBottom: '20px', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
              <video
                src={localVideoUrl}
                controls
                style={{ width: '100%', maxHeight: '320px', display: 'block', background: '#000' }}
              />
            </div>
          )}

          {/* Probe stats grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: '12px' }}>
            <StatCard icon={Zap}     label="Frame Rate"     value={fmt(selectedMission?.video_fps, 'FPS')}         color="#fbbf24" />
            <StatCard icon={Grid}    label="Resolution"
              value={selectedMission?.video_width && selectedMission?.video_height
                ? `${selectedMission.video_width} × ${selectedMission.video_height}`
                : '—'}
              color="#38bdf8"
            />
            <StatCard icon={Clock}    label="Duration"       value={fmtDuration(selectedMission?.video_duration_seconds)} color="#34d399" />
            <StatCard icon={Film}     label="Total Frames"   value={fmt(selectedMission?.video_total_frames)}      color="#a78bfa" />
            <StatCard icon={BarChart2} label="File Size"     value={fmtBytes(selectedMission?.video_size_bytes)}   color="#f472b6" />
            <StatCard icon={Info}     label="Codec"          value={selectedMission?.video_codec || '—'}           color="#94a3b8" />
          </div>
        </div>
      )}

      {/* ── Panel 3: Extraction Controls ── */}
      {hasVideo && !isTerminal && (
        <div style={panelStyle}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', marginBottom: '18px' }}>
            3 · Configure Frame Extraction
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
            {/* Interval slider */}
            <div>
              <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Extraction Interval</span>
                <span style={{ color: '#a78bfa', fontWeight: 700 }}>{intervalSec.toFixed(1)}s</span>
              </label>
              <input
                type="range"
                min="0.1" max="5.0" step="0.1"
                value={intervalSec}
                onChange={(e) => setIntervalSec(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#a78bfa' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                <span>0.1s (dense)</span><span>5.0s (sparse)</span>
              </div>
            </div>

            {/* Max dimension */}
            <div>
              <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Max Frame Dimension</span>
                <span style={{ color: '#38bdf8', fontWeight: 700 }}>{maxDimension === 0 ? 'No resize' : `${maxDimension}px`}</span>
              </label>
              <input
                type="range"
                min="0" max="4096" step="64"
                value={maxDimension}
                onChange={(e) => setMaxDimension(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: '#38bdf8' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                <span>0 (no resize)</span><span>4096px</span>
              </div>
            </div>

            {/* JPEG quality */}
            <div>
              <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>JPEG Quality</span>
                <span style={{ color: '#34d399', fontWeight: 700 }}>{jpegQuality}%</span>
              </label>
              <input
                type="range"
                min="50" max="100" step="5"
                value={jpegQuality}
                onChange={(e) => setJpegQuality(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: '#34d399' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                <span>50 (small)</span><span>100 (lossless)</span>
              </div>
            </div>

            {/* Estimated frame count preview */}
            <div style={{
              background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.2)',
              borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center',
            }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '6px' }}>Estimated Frames</div>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: '#a78bfa', lineHeight: 1 }}>
                {estimatedFrames != null ? estimatedFrames.toLocaleString() : '—'}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '4px' }}>
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
              className="btn-primary"
              style={{ padding: '12px 28px', fontSize: '0.95rem', gap: '8px', display: 'flex', alignItems: 'center' }}
            >
              <Layers size={17} />
              {extracting ? 'Extracting…' : 'Extract Frames'}
            </button>
          </div>
        </div>
      )}

      {/* ── Panel 4: Live Progress ── */}
      {ingestionStatus && ingestionStatus !== 'UPLOADED' && (
        <div style={{
          ...panelStyle,
          border: isTerminal
            ? ingestionStatus === 'COMPLETED'
              ? '1px solid rgba(52,211,153,0.3)'
              : '1px solid rgba(248,113,113,0.3)'
            : '1px solid rgba(167,139,250,0.25)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', margin: 0 }}>
              4 · Processing Status
            </h2>
            <StatusBadge status={ingestionStatus} />
          </div>

          {/* Progress bar (only while extracting) */}
          {(isExtracting || ingestionStatus === 'COMPLETED') && (
            <div style={{ marginBottom: '20px' }}>
              <ProgressBar
                value={selectedMission?.extracted_frame_count || 0}
                max={selectedMission?.estimated_frame_count || estimatedFrames || 0}
                color={ingestionStatus === 'COMPLETED' ? '#34d399' : '#a78bfa'}
              />
            </div>
          )}

          {/* Status stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <StatCard
              icon={Layers}
              label="Frames Extracted"
              value={fmt(selectedMission?.extracted_frame_count)}
              color="#a78bfa"
            />
            <StatCard
              icon={Film}
              label="Interval Used"
              value={fmt(selectedMission?.extraction_interval_sec, 's')}
              color="#38bdf8"
            />
            <StatCard
              icon={Grid}
              label="Max Dimension"
              value={selectedMission?.extraction_max_dimension === 0
                ? 'No resize'
                : fmt(selectedMission?.extraction_max_dimension, 'px')}
              color="#fbbf24"
            />
          </div>

          {/* Error detail */}
          {ingestionStatus === 'FAILED' && selectedMission?.extraction_error && (
            <div style={{
              background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)',
              borderRadius: '8px', padding: '12px 14px', color: '#fca5a5', fontSize: '0.82rem',
              marginBottom: '16px',
            }}>
              <strong>Error:</strong> {selectedMission.extraction_error}
            </div>
          )}

          {/* Success actions */}
          {ingestionStatus === 'COMPLETED' && (
            <div style={{
              background: 'rgba(52,211,153,0.07)', border: '1px solid rgba(52,211,153,0.25)',
              borderRadius: '10px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ color: '#34d399', fontWeight: 700, marginBottom: '2px' }}>
                  ✓ {(selectedMission?.extracted_frame_count || 0).toLocaleString()} frames extracted successfully
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Stored in: <code style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                    storage/frames/{selectedMission?.id?.slice(0, 8)}…/
                  </code>
                </div>
              </div>
              <button
                onClick={() => setActivePage('dashboard')}
                className="btn-primary"
                style={{ padding: '10px 20px', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                Pipeline Monitor <ChevronRight size={15} />
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
                className="btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px', fontSize: '0.88rem' }}
              >
                <RefreshCw size={15} /> Retry Extraction
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── spin keyframe ── */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
