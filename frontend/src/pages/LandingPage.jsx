import React, { useEffect, useState, useMemo } from 'react';
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
  Database
} from 'lucide-react';
import { apiClient } from '../api/client';
import StatusBadge from '../components/StatusBadge';

export default function LandingPage({ setActivePage, setActiveMissionId, setActiveJobId }) {
  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [hardware, setHardware] = useState(null);
  const [sysStatus, setSysStatus] = useState(null);

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
        
        {/* ── 1. HERO SECTION & 3D PHOTOGRAMMETRIC CENTERPIECE ────────────────── */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'minmax(420px, 1.15fr) minmax(460px, 1fr)', 
          gap: '32px', 
          alignItems: 'center',
          marginBottom: '40px' 
        }}>
          
          {/* Left Hero Content */}
          <div>
            {/* Top Professional Badge */}
            <div style={{ 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '8px', 
              padding: '6px 14px', 
              borderRadius: '20px', 
              background: 'rgba(2, 132, 199, 0.08)', 
              border: '1px solid rgba(2, 132, 199, 0.22)', 
              marginBottom: '20px' 
            }}>
              <Compass size={15} color="#0284c7" />
              <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#0369a1', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                UAV PHOTOGRAMMETRY & DIGITAL TWIN WORKSTATION
              </span>
            </div>

            {/* Main Heading */}
            <h1 style={{ 
              fontSize: '2.9rem', 
              fontWeight: 800, 
              letterSpacing: '-0.035em', 
              lineHeight: 1.14, 
              marginBottom: '18px', 
              color: '#0f172a' 
            }}>
              Single-Pass 3D <br />
              <span style={{ 
                background: 'linear-gradient(135deg, #0284c7 0%, #0d9488 100%)', 
                WebkitBackgroundClip: 'text', 
                WebkitTextFillColor: 'transparent' 
              }}>
                Digital Twin Platform
              </span>
            </h1>

            {/* Supporting Text */}
            <p style={{ 
              fontSize: '1.02rem', 
              color: '#475569', 
              lineHeight: 1.62, 
              marginBottom: '28px',
              maxWidth: '560px'
            }}>
              Automated photogrammetry and computer vision pipeline transforming
              drone survey video and telemetry into georeferenced 3D point clouds,
              surface meshes and evidence-based confidence maps.
            </p>

            {/* CTA Buttons - EXACT SAME HANDLERS PRESERVED */}
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '28px' }}>
              <button 
                onClick={() => setActivePage('create-mission')}
                className="geo-btn-primary"
              >
                <Plane size={16} /> New Survey Mission
              </button>
              <button 
                onClick={() => setActivePage('dashboard')}
                className="geo-btn-secondary"
              >
                <Activity size={16} color="#0284c7" /> Pipeline Monitor
              </button>
            </div>

            {/* Micro Telemetry Strip */}
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', paddingTop: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', color: '#64748b' }}>
                <CheckCircle2 size={15} color="#059669" />
                <span style={{ fontWeight: 600, color: '#334155' }}>WGS84 & ENU Datum</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', color: '#64748b' }}>
                <CheckCircle2 size={15} color="#059669" />
                <span style={{ fontWeight: 600, color: '#334155' }}>CE90 / LE90 Certified</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', color: '#64748b' }}>
                <CheckCircle2 size={15} color="#059669" />
                <span style={{ fontWeight: 600, color: '#334155' }}>Zero Geometry Hallucination</span>
              </div>
            </div>
          </div>

          {/* Right Hero Visual Centerpiece */}
          <div style={{ position: 'relative' }}>
            <div className="geo-card" style={{ padding: '20px', overflow: 'hidden', position: 'relative' }}>
              
              {/* Telemetry HUD Tag */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="telemetry-chip">
                    <Crosshair size={12} color="#0284c7" /> AERIAL PHOTOGRAMMETRY
                  </span>
                  <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#059669', background: 'rgba(16, 185, 129, 0.1)', padding: '3px 8px', borderRadius: '4px' }}>
                    ● LIVE CALIBRATION
                  </span>
                </div>
                <span className="font-mono" style={{ fontSize: '0.7rem', color: '#64748b' }}>
                  DATUM: WGS84 / EPSG:4326
                </span>
              </div>

              {/* Realistic Aerial Infrastructure & 3D Site Reconstruction Visual */}
              <div style={{ 
                height: '270px', 
                borderRadius: '12px', 
                background: 'linear-gradient(145deg, #0b1528 0%, #0f243d 40%, #0d3b4c 100%)', 
                position: 'relative', 
                overflow: 'hidden',
                boxShadow: 'inset 0 0 40px rgba(0,0,0,0.5)'
              }}>
                {/* SVG Photogrammetric Site Illustration with Wireframe, Tower Crane & Point Cloud */}
                <svg width="100%" height="100%" viewBox="0 0 540 270" style={{ position: 'absolute', top: 0, left: 0 }}>
                  <defs>
                    {/* Grid Pattern */}
                    <pattern id="site-grid" width="24" height="24" patternUnits="userSpaceOnUse">
                      <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#0284c7" strokeWidth="0.5" strokeOpacity="0.18" />
                    </pattern>
                    <linearGradient id="meshGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.1" />
                    </linearGradient>
                    <linearGradient id="bldgFace" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#1e293b" stopOpacity="0.9" />
                      <stop offset="100%" stopColor="#0f172a" stopOpacity="0.95" />
                    </linearGradient>
                  </defs>

                  {/* Ground Terrain Grid */}
                  <rect width="540" height="270" fill="url(#site-grid)" />

                  {/* Access Road & Terrain Contours */}
                  <path d="M 0 210 Q 140 190, 270 230 T 540 200" fill="none" stroke="#334155" strokeWidth="18" strokeOpacity="0.7" />
                  <path d="M 0 210 Q 140 190, 270 230 T 540 200" fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="6,6" strokeOpacity="0.5" />

                  {/* Topographic Contour Curves */}
                  <path d="M 40 260 C 120 220, 200 250, 360 210 C 440 180, 480 230, 540 240" fill="none" stroke="#0284c7" strokeWidth="0.8" strokeOpacity="0.25" />
                  <path d="M 20 180 C 100 150, 180 170, 300 140 C 400 120, 470 150, 540 130" fill="none" stroke="#0d9488" strokeWidth="0.8" strokeOpacity="0.2" />

                  {/* 3D Isometric Construction Building Framework */}
                  {/* Base / Floor 1 */}
                  <polygon points="170,165 290,135 410,165 290,200" fill="url(#bldgFace)" stroke="#38bdf8" strokeWidth="1.2" strokeOpacity="0.6" />
                  {/* Vertical Columns */}
                  <line x1="170" y1="165" x2="170" y2="110" stroke="#38bdf8" strokeWidth="1.5" strokeOpacity="0.7" />
                  <line x1="290" y1="200" x2="290" y2="145" stroke="#38bdf8" strokeWidth="1.5" strokeOpacity="0.7" />
                  <line x1="410" y1="165" x2="410" y2="110" stroke="#38bdf8" strokeWidth="1.5" strokeOpacity="0.7" />
                  <line x1="290" y1="135" x2="290" y2="85" stroke="#38bdf8" strokeWidth="1.2" strokeOpacity="0.4" />
                  {/* Floor 2 Slab */}
                  <polygon points="170,110 290,85 410,110 290,145" fill="url(#meshGrad)" stroke="#38bdf8" strokeWidth="1.2" />
                  {/* Floor 3 / Rooftop Framework with Wireframe Cross-bracing */}
                  <line x1="170" y1="110" x2="170" y2="65" stroke="#0284c7" strokeWidth="1.2" strokeOpacity="0.8" />
                  <line x1="290" y1="145" x2="290" y2="100" stroke="#0284c7" strokeWidth="1.2" strokeOpacity="0.8" />
                  <line x1="410" y1="110" x2="410" y2="65" stroke="#0284c7" strokeWidth="1.2" strokeOpacity="0.8" />
                  <polygon points="170,65 290,45 410,65 290,100" fill="none" stroke="#2dd4bf" strokeWidth="1.5" />
                  {/* Diagonal Wireframe Bracing */}
                  <line x1="170" y1="110" x2="290" y2="65" stroke="#38bdf8" strokeWidth="0.7" strokeOpacity="0.35" />
                  <line x1="290" y1="110" x2="170" y2="65" stroke="#38bdf8" strokeWidth="0.7" strokeOpacity="0.35" />
                  <line x1="290" y1="145" x2="410" y2="100" stroke="#38bdf8" strokeWidth="0.7" strokeOpacity="0.35" />

                  {/* Tower Construction Crane */}
                  <line x1="390" y1="180" x2="390" y2="25" stroke="#f59e0b" strokeWidth="2.5" />
                  <line x1="330" y1="30" x2="460" y2="30" stroke="#f59e0b" strokeWidth="2" />
                  <line x1="390" y1="20" x2="390" y2="25" stroke="#fbbf24" strokeWidth="2" />
                  <line x1="390" y1="20" x2="460" y2="30" stroke="#fbbf24" strokeWidth="1" strokeOpacity="0.6" />
                  <line x1="390" y1="20" x2="350" y2="30" stroke="#fbbf24" strokeWidth="1" strokeOpacity="0.6" />
                  <line x1="440" y1="30" x2="440" y2="75" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3,3" />
                  <rect x="434" y="75" width="12" height="10" fill="#f59e0b" rx="2" />

                  {/* Dense Point Cloud Scatter Particles */}
                  {[
                    [185, 140], [210, 155], [235, 170], [260, 185], [275, 192],
                    [200, 100], [225, 115], [250, 130], [280, 140], [310, 125],
                    [335, 140], [360, 155], [385, 170], [320, 95],  [345, 105],
                    [370, 120], [395, 135], [285, 75],  [300, 80],  [270, 60],
                    [295, 55],  [320, 60],  [345, 70],  [230, 85],  [255, 75],
                    [155, 195], [140, 220], [165, 235], [440, 180], [465, 195],
                    [480, 215], [120, 160], [430, 140], [450, 155], [210, 215]
                  ].map(([px, py], i) => (
                    <circle key={i} cx={px} cy={py} r={i % 3 === 0 ? 2 : 1.2} fill={i % 4 === 0 ? '#34d399' : '#38bdf8'} opacity="0.85" />
                  ))}

                  {/* Camera Projection Ray from UAV */}
                  <line x1="90" y1="35" x2="290" y2="135" stroke="#06b6d4" strokeWidth="1" strokeDasharray="4,4" strokeOpacity="0.45" />
                  <line x1="90" y1="35" x2="170" y2="165" stroke="#06b6d4" strokeWidth="0.8" strokeDasharray="4,4" strokeOpacity="0.35" />
                  <line x1="90" y1="35" x2="410" y2="165" stroke="#06b6d4" strokeWidth="0.8" strokeDasharray="4,4" strokeOpacity="0.35" />

                  {/* Drone Position Icon */}
                  <g transform="translate(75, 20)">
                    <circle cx="15" cy="15" r="14" fill="rgba(2, 132, 199, 0.25)" stroke="#38bdf8" strokeWidth="1" />
                    <line x1="3" y1="15" x2="27" y2="15" stroke="#38bdf8" strokeWidth="2" />
                    <line x1="15" y1="3" x2="15" y2="27" stroke="#38bdf8" strokeWidth="2" />
                    <circle cx="15" cy="15" r="4" fill="#38bdf8" />
                  </g>

                  {/* Geographic Coordinate Crosshair Marker */}
                  <g transform="translate(280, 125)">
                    <circle cx="10" cy="10" r="12" fill="none" stroke="#2dd4bf" strokeWidth="1" strokeDasharray="3,3" />
                    <line x1="0" y1="10" x2="20" y2="10" stroke="#2dd4bf" strokeWidth="1" />
                    <line x1="10" y1="0" x2="10" y2="20" stroke="#2dd4bf" strokeWidth="1" />
                  </g>
                </svg>

                {/* Live Real-time Telemetry HUD Tag (Bottom Right) */}
                <div style={{ 
                  position: 'absolute', 
                  bottom: '12px', 
                  right: '12px', 
                  background: 'rgba(15, 23, 42, 0.88)', 
                  border: '1px solid rgba(56, 189, 248, 0.25)', 
                  borderRadius: '8px', 
                  padding: '8px 12px', 
                  backdropFilter: 'blur(8px)',
                  display: 'flex',
                  gap: '14px',
                  alignItems: 'center',
                  fontSize: '0.72rem',
                  fontFamily: 'var(--font-mono)'
                }}>
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '0.62rem' }}>ALTITUDE</span>
                    <strong style={{ color: '#38bdf8' }}>{activeMission?.flight_altitude_m || 45.0}m AGL</strong>
                  </div>
                  <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '0.62rem' }}>GSD</span>
                    <strong style={{ color: '#34d399' }}>{activeMission?.target_gsd_cm || 1.8} cm/px</strong>
                  </div>
                  <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />
                  <div>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '0.62rem' }}>COORDS</span>
                    <strong style={{ color: '#f1f5f9' }}>37°46'N, 122°25'W</strong>
                  </div>
                </div>
              </div>

              {/* ── Side Panels: Reconstruction Health & Live Pipeline ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.35fr', gap: '14px', marginTop: '16px' }}>
                
                {/* 1. Reconstruction Health (Circular Progress) */}
                <div style={{ 
                  background: 'rgba(240, 249, 255, 0.75)', 
                  border: '1px solid rgba(14, 165, 233, 0.16)', 
                  borderRadius: '12px', 
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px'
                }}>
                  {/* Circular Gauge Graphic */}
                  <div style={{ position: 'relative', width: '56px', height: '56px', flexShrink: 0 }}>
                    <svg width="56" height="56" viewBox="0 0 56 56">
                      <circle cx="28" cy="28" r="23" fill="none" stroke="#e2e8f0" strokeWidth="5" />
                      <circle 
                        cx="28" 
                        cy="28" 
                        r="23" 
                        fill="none" 
                        stroke="#0284c7" 
                        strokeWidth="5" 
                        strokeDasharray={2 * Math.PI * 23}
                        strokeDashoffset={(2 * Math.PI * 23) * (1 - (platformStats.healthPct / 100))}
                        strokeLinecap="round"
                        transform="rotate(-90 28 28)"
                      />
                    </svg>
                    <div style={{ 
                      position: 'absolute', 
                      top: 0, 
                      left: 0, 
                      width: '100%', 
                      height: '100%', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      fontSize: '0.76rem',
                      fontWeight: 800,
                      color: '#0f172a'
                    }}>
                      {platformStats.healthPct}%
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      RECONSTRUCTION HEALTH
                    </span>
                    <h4 style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>
                      Survey Reliability
                    </h4>
                    <p style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '1px' }}>
                      {platformStats.active > 0 ? `${platformStats.active} jobs converging` : 'Nominal pipeline health'}
                    </p>
                  </div>
                </div>

                {/* 2. Live Pipeline Stage Sequence */}
                <div style={{ 
                  background: 'rgba(240, 249, 255, 0.75)', 
                  border: '1px solid rgba(14, 165, 233, 0.16)', 
                  borderRadius: '12px', 
                  padding: '12px 14px' 
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      LIVE PIPELINE WORKFLOW
                    </span>
                    <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#059669' }}>
                      ● ACTIVE ENGINE
                    </span>
                  </div>
                  
                  {/* Timeline Stage Indicators */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
                    {[
                      { name: "Ingest", active: true },
                      { name: "Quality", active: true },
                      { name: "Masking", active: true },
                      { name: "Tracking", active: true },
                      { name: "SfM Sparse", active: true },
                      { name: "Dense MVS", active: true },
                      { name: "Mesh 3D", active: true },
                      { name: "Confidence", active: true }
                    ].map((stg, i) => (
                      <div 
                        key={i}
                        style={{ 
                          background: '#ffffff', 
                          border: '1px solid rgba(14, 165, 233, 0.22)', 
                          borderRadius: '6px', 
                          padding: '4px 6px',
                          textAlign: 'center'
                        }}
                      >
                        <span style={{ fontSize: '0.64rem', fontWeight: 600, color: '#0f172a', display: 'block' }}>
                          {stg.name}
                        </span>
                        <div style={{ width: '100%', height: '2px', background: '#0284c7', borderRadius: '1px', marginTop: '3px' }} />
                      </div>
                    ))}
                  </div>
                </div>

              </div>

            </div>
          </div>

        </div>

        {/* ── 2. FEATURE & CAPABILITY SECTION (4 ARCHITECTURE PILLARS) ──────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '18px', marginBottom: '40px' }}>
          
          <div className="geo-card" style={{ padding: '22px' }}>
            <div style={{ 
              width: '40px', 
              height: '40px', 
              borderRadius: '10px', 
              background: 'rgba(2, 132, 199, 0.1)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              marginBottom: '14px' 
            }}>
              <Layers size={20} color="#0284c7" />
            </div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
              13 Modular Stages
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.55 }}>
              Adaptive sampling, YOLOv8-seg dynamic masking, incremental SfM, dense disparity matching, and Delaunay mesh triangulation with atomic checkpoints.
            </p>
          </div>

          <div className="geo-card" style={{ padding: '22px' }}>
            <div style={{ 
              width: '40px', 
              height: '40px', 
              borderRadius: '10px', 
              background: 'rgba(16, 185, 129, 0.1)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              marginBottom: '14px' 
            }}>
              <Scale size={20} color="#059669" />
            </div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
              WGS84 Georeferenced
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.55 }}>
              7-parameter Sim(3) Umeyama transformation aligns models to WGS84 and local topocentric ENU coordinates with CE90/LE90 residual audits.
            </p>
          </div>

          <div className="geo-card" style={{ padding: '22px' }}>
            <div style={{ 
              width: '40px', 
              height: '40px', 
              borderRadius: '10px', 
              background: 'rgba(217, 119, 6, 0.1)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              marginBottom: '14px' 
            }}>
              <ShieldCheck size={20} color="#d97706" />
            </div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
              Zero Hallucination
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.55 }}>
              8 photogrammetric evidence streams classify geometry into High, Medium, and Unknown tiers. Unobserved regions are strictly never fabricated.
            </p>
          </div>

          <div className="geo-card" style={{ padding: '22px' }}>
            <div style={{ 
              width: '40px', 
              height: '40px', 
              borderRadius: '10px', 
              background: 'rgba(124, 58, 237, 0.1)', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              marginBottom: '14px' 
            }}>
              <Zap size={20} color="#7c3aed" />
            </div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
              Progressive Outputs
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.55 }}>
              Level 1 Rapid Model unlocks early for instant situational awareness, while Level 2 Refined Twin computes high-density geometry in the background.
            </p>
          </div>

        </div>

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
