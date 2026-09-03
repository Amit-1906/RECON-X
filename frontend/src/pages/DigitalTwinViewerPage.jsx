import React, { useEffect, useState } from 'react';
import { Download, Box, Layers, RefreshCw, FileDown, ShieldCheck, ArrowLeft } from 'lucide-react';
import { apiClient } from '../api/client';
import ModelViewer3D from '../components/ModelViewer3D';

export default function DigitalTwinViewerPage({ activeJobId, setActivePage }) {
  const [artifacts, setArtifacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [jobInfo, setJobInfo] = useState(null);

  useEffect(() => {
    if (!activeJobId) {
      setLoading(false);
      return;
    }

    Promise.all([
      apiClient.getArtifacts(activeJobId),
      apiClient.getJob(activeJobId)
    ])
      .then(([arts, job]) => {
        setArtifacts(arts);
        setJobInfo(job);
        setLoading(false);
      })
      .catch(err => {
        console.warn("Could not load artifacts:", err);
        setLoading(false);
      });
  }, [activeJobId]);

  if (!activeJobId) {
    return (
      <div style={{ maxWidth: '800px', margin: '60px auto', padding: '40px', textAlign: 'center' }} className="glass-panel">
        <Box size={48} color="var(--text-dim)" style={{ margin: '0 auto 16px auto' }} />
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fff' }}>No Active Reconstructed Model</h2>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginTop: '8px', marginBottom: '24px' }}>
          Select or complete a reconstruction job to inspect its 3D digital twin.
        </p>
        <button onClick={() => setActivePage('dashboard')} className="btn-primary">
          Go to Pipeline Monitor
        </button>
      </div>
    );
  }

  // Find artifact URLs
  const densePly = artifacts.find(a => a.artifact_type === 'dense_ply') || artifacts.find(a => a.artifact_type === 'sparse_ply');
  const meshObj = artifacts.find(a => a.artifact_type === 'mesh_obj') || artifacts.find(a => a.artifact_type === 'mesh_textured_obj');
  const posesArt = artifacts.find(a => a.artifact_type === 'camera_poses');

  const plyUrl = densePly ? apiClient.getArtifactDownloadUrl(activeJobId, densePly.artifact_type) : null;
  const objUrl = meshObj ? apiClient.getArtifactDownloadUrl(activeJobId, meshObj.artifact_type) : null;
  const posesUrl = posesArt ? apiClient.getArtifactDownloadUrl(activeJobId, 'camera_poses') : null;

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '24px 20px' }}>
      {/* Top Controls Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button 
            onClick={() => setActivePage('dashboard')}
            className="btn-secondary"
            style={{ padding: '8px 12px' }}
          >
            <ArrowLeft size={16} /> Dashboard
          </button>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff' }}>3D Digital Twin Viewer</h1>
            <p className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              JOB: {activeJobId} • STATUS: {jobInfo?.status?.toUpperCase()}
            </p>
          </div>
        </div>

        {/* Deliverables Download Links */}
        <div style={{ display: 'flex', gap: '10px' }}>
          {densePly && (
            <a
              href={apiClient.getArtifactDownloadUrl(activeJobId, densePly.artifact_type)}
              download
              className="btn-secondary"
              style={{ textDecoration: 'none', fontSize: '0.8rem', padding: '8px 14px' }}
            >
              <FileDown size={14} /> Download Point Cloud (PLY)
            </a>
          )}

          {meshObj && (
            <a
              href={apiClient.getArtifactDownloadUrl(activeJobId, meshObj.artifact_type)}
              download
              className="btn-secondary"
              style={{ textDecoration: 'none', fontSize: '0.8rem', padding: '8px 14px' }}
            >
              <FileDown size={14} /> Download Surface Mesh (OBJ)
            </a>
          )}

          <button 
            onClick={() => setActivePage('analytics')}
            className="btn-primary"
            style={{ padding: '8px 16px', fontSize: '0.8rem' }}
          >
            <ShieldCheck size={14} /> Quality Certification
          </button>
        </div>
      </div>

      {/* 3D Canvas */}
      <div style={{ height: '75vh', width: '100%' }}>
        <ModelViewer3D
          plyUrl={plyUrl}
          objUrl={objUrl}
          posesUrl={posesUrl}
          title="UAV Digital Twin 3D Surface"
          subtitle="Interactive 6-DoF Aerial Photogrammetric Model"
        />
      </div>
    </div>
  );
}
