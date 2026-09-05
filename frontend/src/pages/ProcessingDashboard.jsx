import React, { useEffect, useState, useRef } from 'react';
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
  Upload
} from 'lucide-react';
import { apiClient } from '../api/client';
import StatusBadge from '../components/StatusBadge';
import StagePipelineView from '../components/StagePipelineView';

export default function ProcessingDashboard({ 
  activeJobId, 
  setActiveJobId, 
  activeMissionId, 
  setActivePage 
}) {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [resuming, setResuming] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [systemStatus, setSystemStatus] = useState(null);
  const pollIntervalRef = useRef(null);

  const fetchJobStatus = async () => {
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
      setLoading(false);

      if (data.status === 'completed' || data.status === 'failed') {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to poll job status');
      setLoading(false);
    }
  };

  // Poll job status every 2 seconds
  useEffect(() => {
    fetchJobStatus();
    pollIntervalRef.current = setInterval(fetchJobStatus, 2000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [activeJobId, activeMissionId]);

  // Live timer counting elapsed seconds
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

  const handleResumeStage = async (stageName) => {
    if (!job) return;
    setResuming(true);
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

  const formatTime = (totalSec) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="geospatial-canvas" style={{ minHeight: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', position: 'relative' }}>
        <div className="topographic-overlay" />
        <div className="geo-card" style={{ padding: '36px 48px', textAlign: 'center', position: 'relative', zIndex: 2, background: 'rgba(255, 255, 255, 0.92)', borderRadius: '18px' }}>
          <RefreshCw size={32} color="#0284c7" className="animate-spin" style={{ margin: '0 auto 16px auto' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
            Connecting to Reconstruction Node
          </h3>
          <p style={{ fontSize: '0.86rem', color: '#64748b', margin: 0 }}>
            Querying active photogrammetry telemetry and worker state...
          </p>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="geospatial-canvas" style={{ minHeight: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px 72px 24px', position: 'relative', overflow: 'hidden' }}>
        <div className="topographic-overlay" />
        
        {/* Subtle background geospatial scanning line */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '2px',
          background: 'linear-gradient(90deg, transparent, rgba(2, 132, 199, 0.4), transparent)',
          animation: 'scanSweepBg 8s ease-in-out infinite',
          pointerEvents: 'none',
          zIndex: 1
        }} />

        {/* ── Main Workstation Card ── */}
        <div 
          className="geo-card" 
          style={{
            maxWidth: '780px',
            width: '100%',
            padding: '48px 42px',
            textAlign: 'center',
            position: 'relative',
            zIndex: 2,
            background: 'rgba(255, 255, 255, 0.90)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderRadius: '24px',
            border: '1.5px solid rgba(14, 165, 233, 0.22)',
            boxShadow: '0 16px 48px -12px rgba(2, 132, 199, 0.08), 0 4px 20px -2px rgba(15, 23, 42, 0.04)'
          }}
        >
          {/* Top Status & Telemetry HUD Chips */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '22px', flexWrap: 'wrap' }}>
            <span className="telemetry-chip">
              PHOTOGRAMMETRIC PIPELINE ENGINE
            </span>
            <span className="telemetry-chip" style={{ color: '#0d9488', borderColor: 'rgba(13, 148, 136, 0.25)', background: 'rgba(13, 148, 136, 0.08)' }}>
              STAGE STATUS: STANDBY
            </span>
          </div>

          {/* ── 3D Photogrammetry Empty State Visual ── */}
          <div style={{
            position: 'relative',
            maxWidth: '540px',
            margin: '0 auto',
            padding: '16px',
            background: 'linear-gradient(180deg, rgba(240, 249, 255, 0.6) 0%, rgba(224, 242, 254, 0.25) 100%)',
            borderRadius: '16px',
            border: '1px solid rgba(14, 165, 233, 0.18)',
            overflow: 'hidden'
          }}>
            <svg 
              viewBox="0 0 520 200" 
              style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
            >
              <defs>
                {/* Scanning Laser Gradient */}
                <linearGradient id="laserGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="transparent" />
                  <stop offset="50%" stopColor="#0284c7" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="transparent" />
                </linearGradient>

                {/* Frustum Ray Gradient */}
                <linearGradient id="frustumRay" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#0284c7" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#0d9488" stopOpacity="0.05" />
                </linearGradient>

                {/* Surface Fill Gradient */}
                <linearGradient id="terrainSurface" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="rgba(2, 132, 199, 0.12)" />
                  <stop offset="100%" stopColor="rgba(13, 148, 136, 0.03)" />
                </linearGradient>
              </defs>

              {/* Faint Background Coordinate Grid */}
              <g stroke="rgba(2, 132, 199, 0.1)" strokeWidth="0.75" strokeDasharray="3,4">
                <line x1="40" y1="20" x2="480" y2="20" />
                <line x1="40" y1="60" x2="480" y2="60" />
                <line x1="40" y1="100" x2="480" y2="100" />
                <line x1="40" y1="140" x2="480" y2="140" />
                <line x1="40" y1="180" x2="480" y2="180" />
                <line x1="100" y1="20" x2="100" y2="190" />
                <line x1="200" y1="20" x2="200" y2="190" />
                <line x1="320" y1="20" x2="320" y2="190" />
                <line x1="420" y1="20" x2="420" y2="190" />
              </g>

              {/* 1. Drone Flight Path (Dashed spline curve) */}
              <path 
                d="M 50,45 C 130,20 200,60 260,35 C 320,15 390,50 470,30" 
                fill="none" 
                stroke="#0284c7" 
                strokeWidth="1.8" 
                strokeDasharray="6,4"
                style={{ animation: 'pathDash 6s linear infinite' }}
              />

              {/* Flight Path Waypoint Nodes */}
              <circle cx="110" cy="30" r="3.5" fill="#ffffff" stroke="#0284c7" strokeWidth="1.5" />
              <circle cx="390" cy="38" r="3.5" fill="#ffffff" stroke="#0284c7" strokeWidth="1.5" />

              {/* 2. Drone Surveying Position & Frustum Beams */}
              <g style={{ animation: 'droneHover 4s ease-in-out infinite' }}>
                {/* Optical Camera Frustum Scanning Rays */}
                <polygon 
                  points="260,35 150,150 370,150" 
                  fill="url(#frustumRay)" 
                  stroke="rgba(2, 132, 199, 0.22)" 
                  strokeWidth="0.8"
                />

                {/* Drone Glyph */}
                <circle cx="260" cy="35" r="7" fill="#0284c7" />
                <circle cx="260" cy="35" r="14" fill="none" stroke="#0284c7" strokeWidth="1" strokeDasharray="3,3" />
                {/* Rotor Arms */}
                <line x1="244" y1="23" x2="276" y2="47" stroke="#0369a1" strokeWidth="1.8" strokeLinecap="round" />
                <line x1="244" y1="47" x2="276" y2="23" stroke="#0369a1" strokeWidth="1.8" strokeLinecap="round" />
                {/* Rotors */}
                <ellipse cx="244" cy="23" rx="6" ry="2" fill="none" stroke="#38bdf8" strokeWidth="1" />
                <ellipse cx="276" cy="47" rx="6" ry="2" fill="none" stroke="#38bdf8" strokeWidth="1" />
                <ellipse cx="244" cy="47" rx="6" ry="2" fill="none" stroke="#38bdf8" strokeWidth="1" />
                <ellipse cx="276" cy="23" rx="6" ry="2" fill="none" stroke="#38bdf8" strokeWidth="1" />
              </g>

              {/* 3. Sparse Aerial Points & Tie Points */}
              <g fill="#0284c7">
                <circle cx="180" cy="85" r="2.5" opacity="0.8" style={{ animation: 'pulsePoint 3s infinite 0.2s' }} />
                <circle cx="220" cy="105" r="2" opacity="0.7" style={{ animation: 'pulsePoint 3s infinite 0.6s' }} />
                <circle cx="280" cy="95" r="2.5" opacity="0.9" style={{ animation: 'pulsePoint 3s infinite 0.4s' }} />
                <circle cx="330" cy="80" r="2" opacity="0.7" style={{ animation: 'pulsePoint 3s infinite 0.8s' }} />
                <circle cx="250" cy="115" r="2" opacity="0.8" style={{ animation: 'pulsePoint 3s infinite 0.1s' }} />
              </g>

              {/* 4. 3D Reconstructed Mesh & Surface Geometry */}
              <polygon 
                points="80,180 160,140 220,155 260,125 320,150 380,135 440,175 360,195 200,195" 
                fill="url(#terrainSurface)" 
                stroke="#0284c7" 
                strokeWidth="1.2" 
                strokeLinejoin="round"
              />

              {/* Mesh Facet Triangulation Lines */}
              <g stroke="rgba(2, 132, 199, 0.35)" strokeWidth="0.75" fill="none">
                <line x1="160" y1="140" x2="260" y2="125" />
                <line x1="220" y1="155" x2="260" y2="125" />
                <line x1="260" y1="125" x2="380" y2="135" />
                <line x1="220" y1="155" x2="320" y2="150" />
                <line x1="320" y1="150" x2="380" y2="135" />
                <line x1="160" y1="140" x2="220" y2="155" />
                <line x1="80" y1="180" x2="220" y2="155" />
                <line x1="220" y1="155" x2="200" y2="195" />
                <line x1="320" y1="150" x2="360" y2="195" />
                <line x1="380" y1="135" x2="440" y2="175" />
                <line x1="440" y1="175" x2="360" y2="195" />
              </g>

              {/* 5. 3D Point Cloud Vertices */}
              <g fill="#0d9488">
                <circle cx="160" cy="140" r="3" />
                <circle cx="220" cy="155" r="3" />
                <circle cx="260" cy="125" r="3.5" fill="#0284c7" />
                <circle cx="320" cy="150" r="3" />
                <circle cx="380" cy="135" r="3" />
                <circle cx="80" cy="180" r="2.5" />
                <circle cx="440" cy="175" r="2.5" />
                <circle cx="200" cy="195" r="2.5" />
                <circle cx="360" cy="195" r="2.5" />
              </g>

              {/* 6. Dynamic Laser Scan Sweep Line */}
              <g style={{ animation: 'scanLaser 5s ease-in-out infinite' }}>
                <line x1="60" y1="0" x2="460" y2="0" stroke="url(#laserGradient)" strokeWidth="2.5" />
              </g>

              {/* Engineering Annotations & Coordinates */}
              <text x="60" y="192" fill="#0369a1" fontSize="8" fontFamily="var(--font-mono)" fontWeight="600">
                [GRID 10m] EPSG:4326
              </text>
              <text x="460" y="192" fill="#0369a1" fontSize="8" fontFamily="var(--font-mono)" fontWeight="600" textAnchor="end">
                STEREO BASELINE: 1.8m
              </text>
            </svg>
          </div>

          {/* Title */}
          <h2 style={{
            fontSize: '1.9rem',
            fontWeight: 800,
            color: '#0f172a',
            letterSpacing: '-0.025em',
            marginTop: '26px',
            marginBottom: '0'
          }}>
            No Active Reconstruction Job
          </h2>

          {/* Supporting Text */}
          <p style={{
            fontSize: '0.96rem',
            color: '#64748b',
            marginTop: '10px',
            marginBottom: '32px',
            maxWidth: '520px',
            marginLeft: 'auto',
            marginRight: 'auto',
            lineHeight: 1.6
          }}>
            Select or launch a 3D reconstruction mission from the flight data ingestion page.
          </p>

          {/* Functional Button */}
          <button 
            onClick={() => setActivePage('upload')} 
            className="geo-btn-primary"
            style={{
              padding: '13px 32px',
              fontSize: '0.94rem',
              fontWeight: 700,
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)',
              boxShadow: '0 4px 18px rgba(2, 132, 199, 0.32)',
              letterSpacing: '-0.01em',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              cursor: 'pointer'
            }}
          >
            <Upload size={18} />
            <span>Upload Video &amp; Launch Job</span>
          </button>
        </div>

        {/* CSS Animations */}
        <style>{`
          @keyframes scanSweepBg {
            0% { top: 0%; opacity: 0; }
            50% { opacity: 0.7; }
            100% { top: 100%; opacity: 0; }
          }
          @keyframes pathDash {
            to { stroke-dashoffset: -40; }
          }
          @keyframes droneHover {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-4px); }
          }
          @keyframes scanLaser {
            0% { transform: translateY(35px); opacity: 0; }
            30% { opacity: 0.85; }
            80% { opacity: 0.85; }
            100% { transform: translateY(185px); opacity: 0; }
          }
          @keyframes pulsePoint {
            0%, 100% { transform: scale(1); opacity: 0.6; }
            50% { transform: scale(1.35); opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  const isRunning = job.status === 'running' || job.status === 'resumed';
  const isFinished = job.status === 'completed';

  // Find real-time metrics from stages
  const metrics = job.real_time_metrics || {};
  const stages = job.stages || [];
  const completedStagesCount = stages.filter(s => s.status === 'completed').length;
  const totalStagesCount = stages.length || 13;

  // Real-time Stage Sequence matching user specifications
  const stageChecklist = [
    {
      id: "video_upload",
      title: "Video uploaded",
      detail: "Drone video & flight telemetry ingested",
      isCompleted: true
    },
    {
      id: "preprocessing",
      title: metrics.frames_extracted ? `${metrics.frames_extracted.toLocaleString()} frames extracted` : "Frame sampling",
      detail: "Adaptive frame extraction & color normalization",
      stageName: "preprocessing"
    },
    {
      id: "frame_quality",
      title: "Quality filter",
      detail: "Sharpness, luminance & motion blur filtering",
      stageName: "frame_quality"
    },
    {
      id: "dynamic_masking",
      title: metrics.dynamic_objects_masked !== null ? `Dynamic objects masked (${metrics.dynamic_objects_masked} detected)` : "Dynamic masking",
      detail: "YOLOv8-seg dynamic object occlusion filtering",
      stageName: "dynamic_masking"
    },
    {
      id: "keyframe_selection",
      title: metrics.keyframes_selected ? `${metrics.keyframes_selected} keyframes selected` : "Keyframe selection",
      detail: "Stationary frame pruning & baseline verification",
      stageName: "keyframe_selection"
    },
    {
      id: "pose_estimation",
      title: "Fast pose estimation",
      detail: "SIFT/ORB feature tracking & epipolar RANSAC",
      stageName: "pose_estimation"
    },
    {
      id: "geometry",
      title: metrics.cameras_registered ? `Camera trajectory estimated (${metrics.cameras_registered} cameras)` : "Coarse 3D geometry",
      detail: "Sparse Structure-from-Motion (Level 1 Rapid Model)",
      stageName: "geometry",
      hasRapidModel: true
    },
    {
      id: "dense_point_cloud",
      title: metrics.dense_points ? `Dense reconstruction (${metrics.dense_points.toLocaleString()} pts)` : "Dense reconstruction",
      detail: "Semi-Global Block Matching (SGBM) stereo disparity fields",
      stageName: "dense_point_cloud"
    },
    {
      id: "mesh_generation",
      title: metrics.triangles ? `Mesh surface generated (${metrics.triangles.toLocaleString()} tris)` : "Mesh generation",
      detail: "3D Delaunay spatial surface triangulation",
      stageName: "mesh_generation"
    },
    {
      id: "texture_mapping",
      title: "Texture mapping",
      detail: "Projective UV texture synthesis & seam reduction",
      stageName: "texture_mapping"
    },
    {
      id: "georeferencing",
      title: "Georeferencing",
      detail: "Sim(3) Helmert transformation to WGS84 & UTM coordinates",
      stageName: "georeferencing"
    },
    {
      id: "confidence_estimation",
      title: metrics.confidence_high_pct !== null ? `Confidence map (${metrics.confidence_high_pct}% high)` : "Confidence estimation",
      detail: "Phase 12 evidence-based 8-stream confidence classification",
      stageName: "confidence_estimation"
    },
    {
      id: "validation",
      title: "Final validation & certification",
      detail: "GSD precision audit & photogrammetric quality certification",
      stageName: "validation"
    }
  ];

  const rapidModelAvailable = job.rapid_model_ready;

  return (
    <div className="geospatial-canvas" style={{ minHeight: 'calc(100vh - 120px)', position: 'relative', overflow: 'hidden', paddingBottom: '40px' }}>
      <div style={{ maxWidth: '1360px', margin: '0 auto', padding: '32px 24px 0 24px', position: 'relative', zIndex: 2 }}>
        {/* Header Banner */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.025em', margin: 0 }}>
                Processing Dashboard
              </h1>
              <StatusBadge status={job.status} />
            </div>
            <p className="font-mono" style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '4px' }}>
              JOB ID: <span style={{ color: '#334155', fontWeight: 600 }}>{job.id}</span> • DEVICE: <span style={{ color: '#0284c7', fontWeight: 700 }}>{job.active_device?.toUpperCase()}</span>
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {rapidModelAvailable && (
              <button 
                onClick={() => setActivePage('viewer')} 
                className="btn-primary"
                style={{ background: 'linear-gradient(135deg, #0284c7, #06b6d4)', boxShadow: '0 2px 10px rgba(2, 132, 199, 0.3)' }}
              >
                <Zap size={15} /> Open Level 1 Rapid Model
              </button>
            )}

            {isFinished && (
              <>
                <button onClick={() => setActivePage('viewer')} className="btn-primary" style={{ background: 'linear-gradient(135deg, #059669, #10b981)', borderColor: '#059669' }}>
                  <Sparkles size={15} /> Open Level 2 Refined Twin
                </button>
                <button onClick={() => setActivePage('analytics')} className="btn-secondary">
                  <BarChart3 size={15} /> Quality Report
                </button>
              </>
            )}

            {(job.status === 'running' || job.status === 'pending') && (
              <button 
                onClick={handleCancelJob} 
                className="btn-secondary"
                style={{ color: '#e11d48', borderColor: 'rgba(225, 29, 72, 0.3)' }}
              >
                Cancel Job
              </button>
            )}

            {(job.status === 'failed' || job.status === 'cancelled') && (
              <button 
                onClick={() => handleResumeStage(job.error_stage)} 
                disabled={resuming}
                className="btn-primary"
              >
                <RefreshCw size={15} /> {resuming ? 'Resuming...' : 'Resume Reconstruction'}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', padding: '12px 16px', borderRadius: '10px', color: '#b91c1c', marginBottom: '20px', fontWeight: 500 }}>
            {error}
          </div>
        )}

        {/* Real-time Hardware & Execution Summary Card */}
        <div style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '14px',
          padding: '24px',
          marginBottom: '20px',
          boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.05), 0 2px 6px -1px rgba(15, 23, 42, 0.02)'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
            {/* 1. Elapsed Time */}
            <div style={{ padding: '14px 18px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <Clock size={14} color="#0284c7" /> Elapsed Time
              </div>
              <div className="font-mono" style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                {formatTime(elapsedSec)}
              </div>
              <span style={{ fontSize: '0.72rem', color: isRunning ? '#0284c7' : '#64748b', fontWeight: isRunning ? 600 : 400 }}>
                {isRunning ? '● Actively computing' : (isFinished ? 'Completed successfully' : 'Idle')}
              </span>
            </div>

            {/* 2. Current Stage */}
            <div style={{ padding: '14px 18px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <Layers size={14} color="#0284c7" /> Current Stage
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', marginTop: '4px', textTransform: 'capitalize', letterSpacing: '-0.01em' }}>
                {job.current_stage?.replace(/_/g, ' ') || 'Standby'}
              </div>
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                Stage {stages.find(s => s.stage_name === job.current_stage)?.stage_order || '-' } of {totalStagesCount}
              </span>
            </div>

            {/* 3. GPU / CPU Status */}
            <div style={{ padding: '14px 18px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <Cpu size={14} color="#059669" /> GPU / CPU Status
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                {systemStatus ? (
                  systemStatus.gpu_available ? (
                    <span style={{ color: '#059669' }}>CUDA ({systemStatus.vram_used_gb} / {systemStatus.vram_total_gb} GB)</span>
                  ) : (
                    <span>Host CPU ({systemStatus.cpu_percent}%)</span>
                  )
                ) : (
                  job.active_device?.toUpperCase()
                )}
              </div>
              <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                RAM: {systemStatus ? `${systemStatus.ram_used_gb} / ${systemStatus.ram_total_gb} GB (${systemStatus.ram_percent}%)` : 'Monitoring'}
              </span>
            </div>

            {/* 4. Measured Stage Progress (Non-Fake) */}
            <div style={{ padding: '14px 18px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '0.74rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <Activity size={14} color="#d97706" /> Measured Progress
                </div>
                <span className="font-mono" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0284c7' }}>
                  {job.progress_percent || 0}%
                </span>
              </div>
              <div style={{ width: '100%', height: '7px', background: '#e2e8f0', borderRadius: '4px', marginTop: '8px', overflow: 'hidden' }}>
                <div style={{
                  width: `${job.progress_percent || 0}%`,
                  height: '100%',
                  background: job.status === 'failed' ? 'var(--danger)' : 'linear-gradient(90deg, #0284c7, #0ea5e9)',
                  transition: 'width 0.4s ease'
                }} />
              </div>
              <span style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '5px', display: 'block' }}>
                {completedStagesCount} of {totalStagesCount} stages verified • Strictly verifiable progress
              </span>
            </div>
          </div>
        </div>

        {/* Phase 13: Dual-Tier Progressive Model Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
          {/* Level 1: Rapid Model */}
          <div style={{
            backgroundColor: '#ffffff',
            border: rapidModelAvailable ? '1.5px solid #0284c7' : '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '20px',
            position: 'relative',
            boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.05)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={16} color="#0284c7" />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', letterSpacing: '0.02em', margin: 0 }}>LEVEL 1 — RAPID MODEL</h3>
              </div>
              {rapidModelAvailable ? (
                <span style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#059669', fontSize: '0.7rem', fontWeight: 700, padding: '3px 9px', borderRadius: '6px' }}>
                  READY
                </span>
              ) : (
                <span style={{ background: '#f1f5f9', color: '#64748b', fontSize: '0.7rem', padding: '3px 9px', borderRadius: '6px', fontWeight: 600 }}>
                  GENERATING AT STAGE 6...
                </span>
              )}
            </div>
            <p style={{ fontSize: '0.82rem', color: '#475569', marginBottom: '14px', lineHeight: 1.5, margin: '8px 0 14px 0' }}>
              Coarse 3D geometry from keyframes &amp; Structure-from-Motion. Optimized for instant situational awareness.
            </p>
            {rapidModelAvailable ? (
              <button 
                onClick={() => setActivePage('viewer')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '9px 14px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#0284c7',
                  backgroundColor: '#ffffff',
                  border: '1.5px solid #0284c7',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <Box size={14} /> Preview Rapid Model in 3D Viewer
              </button>
            ) : (
              <div style={{ fontSize: '0.76rem', color: '#94a3b8', fontStyle: 'italic' }}>
                Unlocked as soon as camera trajectory &amp; sparse 3D geometry are triangulated.
              </div>
            )}
          </div>

          {/* Level 2: Refined Model */}
          <div style={{
            backgroundColor: '#ffffff',
            border: isFinished ? '1.5px solid #059669' : '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '20px',
            boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.05)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={16} color="#059669" />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', letterSpacing: '0.02em', margin: 0 }}>LEVEL 2 — REFINED MODEL</h3>
              </div>
              {isFinished ? (
                <span style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#059669', fontSize: '0.7rem', fontWeight: 700, padding: '3px 9px', borderRadius: '6px' }}>
                  COMPLETED
                </span>
              ) : (
                <span style={{ background: 'rgba(2, 132, 199, 0.1)', color: '#0284c7', fontSize: '0.7rem', padding: '3px 9px', borderRadius: '6px', fontWeight: 600 }}>
                  GENERATING IN BACKGROUND...
                </span>
              )}
            </div>
            <p style={{ fontSize: '0.82rem', color: '#475569', marginBottom: '14px', lineHeight: 1.5, margin: '8px 0 14px 0' }}>
              High-density MVS stereo point cloud, watertight surface mesh, PBR textures &amp; 8-stream confidence map.
            </p>
            {isFinished ? (
              <button 
                onClick={() => setActivePage('viewer')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '9px 14px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: '#ffffff',
                  background: 'linear-gradient(135deg, #059669, #10b981)',
                  border: '1px solid #059669',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(5, 150, 105, 0.25)'
                }}
              >
                <Box size={14} /> Open High-Fidelity 3D Digital Twin
              </button>
            ) : (
              <div style={{ fontSize: '0.76rem', color: '#94a3b8', fontStyle: 'italic' }}>
                Refining dense depth maps, texture atlas, and confidence fields.
              </div>
            )}
          </div>
        </div>

        {/* Main Grid: Real-Time Stage Checklist (Left) & Pipeline Interactive View (Right) */}
        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '20px' }}>
          {/* Real-Time Stage Checklist matching user requirements */}
          <div style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '14px',
            padding: '24px',
            boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.05)'
          }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', marginBottom: '4px', letterSpacing: '-0.02em', margin: 0 }}>
              Real-Time Pipeline Status
            </h3>
            <p style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '3px', marginBottom: '18px' }}>
              Live execution status reflecting actual processing
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {stageChecklist.map((item, idx) => {
                const stageRecord = stages.find(s => s.stage_name === item.stageName);
                const isComp = item.isCompleted || (stageRecord && stageRecord.status === 'completed');
                const isCurr = stageRecord && (job.current_stage === item.stageName && isRunning);
                const isPend = !isComp && !isCurr;

                return (
                  <div 
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: isCurr ? 'rgba(2, 132, 199, 0.08)' : (isComp ? 'rgba(16, 185, 129, 0.06)' : '#f8fafc'),
                      border: isCurr ? '1.5px solid #0284c7' : (isComp ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid #e2e8f0'),
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ marginTop: '2px' }}>
                      {isComp && (
                        <span style={{ color: '#059669', fontWeight: 800, fontSize: '0.95rem' }}>✓</span>
                      )}
                      {isCurr && (
                        <span className="animate-pulse" style={{ color: '#0284c7', fontWeight: 800, fontSize: '0.95rem' }}>●</span>
                      )}
                      {isPend && (
                        <span style={{ color: '#94a3b8', fontSize: '0.95rem' }}>○</span>
                      )}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{
                          fontSize: '0.84rem',
                          fontWeight: isComp || isCurr ? 700 : 500,
                          color: isComp || isCurr ? '#0f172a' : '#64748b'
                        }}>
                          {item.title}
                        </span>
                        {stageRecord?.execution_time_seconds > 0 && (
                          <span className="font-mono" style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>
                            {stageRecord.execution_time_seconds}s
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px', margin: 0 }}>
                        {item.detail}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 13 Stage Detailed Interactive Drawer */}
          <div>
            <StagePipelineView
              stages={stages}
              currentStage={job.current_stage}
              onResumeStage={handleResumeStage}
              isRunning={isRunning || resuming}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
