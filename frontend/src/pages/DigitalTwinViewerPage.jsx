import React, { useEffect, useState } from 'react';
import { 
  ArrowLeft, 
  Download, 
  FileDown, 
  Layers, 
  ShieldCheck, 
  Box, 
  Activity, 
  CheckCircle2, 
  AlertCircle,
  FileText,
  Database,
  Sliders,
  Sparkles,
  Zap,
  Globe,
  Compass
} from 'lucide-react';
import { apiClient } from '../api/client';
import ModelViewer3D from '../components/ModelViewer3D';

export default function DigitalTwinViewerPage({ 
  activeJobId, 
  setActiveJobId, 
  setActivePage 
}) {
  const [jobInfo, setJobInfo] = useState(null);
  const [artifacts, setArtifacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showExportDrawer, setShowExportDrawer] = useState(false);

  useEffect(() => {
    if (!activeJobId) {
      setLoading(false);
      return;
    }

    Promise.all([
      apiClient.getJob(activeJobId),
      apiClient.getJobArtifacts(activeJobId)
    ])
      .then(([jData, aData]) => {
        setJobInfo(jData);
        setArtifacts(aData.artifacts || []);
        setLoading(false);
      })
      .catch(err => {
        console.warn("Could not fetch 3D model metadata:", err);
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
  const confGlb = artifacts.find(a => a.artifact_type === 'confidence_map_glb') || artifacts.find(a => a.artifact_type === 'confidence_map');
  const confReportArt = artifacts.find(a => a.artifact_type === 'confidence_report_json') || artifacts.find(a => a.artifact_type === 'confidence_report');
  const georefGlb = artifacts.find(a => a.artifact_type === 'georeferenced_model_glb');
  const texturedGlb = artifacts.find(a => a.artifact_type === 'textured_model_glb');
  const rawGlb = artifacts.find(a => a.artifact_type === 'model_glb');
  const rapidGlb = artifacts.find(a => a.artifact_type === 'rapid_model_glb');
  const activeGlb = georefGlb || texturedGlb || rawGlb || rapidGlb;
  const isRapidOnly = !georefGlb && !texturedGlb && !rawGlb && !!rapidGlb;

  const coordsJsonArt = artifacts.find(a => a.artifact_type === 'coordinates_json') || artifacts.find(a => a.artifact_type === 'georeference_json');
  const textureAtlas = artifacts.find(a => a.artifact_type === 'texture_atlas_png');
  const cleanPly = artifacts.find(a => a.artifact_type === 'model_clean_ply');
  const rawPly = artifacts.find(a => a.artifact_type === 'model_raw_ply');
  const densePly = artifacts.find(a => a.artifact_type === 'dense_point_cloud_ply') || artifacts.find(a => a.artifact_type === 'dense_ply') || artifacts.find(a => a.artifact_type === 'sparse_ply');
  const meshObj = artifacts.find(a => a.artifact_type === 'mesh_textured_obj') || artifacts.find(a => a.artifact_type === 'mesh_obj');
  const posesArt = artifacts.find(a => a.artifact_type === 'camera_poses');
  const dynObjArt = artifacts.find(a => a.artifact_type === 'dynamic_objects_json') || artifacts.find(a => a.artifact_type === 'dynamic_objects');
  const accuracyArt = artifacts.find(a => a.artifact_type === 'accuracy_report_json') || artifacts.find(a => a.artifact_type === 'accuracy_report');
  const scaleArt = artifacts.find(a => a.artifact_type === 'scale_report_json') || artifacts.find(a => a.artifact_type === 'scale_report');

  const [confidenceMode, setConfidenceMode] = useState('normal'); // 'normal' | 'overlay' | 'high_only' | 'medium_only' | 'unknown_only'
  const [confidenceStats, setConfidenceStats] = useState(null);
  const [parsedCoordinates, setParsedCoordinates] = useState(null);

  useEffect(() => {
    if (!confReportArt) return;
    fetch(apiClient.getArtifactDownloadUrl(activeJobId, confReportArt.artifact_type))
      .then(res => res.json())
      .then(data => setConfidenceStats(data))
      .catch(err => console.debug("Confidence report info:", err));
  }, [activeJobId, confReportArt]);

  useEffect(() => {
    if (!coordsJsonArt) return;
    fetch(apiClient.getArtifactDownloadUrl(activeJobId, coordsJsonArt.artifact_type))
      .then(res => res.json())
      .then(data => setParsedCoordinates(data))
      .catch(err => console.debug("Coordinates json info:", err));
  }, [activeJobId, coordsJsonArt]);

  const glbUrl = activeGlb ? apiClient.getArtifactDownloadUrl(activeJobId, activeGlb.artifact_type) : null;
  const confidenceUrl = confGlb ? apiClient.getArtifactDownloadUrl(activeJobId, confGlb.artifact_type) : null;
  const plyUrl = (cleanPly || densePly) ? apiClient.getArtifactDownloadUrl(activeJobId, (cleanPly || densePly).artifact_type) : null;
  const objUrl = meshObj ? apiClient.getArtifactDownloadUrl(activeJobId, meshObj.artifact_type) : null;
  const posesUrl = posesArt ? apiClient.getArtifactDownloadUrl(activeJobId, 'camera_poses') : null;
  const dynamicObjectsUrl = dynObjArt ? apiClient.getArtifactDownloadUrl(activeJobId, dynObjArt.artifact_type) : null;

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px 20px' }}>
      {/* Top Controls Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button 
            onClick={() => setActivePage('dashboard')}
            className="btn-secondary"
            style={{ padding: '7px 12px', fontSize: '0.78rem' }}
          >
            <ArrowLeft size={14} /> Dashboard
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fff' }}>3D Digital Twin Viewer</h1>
              {georefGlb && (
                <span style={{ 
                  backgroundColor: 'rgba(16, 185, 129, 0.15)', 
                  color: '#10b981', 
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '0.68rem',
                  fontWeight: 700
                }}>
                  GEOREFERENCED (WGS84)
                </span>
              )}
              {isRapidOnly && (
                <span style={{ 
                  backgroundColor: 'rgba(2, 132, 199, 0.2)', 
                  color: '#38bdf8', 
                  border: '1px solid rgba(56, 189, 248, 0.4)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '0.68rem',
                  fontWeight: 700
                }}>
                  LEVEL 1 — RAPID MODEL (SITUATIONAL AWARENESS)
                </span>
              )}
            </div>
            <p className="font-mono" style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
              JOB: {activeJobId} • STATUS: {jobInfo?.status?.toUpperCase()}
              {parsedCoordinates?.datum && ` • DATUM: ${parsedCoordinates.datum}`}
              {parsedCoordinates?.utm_zone && ` • ZONE: ${parsedCoordinates.utm_zone}`}
            </p>
          </div>
        </div>

        {/* Action Buttons: Export Drawer & Quality Certification */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => setShowExportDrawer(!showExportDrawer)}
            className="btn-primary"
            style={{ padding: '7px 14px', fontSize: '0.78rem' }}
          >
            <Download size={14} /> Export Deliverables
          </button>

          <button 
            onClick={() => setActivePage('analytics')}
            className="btn-secondary"
            style={{ padding: '7px 14px', fontSize: '0.78rem' }}
          >
            <ShieldCheck size={14} /> Quality Certification
          </button>
        </div>
      </div>

      {/* Structured Export Drawer (Features 16, 17, 18) */}
      {showExportDrawer && (
        <div style={{
          backgroundColor: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '16px 20px',
          marginBottom: '14px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px'
        }}>
          {/* 1. 3D Surface Models */}
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
              Export 3D Surface Models (Feature 16)
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {georefGlb && (
                <a
                  href={apiClient.getArtifactDownloadUrl(activeJobId, 'georeferenced_model_glb')}
                  download="georeferenced_model.glb"
                  className="cad-btn"
                  style={{ textDecoration: 'none', background: 'rgba(16, 185, 129, 0.1)', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)' }}
                >
                  <FileDown size={14} /> georeferenced_model.glb (WGS84)
                </a>
              )}
              {texturedGlb && (
                <a
                  href={apiClient.getArtifactDownloadUrl(activeJobId, 'textured_model_glb')}
                  download="textured_model.glb"
                  className="cad-btn"
                  style={{ textDecoration: 'none' }}
                >
                  <FileDown size={14} /> textured_model.glb (PBR)
                </a>
              )}
              {cleanPly && (
                <a
                  href={apiClient.getArtifactDownloadUrl(activeJobId, 'model_clean_ply')}
                  download="model_clean.ply"
                  className="cad-btn"
                  style={{ textDecoration: 'none' }}
                >
                  <FileDown size={14} /> model_clean.ply (Mesh)
                </a>
              )}
              {meshObj && (
                <a
                  href={apiClient.getArtifactDownloadUrl(activeJobId, meshObj.artifact_type)}
                  download="model.obj"
                  className="cad-btn"
                  style={{ textDecoration: 'none' }}
                >
                  <FileDown size={14} /> mesh.obj (Wavefront)
                </a>
              )}
            </div>
          </div>

          {/* 2. Point Clouds */}
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
              Export Point Clouds (Feature 17)
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {densePly && (
                <a
                  href={apiClient.getArtifactDownloadUrl(activeJobId, densePly.artifact_type)}
                  download="dense_point_cloud.ply"
                  className="cad-btn"
                  style={{ textDecoration: 'none' }}
                >
                  <FileDown size={14} /> dense_point_cloud.ply (MVS)
                </a>
              )}
              <a
                href={apiClient.getArtifactDownloadUrl(activeJobId, 'sparse_ply')}
                download="sparse_point_cloud.ply"
                className="cad-btn"
                style={{ textDecoration: 'none' }}
              >
                <FileDown size={14} /> sparse_point_cloud.ply (SfM)
              </a>
            </div>
          </div>

          {/* 3. Photogrammetric Quality Reports */}
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>
              Quality & Accuracy Reports (Feature 18)
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {accuracyArt && (
                <a
                  href={apiClient.getArtifactDownloadUrl(activeJobId, accuracyArt.artifact_type)}
                  download="accuracy_report.json"
                  className="cad-btn"
                  style={{ textDecoration: 'none' }}
                >
                  <FileText size={14} /> accuracy_report.json (RMSE/CE90)
                </a>
              )}
              {confReportArt && (
                <a
                  href={apiClient.getArtifactDownloadUrl(activeJobId, confReportArt.artifact_type)}
                  download="confidence_report.json"
                  className="cad-btn"
                  style={{ textDecoration: 'none' }}
                >
                  <FileText size={14} /> confidence_report.json (8 Streams)
                </a>
              )}
              {scaleArt && (
                <a
                  href={apiClient.getArtifactDownloadUrl(activeJobId, scaleArt.artifact_type)}
                  download="scale_report.json"
                  className="cad-btn"
                  style={{ textDecoration: 'none' }}
                >
                  <FileText size={14} /> scale_report.json (Metric Scale)
                </a>
              )}
              <a
                href={apiClient.getArtifactDownloadUrl(activeJobId, 'benchmark_report_pdf')}
                download="benchmark_report.pdf"
                className="cad-btn"
                style={{ textDecoration: 'none', background: 'rgba(2, 132, 199, 0.15)', color: '#38bdf8', border: '1px solid rgba(56, 189, 248, 0.3)' }}
              >
                <FileText size={14} /> benchmark_report.pdf (Scientific PDF)
              </a>
              <a
                href={apiClient.getArtifactDownloadUrl(activeJobId, 'benchmark_report_json')}
                download="benchmark_report.json"
                className="cad-btn"
                style={{ textDecoration: 'none' }}
              >
                <FileText size={14} /> benchmark_report.json (10 Metrics)
              </a>
            </div>
          </div>

          {/* 4. Complete Mission Deliverable Archive (ZIP) */}
          <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #1e293b', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fff' }}>Complete Digital Twin Archive (ZIP)</span>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Contains all 3D surface models, point clouds, georeferencing, and scientific reports.</p>
            </div>
            <a
              href={apiClient.getExportBundleUrl(activeJobId)}
              download={`uav_digital_twin_bundle_${activeJobId.slice(0, 8)}.zip`}
              className="btn-primary"
              style={{ textDecoration: 'none', padding: '8px 18px', fontSize: '0.8rem' }}
            >
              <Download size={14} /> Download Full Mission Bundle (.ZIP)
            </a>
          </div>
        </div>
      )}

      {/* Phase 12: Confidence-Aware Reconstruction Control & Statistics (Feature 8) */}
      <div style={{
        backgroundColor: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: '8px',
        padding: '10px 16px',
        marginBottom: '12px',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px'
      }}>
        {/* Mode Switcher Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
            CONFIDENCE MODE:
          </span>
          <button
            onClick={() => setConfidenceMode('normal')}
            className={`cad-btn ${confidenceMode === 'normal' ? 'active' : ''}`}
          >
            Normal Model
          </button>
          <button
            onClick={() => setConfidenceMode('overlay')}
            className={`cad-btn ${confidenceMode === 'overlay' ? 'active' : ''}`}
          >
            Confidence Overlay
          </button>
          <button
            onClick={() => setConfidenceMode('high_only')}
            className={`cad-btn ${confidenceMode === 'high_only' ? 'active' : ''}`}
            style={{ color: confidenceMode === 'high_only' ? '#fff' : '#22c55e' }}
          >
            ● High Confidence
          </button>
          <button
            onClick={() => setConfidenceMode('medium_only')}
            className={`cad-btn ${confidenceMode === 'medium_only' ? 'active' : ''}`}
            style={{ color: confidenceMode === 'medium_only' ? '#fff' : '#eab308' }}
          >
            ● Medium Confidence
          </button>
          <button
            onClick={() => setConfidenceMode('unknown_only')}
            className={`cad-btn ${confidenceMode === 'unknown_only' ? 'active' : ''}`}
            style={{ color: confidenceMode === 'unknown_only' ? '#fff' : '#94a3b8' }}
          >
            ● Unknown
          </button>
        </div>

        {/* Live Confidence Statistics */}
        {confidenceStats && confidenceStats.tier_statistics && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', fontSize: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#22c55e' }}></span>
              <span style={{ color: 'var(--text-dim)' }}>High:</span>
              <strong style={{ color: '#22c55e' }}>{confidenceStats.tier_statistics.high_confidence_percentage}%</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#eab308' }}></span>
              <span style={{ color: 'var(--text-dim)' }}>Medium:</span>
              <strong style={{ color: '#eab308' }}>{confidenceStats.tier_statistics.medium_confidence_percentage}%</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#94a3b8' }}></span>
              <span style={{ color: 'var(--text-dim)' }}>Unknown:</span>
              <strong style={{ color: '#94a3b8' }}>{confidenceStats.tier_statistics.unknown_percentage}%</strong>
            </div>
            <span style={{ fontSize: '0.68rem', color: '#64748b', fontStyle: 'italic' }}>
              (Zero geometry invented for unobserved surfaces)
            </span>
          </div>
        )}
      </div>

      {/* Advanced 3D Digital Twin Viewport (18 Features) */}
      <div style={{ height: '72vh', width: '100%' }}>
        <ModelViewer3D
          glbUrl={glbUrl}
          confidenceUrl={confidenceUrl}
          confidenceMode={confidenceMode}
          plyUrl={plyUrl}
          objUrl={objUrl}
          posesUrl={posesUrl}
          dynamicObjectsUrl={dynamicObjectsUrl}
          coordinates={parsedCoordinates}
          title="UAV 3D Digital Twin"
          subtitle="Precision Engineering & Photogrammetric Inspection Workstation"
        />
      </div>
    </div>
  );
}
