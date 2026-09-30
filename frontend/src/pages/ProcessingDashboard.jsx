import React, { useEffect, useState, useRef, useCallback } from 'react';
import { 
  Activity, 
  Play, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Box, 
  BarChart3, 
  Terminal, 
  Cpu,
  Layers,
  Clock,
  HardDrive,
  Check,
  Circle,
  Loader2,
  Zap,
  Sparkles,
  ArrowRight,
  Upload,
  Video,
  FileText,
  Sliders,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  Shield,
  Plane,
  Camera,
  Compass,
  AlertTriangle,
  RotateCw
} from 'lucide-react';
import { apiClient } from '../api/client';
import StatusBadge from '../components/StatusBadge';
import StagePipelineView from '../components/StagePipelineView';

// ─── TECHNICAL DESIGN TOKENS (Light High-End Engineering Console) ────────────
const CONSOLE_MONO = "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

const STYLES = {
  container: {
    minHeight: 'calc(100vh - 60px)',
    background: '#f8fafc',
    color: '#0f172a',
    padding: '24px 32px 64px 32px',
    position: 'relative',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
  },
  header: {
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    padding: '16px 24px',
    marginBottom: '20px',
    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '16px'
  },
  sectionCard: {
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
    overflow: 'hidden',
    marginBottom: '20px'
  },
  sectionHeader: {
    padding: '12px 18px',
    background: '#f8fafc',
    borderBottom: '1px solid #e2e8f0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  sectionTitle: {
    fontFamily: CONSOLE_MONO,
    fontSize: '0.68rem',
    fontWeight: 800,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: '#0284c7',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  sectionBody: {
    padding: '18px 20px'
  },
  dataGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
    gap: '10px'
  },
  dataCell: {
    background: '#f8fafc',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    padding: '8px 12px'
  },
  cellLabel: {
    fontFamily: CONSOLE_MONO,
    fontSize: '0.58rem',
    fontWeight: 700,
    color: '#64748b',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: '3px'
  },
  cellValue: {
    fontFamily: CONSOLE_MONO,
    fontSize: '0.82rem',
    fontWeight: 700,
    color: '#0f172a',
    lineHeight: 1.2
  }
};

// ─── 9 USER-SPECIFIED RECONSTRUCTION PIPELINE STAGES ─────────────────────────
const VERTICAL_STAGES = [
  {
    id: 'video_ingest',
    label: 'VIDEO INGEST',
    desc: 'Footage and flight telemetry ingested into workspace',
    resolveStatus: (job, mission, stages) => {
      if (job || mission?.video_filename || mission?.video_path) return 'completed';
      return 'pending';
    }
  },
  {
    id: 'frame_extraction',
    label: 'FRAME EXTRACTION',
    desc: 'Adaptive keyframe extraction & color normalization',
    resolveStatus: (job, mission, stages) => {
      if (!job) {
        if (mission?.ingestion_status === 'COMPLETED') return 'completed';
        if (mission?.ingestion_status === 'EXTRACTING') return 'running';
        return 'pending';
      }
      const stg = stages.find(s => s.stage_name === 'preprocessing');
      if (stg?.status === 'completed') return 'completed';
      if (stg?.status === 'running' || job.current_stage === 'preprocessing') return 'running';
      if (stg?.status === 'failed') return 'failed';
      // If subsequent stages are running/completed, this is completed
      const subsequent = stages.some(s => s.stage_order > 1 && (s.status === 'completed' || s.status === 'running'));
      return subsequent ? 'completed' : 'pending';
    },
    getMetric: (metrics) => metrics.frames_extracted ? `${metrics.frames_extracted.toLocaleString()} frames` : null
  },
  {
    id: 'feature_matching',
    label: 'FEATURE MATCHING',
    desc: 'SIFT/ORB feature detection, correspondence & keyframe selection',
    resolveStatus: (job, mission, stages) => {
      if (!job) return 'pending';
      const stg = stages.find(s => s.stage_name === 'keyframe_selection');
      if (stg?.status === 'completed') return 'completed';
      if (stg?.status === 'running' || job.current_stage === 'keyframe_selection') return 'running';
      if (stg?.status === 'failed') return 'failed';
      const subsequent = stages.some(s => s.stage_order > 5 && (s.status === 'completed' || s.status === 'running'));
      return subsequent ? 'completed' : 'pending';
    },
    getMetric: (metrics) => metrics.keyframes_selected ? `${metrics.keyframes_selected} keyframes` : null
  },
  {
    id: 'camera_pose',
    label: 'CAMERA POSE',
    desc: 'Epipolar RANSAC & camera trajectory recovery (Structure-from-Motion)',
    resolveStatus: (job, mission, stages) => {
      if (!job) return 'pending';
      const stgGeom = stages.find(s => s.stage_name === 'geometry');
      const stgPose = stages.find(s => s.stage_name === 'pose_estimation');
      if (stgGeom?.status === 'completed') return 'completed';
      if (stgPose?.status === 'running' || stgGeom?.status === 'running' || job.current_stage === 'pose_estimation' || job.current_stage === 'geometry') return 'running';
      if (stgPose?.status === 'failed' || stgGeom?.status === 'failed') return 'failed';
      const subsequent = stages.some(s => s.stage_order > 7 && (s.status === 'completed' || s.status === 'running'));
      return subsequent ? 'completed' : 'pending';
    },
    getMetric: (metrics) => metrics.cameras_registered ? `${metrics.cameras_registered} cameras` : null
  },
  {
    id: 'depth_estimation',
    label: 'DEPTH ESTIMATION',
    desc: 'Multi-view Semi-Global stereo disparity depth maps',
    resolveStatus: (job, mission, stages) => {
      if (!job) return 'pending';
      const stg = stages.find(s => s.stage_name === 'dense_point_cloud');
      if (stg?.status === 'completed') return 'completed';
      if (stg?.status === 'running' || job.current_stage === 'dense_point_cloud') return 'running';
      if (stg?.status === 'failed') return 'failed';
      const subsequent = stages.some(s => s.stage_order > 8 && (s.status === 'completed' || s.status === 'running'));
      return subsequent ? 'completed' : 'pending';
    }
  },
  {
    id: 'point_cloud',
    label: 'POINT CLOUD',
    desc: 'Dense 3D point cloud triangulation with spatial filtering',
    resolveStatus: (job, mission, stages) => {
      if (!job) return 'pending';
      const stg = stages.find(s => s.stage_name === 'dense_point_cloud');
      if (stg?.status === 'completed') return 'completed';
      if (stg?.status === 'running' || job.current_stage === 'dense_point_cloud') return 'running';
      if (stg?.status === 'failed') return 'failed';
      const subsequent = stages.some(s => s.stage_order > 8 && (s.status === 'completed' || s.status === 'running'));
      return subsequent ? 'completed' : 'pending';
    },
    getMetric: (metrics) => metrics.dense_points ? `${metrics.dense_points.toLocaleString()} pts` : null
  },
  {
    id: 'mesh',
    label: 'MESH',
    desc: 'Watertight surface mesh generation & Delaunay triangulation',
    resolveStatus: (job, mission, stages) => {
      if (!job) return 'pending';
      const stg = stages.find(s => s.stage_name === 'mesh_generation');
      if (stg?.status === 'completed') return 'completed';
      if (stg?.status === 'running' || job.current_stage === 'mesh_generation') return 'running';
      if (stg?.status === 'failed') return 'failed';
      const subsequent = stages.some(s => s.stage_order > 9 && (s.status === 'completed' || s.status === 'running'));
      return subsequent ? 'completed' : 'pending';
    },
    getMetric: (metrics) => metrics.triangles ? `${metrics.triangles.toLocaleString()} tris` : null
  },
  {
    id: 'texture',
    label: 'TEXTURE',
    desc: 'Projective UV texture mapping and multi-view seam blending',
    resolveStatus: (job, mission, stages) => {
      if (!job) return 'pending';
      const stg = stages.find(s => s.stage_name === 'texture_mapping');
      if (stg?.status === 'completed') return 'completed';
      if (stg?.status === 'running' || job.current_stage === 'texture_mapping') return 'running';
      if (stg?.status === 'failed') return 'failed';
      const subsequent = stages.some(s => s.stage_order > 10 && (s.status === 'completed' || s.status === 'running'));
      return subsequent ? 'completed' : 'pending';
    }
  },
  {
    id: 'digital_twin',
    label: 'DIGITAL TWIN',
    desc: 'Georeferencing, uncertainty estimation & certified photogrammetry report',
    resolveStatus: (job, mission, stages) => {
      if (!job) return 'pending';
      if (job.status === 'completed') return 'completed';
      const stgVal = stages.find(s => s.stage_name === 'validation');
      const stgConf = stages.find(s => s.stage_name === 'confidence_estimation');
      const stgGeo = stages.find(s => s.stage_name === 'georeferencing');
      if (stgVal?.status === 'completed') return 'completed';
      if (job.current_stage === 'validation' || job.current_stage === 'confidence_estimation' || job.current_stage === 'georeferencing') return 'running';
      if (stgGeo?.status === 'running' || stgConf?.status === 'running' || stgVal?.status === 'running') return 'running';
      if (job.status === 'failed') return 'failed';
      return 'pending';
    },
    getMetric: (metrics) => metrics.confidence_high_pct !== null && metrics.confidence_high_pct !== undefined ? `${metrics.confidence_high_pct}% confidence` : null
  }
];

export default function ProcessingDashboard({ 
  activeJobId, 
  setActiveJobId, 
  activeMissionId, 
  setActivePage 
}) {
  const [job, setJob] = useState(null);
  const [missions, setMissions] = useState([]);
  const [selectedMission, setSelectedMission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [resuming, setResuming] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [systemStatus, setSystemStatus] = useState(null);
  const [showStageDetails, setShowStageDetails] = useState(false);

  // Upload & Extraction states inside console
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const fileInputRef = useRef(null);

  const pollIntervalRef = useRef(null);

  // ── Load available missions ────────────────────────────────────────────────
  useEffect(() => {
    apiClient.listMissions()
      .then(list => {
        setMissions(list);
        if (activeMissionId) {
          const m = list.find(x => x.id === activeMissionId) || list[0];
          setSelectedMission(m);
        } else if (list.length > 0) {
          setSelectedMission(list[0]);
        }
      })
      .catch(err => console.debug('Could not fetch missions', err));
  }, [activeMissionId]);

  // ── Fetch active job status ────────────────────────────────────────────────
  const fetchJobStatus = useCallback(async () => {
    if (!activeJobId) {
      if (activeMissionId) {
        try {
          const jobs = await apiClient.getMissionJobs(activeMissionId);
          if (jobs.length > 0) {
            setActiveJobId(jobs[0].id);
            setJob(jobs[0]);
            setLoading(false);
            return;
          }
        } catch (e) {
          console.debug("Could not fetch mission jobs", e);
        }
      }
      setLoading(false);
      return;
    }

    try {
      const data = await apiClient.getJob(activeJobId);
      setJob(data);
      if (data.system_status) {
        setSystemStatus(data.system_status);
      }
      if (data.mission_id && (!selectedMission || selectedMission.id !== data.mission_id)) {
        apiClient.getMission(data.mission_id)
          .then(m => setSelectedMission(m))
          .catch(() => {});
      }
      setLoading(false);

      if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to poll job status');
      setLoading(false);
    }
  }, [activeJobId, activeMissionId, selectedMission, setActiveJobId]);

  // ── Poll loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchJobStatus();
    pollIntervalRef.current = setInterval(fetchJobStatus, 2000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [fetchJobStatus]);

  // ── Live elapsed timer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!job?.started_at) return;
    const startMs = new Date(job.started_at).getTime();

    const updateTimer = () => {
      if (job.completed_at) {
        const endMs = new Date(job.completed_at).getTime();
        setElapsedSec(Math.max(0, Math.floor((endMs - startMs) / 1000)));
      } else {
        const nowMs = Date.now();
        setElapsedSec(Math.max(0, Math.floor((nowMs - startMs) / 1000)));
      }
    };

    updateTimer();
    const timerInterval = setInterval(updateTimer, 1000);
    return () => clearInterval(timerInterval);
  }, [job?.started_at, job?.completed_at]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleResumeStage = async (stageName) => {
    if (!job) return;
    setResuming(true);
    setError(null);
    try {
      const resumedJob = await apiClient.resumeJob(job.id, stageName);
      setJob(resumedJob);
      setResuming(false);
      if (!pollIntervalRef.current) {
        pollIntervalRef.current = setInterval(fetchJobStatus, 2000);
      }
    } catch (err) {
      setError(err.message || 'Failed to resume stage');
      setResuming(false);
    }
  };

  const handleCancelJob = async () => {
    if (!job) return;
    try {
      const cancelledJob = await apiClient.cancelJob(job.id);
      setJob(cancelledJob);
    } catch (err) {
      setError(err.message || 'Failed to cancel job');
    }
  };

  const handleLaunchJob = async () => {
    if (!selectedMission?.id) return;
    setLaunching(true);
    setError(null);
    try {
      const newJob = await apiClient.createJob(selectedMission.id, 'auto');
      setActiveJobId(newJob.id);
      setJob(newJob);
      setLaunching(false);
      if (!pollIntervalRef.current) {
        pollIntervalRef.current = setInterval(fetchJobStatus, 2000);
      }
    } catch (err) {
      setError(err.message || 'Failed to launch reconstruction job');
      setLaunching(false);
    }
  };

  const handleVideoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedMission?.id) return;
    setUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      const updated = await apiClient.uploadMissionVideo(selectedMission.id, file, pct => setUploadProgress(pct));
      setSelectedMission(updated);
      setUploading(false);
    } catch (err) {
      setError(err.message || 'Upload failed');
      setUploading(false);
    }
    e.target.value = '';
  };

  const handleExtractFrames = async () => {
    if (!selectedMission?.id) return;
    setExtracting(true);
    setError(null);
    try {
      await apiClient.extractFrames(selectedMission.id, { intervalSec: 0.5, maxDimension: 1920, jpegQuality: 90 });
      // Poll mission status
      const pollTimer = setInterval(async () => {
        try {
          const st = await apiClient.getMissionStatus(selectedMission.id);
          setSelectedMission(prev => ({ ...prev, ...st }));
          if (st.ingestion_status === 'COMPLETED' || st.ingestion_status === 'FAILED') {
            clearInterval(pollTimer);
            setExtracting(false);
          }
        } catch {
          clearInterval(pollTimer);
          setExtracting(false);
        }
      }, 1500);
    } catch (err) {
      setError(err.message || 'Extraction failed');
      setExtracting(false);
    }
  };

  const formatTime = (totalSec) => {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isRunning = job?.status === 'running' || job?.status === 'resumed';
  const isFinished = job?.status === 'completed';
  const rapidModelAvailable = job?.rapid_model_ready || false;
  const metrics = job?.real_time_metrics || {};
  const stages = job?.stages || [];

  return (
    <div style={STYLES.container}>
      
      {/* ══ HEADER: RECON-X MISSION CONSOLE ════════════════════════════════════ */}
      <div style={STYLES.header}>
        {/* Left: Brand & Title */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{
              fontFamily: CONSOLE_MONO,
              fontSize: '0.62rem',
              fontWeight: 800,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              background: '#0f172a',
              color: '#ffffff',
              padding: '2px 6px',
              borderRadius: '3px'
            }}>
              RECON-X
            </span>
            <span style={{
              fontFamily: CONSOLE_MONO,
              fontSize: '0.62rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              color: '#0284c7'
            }}>
              SYSTEM CONSOLE // SPATIAL ENGINE
            </span>
          </div>

          <h1 style={{
            fontSize: '1.45rem',
            fontWeight: 800,
            letterSpacing: '-0.02em',
            margin: 0,
            color: '#0f172a',
            lineHeight: 1.15
          }}>
            MISSION CONSOLE
          </h1>
        </div>

        {/* Right: Telemetry & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          {/* Hardware device pill */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            padding: '5px 12px',
            borderRadius: '6px'
          }}>
            <Cpu size={14} color="#0284c7" />
            <span style={{ fontFamily: CONSOLE_MONO, fontSize: '0.72rem', fontWeight: 700, color: '#334155' }}>
              {systemStatus ? (
                systemStatus.gpu_available ? `CUDA: ${systemStatus.vram_used_gb}/${systemStatus.vram_total_gb}GB` : `CPU: ${systemStatus.cpu_percent}%`
              ) : (
                job?.active_device?.toUpperCase() || 'NODE: READY'
              )}
            </span>
          </div>

          {/* Elapsed runtime */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            padding: '5px 12px',
            borderRadius: '6px'
          }}>
            <Clock size={14} color={isRunning ? '#0284c7' : '#64748b'} />
            <span style={{ fontFamily: CONSOLE_MONO, fontSize: '0.74rem', fontWeight: 800, color: '#0f172a' }}>
              {formatTime(elapsedSec)}
            </span>
          </div>

          {/* Measured Progress pill */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            padding: '5px 12px',
            borderRadius: '6px'
          }}>
            <span style={{ fontFamily: CONSOLE_MONO, fontSize: '0.62rem', fontWeight: 700, color: '#64748b' }}>PROGRESS</span>
            <span style={{ fontFamily: CONSOLE_MONO, fontSize: '0.78rem', fontWeight: 800, color: '#0284c7' }}>
              {job?.progress_percent || 0}%
            </span>
          </div>

          {/* Job status badge */}
          {job ? (
            <StatusBadge status={job.status} />
          ) : (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 10px',
              borderRadius: '999px',
              background: 'rgba(148,163,184,0.1)',
              border: '1px solid rgba(148,163,184,0.2)',
              color: '#64748b',
              fontSize: '0.72rem',
              fontWeight: 700,
              fontFamily: CONSOLE_MONO
            }}>
              <Circle size={8} /> STANDBY
            </span>
          )}

          {/* Refresh button */}
          <button 
            onClick={fetchJobStatus} 
            title="Refresh Console Telemetry"
            style={{
              padding: '7px 11px',
              borderRadius: '6px',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              color: '#64748b'
            }}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* ══ ERROR ALERT ════════════════════════════════════════════════════════ */}
      {error && (
        <div style={{
          background: '#fff1f2',
          border: '1px solid #fecdd3',
          borderRadius: '8px',
          padding: '12px 18px',
          color: '#be123c',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontFamily: CONSOLE_MONO,
          fontSize: '0.78rem',
          fontWeight: 600
        }}>
          <AlertCircle size={16} color="#e11d48" style={{ flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}

      {/* ══ CONSOLE WORKSPACE: 2-COLUMN TECHNICAL LAYOUT ═══════════════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '20px' }}>

        {/* ── LEFT COLUMN: MISSION & INPUT ─────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* ── SECTION 01: MISSION ────────────────────────────────────────── */}
          <div style={STYLES.sectionCard}>
            <div style={STYLES.sectionHeader}>
              <div style={STYLES.sectionTitle}>
                <Plane size={13} color="#0284c7" />
                <span>MISSION</span>
              </div>
              {selectedMission && (
                <span style={{ fontFamily: CONSOLE_MONO, fontSize: '0.62rem', color: '#64748b', fontWeight: 600 }}>
                  ID: {selectedMission.id?.slice(0, 8)}…
                </span>
              )}
            </div>

            <div style={STYLES.sectionBody}>
              {/* Mission Selector */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', ...STYLES.cellLabel, marginBottom: '5px' }}>
                  Active Mission Profile
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    value={selectedMission?.id || ''}
                    onChange={(e) => {
                      const m = missions.find(x => x.id === e.target.value);
                      setSelectedMission(m);
                    }}
                    style={{
                      flex: 1,
                      padding: '7px 10px',
                      borderRadius: '6px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      color: '#0f172a',
                      fontFamily: CONSOLE_MONO,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {missions.length === 0 && <option value="">No missions available</option>}
                    {missions.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.drone_model || 'UAV'})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setActivePage('create-mission')}
                    title="Create New Mission"
                    style={{
                      padding: '7px 12px',
                      borderRadius: '6px',
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      color: '#0284c7',
                      fontFamily: CONSOLE_MONO,
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    + NEW
                  </button>
                </div>
              </div>

              {/* Mission Technical Grid */}
              <div style={STYLES.dataGrid}>
                <div style={STYLES.dataCell}>
                  <div style={STYLES.cellLabel}>DRONE PLATFORM</div>
                  <div style={STYLES.cellValue}>{selectedMission?.drone_model || 'Standard UAV'}</div>
                </div>
                <div style={STYLES.dataCell}>
                  <div style={STYLES.cellLabel}>CAMERA PAYLOAD</div>
                  <div style={STYLES.cellValue}>{selectedMission?.camera_model || 'RGB Optical'}</div>
                </div>
                <div style={STYLES.dataCell}>
                  <div style={STYLES.cellLabel}>FOCAL LENGTH</div>
                  <div style={STYLES.cellValue}>{selectedMission?.focal_length_mm ? `${selectedMission.focal_length_mm} mm` : '35 mm'}</div>
                </div>
                <div style={STYLES.dataCell}>
                  <div style={STYLES.cellLabel}>ALTITUDE</div>
                  <div style={STYLES.cellValue}>{selectedMission?.flight_altitude_m ? `${selectedMission.flight_altitude_m} m AGL` : '60 m'}</div>
                </div>
                <div style={STYLES.dataCell}>
                  <div style={STYLES.cellLabel}>TARGET GSD</div>
                  <div style={STYLES.cellValue}>{selectedMission?.target_gsd_cm ? `${selectedMission.target_gsd_cm} cm/px` : '1.5 cm/px'}</div>
                </div>
                <div style={STYLES.dataCell}>
                  <div style={STYLES.cellLabel}>OVERLAP (FWD/SIDE)</div>
                  <div style={STYLES.cellValue}>
                    {selectedMission ? `${selectedMission.overlap_forward_percent || 80}% / ${selectedMission.overlap_side_percent || 70}%` : '80% / 70%'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── SECTION 02: INPUT ──────────────────────────────────────────── */}
          <div style={STYLES.sectionCard}>
            <div style={STYLES.sectionHeader}>
              <div style={STYLES.sectionTitle}>
                <Video size={13} color="#0284c7" />
                <span>INPUT</span>
              </div>
              <span style={{ fontFamily: CONSOLE_MONO, fontSize: '0.62rem', color: selectedMission?.video_filename ? '#059669' : '#d97706', fontWeight: 700 }}>
                {selectedMission?.video_filename ? '● FOOTAGE LOADED' : '○ NO FOOTAGE'}
              </span>
            </div>

            <div style={STYLES.sectionBody}>
              {/* Technical Input Footage Specifications */}
              <div style={STYLES.dataGrid}>
                <div style={{ ...STYLES.dataCell, gridColumn: 'span 2' }}>
                  <div style={STYLES.cellLabel}>SOURCE FILE</div>
                  <div style={{ ...STYLES.cellValue, fontSize: '0.74rem', wordBreak: 'break-all' }}>
                    {selectedMission?.video_filename || 'No video uploaded yet'}
                  </div>
                </div>
                <div style={STYLES.dataCell}>
                  <div style={STYLES.cellLabel}>RESOLUTION</div>
                  <div style={STYLES.cellValue}>
                    {selectedMission?.video_width && selectedMission?.video_height 
                      ? `${selectedMission.video_width}×${selectedMission.video_height}` 
                      : (selectedMission?.video_filename ? '4K UHD (3840×2160)' : '—')}
                  </div>
                </div>
                <div style={STYLES.dataCell}>
                  <div style={STYLES.cellLabel}>FRAME RATE</div>
                  <div style={STYLES.cellValue}>
                    {selectedMission?.video_fps ? `${selectedMission.video_fps.toFixed(2)} fps` : '29.97 fps'}
                  </div>
                </div>
                <div style={STYLES.dataCell}>
                  <div style={STYLES.cellLabel}>DURATION</div>
                  <div style={STYLES.cellValue}>
                    {selectedMission?.video_duration_seconds ? `${selectedMission.video_duration_seconds.toFixed(1)}s` : '—'}
                  </div>
                </div>
                <div style={STYLES.dataCell}>
                  <div style={STYLES.cellLabel}>CODEC</div>
                  <div style={STYLES.cellValue}>
                    {selectedMission?.video_codec?.toUpperCase() || 'H.264 / AVC'}
                  </div>
                </div>
                <div style={STYLES.dataCell}>
                  <div style={STYLES.cellLabel}>FILE SIZE</div>
                  <div style={STYLES.cellValue}>
                    {selectedMission?.video_size_bytes 
                      ? `${(selectedMission.video_size_bytes / (1024*1024)).toFixed(1)} MB` 
                      : '—'}
                  </div>
                </div>
                <div style={STYLES.dataCell}>
                  <div style={STYLES.cellLabel}>KEYFRAMES EXTRACTED</div>
                  <div style={{ ...STYLES.cellValue, color: selectedMission?.extracted_frame_count ? '#059669' : '#0f172a' }}>
                    {selectedMission?.extracted_frame_count 
                      ? `${selectedMission.extracted_frame_count} frames` 
                      : 'Not extracted'}
                  </div>
                </div>
              </div>

              {/* Video upload / replacement button */}
              <div style={{ marginTop: '14px', display: 'flex', gap: '8px' }}>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="video/*,.mp4,.mov,.mkv,.avi"
                  style={{ display: 'none' }}
                  onChange={handleVideoUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    color: '#334155',
                    fontFamily: CONSOLE_MONO,
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: uploading ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Upload size={13} color="#0284c7" />
                  <span>{uploading ? `UPLOADING (${uploadProgress}%)` : (selectedMission?.video_filename ? 'REPLACE FOOTAGE' : 'SELECT & UPLOAD FOOTAGE')}</span>
                </button>

                {/* Extract frames trigger if video exists */}
                {selectedMission?.video_filename && !selectedMission?.extracted_frame_count && (
                  <button
                    onClick={handleExtractFrames}
                    disabled={extracting}
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: '#0284c7',
                      border: '1px solid #0284c7',
                      color: '#ffffff',
                      fontFamily: CONSOLE_MONO,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: extracting ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Layers size={13} />
                    <span>{extracting ? 'EXTRACTING...' : 'EXTRACT FRAMES'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* ── RIGHT COLUMN: PROCESSING & OUTPUT ────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* ── SECTION 03: PROCESSING ──────────────────────────────────────── */}
          <div style={STYLES.sectionCard}>
            <div style={STYLES.sectionHeader}>
              <div style={STYLES.sectionTitle}>
                <Activity size={13} color="#0284c7" />
                <span>PROCESSING</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontFamily: CONSOLE_MONO, fontSize: '0.62rem', color: '#64748b', fontWeight: 600 }}>
                  CURRENT STAGE: <strong style={{ color: '#0f172a' }}>{job?.current_stage?.toUpperCase() || 'STANDBY'}</strong>
                </span>

                {/* Launch / Cancel / Resume Actions */}
                {!job ? (
                  <button
                    onClick={handleLaunchJob}
                    disabled={launching || !selectedMission?.id}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '5px',
                      background: '#0284c7',
                      border: '1px solid #0284c7',
                      color: '#ffffff',
                      fontFamily: CONSOLE_MONO,
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      cursor: launching ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Play size={11} />
                    <span>{launching ? 'INITIALIZING...' : 'START RECONSTRUCTION'}</span>
                  </button>
                ) : isRunning ? (
                  <button
                    onClick={handleCancelJob}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '5px',
                      background: '#ffffff',
                      border: '1px solid #fecdd3',
                      color: '#e11d48',
                      fontFamily: CONSOLE_MONO,
                      fontSize: '0.66rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    CANCEL JOB
                  </button>
                ) : (job.status === 'failed' || job.status === 'cancelled') ? (
                  <button
                    onClick={() => handleResumeStage(job.error_stage)}
                    disabled={resuming}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '5px',
                      background: '#0284c7',
                      border: '1px solid #0284c7',
                      color: '#ffffff',
                      fontFamily: CONSOLE_MONO,
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    <RotateCw size={11} />
                    <span>{resuming ? 'RESUMING...' : 'RESUME RECONSTRUCTION'}</span>
                  </button>
                ) : null}
              </div>
            </div>

            <div style={STYLES.sectionBody}>
              {/* Telemetry Strip: Hardware, Timer & Progress */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '10px',
                marginBottom: '20px'
              }}>
                <div style={STYLES.dataCell}>
                  <div style={STYLES.cellLabel}>COMPUTE DEVICE</div>
                  <div style={{ ...STYLES.cellValue, color: '#0284c7' }}>
                    {job?.active_device?.toUpperCase() || (systemStatus?.gpu_available ? 'CUDA GPU' : 'CPU')}
                  </div>
                </div>
                <div style={STYLES.dataCell}>
                  <div style={STYLES.cellLabel}>ELAPSED RUNTIME</div>
                  <div style={STYLES.cellValue}>{formatTime(elapsedSec)}</div>
                </div>
                <div style={STYLES.dataCell}>
                  <div style={STYLES.cellLabel}>MEASURED PROGRESS</div>
                  <div style={{ ...STYLES.cellValue, color: '#059669' }}>{job?.progress_percent || 0}%</div>
                </div>
                <div style={STYLES.dataCell}>
                  <div style={STYLES.cellLabel}>STAGE ORDER</div>
                  <div style={STYLES.cellValue}>
                    {stages.find(s => s.stage_name === job?.current_stage)?.stage_order || (isFinished ? '13' : '—')} / 13
                  </div>
                </div>
              </div>

              {/* Measured Progress Bar */}
              <div style={{ marginBottom: '22px' }}>
                <div style={{
                  height: '6px',
                  background: '#e2e8f0',
                  borderRadius: '3px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    height: '100%',
                    width: `${job?.progress_percent || 0}%`,
                    background: job?.status === 'failed' ? '#e11d48' : 'linear-gradient(90deg, #0284c7, #0d9488)',
                    borderRadius: '3px',
                    transition: 'width 0.4s ease'
                  }} />
                </div>
              </div>

              {/* ── PREMIUM VERTICAL PIPELINE (THE 9 REQUESTED STAGES) ──────── */}
              <div style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '16px 20px',
                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.02)'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '14px',
                  paddingBottom: '8px',
                  borderBottom: '1px solid #f1f5f9'
                }}>
                  <span style={{
                    fontFamily: CONSOLE_MONO,
                    fontSize: '0.65rem',
                    fontWeight: 800,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: '#64748b'
                  }}>
                    RECONSTRUCTION PIPELINE EXECUTION
                  </span>
                  <button
                    onClick={() => setShowStageDetails(!showStageDetails)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#0284c7',
                      fontFamily: CONSOLE_MONO,
                      fontSize: '0.62rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <span>{showStageDetails ? 'COLLAPSE DETAILED VIEW' : 'EXPAND 13-STAGE ARCHITECTURE'}</span>
                    <ChevronDown size={12} style={{ transform: showStageDetails ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  </button>
                </div>

                {/* Vertical Stage Stack */}
                <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
                  {VERTICAL_STAGES.map((step, idx) => {
                    const status = step.resolveStatus(job, selectedMission, stages);
                    const metric = step.getMetric ? step.getMetric(metrics) : null;
                    const stageRecord = stages.find(s => s.stage_name === step.id || s.stage_name === step.backendStage);
                    const execTime = stageRecord?.execution_time_seconds;
                    const isLast = idx === VERTICAL_STAGES.length - 1;

                    return (
                      <div key={step.id} style={{ display: 'flex', alignItems: 'flex-start', position: 'relative', minHeight: '44px' }}>
                        
                        {/* Connecting Line */}
                        {!isLast && (
                          <div style={{
                            position: 'absolute',
                            top: '22px',
                            left: '11px',
                            bottom: '-4px',
                            width: '2px',
                            background: status === 'completed' ? '#a7f3d0' : (status === 'running' ? '#bae6fd' : '#e2e8f0'),
                            zIndex: 1
                          }} />
                        )}

                        {/* Indicator glyph (✓, ●, ○, ✕) */}
                        <div style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          marginRight: '14px',
                          marginTop: '2px',
                          position: 'relative',
                          zIndex: 2,
                          background: status === 'completed' ? '#ecfdf5' : (status === 'running' ? '#f0f9ff' : (status === 'failed' ? '#fff1f2' : '#ffffff')),
                          border: status === 'completed' ? '1.5px solid #059669' : (status === 'running' ? '1.5px solid #0284c7' : (status === 'failed' ? '1.5px solid #e11d48' : '1px solid #cbd5e1')),
                          boxShadow: status === 'running' ? '0 0 0 3px rgba(2, 132, 199, 0.15)' : 'none'
                        }}>
                          {status === 'completed' && (
                            <span style={{ color: '#059669', fontWeight: 900, fontSize: '0.8rem', lineHeight: 1 }}>✓</span>
                          )}
                          {status === 'running' && (
                            <span className="animate-pulse" style={{ color: '#0284c7', fontWeight: 900, fontSize: '0.8rem', lineHeight: 1 }}>●</span>
                          )}
                          {status === 'failed' && (
                            <span style={{ color: '#e11d48', fontWeight: 900, fontSize: '0.75rem', lineHeight: 1 }}>✕</span>
                          )}
                          {status === 'pending' && (
                            <span style={{ color: '#94a3b8', fontSize: '0.75rem', lineHeight: 1 }}>○</span>
                          )}
                        </div>

                        {/* Stage Label & Details */}
                        <div style={{
                          flex: 1,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          paddingBottom: '14px',
                          borderBottom: isLast ? 'none' : '1px solid #f8fafc'
                        }}>
                          <div>
                            <div style={{
                              fontFamily: CONSOLE_MONO,
                              fontSize: '0.75rem',
                              fontWeight: status === 'running' || status === 'completed' ? 800 : 600,
                              letterSpacing: '0.06em',
                              color: status === 'running' ? '#0284c7' : (status === 'completed' ? '#0f172a' : '#64748b'),
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}>
                              <span>{step.label}</span>
                              {metric && (
                                <span style={{
                                  fontSize: '0.62rem',
                                  fontWeight: 700,
                                  color: '#059669',
                                  background: '#ecfdf5',
                                  padding: '1px 5px',
                                  borderRadius: '3px'
                                }}>
                                  {metric}
                                </span>
                              )}
                            </div>
                            <div style={{
                              fontFamily: CONSOLE_MONO,
                              fontSize: '0.62rem',
                              color: '#94a3b8',
                              marginTop: '2px'
                            }}>
                              {step.desc}
                            </div>
                          </div>

                          {/* Time & State Badge */}
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            {execTime > 0 && (
                              <div style={{ fontFamily: CONSOLE_MONO, fontSize: '0.65rem', color: '#64748b', fontWeight: 600 }}>
                                {execTime.toFixed(1)}s
                              </div>
                            )}
                            <span style={{
                              fontFamily: CONSOLE_MONO,
                              fontSize: '0.58rem',
                              fontWeight: 700,
                              letterSpacing: '0.06em',
                              color: status === 'completed' ? '#059669' : (status === 'running' ? '#0284c7' : (status === 'failed' ? '#e11d48' : '#94a3b8'))
                            }}>
                              {status.toUpperCase()}
                            </span>
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Detailed 13-Stage Drawer (Collapsible) */}
              {showStageDetails && (
                <div style={{ marginTop: '16px' }}>
                  <StagePipelineView
                    stages={stages}
                    currentStage={job?.current_stage}
                    onResumeStage={handleResumeStage}
                    isRunning={isRunning || resuming}
                  />
                </div>
              )}
            </div>
          </div>

          {/* ── SECTION 04: OUTPUT ─────────────────────────────────────────── */}
          <div style={STYLES.sectionCard}>
            <div style={STYLES.sectionHeader}>
              <div style={STYLES.sectionTitle}>
                <Box size={13} color="#0284c7" />
                <span>OUTPUT</span>
              </div>
              <span style={{ fontFamily: CONSOLE_MONO, fontSize: '0.62rem', color: isFinished ? '#059669' : '#64748b', fontWeight: 700 }}>
                {isFinished ? '✓ DUAL-TIER MODELS CERTIFIED' : (rapidModelAvailable ? '● LEVEL 1 READY' : '○ STANDBY')}
              </span>
            </div>

            <div style={STYLES.sectionBody}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                
                {/* Level 1: Rapid Model Output */}
                <div style={{
                  background: rapidModelAvailable ? '#f0fdf4' : '#f8fafc',
                  border: rapidModelAvailable ? '1px solid #86efac' : '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Zap size={14} color="#0284c7" />
                        <span style={{ fontFamily: CONSOLE_MONO, fontSize: '0.74rem', fontWeight: 800, color: '#0f172a' }}>
                          LEVEL 1 — RAPID MODEL
                        </span>
                      </div>
                      <span style={{
                        fontFamily: CONSOLE_MONO,
                        fontSize: '0.58rem',
                        fontWeight: 700,
                        color: rapidModelAvailable ? '#059669' : '#64748b',
                        background: rapidModelAvailable ? '#dcfce7' : '#e2e8f0',
                        padding: '1px 5px',
                        borderRadius: '3px'
                      }}>
                        {rapidModelAvailable ? 'READY' : 'GENERATING...'}
                      </span>
                    </div>
                    <p style={{ fontFamily: CONSOLE_MONO, fontSize: '0.64rem', color: '#64748b', lineHeight: 1.4, margin: '4px 0 12px 0' }}>
                      Coarse 3D sparse point cloud &amp; reconstructed camera trajectory. Immediate spatial awareness.
                    </p>
                  </div>

                  <button
                    onClick={() => setActivePage('viewer')}
                    disabled={!rapidModelAvailable}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '5px',
                      background: rapidModelAvailable ? '#ffffff' : '#f1f5f9',
                      border: rapidModelAvailable ? '1px solid #0284c7' : '1px solid #cbd5e1',
                      color: rapidModelAvailable ? '#0284c7' : '#94a3b8',
                      fontFamily: CONSOLE_MONO,
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      cursor: rapidModelAvailable ? 'pointer' : 'not-allowed',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <Box size={12} />
                    <span>INSPECT RAPID MODEL IN 3D</span>
                  </button>
                </div>

                {/* Level 2: Refined Digital Twin Output */}
                <div style={{
                  background: isFinished ? '#ecfdf5' : '#f8fafc',
                  border: isFinished ? '1px solid #6ee7b7' : '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Sparkles size={14} color="#059669" />
                        <span style={{ fontFamily: CONSOLE_MONO, fontSize: '0.74rem', fontWeight: 800, color: '#0f172a' }}>
                          LEVEL 2 — REFINED TWIN
                        </span>
                      </div>
                      <span style={{
                        fontFamily: CONSOLE_MONO,
                        fontSize: '0.58rem',
                        fontWeight: 700,
                        color: isFinished ? '#059669' : '#64748b',
                        background: isFinished ? '#d1fae5' : '#e2e8f0',
                        padding: '1px 5px',
                        borderRadius: '3px'
                      }}>
                        {isFinished ? 'CERTIFIED' : 'PENDING'}
                      </span>
                    </div>
                    <p style={{ fontFamily: CONSOLE_MONO, fontSize: '0.64rem', color: '#64748b', lineHeight: 1.4, margin: '4px 0 12px 0' }}>
                      High-density dense point cloud, textured watertight mesh (OBJ/GLB) with 8-stream confidence classification.
                    </p>
                  </div>

                  <button
                    onClick={() => setActivePage('viewer')}
                    disabled={!isFinished}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: '5px',
                      background: isFinished ? '#059669' : '#f1f5f9',
                      border: isFinished ? '1px solid #059669' : '1px solid #cbd5e1',
                      color: isFinished ? '#ffffff' : '#94a3b8',
                      fontFamily: CONSOLE_MONO,
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      cursor: isFinished ? 'pointer' : 'not-allowed',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <Box size={12} />
                    <span>LAUNCH HIGH-FIDELITY 3D TWIN</span>
                  </button>
                </div>

              </div>

              {/* Quality Report & Export links */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => setActivePage('analytics')}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                    color: '#334155',
                    fontFamily: CONSOLE_MONO,
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <BarChart3 size={13} color="#0284c7" />
                  <span>QUALITY &amp; ACCURACY ANALYTICS</span>
                </button>

                {job?.id && isFinished && (
                  <a
                    href={apiClient.getExportBundleUrl(job.id)}
                    download
                    style={{
                      padding: '8px 14px',
                      borderRadius: '6px',
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      color: '#059669',
                      fontFamily: CONSOLE_MONO,
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      textDecoration: 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <Download size={13} />
                    <span>EXPORT BUNDLE (ZIP)</span>
                  </a>
                )}
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
