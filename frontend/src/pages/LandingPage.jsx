import React, { useEffect, useState, useMemo, useRef } from 'react';
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
  MapPin,
  Search,
  Crosshair,
  TrendingUp,
  HardDrive,
  Clock,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  Database,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Ruler,
  Maximize2,
  Mouse,
  Camera,
  Film,
  Scan,
  Grid
} from 'lucide-react';
import { apiClient } from '../api/client';
import StatusBadge from '../components/StatusBadge';

const PIPELINE_SEQUENCE = [
  {
    num: "01",
    id: "video-ingest",
    phase: "RAW DRONE VIDEO",
    title: "VIDEO INGEST",
    explanation: "Continuous 4K UAV video ingestion with automated timestamp, EXIF metadata, and camera intrinsic calibration.",
    spec: "4K @ 30FPS | MP4 / H.264 | TIME-SERIES",
    icon: Film,
    formula: "K = [[fx, 0, cx], [0, fy, cy], [0, 0, 1]]",
    details: "Lossless frame demuxing with temporal synchronization and sensor IMU orientation binding."
  },
  {
    num: "02",
    id: "keyframe-selection",
    phase: "KEYFRAMES",
    title: "KEYFRAME SELECTION",
    explanation: "Motion-blur filtering and optical flow displacement ensure optimal baseline parallax.",
    spec: "LAPLACIAN σ² > 180 | BASELINE Δd ≥ 1.2m",
    icon: Layers,
    formula: "Var(∇²I) > τ_sharp ∧ ||Δx||_flow ≥ τ_baseline",
    details: "Rejects stationary hovering frames and blurred pitch/roll transitions to preserve SfM conditioning."
  },
  {
    num: "03",
    id: "feature-matching",
    title: "FEATURE MATCHING",
    explanation: "Invariant feature keypoint detection and cross-frame bidirectional descriptor matching.",
    spec: "SIFT / ORB DESCRIPTORS | RANSAC 94.2% INLIERS",
    icon: Crosshair,
    formula: "d(f_i, f_j) < 0.75 · d(f_i, f'_j)",
    details: "Robust Lowe's ratio test paired with fundamental matrix epipolar geometry verification."
  },
  {
    num: "04",
    id: "camera-pose",
    phase: "CAMERA TRAJECTORY",
    title: "CAMERA POSE",
    explanation: "6-DoF trajectory estimation recovering camera position, rotation, and exterior orientation.",
    spec: "SE(3) RIGID MOTION | [R|t] QUATERNION BUNDLE ADJ",
    icon: Compass,
    formula: "min_{R,t} ∑ ||x_ij - π(K(R_i X_j + t_i))||²",
    details: "Nonlinear Levenberg-Marquardt bundle adjustment minimizing global reprojection residuals."
  },
  {
    num: "05",
    id: "ai-depth",
    phase: "DEPTH",
    title: "AI DEPTH",
    explanation: "Monocular and stereo neural disparity inference generating continuous metric depth maps.",
    spec: "METRIC DEPTH FIELD | DUAL-DISPARITY ESTIMATION",
    icon: Scan,
    formula: "D(u, v) = (f_x · Baseline) / d(u, v)",
    details: "Neural foundation depth models combined with multi-baseline cost volume regularization."
  },
  {
    num: "06",
    id: "depth-pose-fusion",
    title: "DEPTH + POSE FUSION",
    explanation: "Multi-view geometric fusion correlating camera poses with verified depth projections.",
    spec: "EPIPOLAR RAY CONSISTENCY | REPROJECTION < 1.5px",
    icon: Cpu,
    formula: "||X_proj - X_triang||_2 < ε_parallax",
    details: "Fuses per-view depth maps into an unoccluded spatial volume with photometric consensus."
  },
  {
    num: "07",
    id: "point-cloud",
    phase: "POINT CLOUD",
    title: "POINT CLOUD",
    explanation: "Dense 3D point cloud generation with per-point photometric RGB and surface normal vectors.",
    spec: "DENSE MVS | 420 PTS/m² | XYZ-RGB NORMAL TENSORS",
    icon: Database,
    formula: "P_k = [x, y, z, r, g, b, n_x, n_y, n_z]^T",
    details: "Spatial octree organization with statistical outlier removal and normal tensor estimation."
  },
  {
    num: "08",
    id: "mesh-reconstruction",
    phase: "MESH",
    title: "MESH RECONSTRUCTION",
    explanation: "Watertight Poisson surface reconstruction and Delaunay triangulation creating continuous geometry.",
    spec: "DELAUNAY SURFACE | 1.18M FACES | POLYGON TOPOLOGY",
    icon: Box,
    formula: "∇ · ∇χ = ∇ · V_normal",
    details: "Implicit indicator function solving screened Poisson PDE for seamless topological manifolds."
  },
  {
    num: "09",
    id: "texture-mapping",
    title: "TEXTURE MAPPING",
    explanation: "Orthorectified high-resolution UV atlas synthesis and exposure-balanced texture projection.",
    spec: "4096×4096 UV ATLAS | ALBEDO EQUALIZATION",
    icon: Grid,
    formula: "T(u, v) = ∑ w_i · I_i(π_i(X(u,v)))",
    details: "Angle-weighted ray projection with Poisson gradient blending to eliminate shadow boundaries."
  },
  {
    num: "10",
    id: "digital-twin",
    phase: "TEXTURED 3D SCENE",
    title: "DIGITAL TWIN",
    explanation: "Georeferenced spatial digital twin calibrated to WGS84 datum with millimeter CE90 accuracy.",
    spec: "DATUM WGS84 | CE90 ±1.5mm | OBJ / GLTF / PLY",
    icon: ShieldCheck,
    formula: "X_geo = s · R_helmert · X_local + T_enu",
    details: "Certified 7-parameter Sim(3) georeferencing exportable to standard CAD, GIS, and 3D pipelines."
  }
];

const PROGRESSION_MILESTONES = [
  { label: "RAW DRONE VIDEO", stepIndices: [0] },
  { label: "KEYFRAMES", stepIndices: [1] },
  { label: "CAMERA TRAJECTORY", stepIndices: [2, 3] },
  { label: "DEPTH", stepIndices: [4, 5] },
  { label: "POINT CLOUD", stepIndices: [6] },
  { label: "MESH", stepIndices: [7] },
  { label: "TEXTURED 3D SCENE", stepIndices: [8, 9] }
];

function StageMicroVisual({ num, isActive }) {
  const strokeColor = isActive ? "#0f766e" : "#64748b";
  const accentColor = isActive ? "#0f766e" : "#94a3b8";

  switch (num) {
    case "01": // Video Ingest - Sensor raster & timecode frames
      return (
        <svg width="56" height="30" viewBox="0 0 56 30" fill="none" aria-hidden="true">
          <rect x="2" y="3" width="52" height="24" rx="2" stroke={strokeColor} strokeWidth="1" strokeDasharray="3 2" opacity="0.4" />
          <rect x="6" y="6" width="44" height="18" rx="1" stroke={strokeColor} strokeWidth="1.2" />
          <circle cx="28" cy="15" r="2.5" fill={accentColor} />
          <line x1="12" y1="21" x2="12" y2="23" stroke={strokeColor} strokeWidth="1" />
          <line x1="20" y1="21" x2="20" y2="23" stroke={strokeColor} strokeWidth="1" />
          <line x1="36" y1="21" x2="36" y2="23" stroke={strokeColor} strokeWidth="1" />
          <line x1="44" y1="21" x2="44" y2="23" stroke={strokeColor} strokeWidth="1" />
        </svg>
      );
    case "02": // Keyframe Selection - Laplacian variance curve with keyframe peaks
      return (
        <svg width="56" height="30" viewBox="0 0 56 30" fill="none" aria-hidden="true">
          <line x1="2" y1="18" x2="54" y2="18" stroke={strokeColor} strokeWidth="0.8" strokeDasharray="2 2" opacity="0.35" />
          <path d="M4 24 C10 24 13 8 18 8 C23 8 26 24 31 24 C36 24 38 12 43 12 C48 12 50 24 54 24" stroke={strokeColor} strokeWidth="1.2" fill="none" />
          <circle cx="18" cy="8" r="2.5" fill={accentColor} />
          <circle cx="43" cy="12" r="2.5" fill={accentColor} />
        </svg>
      );
    case "03": // Feature Matching - Epipolar tie vectors
      return (
        <svg width="56" height="30" viewBox="0 0 56 30" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="18" height="24" rx="1" stroke={strokeColor} strokeWidth="1" opacity="0.5" />
          <rect x="35" y="3" width="18" height="24" rx="1" stroke={strokeColor} strokeWidth="1" opacity="0.5" />
          <circle cx="12" cy="10" r="2" fill={accentColor} />
          <circle cx="14" cy="20" r="2" fill={accentColor} />
          <circle cx="44" cy="10" r="2" fill={accentColor} />
          <circle cx="46" cy="20" r="2" fill={accentColor} />
          <line x1="12" y1="10" x2="44" y2="10" stroke={accentColor} strokeWidth="1" strokeDasharray="2 2" />
          <line x1="14" y1="20" x2="46" y2="20" stroke={accentColor} strokeWidth="1" strokeDasharray="2 2" />
        </svg>
      );
    case "04": // Camera Pose - 6-DoF trajectory & frustum
      return (
        <svg width="56" height="30" viewBox="0 0 56 30" fill="none" aria-hidden="true">
          <path d="M4 22 Q18 8 30 16 T52 6" stroke={strokeColor} strokeWidth="1" strokeDasharray="2 2" opacity="0.45" />
          <polygon points="30,15 42,10 42,22" stroke={strokeColor} strokeWidth="1.2" fill="none" opacity="0.8" />
          <circle cx="30" cy="15" r="2.5" fill={accentColor} />
          <line x1="30" y1="15" x2="25" y2="12" stroke="#0284c7" strokeWidth="1.2" />
          <line x1="30" y1="15" x2="30" y2="9" stroke="#059669" strokeWidth="1.2" />
        </svg>
      );
    case "05": // AI Depth - Metric disparity isolines
      return (
        <svg width="56" height="30" viewBox="0 0 56 30" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="50" height="24" rx="2" stroke={strokeColor} strokeWidth="0.9" opacity="0.4" />
          <path d="M7 21 Q22 13 36 19 T49 11" stroke={accentColor} strokeWidth="1.2" fill="none" />
          <path d="M7 15 Q19 7 34 13 T49 6" stroke="#0284c7" strokeWidth="1.1" fill="none" opacity="0.75" />
          <line x1="26" y1="5" x2="26" y2="25" stroke={strokeColor} strokeWidth="0.8" strokeDasharray="1 2" opacity="0.3" />
        </svg>
      );
    case "06": // Depth + Pose Fusion - Multi-view ray intersection
      return (
        <svg width="56" height="30" viewBox="0 0 56 30" fill="none" aria-hidden="true">
          <circle cx="10" cy="7" r="2.5" fill="#0284c7" />
          <circle cx="46" cy="7" r="2.5" fill="#0284c7" />
          <path d="M12 25 Q28 21 44 25" stroke={strokeColor} strokeWidth="1.1" opacity="0.5" />
          <circle cx="28" cy="22" r="2.5" fill={accentColor} />
          <line x1="10" y1="7" x2="28" y2="22" stroke={accentColor} strokeWidth="1.1" strokeDasharray="2 2" />
          <line x1="46" y1="7" x2="28" y2="22" stroke={accentColor} strokeWidth="1.1" strokeDasharray="2 2" />
        </svg>
      );
    case "07": // Point Cloud - 3D spatial points with normal vectors
      return (
        <svg width="56" height="30" viewBox="0 0 56 30" fill="none" aria-hidden="true">
          <circle cx="8" cy="18" r="1.5" fill={accentColor} />
          <circle cx="16" cy="12" r="1.5" fill={accentColor} />
          <circle cx="24" cy="22" r="1.5" fill={accentColor} />
          <circle cx="30" cy="11" r="2" fill={accentColor} />
          <circle cx="38" cy="17" r="1.5" fill={accentColor} />
          <circle cx="48" cy="20" r="1.5" fill={accentColor} />
          <line x1="30" y1="11" x2="30" y2="5" stroke={accentColor} strokeWidth="1.1" />
          <line x1="16" y1="12" x2="14" y2="6" stroke={accentColor} strokeWidth="1" opacity="0.7" />
        </svg>
      );
    case "08": // Mesh Reconstruction - Delaunay wireframe triangulation
      return (
        <svg width="56" height="30" viewBox="0 0 56 30" fill="none" aria-hidden="true">
          <polygon points="10,22 22,8 34,22" stroke={strokeColor} strokeWidth="1.1" fill="none" opacity="0.6" />
          <polygon points="22,8 38,6 34,22" stroke={accentColor} strokeWidth="1.2" fill={isActive ? "rgba(15,118,110,0.14)" : "rgba(148,163,184,0.12)"} />
          <polygon points="34,22 38,6 48,20" stroke={strokeColor} strokeWidth="1.1" fill="none" opacity="0.6" />
          <circle cx="22" cy="8" r="2" fill={accentColor} />
          <circle cx="38" cy="6" r="2" fill={accentColor} />
          <circle cx="34" cy="22" r="2" fill={accentColor} />
        </svg>
      );
    case "09": // Texture Mapping - Orthogonal UV mapping projection
      return (
        <svg width="56" height="30" viewBox="0 0 56 30" fill="none" aria-hidden="true">
          <rect x="5" y="4" width="20" height="22" stroke={strokeColor} strokeWidth="1" opacity="0.5" />
          <line x1="5" y1="15" x2="25" y2="15" stroke={strokeColor} strokeWidth="0.8" opacity="0.3" />
          <line x1="15" y1="4" x2="15" y2="26" stroke={strokeColor} strokeWidth="0.8" opacity="0.3" />
          <path d="M27 15 L35 15" stroke={accentColor} strokeWidth="1.2" strokeDasharray="2 1" />
          <polygon points="39,8 51,11 47,24 37,18" stroke={accentColor} strokeWidth="1.2" fill={isActive ? "rgba(15,118,110,0.12)" : "transparent"} />
        </svg>
      );
    case "10": // Digital Twin - Georeferenced WGS84 target
    default:
      return (
        <svg width="56" height="30" viewBox="0 0 56 30" fill="none" aria-hidden="true">
          <circle cx="28" cy="15" r="11" stroke={strokeColor} strokeWidth="0.9" strokeDasharray="2 2" opacity="0.4" />
          <circle cx="28" cy="15" r="5.5" stroke={accentColor} strokeWidth="1.2" />
          <line x1="28" y1="1" x2="28" y2="29" stroke={strokeColor} strokeWidth="0.9" opacity="0.5" />
          <line x1="14" y1="15" x2="42" y2="15" stroke={strokeColor} strokeWidth="0.9" opacity="0.5" />
          <circle cx="28" cy="15" r="1.8" fill={accentColor} />
        </svg>
      );
  }
}

export default function LandingPage({ setActivePage, setActiveMissionId, setActiveJobId }) {
  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [hardware, setHardware] = useState(null);
  const [sysStatus, setSysStatus] = useState(null);
  const [activePipelineStep, setActivePipelineStep] = useState(0);

  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef(null);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  useEffect(() => {
    // 1. Fetch Missions
    apiClient.listMissions()
      .then(data => {
        setMissions(data);
        setLoading(false);
      })
      .catch(err => {
        console.warn("Could not load missions:", err);
        setLoading(false);
      });

    // 2. Fetch Hardware Telemetry
    apiClient.getSystemHardware()
      .then(data => setHardware(data))
      .catch(err => console.debug("Hardware query error:", err));

    // 3. Fetch Live System Status
    apiClient.getSystemStatus()
      .then(data => setSysStatus(data))
      .catch(err => console.debug("System status query error:", err));
  }, []);

  // Filtered Missions
  const filteredMissions = useMemo(() => {
    if (!searchQuery.trim()) return missions;
    const q = searchQuery.toLowerCase();
    return missions.filter(m => 
      (m.name && m.name.toLowerCase().includes(q)) ||
      (m.id && m.id.toLowerCase().includes(q)) ||
      (m.status && m.status.toLowerCase().includes(q))
    );
  }, [missions, searchQuery]);

  // Derived Real Platform Metrics
  const platformStats = useMemo(() => {
    const total = missions.length;
    const completed = missions.filter(m => m.status === 'completed' || (m.jobs && m.jobs.some(j => j.status === 'completed'))).length;
    const active = missions.filter(m => m.status === 'processing' || m.status === 'ready').length;
    const totalBytes = missions.reduce((acc, m) => acc + (m.video_size_bytes || 0), 0);
    const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);
    
    // Average GSD
    const validGsds = missions.filter(m => m.target_gsd_cm).map(m => m.target_gsd_cm);
    const avgGsd = validGsds.length > 0 
      ? (validGsds.reduce((a, b) => a + b, 0) / validGsds.length).toFixed(1)
      : '1.8';

    // Health Score (% successful or active)
    const healthPct = total > 0 ? Math.round(((total - missions.filter(m => m.status === 'failed').length) / total) * 100) : 100;

    return { total, completed, active, totalMb, avgGsd, healthPct };
  }, [missions]);

  // Telemetry Overlay Data from first available mission
  const activeMission = missions.find(m => m.status === 'ready' || m.status === 'completed') || missions[0];

  return (
    <div className="geospatial-canvas" style={{ minHeight: '100vh', position: 'relative', overflowX: 'hidden' }}>
      {/* Topographic Contour Overlay Background */}
      <div className="topographic-overlay" />

      <div style={{ maxWidth: '1360px', margin: '0 auto', padding: '36px 24px 60px 24px', position: 'relative', zIndex: 2 }}>
        
        {/* ── 1. CINEMATIC SPATIAL RECONSTRUCTION HERO ── */}
        <div className="recon-hero-container">
          {/* Full-Bleed Drone Survey Video Background (Realistic aerial environment: buildings, roads, terrain, vegetation) */}
          <video
            ref={videoRef}
            src="/drone_survey_hero.mp4"
            autoPlay
            loop
            muted
            playsInline
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center 28%',
              zIndex: 0,
              pointerEvents: 'none',
              filter: 'none',
              opacity: 0.96
            }}
          />

          {/* Precision Light Geospatial Scrim for Superior Readability */}
          <div className="recon-hero-scrim" />

          {/* Minimal Floating Top Header Bar */}
          <div style={{
            position: 'relative',
            zIndex: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderBottom: '1px solid rgba(226, 232, 240, 0.65)',
            background: 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className="telemetry-chip" style={{ background: '#ffffff', color: '#0f766e', borderColor: 'var(--border-subtle)', fontWeight: 700 }}>
                RECON-X / SPATIAL RECONSTRUCTION
              </span>
              <span style={{
                fontSize: '0.68rem',
                fontWeight: 600,
                color: 'var(--status-ready)',
                background: 'var(--status-ready-bg)',
                border: '1px solid var(--status-ready-border)',
                padding: '2px 8px',
                borderRadius: '4px',
                fontFamily: 'var(--font-mono)'
              }}>
                ● FLIGHT ENGINE READY
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="font-mono" style={{ fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', gap: '12px' }}>
                <span>DATUM: WGS84 / EPSG:4326</span>
                <span>GSD: {activeMission?.target_gsd_cm || '1.8'} CM/PX</span>
              </div>

              {/* Functional Audio & Video Playback Controls */}
              <div style={{
                display: 'flex',
                gap: '4px',
                alignItems: 'center',
                background: '#ffffff',
                padding: '3px 6px',
                borderRadius: '6px',
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-xs)'
              }}>
                <button
                  onClick={togglePlay}
                  title={isPlaying ? "Pause Drone Video" : "Play Drone Video"}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: '3px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '3px'
                  }}
                >
                  {isPlaying ? <Pause size={12} color="#0f766e" /> : <Play size={12} color="#0f766e" />}
                </button>
                <button
                  onClick={toggleMute}
                  title={isMuted ? "Unmute Audio" : "Mute Audio"}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: '3px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '3px'
                  }}
                >
                  {isMuted ? <VolumeX size={12} color="#94a3b8" /> : <Volume2 size={12} color="#059669" />}
                </button>
              </div>
            </div>
          </div>

          {/* Main Hero Content Area */}
          <div className="recon-hero-grid">
            
            {/* Left Content Column */}
            <div>
              {/* Technical Eyebrow Concept Banner */}
              <div style={{ 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '8px', 
                padding: '4px 10px', 
                borderRadius: '6px', 
                background: '#ffffff', 
                border: '1px solid var(--border-subtle)', 
                boxShadow: 'var(--shadow-xs)',
                marginBottom: '18px' 
              }}>
                <span className="font-mono" style={{ fontSize: '0.68rem', fontWeight: 700, color: '#0f766e', letterSpacing: '0.08em' }}>
                  ONE DRONE FLIGHT. ONE DIGITAL TWIN.
                </span>
              </div>

              {/* Main Heading */}
              <h1 style={{ 
                fontSize: 'clamp(2.3rem, 4vw, 3.3rem)', 
                fontWeight: 800, 
                letterSpacing: '-0.035em', 
                lineHeight: 1.08, 
                marginBottom: '16px', 
                color: '#0f172a'
              }}>
                TURN ONE DRONE FLIGHT <br />
                <span style={{ color: '#0f766e' }}>
                  INTO A DIGITAL TWIN.
                </span>
              </h1>

              {/* Supporting Text */}
              <p style={{ 
                fontSize: '1rem', 
                color: '#334155', 
                fontWeight: 500,
                lineHeight: 1.62, 
                marginBottom: '26px',
                maxWidth: '540px'
              }}>
                Transform a single continuous drone video into a measurable, photorealistic 3D representation of the captured environment.
              </p>

              {/* Functional CTA Buttons (Restyled into premium minimal controls) */}
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '28px' }}>
                <button 
                  onClick={() => setActivePage('create-mission')}
                  className="geo-btn-primary"
                  style={{
                    padding: '10px 20px',
                    fontSize: '0.86rem',
                    borderRadius: '6px',
                    background: '#0f172a',
                    borderColor: '#0f172a'
                  }}
                >
                  <Plane size={15} /> New Survey Mission <ArrowRight size={14} />
                </button>
                <button 
                  onClick={() => setActivePage('dashboard')}
                  className="geo-btn-secondary"
                  style={{
                    padding: '10px 20px',
                    fontSize: '0.86rem',
                    borderRadius: '6px',
                    background: '#ffffff'
                  }}
                >
                  <Activity size={15} color="#0f766e" /> Pipeline Monitor
                </button>
                {activeMission && (
                  <button 
                    onClick={() => {
                      setActiveMissionId(activeMission.id);
                      if (activeMission.jobs && activeMission.jobs.length > 0) {
                        setActiveJobId(activeMission.jobs[0].id);
                      }
                      setActivePage('viewer');
                    }}
                    className="geo-btn-secondary"
                    style={{
                      padding: '10px 18px',
                      fontSize: '0.86rem',
                      borderRadius: '6px',
                      background: '#ffffff'
                    }}
                  >
                    <Box size={15} color="#0284c7" /> Inspect 3D Twin
                  </button>
                )}
              </div>

              {/* Spatial Reconstruction Workflow Progression: Drone Capture → AI Reconstruction → 3D Digital Twin */}
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '6px',
                background: '#ffffff',
                border: '1px solid var(--border-subtle)',
                marginBottom: '28px',
                boxShadow: 'var(--shadow-xs)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Plane size={13} color="#0f766e" />
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
                    DRONE CAPTURE
                  </span>
                </div>
                <ChevronRight size={13} color="#94a3b8" />
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Cpu size={13} color="#0284c7" />
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
                    AI RECONSTRUCTION
                  </span>
                </div>
                <ChevronRight size={13} color="#94a3b8" />
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Box size={13} color="#059669" />
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>
                    3D DIGITAL TWIN
                  </span>
                </div>
              </div>

              {/* Subtle Technical Metadata Tiles (FRAME, CAMERA, DEPTH, POINT CLOUD) */}
              <div className="recon-hero-meta-grid">
                <div style={{ 
                  background: '#ffffff', 
                  border: '1px solid var(--border-subtle)', 
                  borderRadius: '6px', 
                  padding: '8px 10px',
                  boxShadow: 'var(--shadow-xs)' 
                }}>
                  <span className="text-tech-label" style={{ display: 'block', fontSize: '0.62rem' }}>FRAME</span>
                  <strong className="font-mono" style={{ fontSize: '0.85rem', color: '#0f172a' }}>
                    {activeMission?.video_total_frames ? String(activeMission.video_total_frames).padStart(5, '0') : '01842'}
                  </strong>
                </div>

                <div style={{ 
                  background: '#ffffff', 
                  border: '1px solid var(--border-subtle)', 
                  borderRadius: '6px', 
                  padding: '8px 10px',
                  boxShadow: 'var(--shadow-xs)' 
                }}>
                  <span className="text-tech-label" style={{ display: 'block', fontSize: '0.62rem' }}>CAMERA</span>
                  <strong className="font-mono" style={{ fontSize: '0.82rem', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>
                    {activeMission?.camera_model ? activeMission.camera_model.split(' ')[0] : 'ZENMUSE'} 35mm
                  </strong>
                </div>

                <div style={{ 
                  background: '#ffffff', 
                  border: '1px solid var(--border-subtle)', 
                  borderRadius: '6px', 
                  padding: '8px 10px',
                  boxShadow: 'var(--shadow-xs)' 
                }}>
                  <span className="text-tech-label" style={{ display: 'block', fontSize: '0.62rem' }}>DEPTH</span>
                  <strong className="font-mono" style={{ fontSize: '0.82rem', color: '#0f766e' }}>
                    STEREO SGBM
                  </strong>
                </div>

                <div style={{ 
                  background: '#ffffff', 
                  border: '1px solid var(--border-subtle)', 
                  borderRadius: '6px', 
                  padding: '8px 10px',
                  boxShadow: 'var(--shadow-xs)' 
                }}>
                  <span className="text-tech-label" style={{ display: 'block', fontSize: '0.62rem' }}>POINT CLOUD</span>
                  <strong className="font-mono" style={{ fontSize: '0.85rem', color: '#059669' }}>
                    {platformStats?.completed > 0 ? '2.41M PTS' : 'DENSE MVS'}
                  </strong>
                </div>
              </div>
            </div>

            {/* Right Column: High-Precision Spatial Inspection Viewport */}
            <div style={{ position: 'relative' }}>
              <div style={{ 
                background: '#ffffff', 
                borderRadius: '10px', 
                padding: '14px', 
                border: '1px solid var(--border-subtle)',
                boxShadow: 'var(--shadow-sm)'
              }}>
                {/* Viewport Top Bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="telemetry-chip">
                      <Crosshair size={11} color="#0f766e" /> SPATIAL PHOTOGRAMMETRY
                    </span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--status-ready)', background: 'var(--status-ready-bg)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--status-ready-border)' }}>
                      ● ACTIVE RECONSTRUCTION
                    </span>
                  </div>
                  <span className="font-mono" style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>
                    DATUM: WGS84 / EPSG:4326
                  </span>
                </div>

                {/* Viewport Frame with Realistic Aerial Environment Overlay */}
                <div style={{ 
                  height: '290px', 
                  borderRadius: '8px', 
                  background: '#09121f', 
                  position: 'relative', 
                  overflow: 'hidden',
                  border: '1px solid var(--border-subtle)'
                }}>
                  {/* Realistic Aerial Survey Background Image / Canvas */}
                  <img
                    src="/survey_orthomosaic_preview.jpg"
                    alt="Aerial Photogrammetric Survey Terrain"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      opacity: 0.82,
                      filter: 'contrast(1.05) brightness(0.95)'
                    }}
                  />

                  {/* Photogrammetric Coordinate Overlay Grid Lines */}
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage: 'linear-gradient(rgba(56, 189, 248, 0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(56, 189, 248, 0.12) 1px, transparent 1px)',
                    backgroundSize: '36px 36px',
                    pointerEvents: 'none'
                  }} />

                  {/* Target Crosshair & Survey Focus */}
                  <div style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 3, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Crosshair size={16} color="#38bdf8" />
                    <span className="font-mono" style={{ fontSize: '0.65rem', color: '#e0f2fe', background: 'rgba(15, 23, 42, 0.7)', padding: '1px 5px', borderRadius: '3px' }}>
                      TARGET GSD 1.8 CM/PX
                    </span>
                  </div>

                  {/* Precision Optical Scanner Frustum Frame */}
                  <div style={{
                    position: 'absolute',
                    top: '40px',
                    left: '50px',
                    right: '50px',
                    bottom: '48px',
                    border: '1.5px dashed rgba(56, 189, 248, 0.55)',
                    borderRadius: '4px',
                    pointerEvents: 'none'
                  }}>
                    {/* Corner Guides */}
                    <div style={{ position: 'absolute', top: '-4px', left: '-4px', width: '8px', height: '8px', borderTop: '2px solid #38bdf8', borderLeft: '2px solid #38bdf8' }} />
                    <div style={{ position: 'absolute', top: '-4px', right: '-4px', width: '8px', height: '8px', borderTop: '2px solid #38bdf8', borderRight: '2px solid #38bdf8' }} />
                    <div style={{ position: 'absolute', bottom: '-4px', left: '-4px', width: '8px', height: '8px', borderBottom: '2px solid #38bdf8', borderLeft: '2px solid #38bdf8' }} />
                    <div style={{ position: 'absolute', bottom: '-4px', right: '-4px', width: '8px', height: '8px', borderBottom: '2px solid #38bdf8', borderRight: '2px solid #38bdf8' }} />
                  </div>

                  {/* Right-edge CAD tool buttons */}
                  <div style={{
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    zIndex: 3,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '5px'
                  }}>
                    {[
                      { icon: Box, label: '3D Mesh' },
                      { icon: Layers, label: 'Dense Cloud' },
                      { icon: Ruler, label: 'Measure Metric' },
                      { icon: Maximize2, label: 'Expand Viewport' }
                    ].map((btn, idx) => (
                      <div
                        key={idx}
                        title={btn.label}
                        style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '4px',
                          background: 'rgba(15, 23, 42, 0.8)',
                          border: '1px solid rgba(56, 189, 248, 0.25)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#94a3b8',
                          cursor: 'pointer'
                        }}
                      >
                        <btn.icon size={12} color="#38bdf8" />
                      </div>
                    ))}
                  </div>

                  {/* 4-column telemetry bar inside bottom of viewport */}
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    zIndex: 3,
                    background: 'rgba(9, 18, 31, 0.94)',
                    borderTop: '1px solid rgba(56, 189, 248, 0.2)',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    padding: '7px 12px',
                    textAlign: 'center',
                    fontFamily: 'var(--font-mono)'
                  }}>
                    <div>
                      <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.58rem', letterSpacing: '0.04em' }}>ALTITUDE</span>
                      <strong style={{ color: '#38bdf8', fontSize: '0.76rem' }}>
                        {activeMission?.flight_altitude_m ? `${activeMission.flight_altitude_m}m AGL` : '45m AGL'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.58rem', letterSpacing: '0.04em' }}>GSD</span>
                      <strong style={{ color: '#34d399', fontSize: '0.76rem' }}>
                        {activeMission?.target_gsd_cm ? `${activeMission.target_gsd_cm} cm/px` : '1.8 cm/px'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.58rem', letterSpacing: '0.04em' }}>COORDS</span>
                      <strong style={{ color: '#f1f5f9', fontSize: '0.74rem' }}>37°46'N, 122°25'W</strong>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.58rem', letterSpacing: '0.04em' }}>OVERLAP</span>
                      <strong style={{ color: '#38bdf8', fontSize: '0.76rem' }}>
                        {activeMission?.overlap_forward_percent ? `${activeMission.overlap_forward_percent}%` : '80%'}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Sub-strip: Precision Metrics & Engineering Certification */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px' }}>
                  <div style={{
                    background: 'var(--bg-surface-subtle)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <span className="text-tech-label">SURVEY TOLERANCE</span>
                    <span className="font-mono" style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--status-ready)' }}>
                      ±1.5mm CE90
                    </span>
                  </div>
                  <div style={{
                    background: 'var(--bg-surface-subtle)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <span className="text-tech-label">POSE RANSAC</span>
                    <span className="font-mono" style={{ fontSize: '0.74rem', fontWeight: 700, color: '#0f766e' }}>
                      98.7% INLIERS
                    </span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* ── 2. TECHNICAL STORYTELLING: FROM VIDEO TO DIGITAL TWIN ──────── */}
        <section className="recon-pipeline-section" aria-label="Reconstruction Pipeline Sequence">
          {/* Header & Spatial Subtitle */}
          <div className="recon-process-header">
            <div className="recon-tech-badge">
              <span className="recon-tech-badge-dot" />
              <span>SPATIAL RECONSTRUCTION PIPELINE</span>
            </div>
            
            <h2 className="recon-process-title">
              FROM VIDEO <br />
              <span className="recon-process-title-accent">TO DIGITAL TWIN</span>
            </h2>

            <p className="recon-process-subtitle">
              A single continuous drone flight passes through a computer-vision and 3D reconstruction pipeline.
            </p>
          </div>

          {/* 7-Step Visual Progression Stream (Milestones: RAW DRONE VIDEO ↓ KEYFRAMES ↓ CAMERA TRAJECTORY ↓ DEPTH ↓ POINT CLOUD ↓ MESH ↓ TEXTURED 3D SCENE) */}
          <div className="recon-milestones-stream" role="navigation" aria-label="Pipeline Progression Milestones">
            {PROGRESSION_MILESTONES.map((milestone, idx) => {
              const isCurrent = milestone.stepIndices.includes(activePipelineStep);
              return (
                <React.Fragment key={milestone.label}>
                  <button
                    type="button"
                    className={`recon-milestone-node ${isCurrent ? 'active' : ''}`}
                    onClick={() => setActivePipelineStep(milestone.stepIndices[0])}
                    title={`Jump to ${milestone.label} phase`}
                  >
                    <span className="recon-milestone-dot" />
                    <span>{milestone.label}</span>
                  </button>
                  {idx < PROGRESSION_MILESTONES.length - 1 && (
                    <span className="recon-milestone-arrow" aria-hidden="true">↓</span>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Technical Sequence Rail (Left) + Telemetry Inspector Viewport (Right) */}
          <div className="recon-pipeline-grid">
            
            {/* Left: 10-Step Connected Technical Sequence (No generic cards) */}
            <div className="recon-tech-rail">
              {/* Continuous Hairline Connecting Line */}
              <div className="recon-tech-line">
                <div 
                  className="recon-tech-line-progress" 
                  style={{ height: `${((activePipelineStep + 0.5) / PIPELINE_SEQUENCE.length) * 100}%` }} 
                />
              </div>

              {PIPELINE_SEQUENCE.map((step, idx) => {
                const isActive = activePipelineStep === idx;

                return (
                  <div
                    key={step.id}
                    className={`recon-seq-step ${isActive ? 'active' : ''}`}
                    onClick={() => setActivePipelineStep(idx)}
                    onMouseEnter={() => setActivePipelineStep(idx)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        setActivePipelineStep(idx);
                      } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setActivePipelineStep((idx + 1) % PIPELINE_SEQUENCE.length);
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setActivePipelineStep((idx - 1 + PIPELINE_SEQUENCE.length) % PIPELINE_SEQUENCE.length);
                      }
                    }}
                    aria-selected={isActive}
                  >
                    {/* Precision Node Anchor on Rail */}
                    <div className="recon-seq-node">
                      <div className="recon-seq-node-inner" />
                    </div>

                    {/* Step Number in Monospace */}
                    <span className="recon-seq-num">{step.num}</span>

                    {/* Content: Title, One-line Explanation & Spec */}
                    <div className="recon-seq-content">
                      <div className="recon-seq-title-row">
                        <span className="recon-seq-title">{step.title}</span>
                        {step.phase && (
                          <span className="recon-seq-epoch">[{step.phase}]</span>
                        )}
                      </div>

                      <p className="recon-seq-desc">
                        {step.explanation}
                      </p>

                      <div className="recon-seq-spec">
                        <span style={{ color: '#0f766e', fontWeight: 700 }}>SPEC:</span>
                        <span>{step.spec}</span>
                      </div>
                    </div>

                    {/* Minimal Technical Visual */}
                    <div className="recon-micro-visual">
                      <StageMicroVisual num={step.num} isActive={isActive} />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right: Technical Inspector & Realistic Visual Progression Viewport */}
            <div className="recon-tech-inspector">
              {/* Inspector Top Bar */}
              <div className="recon-inspector-head">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="font-mono" style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0f766e' }}>
                    STAGE {PIPELINE_SEQUENCE[activePipelineStep].num} / 10
                  </span>
                  <span style={{ 
                    fontSize: '0.64rem', 
                    fontWeight: 600, 
                    color: '#0f766e', 
                    background: 'rgba(15, 118, 110, 0.08)', 
                    padding: '2px 8px', 
                    borderRadius: '4px',
                    border: '1px solid rgba(15, 118, 110, 0.2)' 
                  }}>
                    {PROGRESSION_MILESTONES.find(m => m.stepIndices.includes(activePipelineStep))?.label || "RAW DRONE VIDEO"}
                  </span>
                </div>

                {/* Subtle Step Controller */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button 
                    className="recon-nav-btn" 
                    onClick={() => setActivePipelineStep(prev => (prev > 0 ? prev - 1 : PIPELINE_SEQUENCE.length - 1))}
                    title="Previous Stage"
                    aria-label="Previous Stage"
                  >
                    <ChevronLeft size={13} />
                  </button>
                  <button 
                    className="recon-nav-btn" 
                    onClick={() => setActivePipelineStep(prev => (prev < PIPELINE_SEQUENCE.length - 1 ? prev + 1 : 0))}
                    title="Next Stage"
                    aria-label="Next Stage"
                  >
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>

              {/* Realistic Visual Preview Frame (Uses Real Project Media Assets) */}
              <div className="recon-viewport-card">
                {activePipelineStep <= 1 ? (
                  /* 01-02: Real Drone Survey Video Frame */
                  <>
                    <video
                      src="/drone_survey_hero.mp4"
                      autoPlay
                      loop
                      muted
                      playsInline
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        opacity: 0.92
                      }}
                    />
                    <div className="recon-viewport-hud-top">
                      <div className="recon-hud-tag">
                        <Film size={11} color="#38bdf8" />
                        <span>RAW SENSOR • 4K UHD 30FPS</span>
                      </div>
                      <div className="recon-hud-tag">
                        <span>TC 00:01:24:12</span>
                      </div>
                    </div>
                  </>
                ) : activePipelineStep >= 2 && activePipelineStep <= 5 ? (
                  /* 03-06: Real UAV Flight Survey Aerial Scene */
                  <>
                    <img
                      src="/uav_survey_hero.jpg"
                      alt="Camera Trajectory Photogrammetric Survey"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        opacity: 0.88
                      }}
                    />
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      backgroundImage: 'linear-gradient(rgba(56, 189, 248, 0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(56, 189, 248, 0.12) 1px, transparent 1px)',
                      backgroundSize: '24px 24px',
                      pointerEvents: 'none'
                    }} />
                    <div className="recon-viewport-hud-top">
                      <div className="recon-hud-tag">
                        <Compass size={11} color="#38bdf8" />
                        <span>{activePipelineStep <= 3 ? "6-DoF TRAJECTORY • BUNDLE ADJ" : "NEURAL METRIC DEPTH • DUAL-DISPARITY"}</span>
                      </div>
                      <div className="recon-hud-tag">
                        <span>RESIDUAL &lt; 0.42px</span>
                      </div>
                    </div>
                  </>
                ) : (
                  /* 07-10: Dense 3D Point Cloud & Surface Twin */
                  <>
                    <img
                      src="/survey_orthomosaic_preview.jpg"
                      alt="Photogrammetric Digital Twin"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        opacity: 0.92
                      }}
                    />
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      backgroundImage: activePipelineStep <= 7 
                        ? 'radial-gradient(circle, rgba(56, 189, 248, 0.25) 1px, transparent 1px)' 
                        : 'none',
                      backgroundSize: '16px 16px',
                      pointerEvents: 'none'
                    }} />
                    <div className="recon-viewport-hud-top">
                      <div className="recon-hud-tag">
                        <Box size={11} color="#34d399" />
                        <span>{activePipelineStep <= 8 ? "DENSE MVS • 420 PTS/m²" : "3D DIGITAL TWIN • WGS84"}</span>
                      </div>
                      <div className="recon-hud-tag">
                        <span>CE90 ±1.5mm</span>
                      </div>
                    </div>
                  </>
                )}

                {/* Sub-strip telemetry inside viewport */}
                <div className="recon-viewport-hud-bottom">
                  <span>TARGET: {activeMission?.target_gsd_cm || '1.8'} CM/PX</span>
                  <span style={{ color: '#38bdf8' }}>{PIPELINE_SEQUENCE[activePipelineStep].title}</span>
                </div>
              </div>

              {/* Stage Specific Formulation & Engineering Parameters */}
              <div className="recon-formula-box">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span className="text-tech-label" style={{ fontSize: '0.62rem', letterSpacing: '0.06em' }}>MATHEMATICAL FORMULATION</span>
                  <span className="font-mono" style={{ fontSize: '0.62rem', color: '#0f766e', fontWeight: 700 }}>
                    CV-ALGORITHM
                  </span>
                </div>
                <div className="font-mono" style={{ fontSize: '0.72rem', color: '#0f172a', fontWeight: 600, wordBreak: 'break-all', marginBottom: '8px' }}>
                  {PIPELINE_SEQUENCE[activePipelineStep].formula}
                </div>
                <p style={{ fontSize: '0.76rem', color: '#475569', lineHeight: 1.5, margin: 0 }}>
                  {PIPELINE_SEQUENCE[activePipelineStep].details}
                </p>
              </div>

              {/* Real Platform & Active Mission Parameters */}
              <div className="recon-telemetry-rows">
                <div className="recon-telemetry-row">
                  <span style={{ color: '#64748b' }}>Flight Source:</span>
                  <span className="font-mono" style={{ fontWeight: 600, color: '#0f172a' }}>
                    {activeMission?.video_filename || 'DJI_SURVEY_01842.MP4'}
                  </span>
                </div>
                <div className="recon-telemetry-row">
                  <span style={{ color: '#64748b' }}>Flight Altitude:</span>
                  <span className="font-mono" style={{ fontWeight: 600, color: '#0f172a' }}>
                    {activeMission?.flight_altitude_m ? `${activeMission.flight_altitude_m}m AGL` : '45m AGL'}
                  </span>
                </div>
                <div className="recon-telemetry-row">
                  <span style={{ color: '#64748b' }}>Camera Model:</span>
                  <span className="font-mono" style={{ fontWeight: 600, color: '#0f172a' }}>
                    {activeMission?.camera_model ? activeMission.camera_model : 'Zenmuse 35mm'}
                  </span>
                </div>
                <div className="recon-telemetry-row">
                  <span style={{ color: '#64748b' }}>Coordinate Datum:</span>
                  <span className="font-mono" style={{ fontWeight: 700, color: '#059669' }}>
                    WGS84 / EPSG:4326
                  </span>
                </div>
                <div className="recon-telemetry-row" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                  <span style={{ color: '#64748b' }}>Engine Status:</span>
                  <span className="font-mono" style={{ fontWeight: 700, color: activeMission?.status === 'failed' ? '#dc2626' : '#0f766e' }}>
                    {activeMission?.jobs?.[0]?.status ? activeMission.jobs[0].status.toUpperCase() : (activeMission?.status ? activeMission.status.toUpperCase() : 'CALIBRATED // READY')}
                  </span>
                </div>
              </div>

              {/* Action Buttons to launch 3D twin inspection or monitor */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => {
                    if (activeMission) {
                      setActiveMissionId(activeMission.id);
                      if (activeMission.jobs && activeMission.jobs.length > 0) {
                        setActiveJobId(activeMission.jobs[0].id);
                      }
                      setActivePage('viewer');
                    } else {
                      setActivePage('dashboard');
                    }
                  }}
                  className="geo-btn-primary"
                  style={{ flex: 1, padding: '8px 12px', fontSize: '0.76rem', justifyContent: 'center' }}
                >
                  <Box size={13} /> Inspect 3D Twin <ArrowRight size={12} />
                </button>
                <button
                  onClick={() => setActivePage('dashboard')}
                  className="geo-btn-secondary"
                  style={{ padding: '8px 12px', fontSize: '0.76rem' }}
                  title="Open Pipeline Monitor"
                >
                  <Activity size={13} color="#0f766e" /> Monitor
                </button>
              </div>
            </div>

          </div>
        </section>

        {/* ── 3. OPERATIONS WORKSPACE: MISSIONS TABLE + SIDEBAR ───────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: '24px', alignItems: 'flex-start' }}>
          
          {/* Main Column: UAV Survey Missions */}
          <div className="geo-card-static" style={{ padding: '26px' }}>
            
            {/* Header + Search + Action */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                  UAV Survey Missions
                </h2>
                <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '2px' }}>
                  Select an active mission to inspect its 3D digital twin or review photogrammetric processing status.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {/* Search Bar */}
                <div style={{ position: 'relative', width: '220px' }}>
                  <Search size={14} color="#64748b" style={{ position: 'absolute', left: '10px', top: '10px' }} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search missions..."
                    style={{
                      width: '100%',
                      padding: '7px 10px 7px 32px',
                      fontSize: '0.8rem',
                      borderRadius: '8px',
                      border: '1px solid rgba(14, 165, 233, 0.25)',
                      background: '#ffffff',
                      color: '#0f172a',
                      outline: 'none'
                    }}
                  />
                </div>

                {/* + New Mission Button (EXACT SAME HANDLER PRESERVED) */}
                <button 
                  onClick={() => setActivePage('create-mission')}
                  className="geo-btn-primary"
                  style={{ padding: '7px 16px', fontSize: '0.8rem' }}
                >
                  <Plane size={14} /> + New Mission
                </button>
              </div>
            </div>

            {/* Table or Empty State */}
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '0.88rem' }}>
                <Activity size={24} className="animate-spin" style={{ margin: '0 auto 10px auto', color: '#0284c7' }} />
                Loading mission directory...
              </div>
            ) : filteredMissions.length === 0 ? (
              <div style={{ 
                padding: '44px 20px', 
                textAlign: 'center', 
                border: '1px dashed rgba(14, 165, 233, 0.3)', 
                borderRadius: '12px',
                background: 'rgba(240, 249, 255, 0.5)' 
              }}>
                <Plane size={36} color="#0284c7" style={{ margin: '0 auto 12px auto' }} />
                <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                  No Survey Missions Found
                </h4>
                <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '16px', maxWidth: '420px', margin: '0 auto 16px auto' }}>
                  Ingest raw drone flight video and telemetry data to launch automated 3D photogrammetric reconstruction.
                </p>
                <button 
                  onClick={() => setActivePage('create-mission')}
                  className="geo-btn-primary"
                >
                  Launch First Mission
                </button>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#64748b', fontSize: '0.72rem', letterSpacing: '0.04em' }}>
                      <th style={{ padding: '12px 14px' }}>MISSION NAME</th>
                      <th style={{ padding: '12px 14px' }}>STATUS</th>
                      <th style={{ padding: '12px 14px' }}>ALTITUDE</th>
                      <th style={{ padding: '12px 14px' }}>TARGET GSD</th>
                      <th style={{ padding: '12px 14px' }}>VIDEO SOURCE</th>
                      <th style={{ padding: '12px 14px', textAlign: 'right' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMissions.map((m) => (
                      <tr 
                        key={m.id}
                        className="geo-table-row"
                      >
                        {/* Mission Name + ID */}
                        <td style={{ padding: '14px', fontWeight: 600, color: '#0f172a' }}>
                          <span style={{ fontSize: '0.88rem', display: 'block', color: '#0f172a' }}>
                            {m.name}
                          </span>
                          <span className="font-mono" style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 400 }}>
                            {m.id}
                          </span>
                        </td>

                        {/* Status Badge */}
                        <td style={{ padding: '14px' }}>
                          <StatusBadge status={m.status} />
                        </td>

                        {/* Altitude */}
                        <td style={{ padding: '14px', color: '#334155', fontWeight: 500 }}>
                          {m.flight_altitude_m ? `${m.flight_altitude_m}m AGL` : '—'}
                        </td>

                        {/* Target GSD */}
                        <td style={{ padding: '14px', color: '#334155', fontWeight: 500 }}>
                          {m.target_gsd_cm ? `${m.target_gsd_cm} cm/px` : '—'}
                        </td>

                        {/* Video Source */}
                        <td style={{ padding: '14px', color: '#64748b' }}>
                          {m.video_filename || (m.video_path ? m.video_path.split(/[/\\]/).pop() : "Pending Ingestion")}
                        </td>

                        {/* Action Buttons - EXACT SAME LOGIC PRESERVED */}
                        <td style={{ padding: '14px', textAlign: 'right' }}>
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
                              className="geo-btn-primary"
                              style={{ padding: '6px 12px', fontSize: '0.74rem' }}
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
                              className="geo-btn-secondary"
                              style={{ padding: '6px 12px', fontSize: '0.74rem' }}
                            >
                              <Activity size={13} color="#0284c7" /> Monitor
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

          {/* Right Sidebar: Platform Overview & System Performance */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* 1. Platform Operations Overview */}
            <div className="geo-card-static" style={{ padding: '22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <TrendingUp size={16} color="#0284c7" />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                  Platform Overview
                </h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Active Missions:</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0284c7' }}>{platformStats.active} Active</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Total Processed:</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{platformStats.total} Missions</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Models Generated:</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#059669' }}>{platformStats.completed} 3D Twins</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Average GSD:</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{platformStats.avgGsd} cm/px</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Video Ingested:</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a' }}>{platformStats.totalMb} MB</span>
                </div>
              </div>
            </div>

            {/* 2. System Performance & Compute Hardware */}
            <div className="geo-card-static" style={{ padding: '22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Cpu size={16} color="#0d9488" />
                <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>
                  System Performance
                </h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* CPU Utilization */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '4px' }}>
                    <span style={{ color: '#64748b' }}>CPU Cores:</span>
                    <strong style={{ color: '#0f172a' }}>
                      {hardware?.device_capabilities?.cpu_cores_logical ? `${hardware.device_capabilities.cpu_cores_logical} Logical Threads` : '4 Threads'}
                    </strong>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${sysStatus?.cpu_percent || 24}%`, height: '100%', background: '#0284c7', borderRadius: '3px' }} />
                  </div>
                </div>

                {/* RAM / System Memory */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '4px' }}>
                    <span style={{ color: '#64748b' }}>System RAM:</span>
                    <strong style={{ color: '#0f172a' }}>
                      {hardware?.device_capabilities?.ram_total_gb ? `${hardware.device_capabilities.ram_total_gb} GB Installed` : '16.0 GB'}
                    </strong>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${sysStatus?.ram_percent || 48}%`, height: '100%', background: '#0d9488', borderRadius: '3px' }} />
                  </div>
                </div>

                {/* Compute Acceleration / GPU */}
                <div style={{ 
                  background: 'rgba(240, 249, 255, 0.8)', 
                  border: '1px solid rgba(14, 165, 233, 0.2)', 
                  borderRadius: '10px', 
                  padding: '10px 12px' 
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase' }}>
                      COMPUTE ENGINE
                    </span>
                  </div>
                  <p style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0f172a' }}>
                    {hardware?.device_capabilities?.cuda_available 
                      ? `CUDA GPU (${hardware.device_capabilities.device_name})`
                      : 'CPU SIMD Multithreaded Acceleration'}
                  </p>
                  <span style={{ fontSize: '0.68rem', color: '#059669', display: 'block', marginTop: '2px' }}>
                    ✓ Survey Photogrammetry Pipeline Ready
                  </span>
                </div>
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
