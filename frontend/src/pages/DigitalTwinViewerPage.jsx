import React, { useEffect, useState } from "react";
import { ArrowLeft, Download, FileDown, ShieldCheck, Zap, Globe, Crosshair } from "lucide-react";
import { apiClient } from "../api/client";
import ModelViewer3D from "../components/ModelViewer3D";

// ─── Floating HUD Panel ──────────────────────────────────────────────────────
function HUDPanel({ children, style = {} }) {
  return (
    <div style={{
      background: "rgba(8, 14, 24, 0.82)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      border: "1px solid rgba(148, 163, 184, 0.12)",
      borderRadius: "6px",
      ...style
    }}>
      {children}
    </div>
  );
}

// ─── HUD Label ───────────────────────────────────────────────────────────────
function HUDLabel({ children, style = {} }) {
  return (
    <span style={{
      fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, monospace",
      fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.1em",
      textTransform: "uppercase", color: "rgba(148, 163, 184, 0.7)",
      ...style
    }}>{children}</span>
  );
}

// ─── HUD Value ───────────────────────────────────────────────────────────────
function HUDValue({ children, style = {} }) {
  return (
    <span style={{
      fontFamily: "'JetBrains Mono', 'SF Mono', Menlo, monospace",
      fontSize: "0.72rem", fontWeight: 700, color: "#e2e8f0",
      letterSpacing: "0.02em", ...style
    }}>{children}</span>
  );
}

// ─── Status Dot ──────────────────────────────────────────────────────────────
function StatusDot({ color = "#10b981" }) {
  return (
    <span style={{
      display: "inline-block", width: "5px", height: "5px",
      borderRadius: "50%", backgroundColor: color,
      boxShadow: `0 0 4px ${color}`, flexShrink: 0
    }} />
  );
}

// ─── Export Link Button ──────────────────────────────────────────────────────
function ExportLink({ href, download, label, sublabel, accent }) {
  return (
    <a href={href} download={download}
      style={{
        display: "inline-flex", alignItems: "center", gap: "8px",
        padding: "5px 10px", borderRadius: "4px", textDecoration: "none",
        background: accent ? "rgba(2,132,199,0.1)" : "rgba(148,163,184,0.05)",
        border: `1px solid ${accent ? "rgba(2,132,199,0.2)" : "rgba(148,163,184,0.1)"}`,
        color: accent ? "#7dd3fc" : "rgba(148,163,184,0.7)",
        transition: "all 0.15s ease", fontSize: "0.68rem",
        fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
        letterSpacing: "0.02em", whiteSpace: "nowrap"
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = accent ? "rgba(2,132,199,0.18)" : "rgba(148,163,184,0.1)";
        e.currentTarget.style.color = accent ? "#bae6fd" : "#e2e8f0";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = accent ? "rgba(2,132,199,0.1)" : "rgba(148,163,184,0.05)";
        e.currentTarget.style.color = accent ? "#7dd3fc" : "rgba(148,163,184,0.7)";
      }}
    >
      <FileDown size={11} />
      <span>{label}</span>
      {sublabel && (
        <span style={{ fontSize: "0.55rem", color: "rgba(148,163,184,0.4)", fontWeight: 600, letterSpacing: "0.08em" }}>
          {sublabel}
        </span>
      )}
    </a>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function DigitalTwinViewerPage({ activeJobId, setActiveJobId, setActivePage }) {
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
      const qParam = params.get("jobId") || params.get("missionId");
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
                  id: j.id, missionId: m.id,
                  missionName: m.name || `Mission ${m.id.slice(0, 8)}`,
                  status: j.status, createdAt: j.created_at || j.updated_at
                });
              }
            }
          } catch (e) {}
        }
      } catch (e) { console.debug("Failed to list missions for 3D twin:", e); }

      if (isMounted) setAvailableJobs(foundJobs);

      let resolvedJobId = null;
      let resolvedJobData = null;

      if (targetId && targetId !== "demo-survey-model") {
        try {
          const j = await apiClient.getJob(targetId);
          if (j && j.id) { resolvedJobId = j.id; resolvedJobData = j; }
        } catch (e) {
          try {
            const mJobs = await apiClient.getMissionJobs(targetId);
            if (Array.isArray(mJobs) && mJobs.length > 0) {
              const comp = mJobs.find(j => j.status === "completed") || mJobs[0];
              if (comp) { resolvedJobId = comp.id; resolvedJobData = comp; }
            }
          } catch (err) {}
        }
      }

      if (!resolvedJobId && foundJobs.length > 0) {
        const comp = foundJobs.find(j => j.status === "completed") || foundJobs[0];
        if (comp) {
          resolvedJobId = comp.id;
          try { resolvedJobData = await apiClient.getJob(comp.id); } catch (e) {}
        }
      }

      if (!resolvedJobId) {
        resolvedJobId = "demo-survey-model";
        resolvedJobData = {
          id: "demo-survey-model", status: "completed",
          drone_model: "DJI Matrice 300 RTK", current_stage: "confidence_estimation"
        };
      }

      if (isMounted) {
        if (resolvedJobId !== activeJobId && setActiveJobId) setActiveJobId(resolvedJobId);
        setJobInfo(resolvedJobData);
        if (resolvedJobId && resolvedJobId !== "demo-survey-model") {
          try {
            const aData = await apiClient.getJobArtifacts(resolvedJobId);
            setArtifacts(Array.isArray(aData) ? aData : (aData?.artifacts || []));
          } catch (err) { setArtifacts([]); }
        } else { setArtifacts([]); }
        setLoading(false);
      }
    }
    discoverAndResolve();
    return () => { isMounted = false; };
  }, [activeJobId, setActiveJobId]);

  // Find artifact URLs
  const confGlb = artifacts.find(a => a.artifact_type === "confidence_map_glb") || artifacts.find(a => a.artifact_type === "confidence_map");
  const confReportArt = artifacts.find(a => a.artifact_type === "confidence_report_json") || artifacts.find(a => a.artifact_type === "confidence_report");
  const georefGlb = artifacts.find(a => a.artifact_type === "georeferenced_model_glb");
  const texturedGlb = artifacts.find(a => a.artifact_type === "textured_model_glb");
  const rawGlb = artifacts.find(a => a.artifact_type === "model_glb");
  const rapidGlb = artifacts.find(a => a.artifact_type === "rapid_model_glb");
  const activeGlb = georefGlb || texturedGlb || rawGlb || rapidGlb;
  const isRapidOnly = !georefGlb && !texturedGlb && !rawGlb && !!rapidGlb;
  const coordsJsonArt = artifacts.find(a => a.artifact_type === "coordinates_json") || artifacts.find(a => a.artifact_type === "georeference_json");
  const cleanPly = artifacts.find(a => a.artifact_type === "model_clean_ply");
  const densePly = artifacts.find(a => a.artifact_type === "dense_point_cloud_ply") || artifacts.find(a => a.artifact_type === "dense_ply") || artifacts.find(a => a.artifact_type === "sparse_ply");
  const meshObj = artifacts.find(a => a.artifact_type === "mesh_textured_obj") || artifacts.find(a => a.artifact_type === "mesh_obj");
  const posesArt = artifacts.find(a => a.artifact_type === "camera_poses");
  const dynObjArt = artifacts.find(a => a.artifact_type === "dynamic_objects_json") || artifacts.find(a => a.artifact_type === "dynamic_objects");
  const accuracyArt = artifacts.find(a => a.artifact_type === "accuracy_report_json") || artifacts.find(a => a.artifact_type === "accuracy_report");
  const scaleArt = artifacts.find(a => a.artifact_type === "scale_report_json") || artifacts.find(a => a.artifact_type === "scale_report");

  const [confidenceMode, setConfidenceMode] = useState("normal");
  const [confidenceStats, setConfidenceStats] = useState(null);
  const [parsedCoordinates, setParsedCoordinates] = useState(null);

  useEffect(() => {
    if (!confReportArt) return;
    fetch(apiClient.getArtifactDownloadUrl(activeJobId, confReportArt.artifact_type))
      .then(res => res.json()).then(data => setConfidenceStats(data))
      .catch(err => console.debug("Confidence report info:", err));
  }, [activeJobId, confReportArt]);

  useEffect(() => {
    if (!coordsJsonArt) return;
    fetch(apiClient.getArtifactDownloadUrl(activeJobId, coordsJsonArt.artifact_type))
      .then(res => res.json()).then(data => setParsedCoordinates(data))
      .catch(err => console.debug("Coordinates json info:", err));
  }, [activeJobId, coordsJsonArt]);

  const glbUrl = activeGlb ? apiClient.getArtifactDownloadUrl(activeJobId, activeGlb.artifact_type) : null;
  const confidenceUrl = confGlb ? apiClient.getArtifactDownloadUrl(activeJobId, confGlb.artifact_type) : null;
  const plyUrl = (cleanPly || densePly) ? apiClient.getArtifactDownloadUrl(activeJobId, (cleanPly || densePly).artifact_type) : null;
  const objUrl = meshObj ? apiClient.getArtifactDownloadUrl(activeJobId, meshObj.artifact_type) : null;
  const posesUrl = posesArt ? apiClient.getArtifactDownloadUrl(activeJobId, "camera_poses") : null;
  const dynamicObjectsUrl = dynObjArt ? apiClient.getArtifactDownloadUrl(activeJobId, dynObjArt.artifact_type) : null;

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading && !jobInfo) {
    return (
      <div style={{ minHeight: "calc(100vh - 64px)", background: "#080e18", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "16px" }}>
        <div style={{ position: "relative", width: "64px", height: "64px" }}>
          <div style={{ position: "absolute", inset: 0, border: "1px solid rgba(2,132,199,0.3)", borderRadius: "50%", animation: "dt-spin 2s linear infinite" }} />
          <div style={{ position: "absolute", inset: "8px", border: "1px solid rgba(2,132,199,0.15)", borderRadius: "50%", animation: "dt-spin 3s linear infinite reverse" }} />
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Crosshair size={18} color="#0284c7" />
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.12em", color: "#0284c7", textTransform: "uppercase", marginBottom: "4px" }}>
            Initializing Digital Twin
          </p>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.62rem", color: "rgba(148,163,184,0.5)", letterSpacing: "0.04em" }}>
            Connecting to photogrammetry pipeline...
          </p>
        </div>
        <style>{`@keyframes dt-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Reconstruction quality label ──────────────────────────────────────────
  const recoStatus = georefGlb
    ? { label: "GEOREFERENCED", sublabel: "WGS84 · RTK", color: "#10b981" }
    : isRapidOnly
    ? { label: "LEVEL 1 — RAPID", sublabel: "Situational Awareness", color: "#0284c7" }
    : { label: "RECONSTRUCTION", sublabel: "Photogrammetric", color: "#94a3b8" };

  const jobStatus = jobInfo?.status?.toUpperCase() || "COMPLETED";
  const jobShortId = (activeJobId || "DEMO").slice(0, 8).toUpperCase();

  const confidenceBtns = [
    { key: "normal",       label: "Normal Model",  color: null },
    { key: "overlay",      label: "Conf. Overlay", color: null },
    { key: "high_only",    label: "● High",         color: "#10b981" },
    { key: "medium_only",  label: "● Medium",       color: "#f59e0b" },
    { key: "unknown_only", label: "● Unknown",      color: "#64748b" },
  ];

  const artifactChips = [
    { label: "GLB",   active: !!activeGlb },
    { label: "PLY",   active: !!densePly },
    { label: "OBJ",   active: !!meshObj },
    { label: "POSES", active: !!posesArt },
    { label: "CONF",  active: !!confGlb },
    { label: "GEO",   active: !!georefGlb },
  ];

  return (
    <div style={{ background: "#080e18", minHeight: "calc(100vh - 64px)", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>

      {/* Subtle engineering dot grid */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, backgroundImage: "radial-gradient(rgba(2,132,199,0.055) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />

      {/* ── TOP HEADER BAR ───────────────────────────────────────────────── */}
      <div style={{ position: "relative", zIndex: 10, borderBottom: "1px solid rgba(148,163,184,0.08)", background: "rgba(8,14,24,0.93)", backdropFilter: "blur(8px)", padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", height: "52px", flexShrink: 0 }}>

        {/* Left: Back + identity */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <button onClick={() => setActivePage("dashboard")}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 10px", background: "transparent", border: "1px solid rgba(148,163,184,0.15)", borderRadius: "5px", cursor: "pointer", color: "rgba(148,163,184,0.8)", fontSize: "0.75rem", fontWeight: 600, fontFamily: "inherit", transition: "all 0.15s ease" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(148,163,184,0.08)"; e.currentTarget.style.color = "#e2e8f0"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(148,163,184,0.8)"; }}
          >
            <ArrowLeft size={12} /> Dashboard
          </button>

          <div style={{ width: "1px", height: "20px", background: "rgba(148,163,184,0.12)" }} />

          {/* Identity row */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.14em", color: "rgba(148,163,184,0.4)", textTransform: "uppercase" }}>RECON-X /</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.06em", color: "#e2e8f0" }}>DIGITAL TWIN</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.1em", color: "rgba(148,163,184,0.3)" }}>#{jobShortId}</span>
            <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "2px 7px", background: jobStatus === "COMPLETED" ? "rgba(16,185,129,0.08)" : "rgba(2,132,199,0.08)", border: `1px solid ${jobStatus === "COMPLETED" ? "rgba(16,185,129,0.2)" : "rgba(2,132,199,0.2)"}`, borderRadius: "3px" }}>
              <StatusDot color={jobStatus === "COMPLETED" ? "#10b981" : "#0284c7"} />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.1em", color: jobStatus === "COMPLETED" ? "#10b981" : "#0284c7" }}>{jobStatus}</span>
            </div>
            {georefGlb && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "2px 7px", background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)", borderRadius: "3px" }}>
                <Globe size={9} color="#10b981" />
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.08em", color: "#10b981" }}>WGS84</span>
              </div>
            )}
            {isRapidOnly && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "2px 7px", background: "rgba(2,132,199,0.06)", border: "1px solid rgba(2,132,199,0.15)", borderRadius: "3px" }}>
                <Zap size={9} color="#0284c7" />
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.08em", color: "#0284c7" }}>RAPID L1</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Action controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {availableJobs.length > 0 && (
            <select value={activeJobId || ""} onChange={e => { if (setActiveJobId) setActiveJobId(e.target.value); }}
              style={{ fontSize: "0.7rem", padding: "4px 8px", borderRadius: "5px", border: "1px solid rgba(148,163,184,0.15)", background: "rgba(148,163,184,0.06)", color: "#94a3b8", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, cursor: "pointer", outline: "none", maxWidth: "200px" }}
            >
              {availableJobs.map(j => (
                <option key={j.id} value={j.id} style={{ background: "#0f172a" }}>{j.missionName} — {j.id.slice(0, 8)}</option>
              ))}
              <option value="demo-survey-model" style={{ background: "#0f172a" }}>Survey Twin (Sample)</option>
            </select>
          )}
          <button onClick={() => setActivePage("analytics")}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 12px", background: "transparent", border: "1px solid rgba(148,163,184,0.15)", borderRadius: "5px", cursor: "pointer", color: "rgba(148,163,184,0.8)", fontSize: "0.72rem", fontWeight: 600, fontFamily: "inherit", transition: "all 0.15s ease" }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(148,163,184,0.08)"; e.currentTarget.style.color = "#e2e8f0"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(148,163,184,0.8)"; }}
          >
            <ShieldCheck size={12} /> Quality Report
          </button>
          <button onClick={() => setShowExportDrawer(!showExportDrawer)}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 14px", background: showExportDrawer ? "#0369a1" : "#0284c7", border: "1px solid #0284c7", borderRadius: "5px", cursor: "pointer", color: "#ffffff", fontSize: "0.72rem", fontWeight: 700, fontFamily: "inherit", transition: "all 0.15s ease", letterSpacing: "0.02em" }}
            onMouseEnter={e => { e.currentTarget.style.background = "#0369a1"; }}
            onMouseLeave={e => { e.currentTarget.style.background = showExportDrawer ? "#0369a1" : "#0284c7"; }}
          >
            <Download size={12} /> Export
          </button>
        </div>
      </div>

      {/* ── EXPORT DRAWER ────────────────────────────────────────────────── */}
      {showExportDrawer && (
        <div style={{ position: "relative", zIndex: 9, background: "rgba(8,14,24,0.96)", borderBottom: "1px solid rgba(148,163,184,0.1)", padding: "16px 24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "20px" }}>
          {/* 3D Surface Models */}
          <div>
            <HUDLabel style={{ display: "block", marginBottom: "8px" }}>3D Surface Models — Feature 16</HUDLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              {georefGlb && <ExportLink href={apiClient.getArtifactDownloadUrl(activeJobId, "georeferenced_model_glb")} download="georeferenced_model.glb" label="georeferenced_model.glb" sublabel="WGS84" accent />}
              {texturedGlb && <ExportLink href={apiClient.getArtifactDownloadUrl(activeJobId, "textured_model_glb")} download="textured_model.glb" label="textured_model.glb" sublabel="PBR" />}
              {cleanPly && <ExportLink href={apiClient.getArtifactDownloadUrl(activeJobId, "model_clean_ply")} download="model_clean.ply" label="model_clean.ply" sublabel="Mesh" />}
              {meshObj && <ExportLink href={apiClient.getArtifactDownloadUrl(activeJobId, meshObj.artifact_type)} download="model.obj" label="mesh.obj" sublabel="Wavefront" />}
            </div>
          </div>
          {/* Point Clouds */}
          <div>
            <HUDLabel style={{ display: "block", marginBottom: "8px" }}>Point Clouds — Feature 17</HUDLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              {densePly && <ExportLink href={apiClient.getArtifactDownloadUrl(activeJobId, densePly.artifact_type)} download="dense_point_cloud.ply" label="dense_point_cloud.ply" sublabel="MVS" />}
              <ExportLink href={apiClient.getArtifactDownloadUrl(activeJobId, "sparse_ply")} download="sparse_point_cloud.ply" label="sparse_point_cloud.ply" sublabel="SfM" />
            </div>
          </div>
          {/* Quality Reports */}
          <div>
            <HUDLabel style={{ display: "block", marginBottom: "8px" }}>Quality and Accuracy — Feature 18</HUDLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              {accuracyArt && <ExportLink href={apiClient.getArtifactDownloadUrl(activeJobId, accuracyArt.artifact_type)} download="accuracy_report.json" label="accuracy_report.json" sublabel="RMSE/CE90" />}
              {confReportArt && <ExportLink href={apiClient.getArtifactDownloadUrl(activeJobId, confReportArt.artifact_type)} download="confidence_report.json" label="confidence_report.json" sublabel="8 Streams" />}
              {scaleArt && <ExportLink href={apiClient.getArtifactDownloadUrl(activeJobId, scaleArt.artifact_type)} download="scale_report.json" label="scale_report.json" sublabel="Metric Scale" />}
              <ExportLink href={apiClient.getArtifactDownloadUrl(activeJobId, "benchmark_report_pdf")} download="benchmark_report.pdf" label="benchmark_report.pdf" sublabel="Scientific PDF" accent />
              <ExportLink href={apiClient.getArtifactDownloadUrl(activeJobId, "benchmark_report_json")} download="benchmark_report.json" label="benchmark_report.json" sublabel="10 Metrics" />
            </div>
          </div>
          {/* Full Bundle */}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <HUDLabel style={{ display: "block", marginBottom: "8px" }}>Complete Archive</HUDLabel>
            <p style={{ fontSize: "0.67rem", color: "rgba(148,163,184,0.5)", marginBottom: "8px", lineHeight: 1.5 }}>
              All 3D models, point clouds, georeferencing data and reports bundled as ZIP.
            </p>
            <a href={apiClient.getExportBundleUrl(activeJobId)} download={`uav_digital_twin_bundle_${activeJobId.slice(0, 8)}.zip`}
              style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "8px 16px", background: "#0284c7", border: "1px solid #0284c7", borderRadius: "5px", textDecoration: "none", color: "#fff", fontSize: "0.72rem", fontWeight: 700, fontFamily: "inherit", letterSpacing: "0.02em" }}
            >
              <Download size={12} /> Download Full Bundle (.ZIP)
            </a>
          </div>
        </div>
      )}

      {/* ── MAIN VIEWPORT AREA ───────────────────────────────────────────── */}
      <div style={{ flex: 1, position: "relative", minHeight: "520px", zIndex: 1 }}>

        {/* ── The 3D model — COMPLETELY UNTOUCHED ─────────────────────── */}
        <div style={{ position: "absolute", inset: 0 }}>
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
            subtitle="Precise Engineering and Photogrammetric Inspection Visualization"
          />
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            FLOATING HUD OVERLAYS — purely visual, all pointerEvents managed
        ═══════════════════════════════════════════════════════════════════ */}

        {/* TOP-LEFT: Reconstruction identity */}
        <HUDPanel style={{ position: "absolute", top: "14px", left: "14px", padding: "10px 14px", minWidth: "180px", pointerEvents: "none" }}>
          <div style={{ marginBottom: "6px" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.14em", color: "rgba(148,163,184,0.45)", textTransform: "uppercase", marginBottom: "2px" }}>DIGITAL TWIN</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.9rem", fontWeight: 700, color: "#e2e8f0", letterSpacing: "0.04em", lineHeight: 1.2 }}>RECONSTRUCTION</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.7rem", fontWeight: 700, color: recoStatus.color, letterSpacing: "0.04em" }}>#{jobShortId}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "5px", paddingTop: "6px", borderTop: "1px solid rgba(148,163,184,0.08)" }}>
            <StatusDot color={recoStatus.color} />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.1em", color: recoStatus.color, textTransform: "uppercase" }}>{recoStatus.label}</span>
          </div>
          {recoStatus.sublabel && (
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.56rem", color: "rgba(148,163,184,0.4)", letterSpacing: "0.06em", marginTop: "2px" }}>{recoStatus.sublabel}</div>
          )}
        </HUDPanel>

        {/* TOP-RIGHT: Scene metadata / coordinates */}
        {(parsedCoordinates || georefGlb) && (
          <HUDPanel style={{ position: "absolute", top: "14px", right: "14px", padding: "10px 14px", minWidth: "200px", pointerEvents: "none" }}>
            <HUDLabel style={{ display: "block", marginBottom: "6px" }}>Scene Metadata</HUDLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {parsedCoordinates?.datum && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                  <HUDLabel>Datum</HUDLabel><HUDValue>{parsedCoordinates.datum}</HUDValue>
                </div>
              )}
              {parsedCoordinates?.utm_zone && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                  <HUDLabel>UTM Zone</HUDLabel><HUDValue>{parsedCoordinates.utm_zone}</HUDValue>
                </div>
              )}
              {parsedCoordinates?.origin_lat != null && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                  <HUDLabel>Lat</HUDLabel><HUDValue>{Number(parsedCoordinates.origin_lat).toFixed(6)}°</HUDValue>
                </div>
              )}
              {parsedCoordinates?.origin_lon != null && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                  <HUDLabel>Lon</HUDLabel><HUDValue>{Number(parsedCoordinates.origin_lon).toFixed(6)}°</HUDValue>
                </div>
              )}
              {parsedCoordinates?.altitude_m != null && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                  <HUDLabel>Alt</HUDLabel><HUDValue>{Number(parsedCoordinates.altitude_m).toFixed(1)} m</HUDValue>
                </div>
              )}
              {!parsedCoordinates && georefGlb && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                  <HUDLabel>CRS</HUDLabel><HUDValue style={{ color: "#10b981" }}>WGS84</HUDValue>
                </div>
              )}
            </div>
          </HUDPanel>
        )}

        {/* BOTTOM-CENTER: Confidence mode controls */}
        <div style={{ position: "absolute", bottom: "14px", left: "50%", transform: "translateX(-50%)", pointerEvents: "auto" }}>
          <HUDPanel style={{ display: "flex", alignItems: "center", gap: "2px", padding: "4px", borderRadius: "7px" }}>
            <div style={{ padding: "4px 10px", borderRight: "1px solid rgba(148,163,184,0.1)" }}>
              <HUDLabel>Confidence Mode</HUDLabel>
            </div>
            {confidenceBtns.map(btn => (
              <button key={btn.key} onClick={() => setConfidenceMode(btn.key)}
                style={{
                  padding: "5px 12px",
                  background: confidenceMode === btn.key ? (btn.color ? `${btn.color}18` : "rgba(2,132,199,0.2)") : "transparent",
                  border: confidenceMode === btn.key ? `1px solid ${btn.color || "#0284c7"}40` : "1px solid transparent",
                  borderRadius: "5px", cursor: "pointer",
                  color: confidenceMode === btn.key ? (btn.color || "#7dd3fc") : "rgba(148,163,184,0.55)",
                  fontFamily: "'JetBrains Mono', monospace", fontSize: "0.65rem", fontWeight: 700,
                  letterSpacing: "0.04em", transition: "all 0.15s ease", whiteSpace: "nowrap"
                }}
                onMouseEnter={e => { if (confidenceMode !== btn.key) { e.currentTarget.style.color = "#94a3b8"; e.currentTarget.style.background = "rgba(148,163,184,0.06)"; } }}
                onMouseLeave={e => { if (confidenceMode !== btn.key) { e.currentTarget.style.color = "rgba(148,163,184,0.55)"; e.currentTarget.style.background = "transparent"; } }}
              >
                {btn.label}
              </button>
            ))}
            {confidenceStats?.tier_statistics && (
              <>
                <div style={{ width: "1px", height: "16px", background: "rgba(148,163,184,0.1)", margin: "0 4px" }} />
                <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "0 8px" }}>
                  {[["#10b981", confidenceStats.tier_statistics.high_confidence_percentage],
                    ["#f59e0b", confidenceStats.tier_statistics.medium_confidence_percentage],
                    ["#475569", confidenceStats.tier_statistics.unknown_percentage]].map(([clr, val]) => (
                    <span key={clr} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <StatusDot color={clr} />
                      <HUDValue style={{ fontSize: "0.62rem", color: clr }}>{val}%</HUDValue>
                    </span>
                  ))}
                </div>
              </>
            )}
          </HUDPanel>
        </div>

        {/* BOTTOM-LEFT: Artifact availability chips */}
        <HUDPanel style={{ position: "absolute", bottom: "14px", left: "14px", padding: "8px 12px", pointerEvents: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "5px" }}>
            <div style={{ width: "16px", height: "1px", background: "rgba(148,163,184,0.4)" }} />
            <HUDLabel>Artifacts</HUDLabel>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", maxWidth: "180px" }}>
            {artifactChips.map(art => (
              <span key={art.label} style={{
                padding: "1px 5px", borderRadius: "3px",
                fontFamily: "'JetBrains Mono', monospace", fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.06em",
                background: art.active ? "rgba(2,132,199,0.12)" : "rgba(148,163,184,0.04)",
                color: art.active ? "#7dd3fc" : "rgba(148,163,184,0.22)",
                border: `1px solid ${art.active ? "rgba(2,132,199,0.2)" : "rgba(148,163,184,0.06)"}`,
                textDecoration: art.active ? "none" : "line-through"
              }}>{art.label}</span>
            ))}
          </div>
        </HUDPanel>

        {/* BOTTOM-RIGHT: Reconstruction quality mini bar chart */}
        {confidenceStats?.tier_statistics && (
          <HUDPanel style={{ position: "absolute", bottom: "14px", right: "14px", padding: "8px 14px", pointerEvents: "none", minWidth: "160px" }}>
            <HUDLabel style={{ display: "block", marginBottom: "6px" }}>Reconstruction Quality</HUDLabel>
            {[
              { label: "High",    val: confidenceStats.tier_statistics.high_confidence_percentage,   color: "#10b981" },
              { label: "Med",     val: confidenceStats.tier_statistics.medium_confidence_percentage, color: "#f59e0b" },
              { label: "Unknown", val: confidenceStats.tier_statistics.unknown_percentage,           color: "#475569" },
            ].map(row => (
              <div key={row.label} style={{ marginBottom: "4px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                  <HUDLabel>{row.label}</HUDLabel>
                  <HUDValue style={{ fontSize: "0.62rem", color: row.color }}>{row.val}%</HUDValue>
                </div>
                <div style={{ height: "3px", background: "rgba(148,163,184,0.08)", borderRadius: "2px", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${row.val}%`, background: row.color, borderRadius: "2px", opacity: 0.7 }} />
                </div>
              </div>
            ))}
            <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.53rem", color: "rgba(148,163,184,0.3)", marginTop: "4px", lineHeight: 1.4, fontStyle: "italic" }}>
              Zero geometry invented for<br />unobserved surfaces
            </p>
          </HUDPanel>
        )}

      </div>

      {/* ── BOTTOM STATUS STRIP ──────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, height: "28px", background: "rgba(8,14,24,0.95)", borderTop: "1px solid rgba(148,163,184,0.07)", display: "flex", alignItems: "center", padding: "0 16px", gap: "20px", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <StatusDot color="#10b981" />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", fontWeight: 700, letterSpacing: "0.08em", color: "rgba(148,163,184,0.5)" }}>ENGINE: THREE.JS</span>
        </div>
        <div style={{ width: "1px", height: "12px", background: "rgba(148,163,184,0.1)" }} />
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", fontWeight: 600, letterSpacing: "0.08em", color: "rgba(148,163,184,0.35)" }}>
          MISSION: {jobInfo?.drone_model || "UAV PHOTOGRAMMETRY"} · STAGE: {(jobInfo?.current_stage || "COMPLETED").toUpperCase().replace(/_/g, " ")}
        </span>
        {parsedCoordinates?.datum && (
          <>
            <div style={{ width: "1px", height: "12px", background: "rgba(148,163,184,0.1)" }} />
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", fontWeight: 600, letterSpacing: "0.08em", color: "rgba(148,163,184,0.35)" }}>
              CRS: {parsedCoordinates.datum}{parsedCoordinates.utm_zone ? ` · ZONE ${parsedCoordinates.utm_zone}` : ""}
            </span>
          </>
        )}
        <div style={{ marginLeft: "auto" }} />
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "0.58rem", fontWeight: 600, letterSpacing: "0.08em", color: "rgba(148,163,184,0.22)" }}>
          RECON-X · SIH-001 · v3.0
        </span>
      </div>

    </div>
  );
}
