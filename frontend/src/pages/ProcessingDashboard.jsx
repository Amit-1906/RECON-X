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
  ArrowRight
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
      <div style={{ maxWidth: '1200px', margin: '80px auto', textAlign: 'center', color: 'var(--text-dim)' }}>
        <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px auto' }} />
        <p>Connecting to reconstruction worker node...</p>
      </div>
    );
  }

  if (!job) {
    return (
      <div style={{ maxWidth: '800px', margin: '60px auto', padding: '40px', textAlign: 'center' }} className="glass-panel">
        <Activity size={48} color="var(--text-dim)" style={{ margin: '0 auto 16px auto' }} />
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fff' }}>No Active Reconstruction Job</h2>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '8px', marginBottom: '24px' }}>
          Select or launch a 3D reconstruction mission from the flight data ingestion page.
        </p>
        <button onClick={() => setActivePage('upload')} className="btn-primary">
          Upload Video & Launch Job
        </button>
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
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 20px' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff' }}>Processing Dashboard</h1>
            <StatusBadge status={job.status} />
          </div>
          <p className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            JOB ID: {job.id} • DEVICE: {job.active_device?.toUpperCase()}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {rapidModelAvailable && (
            <button 
              onClick={() => setActivePage('viewer')} 
              className="btn-primary"
              style={{ background: 'linear-gradient(135deg, #0284c7, #06b6d4)', boxShadow: '0 0 16px rgba(6, 182, 212, 0.4)' }}
            >
              <Zap size={15} /> Open Level 1 Rapid Model
            </button>
          )}

          {isFinished && (
            <>
              <button onClick={() => setActivePage('viewer')} className="btn-primary" style={{ background: 'linear-gradient(135deg, #059669, #10b981)' }}>
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
              style={{ color: '#fb7185', borderColor: 'rgba(244, 63, 94, 0.3)' }}
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
        <div style={{ background: 'rgba(244, 63, 94, 0.15)', border: '1px solid var(--danger)', padding: '12px 16px', borderRadius: '8px', color: '#fb7185', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {/* Real-time Hardware & Execution Summary Card */}
      <div className="glass-panel" style={{ padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          {/* 1. Elapsed Time */}
          <div style={{ padding: '12px 16px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-dim)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
              <Clock size={14} color="#38bdf8" /> Elapsed Time
            </div>
            <div className="font-mono" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', marginTop: '4px' }}>
              {formatTime(elapsedSec)}
            </div>
            <span style={{ fontSize: '0.7rem', color: isRunning ? '#38bdf8' : 'var(--text-dim)' }}>
              {isRunning ? '● Actively computing' : (isFinished ? 'Completed successfully' : 'Idle')}
            </span>
          </div>

          {/* 2. Current Stage */}
          <div style={{ padding: '12px 16px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-dim)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
              <Layers size={14} color="#06b6d4" /> Current Stage
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', marginTop: '4px', textTransform: 'capitalize' }}>
              {job.current_stage?.replace(/_/g, ' ')}
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
              Stage {stages.find(s => s.stage_name === job.current_stage)?.stage_order || '-' } of {totalStagesCount}
            </span>
          </div>

          {/* 3. GPU / CPU Status */}
          <div style={{ padding: '12px 16px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-dim)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
              <Cpu size={14} color="#10b981" /> GPU / CPU Status
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', marginTop: '4px' }}>
              {systemStatus ? (
                systemStatus.gpu_available ? (
                  <span style={{ color: '#10b981' }}>CUDA ({systemStatus.vram_used_gb} / {systemStatus.vram_total_gb} GB)</span>
                ) : (
                  <span>Host CPU ({systemStatus.cpu_percent}%)</span>
                )
              ) : (
                job.active_device?.toUpperCase()
              )}
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
              RAM: {systemStatus ? `${systemStatus.ram_used_gb} / ${systemStatus.ram_total_gb} GB (${systemStatus.ram_percent}%)` : 'Monitoring'}
            </span>
          </div>

          {/* 4. Measured Stage Progress (Non-Fake) */}
          <div style={{ padding: '12px 16px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-dim)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
                <Activity size={14} color="#eab308" /> Measured Progress
              </div>
              <span className="font-mono" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#38bdf8' }}>
                {job.progress_percent || 0}%
              </span>
            </div>
            <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', marginTop: '8px', overflow: 'hidden' }}>
              <div style={{
                width: `${job.progress_percent || 0}%`,
                height: '100%',
                background: job.status === 'failed' ? 'var(--danger)' : 'linear-gradient(90deg, #06b6d4, #38bdf8)',
                transition: 'width 0.4s ease'
              }} />
            </div>
            <span style={{ fontSize: '0.68rem', color: '#94a3b8', marginTop: '4px', display: 'block' }}>
              {completedStagesCount} of {totalStagesCount} stages verified • Strictly verifiable progress
            </span>
          </div>
        </div>
      </div>

      {/* Phase 13: Dual-Tier Progressive Model Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        {/* Level 1: Rapid Model */}
        <div style={{
          backgroundColor: '#0f172a',
          border: rapidModelAvailable ? '1px solid #0284c7' : '1px solid #1e293b',
          borderRadius: '8px',
          padding: '16px 20px',
          position: 'relative'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={16} color="#38bdf8" />
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>LEVEL 1 — RAPID MODEL</h3>
            </div>
            {rapidModelAvailable ? (
              <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>
                READY
              </span>
            ) : (
              <span style={{ background: 'rgba(255, 255, 255, 0.05)', color: 'var(--text-dim)', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px' }}>
                GENERATING AT STAGE 6...
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
            Coarse 3D geometry from keyframes & Structure-from-Motion. Optimized for instant situational awareness.
          </p>
          {rapidModelAvailable ? (
            <button 
              onClick={() => setActivePage('viewer')}
              className="btn-secondary"
              style={{ fontSize: '0.78rem', padding: '6px 12px', width: '100%', borderColor: '#0284c7', color: '#38bdf8' }}
            >
              <Box size={14} /> Preview Rapid Model in 3D Viewer
            </button>
          ) : (
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
              Unlocked as soon as camera trajectory & sparse 3D geometry are triangulated.
            </div>
          )}
        </div>

        {/* Level 2: Refined Model */}
        <div style={{
          backgroundColor: '#0f172a',
          border: isFinished ? '1px solid #10b981' : '1px solid #1e293b',
          borderRadius: '8px',
          padding: '16px 20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={16} color="#10b981" />
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>LEVEL 2 — REFINED MODEL</h3>
            </div>
            {isFinished ? (
              <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: '4px' }}>
                COMPLETED
              </span>
            ) : (
              <span style={{ background: 'rgba(255, 255, 255, 0.05)', color: '#38bdf8', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px' }}>
                GENERATING IN BACKGROUND...
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
            High-density MVS stereo point cloud, watertight surface mesh, PBR textures & 8-stream confidence map.
          </p>
          {isFinished ? (
            <button 
              onClick={() => setActivePage('viewer')}
              className="btn-primary"
              style={{ fontSize: '0.78rem', padding: '6px 12px', width: '100%', background: 'linear-gradient(135deg, #059669, #10b981)' }}
            >
              <Box size={14} /> Open High-Fidelity 3D Digital Twin
            </button>
          ) : (
            <div style={{ fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
              Refining dense depth maps, texture atlas, and confidence fields.
            </div>
          )}
        </div>
      </div>

      {/* Main Grid: Real-Time Stage Checklist (Left) & Pipeline Interactive View (Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '20px' }}>
        {/* Real-Time Stage Checklist matching user requirements */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
            Real-Time Pipeline Status
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginBottom: '16px' }}>
            Live execution status reflecting actual processing
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: isCurr ? 'rgba(56, 189, 248, 0.1)' : (isComp ? 'rgba(16, 185, 129, 0.04)' : 'transparent'),
                    border: isCurr ? '1px solid rgba(56, 189, 248, 0.3)' : '1px solid transparent',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ marginTop: '2px' }}>
                    {isComp && (
                      <span style={{ color: '#10b981', fontWeight: 800, fontSize: '0.95rem' }}>✓</span>
                    )}
                    {isCurr && (
                      <span className="animate-pulse" style={{ color: '#38bdf8', fontWeight: 800, fontSize: '0.95rem' }}>●</span>
                    )}
                    {isPend && (
                      <span style={{ color: '#64748b', fontSize: '0.95rem' }}>○</span>
                    )}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{
                        fontSize: '0.82rem',
                        fontWeight: isComp || isCurr ? 700 : 500,
                        color: isComp ? '#fff' : (isCurr ? '#38bdf8' : '#64748b')
                      }}>
                        {item.title}
                      </span>
                      {stageRecord?.execution_time_seconds > 0 && (
                        <span className="font-mono" style={{ fontSize: '0.68rem', color: '#64748b' }}>
                          {stageRecord.execution_time_seconds}s
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '0.7rem', color: isCurr ? '#94a3b8' : '#64748b', marginTop: '1px' }}>
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
  );
}
