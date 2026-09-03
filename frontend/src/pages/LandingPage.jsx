import React, { useEffect, useState } from 'react';
import { 
  Plane, 
  Layers, 
  Cpu, 
  ShieldCheck, 
  ArrowRight, 
  Activity, 
  CheckCircle2, 
  Box, 
  Sparkles,
  Zap,
  FolderOpen
} from 'lucide-react';
import { apiClient } from '../api/client';
import StatusBadge from '../components/StatusBadge';

export default function LandingPage({ setActivePage, setActiveMissionId, setActiveJobId }) {
  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.listMissions()
      .then(data => {
        setMissions(data);
        setLoading(false);
      })
      .catch(err => {
        console.warn("Could not load missions:", err);
        setLoading(false);
      });
  }, []);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px' }}>
      {/* Hero Section */}
      <div style={{ textAlign: 'center', marginBottom: '60px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px', borderRadius: '9999px', background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.3)', marginBottom: '20px' }}>
          <Sparkles size={14} color="#38bdf8" />
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#38bdf8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Production-Grade UAV Photogrammetry Engine
          </span>
        </div>

        <h1 style={{ fontSize: '3.2rem', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: '20px' }}>
          Single-Pass <span style={{ background: 'linear-gradient(135deg, #38bdf8 0%, #06b6d4 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>3D Digital Twin</span> Reconstruction
        </h1>

        <p style={{ fontSize: '1.15rem', color: 'var(--text-muted)', maxWidth: '750px', margin: '0 auto 32px auto', lineHeight: 1.6 }}>
          End-to-end computer vision and photogrammetry platform transforming raw UAV survey video and flight telemetry into georeferenced metric 3D point clouds and textured surface meshes.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
          <button 
            onClick={() => setActivePage('create-mission')}
            className="btn-primary"
            style={{ padding: '12px 24px', fontSize: '1rem' }}
          >
            <Plane size={18} /> Create New Mission
          </button>
          <button 
            onClick={() => setActivePage('dashboard')}
            className="btn-secondary"
            style={{ padding: '12px 24px', fontSize: '1rem' }}
          >
            <Activity size={18} /> View Pipeline Monitor
          </button>
        </div>
      </div>

      {/* 3 Core Architecture Pillars */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '60px' }}>
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: 'rgba(6, 182, 212, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
            <Layers size={22} color="#38bdf8" />
          </div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
            11 Independent Modules
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Every stage—from video unpacking to RANSAC pose estimation, triangulation, meshing, and georeferencing—has strict input/output contracts and is callable independently.
          </p>
        </div>

        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
            <CheckCircle2 size={22} color="#34d399" />
          </div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
            Resumable Checkpoints
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Intermediate outputs (manifests, camera poses, PLY point clouds, OBJ geometry) are persisted atomically. Failed stages can be resumed without restarting earlier computation.
          </p>
        </div>

        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
            <Zap size={22} color="#c084fc" />
          </div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
            Hardware Accelerated
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Automated hardware detection inspects PyTorch CUDA runtimes and GPU VRAM, falling back gracefully to optimized multi-threaded CPU execution when accelerators are absent.
          </p>
        </div>
      </div>

      {/* Active Missions Table */}
      <div className="glass-panel" style={{ padding: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff' }}>UAV Reconstruction Missions</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Select an existing mission to monitor execution, view 3D twin, or create a new survey.
            </p>
          </div>
          <button 
            onClick={() => setActivePage('create-mission')}
            className="btn-secondary"
          >
            + New Mission
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>
            Loading missions...
          </div>
        ) : missions.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', border: '1px dashed var(--border-subtle)', borderRadius: '8px' }}>
            <Plane size={36} color="var(--text-dim)" style={{ margin: '0 auto 12px auto' }} />
            <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              No missions found. Create your first UAV survey mission to get started.
            </p>
            <button 
              onClick={() => setActivePage('create-mission')}
              className="btn-primary"
            >
              Create Mission
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {missions.map(m => (
              <div 
                key={m.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px 20px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-subtle)'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>{m.name}</span>
                    <StatusBadge status={m.status} />
                  </div>
                  <div style={{ display: 'flex', gap: '16px', marginTop: '6px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <span>Drone: <strong style={{ color: '#fff' }}>{m.drone_model}</strong></span>
                    <span>Altitude: <strong style={{ color: '#fff' }}>{m.flight_altitude_m}m</strong></span>
                    <span>GSD Target: <strong style={{ color: '#38bdf8' }}>{m.target_gsd_cm} cm/px</strong></span>
                    {m.video_filename && (
                      <span>Video: <strong style={{ color: '#34d399' }}>{m.video_filename}</strong></span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                  {m.video_path ? (
                    <button
                      onClick={() => {
                        setActiveMissionId(m.id);
                        setActivePage('dashboard');
                      }}
                      className="btn-primary"
                      style={{ padding: '8px 14px', fontSize: '0.8rem' }}
                    >
                      <Activity size={14} /> Monitor
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setActiveMissionId(m.id);
                        setActivePage('upload');
                      }}
                      className="btn-secondary"
                      style={{ padding: '8px 14px', fontSize: '0.8rem' }}
                    >
                      Upload Video
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setActiveMissionId(m.id);
                      setActivePage('viewer');
                    }}
                    className="btn-secondary"
                    style={{ padding: '8px 14px', fontSize: '0.8rem' }}
                  >
                    <Box size={14} /> 3D View
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
