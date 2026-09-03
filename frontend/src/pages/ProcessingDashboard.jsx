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
  Layers
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
  const pollIntervalRef = useRef(null);

  const fetchJobStatus = async () => {
    if (!activeJobId) {
      // Find latest job for active mission if available
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
      setLoading(false);

      // Stop polling if completed or failed
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

  useEffect(() => {
    fetchJobStatus();
    pollIntervalRef.current = setInterval(fetchJobStatus, 2000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [activeJobId, activeMissionId]);

  const handleResumeStage = async (stageName) => {
    if (!job) return;
    setResuming(true);
    try {
      const resumedJob = await apiClient.resumeJob(job.id, stageName);
      setJob(resumedJob);
      setResuming(false);
      // Restart polling
      if (!pollIntervalRef.current) {
        pollIntervalRef.current = setInterval(fetchJobStatus, 2000);
      }
    } catch (err) {
      setError(err.message || 'Failed to resume stage');
      setResuming(false);
    }
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

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '32px 20px' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#fff' }}>Processing Dashboard</h1>
            <StatusBadge status={job.status} />
          </div>
          <p className="font-mono" style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '4px' }}>
            JOB ID: {job.id} • DEVICE: {job.active_device?.toUpperCase()}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          {isFinished && (
            <>
              <button onClick={() => setActivePage('viewer')} className="btn-primary">
                <Box size={16} /> Open 3D Digital Twin
              </button>
              <button onClick={() => setActivePage('analytics')} className="btn-secondary">
                <BarChart3 size={16} /> Quality Report
              </button>
            </>
          )}

          {job.status === 'failed' && (
            <button 
              onClick={() => handleResumeStage(job.error_stage)} 
              disabled={resuming}
              className="btn-primary"
            >
              <RefreshCw size={16} /> {resuming ? 'Resuming...' : 'Resume From Failed Stage'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(244, 63, 94, 0.15)', border: '1px solid var(--danger)', padding: '12px 16px', borderRadius: '8px', color: '#fb7185', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {/* Progress Bar Card */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
              Current Pipeline Stage
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
              <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', textTransform: 'capitalize' }}>
                {job.current_stage?.replace(/_/g, ' ')}
              </span>
              {isRunning && <span className="animate-pulse-glow" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#38bdf8' }} />}
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
              Overall Progress
            </span>
            <div className="font-mono" style={{ fontSize: '1.3rem', fontWeight: 800, color: '#38bdf8' }}>
              {job.progress_percent || 0}%
            </div>
          </div>
        </div>

        {/* Progress Track */}
        <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{
            width: `${job.progress_percent || 0}%`,
            height: '100%',
            background: job.status === 'failed' ? 'var(--danger)' : 'linear-gradient(90deg, #06b6d4, #38bdf8)',
            transition: 'width 0.4s ease'
          }} />
        </div>
      </div>

      {/* 11 Stage Interactive Pipeline View */}
      <StagePipelineView
        stages={job.stages || []}
        currentStage={job.current_stage}
        onResumeStage={handleResumeStage}
        isRunning={isRunning || resuming}
      />
    </div>
  );
}
