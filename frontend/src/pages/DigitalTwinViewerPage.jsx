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
  const [availableJobs, setAvailableJobs] = useState([]);
  const [showExportDrawer, setShowExportDrawer] = useState(false);

  // 1. Discover all jobs across missions and resolve activeJobId or missionId
  useEffect(() => {
    let isMounted = true;

    async function discoverAndResolve() {
      setLoading(true);
      const params = new URLSearchParams(window.location.search);
      const qParam = params.get('jobId') || params.get('missionId');
      let targetId = activeJobId || qParam;

      const foundJobs = [];
      try {
        const missions = await apiClient.listMissions();
        for (const m of missions) {
          try {
            const mJobs = await apiClient.getMissionJobs(m.id);
            if (Array.isArray(mJobs) && mJobs.length > 0) {
              for (const j of mJobs) {
                foundJobs.push({
                  id: j.id,
                  missionId: m.id,
                  missionName: m.name || `Mission ${m.id.slice(0, 8)}`,
                  status: j.status,
                  createdAt: j.created_at || j.updated_at
                });
              }
            }
          } catch (e) {}
        }
      } catch (e) {
        console.debug("Failed to list missions for 3D twin:", e);
      }

      if (isMounted) {
        setAvailableJobs(foundJobs);
      }

      // Check if targetId is a valid job
      let resolvedJobId = null;
      let resolvedJobData = null;

      if (targetId && targetId !== 'demo-survey-model') {
        try {
          const j = await apiClient.getJob(targetId);
          if (j && j.id) {
            resolvedJobId = j.id;
            resolvedJobData = j;
          }
        } catch (e) {
          // targetId might be a mission ID!
          try {
            const mJobs = await apiClient.getMissionJobs(targetId);
            if (Array.isArray(mJobs) && mJobs.length > 0) {
              const comp = mJobs.find(j => j.status === 'completed') || mJobs[0];
              if (comp) {
                resolvedJobId = comp.id;
                resolvedJobData = comp;
              }
            }
          } catch (err) {}
        }
      }

      // If still not resolved, pick latest completed job from platform
      if (!resolvedJobId && foundJobs.length > 0) {
        const comp = foundJobs.find(j => j.status === 'completed') || foundJobs[0];
        if (comp) {
          resolvedJobId = comp.id;
          try {
            resolvedJobData = await apiClient.getJob(comp.id);
          } catch (e) {}
        }
      }

      // If no job found at all in DB, fallback to demo photogrammetry survey model
      if (!resolvedJobId) {
        resolvedJobId = 'demo-survey-model';
        resolvedJobData = {
          id: 'demo-survey-model',
          status: 'completed',
          drone_model: 'DJI Matrice 300 RTK',
          current_stage: 'confidence_estimation'
        };
      }

      if (isMounted) {
        if (resolvedJobId !== activeJobId && setActiveJobId) {
          setActiveJobId(resolvedJobId);
        }
        setJobInfo(resolvedJobData);

        // Fetch artifacts
        if (resolvedJobId && resolvedJobId !== 'demo-survey-model') {
          try {
            const aData = await apiClient.getJobArtifacts(resolvedJobId);
            const artList = Array.isArray(aData) ? aData : (aData?.artifacts || []);
            setArtifacts(artList);
          } catch (err) {
            setArtifacts([]);
          }
        } else {
          setArtifacts([]);
        }
        setLoading(false);
      }
    }

    discoverAndResolve();

    return () => { isMounted = false; };
  }, [activeJobId, setActiveJobId]);

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

  if (loading && !jobInfo) {
    return (
      <div className="geospatial-canvas" style={{ minHeight: 'calc(100vh - 120px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px' }}>
        <div className="geo-card" style={{ maxWidth: '440px', width: '100%', padding: '40px 32px', textAlign: 'center' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: 'rgba(2, 132, 199, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', color: '#0284c7' }}>
            <Activity className="animate-spin" size={28} />
          </div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>Initializing 3D Digital Twin</h3>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '6px' }}>
            Connecting to UAV photogrammetry engine and spatial pipeline...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="geospatial-canvas" style={{ minHeight: 'calc(100vh - 120px)', position: 'relative', overflow: 'hidden', paddingBottom: '32px' }}>
      <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '24px 24px 0 24px', position: 'relative', zIndex: 2 }}>
        {/* Top Controls Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button 
              onClick={() => setActivePage('dashboard')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 16px',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: '#334155',
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.color = '#0f172a'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#ffffff'; e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#334155'; }}
            >
              <ArrowLeft size={14} /> Dashboard
            </button>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.025em' }}>3D Digital Twin Viewer</h1>
                {georefGlb && (
                  <span style={{ 
                    backgroundColor: 'rgba(16, 185, 129, 0.1)', 
                    color: '#059669', 
                    border: '1px solid rgba(16, 185, 129, 0.25)',
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
                    backgroundColor: 'rgba(2, 132, 199, 0.1)', 
                    color: '#0284c7', 
                    border: '1px solid rgba(2, 132, 199, 0.25)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.68rem',
                    fontWeight: 700
                  }}>
                    LEVEL 1 — RAPID MODEL (SITUATIONAL AWARENESS)
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '3px', flexWrap: 'wrap' }}>
                <p className="font-mono" style={{ fontSize: '0.74rem', color: '#64748b', margin: 0 }}>
                  JOB: <span style={{ color: '#334155', fontWeight: 600 }}>{activeJobId || 'Survey Twin'}</span> • STATUS : <span style={{ color: '#10b981', fontWeight: 700 }}>{jobInfo?.status?.toUpperCase() || 'COMPLETED'}</span>
                  {parsedCoordinates?.datum && ` • DATUM: ${parsedCoordinates.datum}`}
                  {parsedCoordinates?.utm_zone && ` • ZONE: ${parsedCoordinates.utm_zone}`}
                </p>
                {availableJobs.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Switch Model:</span>
                    <select
                      value={activeJobId || ''}
                      onChange={(e) => {
                        if (setActiveJobId) setActiveJobId(e.target.value);
                      }}
                      style={{
                        fontSize: '0.72rem',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        color: '#0f172a',
                        fontWeight: 600,
                        cursor: 'pointer',
                        outline: 'none'
                      }}
                    >
                      {availableJobs.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.missionName} ({j.status}) — {j.id.slice(0, 8)}...
                        </option>
                      ))}
                      <option value="demo-survey-model">Photogrammetric Survey Twin (Sample)</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons: Export Drawer & Quality Certification */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button
              onClick={() => setShowExportDrawer(!showExportDrawer)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 18px',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: '#ffffff',
                background: '#0284c7',
                border: '1px solid #0284c7',
                borderRadius: '8px',
                boxShadow: '0 2px 6px rgba(2, 132, 199, 0.25)',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#0369a1'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#0284c7'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <Download size={14} /> Export Deliverables
            </button>

            <button 
              onClick={() => setActivePage('analytics')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 18px',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: '#334155',
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#f8fafc'; e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.color = '#0f172a'; e.currentTarget.style.transform = 'translateY(-1px)'; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = '#ffffff'; e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#334155'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <ShieldCheck size={14} /> Quality Certification
            </button>
          </div>
        </div>

        {/* Structured Export Drawer (Features 16, 17, 18) */}
        {showExportDrawer && (
          <div style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '20px 24px',
            marginBottom: '14px',
            boxShadow: '0 8px 28px -4px rgba(15, 23, 42, 0.08), 0 4px 10px -2px rgba(15, 23, 42, 0.04)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '20px'
          }}>
            {/* 1. 3D Surface Models */}
            <div>
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: '10px', letterSpacing: '0.04em' }}>
                Export 3D Surface Models (Feature 16)
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {georefGlb && (
                  <a
                    href={apiClient.getArtifactDownloadUrl(activeJobId, 'georeferenced_model_glb')}
                    download="georeferenced_model.glb"
                    style={{
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      background: 'rgba(16, 185, 129, 0.08)',
                      color: '#059669',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <FileDown size={14} /> georeferenced_model.glb (WGS84)
                  </a>
                )}
                {texturedGlb && (
                  <a
                    href={apiClient.getArtifactDownloadUrl(activeJobId, 'textured_model_glb')}
                    download="textured_model.glb"
                    style={{
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      background: '#f8fafc',
                      color: '#1e293b',
                      border: '1px solid #e2e8f0',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <FileDown size={14} /> textured_model.glb (PBR)
                  </a>
                )}
                {cleanPly && (
                  <a
                    href={apiClient.getArtifactDownloadUrl(activeJobId, 'model_clean_ply')}
                    download="model_clean.ply"
                    style={{
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      background: '#f8fafc',
                      color: '#1e293b',
                      border: '1px solid #e2e8f0',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <FileDown size={14} /> model_clean.ply (Mesh)
                  </a>
                )}
                {meshObj && (
                  <a
                    href={apiClient.getArtifactDownloadUrl(activeJobId, meshObj.artifact_type)}
                    download="model.obj"
                    style={{
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      background: '#f8fafc',
                      color: '#1e293b',
                      border: '1px solid #e2e8f0',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <FileDown size={14} /> mesh.obj (Wavefront)
                  </a>
                )}
              </div>
            </div>

            {/* 2. Point Clouds */}
            <div>
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: '10px', letterSpacing: '0.04em' }}>
                Export Point Clouds (Feature 17)
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {densePly && (
                  <a
                    href={apiClient.getArtifactDownloadUrl(activeJobId, densePly.artifact_type)}
                    download="dense_point_cloud.ply"
                    style={{
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      background: '#f8fafc',
                      color: '#1e293b',
                      border: '1px solid #e2e8f0',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <FileDown size={14} /> dense_point_cloud.ply (MVS)
                  </a>
                )}
                <a
                  href={apiClient.getArtifactDownloadUrl(activeJobId, 'sparse_ply')}
                  download="sparse_point_cloud.ply"
                  style={{
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    background: '#f8fafc',
                    color: '#1e293b',
                    border: '1px solid #e2e8f0',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <FileDown size={14} /> sparse_point_cloud.ply (SfM)
                </a>
              </div>
            </div>

            {/* 3. Photogrammetric Quality Reports */}
            <div>
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: '10px', letterSpacing: '0.04em' }}>
                Quality & Accuracy Reports (Feature 18)
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {accuracyArt && (
                  <a
                    href={apiClient.getArtifactDownloadUrl(activeJobId, accuracyArt.artifact_type)}
                    download="accuracy_report.json"
                    style={{
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      background: '#f8fafc',
                      color: '#1e293b',
                      border: '1px solid #e2e8f0',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <FileText size={14} /> accuracy_report.json (RMSE/CE90)
                  </a>
                )}
                {confReportArt && (
                  <a
                    href={apiClient.getArtifactDownloadUrl(activeJobId, confReportArt.artifact_type)}
                    download="confidence_report.json"
                    style={{
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      background: '#f8fafc',
                      color: '#1e293b',
                      border: '1px solid #e2e8f0',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <FileText size={14} /> confidence_report.json (8 Streams)
                  </a>
                )}
                {scaleArt && (
                  <a
                    href={apiClient.getArtifactDownloadUrl(activeJobId, scaleArt.artifact_type)}
                    download="scale_report.json"
                    style={{
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      background: '#f8fafc',
                      color: '#1e293b',
                      border: '1px solid #e2e8f0',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <FileText size={14} /> scale_report.json (Metric Scale)
                  </a>
                )}
                <a
                  href={apiClient.getArtifactDownloadUrl(activeJobId, 'benchmark_report_pdf')}
                  download="benchmark_report.pdf"
                  style={{
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    background: 'rgba(2, 132, 199, 0.08)',
                    color: '#0284c7',
                    border: '1px solid rgba(2, 132, 199, 0.25)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <FileText size={14} /> benchmark_report.pdf (Scientific PDF)
                </a>
                <a
                  href={apiClient.getArtifactDownloadUrl(activeJobId, 'benchmark_report_json')}
                  download="benchmark_report.json"
                  style={{
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    background: '#f8fafc',
                    color: '#1e293b',
                    border: '1px solid #e2e8f0',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <FileText size={14} /> benchmark_report.json (10 Metrics)
                </a>
              </div>
            </div>

            {/* 4. Complete Mission Deliverable Archive (ZIP) */}
            <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #f1f5f9', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>Complete Digital Twin Archive (ZIP)</span>
                <p style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '2px' }}>Contains all 3D surface models, point clouds, georeferencing, and scientific reports.</p>
              </div>
              <a
                href={apiClient.getExportBundleUrl(activeJobId)}
                download={`uav_digital_twin_bundle_${activeJobId.slice(0, 8)}.zip`}
                style={{
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 20px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: '#ffffff',
                  background: '#0284c7',
                  border: '1px solid #0284c7',
                  borderRadius: '8px',
                  boxShadow: '0 2px 6px rgba(2, 132, 199, 0.25)'
                }}
              >
                <Download size={14} /> Download Full Mission Bundle (.ZIP)
              </a>
            </div>
          </div>
        )}

        {/* Phase 12: Confidence-Aware Reconstruction Control & Statistics (Feature 8) */}
        <div style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '10px 18px',
          marginBottom: '14px',
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px'
        }}>
          {/* Mode Switcher Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              CONFIDENCE MODE:
            </span>
            <button
              onClick={() => setConfidenceMode('normal')}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                backgroundColor: confidenceMode === 'normal' ? '#0284c7' : '#f8fafc',
                color: confidenceMode === 'normal' ? '#ffffff' : '#475569',
                border: confidenceMode === 'normal' ? '1px solid #0284c7' : '1px solid #e2e8f0'
              }}
            >
              Normal Model
            </button>
            <button
              onClick={() => setConfidenceMode('overlay')}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                backgroundColor: confidenceMode === 'overlay' ? '#0284c7' : '#f8fafc',
                color: confidenceMode === 'overlay' ? '#ffffff' : '#475569',
                border: confidenceMode === 'overlay' ? '1px solid #0284c7' : '1px solid #e2e8f0'
              }}
            >
              Confidence Overlay
            </button>
            <button
              onClick={() => setConfidenceMode('high_only')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                backgroundColor: confidenceMode === 'high_only' ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
                color: '#10b981',
                border: confidenceMode === 'high_only' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid transparent'
              }}
            >
              ● High Confidence
            </button>
            <button
              onClick={() => setConfidenceMode('medium_only')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                backgroundColor: confidenceMode === 'medium_only' ? 'rgba(245, 158, 11, 0.12)' : 'transparent',
                color: '#f59e0b',
                border: confidenceMode === 'medium_only' ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid transparent'
              }}
            >
              ● Medium Confidence
            </button>
            <button
              onClick={() => setConfidenceMode('unknown_only')}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                backgroundColor: confidenceMode === 'unknown_only' ? 'rgba(100, 116, 139, 0.12)' : 'transparent',
                color: '#64748b',
                border: confidenceMode === 'unknown_only' ? '1px solid rgba(100, 116, 139, 0.3)' : '1px solid transparent'
              }}
            >
              ● Unknown
            </button>
          </div>

          {/* Live Confidence Statistics */}
          {confidenceStats && confidenceStats.tier_statistics && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', fontSize: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#10b981' }}></span>
                <span style={{ color: '#64748b' }}>High:</span>
                <strong style={{ color: '#10b981' }}>{confidenceStats.tier_statistics.high_confidence_percentage}%</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#f59e0b' }}></span>
                <span style={{ color: '#64748b' }}>Medium:</span>
                <strong style={{ color: '#f59e0b' }}>{confidenceStats.tier_statistics.medium_confidence_percentage}%</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#64748b' }}></span>
                <span style={{ color: '#64748b' }}>Unknown:</span>
                <strong style={{ color: '#64748b' }}>{confidenceStats.tier_statistics.unknown_percentage}%</strong>
              </div>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic' }}>
                (Zero geometry invented for unobserved surfaces)
              </span>
            </div>
          )}
        </div>

        {/* Advanced 3D Digital Twin Viewport (18 Features) */}
        <div style={{ height: '74vh', width: '100%', minHeight: '560px' }}>
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
            subtitle="Precise Engineering & Photogrammetric Inspection Visualization"
          />
        </div>
      </div>
    </div>
  );
}
