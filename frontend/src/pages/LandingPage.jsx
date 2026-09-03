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
  Zap,
  FolderOpen,
  Compass,
  FileCheck,
  Scale,
  MapPin
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
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '36px 20px' }}>
      {/* Hero Section */}
      <div style={{ textAlign: 'center', marginBottom: '48px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '4px 12px', borderRadius: '4px', background: 'rgba(2, 132, 199, 0.12)', border: '1px solid #0284c7', marginBottom: '16px' }}>
          <Compass size={14} color="#38bdf8" />
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            UAV Photogrammetric Reconstruction & Digital Twin Workstation
          </span>
        </div>

        <h1 style={{ fontSize: '2.6rem', fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: '16px', color: '#fff' }}>
          Single-Pass 3D Digital Twin Platform
        </h1>

        <p style={{ fontSize: '1.05rem', color: '#94a3b8', maxWidth: '780px', margin: '0 auto 28px auto', lineHeight: 1.6 }}>
          Automated photogrammetry and computer vision pipeline transforming drone survey video and telemetry 
          into survey-grade georeferenced 3D point clouds, watertight surface meshes, and evidence-based confidence maps.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '14px' }}>
          <button 
            onClick={() => setActivePage('create-mission')}
            className="btn-primary"
            style={{ padding: '10px 22px', fontSize: '0.9rem' }}
          >
            <Plane size={16} /> New Survey Mission
          </button>
          <button 
            onClick={() => setActivePage('dashboard')}
            className="btn-secondary"
            style={{ padding: '10px 22px', fontSize: '0.9rem' }}
          >
            <Activity size={16} /> Pipeline Monitor
          </button>
        </div>
      </div>

      {/* 4 Core Engineering Architecture Pillars */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '40px' }}>
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: 'rgba(2, 132, 199, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
            <Layers size={18} color="#38bdf8" />
          </div>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>
            13 Modular Stages
          </h2>
          <p style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.5 }}>
            From adaptive sampling and YOLOv8-seg dynamic masking to SfM, MVS dense matching, and Delaunay surface reconstruction with atomic checkpoints.
          </p>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
            <Scale size={18} color="#34d399" />
          </div>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>
            WGS84 Georeferenced
          </h2>
          <p style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.5 }}>
            7-parameter Sim(3) Umeyama transformation aligns models to WGS84 and local topocentric ENU coordinates with CE90/LE90 residual audits.
          </p>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: 'rgba(234, 179, 8, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
            <ShieldCheck size={18} color="#fbbf24" />
          </div>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>
            Zero Hallucination
          </h2>
          <p style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.5 }}>
            8 photogrammetric evidence streams classify geometry into High, Medium, and Unknown tiers. Unobserved regions are strictly never fabricated.
          </p>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '6px', background: 'rgba(168, 85, 247, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
            <Zap size={18} color="#c084fc" />
          </div>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', marginBottom: '6px' }}>
            Progressive Outputs
          </h2>
          <p style={{ fontSize: '0.78rem', color: '#94a3b8', lineHeight: 1.5 }}>
            Level 1 Rapid Model unlocks early for instant situational awareness, while Level 2 Refined Twin computes high-density geometry in the background.
          </p>
        </div>
      </div>

      {/* Active Missions Table */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff' }}>UAV Survey Missions</h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Select an active mission to inspect its 3D digital twin or review photogrammetric certification.
            </p>
          </div>
          <button 
            onClick={() => setActivePage('create-mission')}
            className="btn-secondary"
            style={{ fontSize: '0.78rem', padding: '6px 14px' }}
          >
            + New Mission
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
            Loading mission directory...
          </div>
        ) : missions.length === 0 ? (
          <div style={{ padding: '36px', textAlign: 'center', border: '1px dashed var(--border-subtle)', borderRadius: '6px' }}>
            <Plane size={32} color="var(--text-dim)" style={{ margin: '0 auto 10px auto' }} />
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
              No missions found. Ingest raw flight video and telemetry to launch 3D reconstruction.
            </p>
            <button 
              onClick={() => setActivePage('create-mission')}
              className="btn-primary"
            >
              Launch First Mission
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: 'var(--text-dim)' }}>
                  <th style={{ padding: '10px 12px' }}>MISSION NAME</th>
                  <th style={{ padding: '10px 12px' }}>STATUS</th>
                  <th style={{ padding: '10px 12px' }}>ALTITUDE</th>
                  <th style={{ padding: '10px 12px' }}>TARGET GSD</th>
                  <th style={{ padding: '10px 12px' }}>VIDEO SOURCE</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {missions.map((m) => (
                  <tr 
                    key={m.id}
                    style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)', transition: 'background 0.15s' }}
                  >
                    <td style={{ padding: '12px', fontWeight: 600, color: '#fff' }}>
                      {m.name}
                      <span className="font-mono" style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 400 }}>
                        {m.id}
                      </span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      <StatusBadge status={m.status} />
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)' }}>
                      {m.flight_altitude_m}m AGL
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)' }}>
                      {m.target_gsd_cm} cm/px
                    </td>
                    <td style={{ padding: '12px', color: 'var(--text-muted)' }}>
                      {m.video_filename || (m.video_path ? m.video_path.split(/[/\\]/).pop() : "Pending Ingestion")}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '8px' }}>
                        <button
                          onClick={() => {
                            setActiveMissionId(m.id);
                            if (m.jobs && m.jobs.length > 0) {
                              setActiveJobId(m.jobs[0].id);
                              setActivePage('viewer');
                            } else {
                              setActivePage('dashboard');
                            }
                          }}
                          className="btn-primary"
                          style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                        >
                          <Box size={13} /> 3D Twin
                        </button>
                        <button
                          onClick={() => {
                            setActiveMissionId(m.id);
                            if (m.jobs && m.jobs.length > 0) {
                              setActiveJobId(m.jobs[0].id);
                            }
                            setActivePage('dashboard');
                          }}
                          className="btn-secondary"
                          style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                        >
                          <Activity size={13} /> Monitor
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
