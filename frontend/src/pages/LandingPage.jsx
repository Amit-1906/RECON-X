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
  Database,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Ruler,
  Maximize2,
  Mouse
} from 'lucide-react';
import { apiClient } from '../api/client';
import StatusBadge from '../components/StatusBadge';

export default function LandingPage({ setActivePage, setActiveMissionId, setActiveJobId }) {
  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [hardware, setHardware] = useState(null);
  const [sysStatus, setSysStatus] = useState(null);

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
        
        {/* ── 1. HERO SECTION WITH FULL VIDEO BACKGROUND (MATCHING USER REFERENCE) ── */}
        <div style={{
          position: 'relative',
          borderRadius: '24px',
          overflow: 'hidden',
          marginBottom: '44px',
          boxShadow: '0 20px 50px rgba(15, 23, 42, 0.12)',
          border: '1px solid rgba(226, 232, 240, 0.8)',
          background: '#0a1426',
          minHeight: '620px'
        }}>
          {/* Full-Bleed Video Background - Crystal Clear and Bright */}
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
              objectPosition: 'center 22%',
              zIndex: 0,
              pointerEvents: 'none',
              filter: 'none',
              opacity: 1
            }}
          />

          {/* Subtle localized gradient behind the LEFT text area only - completely transparent across center and right */}
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(90deg, rgba(255, 255, 255, 0.65) 0%, rgba(255, 255, 255, 0.42) 24%, rgba(255, 255, 255, 0.10) 42%, transparent 58%)',
            zIndex: 1,
            pointerEvents: 'none'
          }} />

          {/* Discrete Video Sound & Playback Controls in top-right corner */}
          <div style={{
            position: 'absolute',
            top: '16px',
            right: '20px',
            zIndex: 4,
            display: 'flex',
            gap: '6px',
            alignItems: 'center',
            background: 'rgba(15, 23, 42, 0.65)',
            padding: '4px 8px',
            borderRadius: '20px',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.15)'
          }}>
            <button
              onClick={togglePlay}
              title={isPlaying ? "Pause Video" : "Play Video"}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#f8fafc',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%'
              }}
            >
              {isPlaying ? <Pause size={12} color="#38bdf8" /> : <Play size={12} color="#38bdf8" />}
            </button>
            <button
              onClick={toggleMute}
              title={isMuted ? "Unmute Audio" : "Mute Audio"}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#f8fafc',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '50%'
              }}
            >
              {isMuted ? <VolumeX size={12} color="#94a3b8" /> : <Volume2 size={12} color="#34d399" />}
            </button>
          </div>

          {/* Hero Content Grid */}
          <div style={{
            position: 'relative',
            zIndex: 2,
            display: 'grid',
            gridTemplateColumns: 'minmax(420px, 1.05fr) minmax(500px, 1fr)',
            gap: '36px',
            alignItems: 'center',
            padding: '44px 38px 36px 38px'
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
                background: 'rgba(255, 255, 255, 0.88)', 
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(2, 132, 199, 0.25)', 
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                marginBottom: '22px' 
              }}>
                <Compass size={15} color="#0284c7" />
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#0369a1', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  UAV PHOTOGRAMMETRY & DIGITAL TWIN WORKSTATION
                </span>
              </div>

              {/* Main Heading */}
              <h1 style={{ 
                fontSize: '3.1rem', 
                fontWeight: 800, 
                letterSpacing: '-0.035em', 
                lineHeight: 1.12, 
                marginBottom: '18px', 
                color: '#0f172a'
              }}>
                <span style={{ textShadow: '0 2px 12px rgba(255, 255, 255, 0.95)' }}>Single-Pass 3D</span> <br />
                <span style={{ 
                  background: 'linear-gradient(135deg, #0284c7 0%, #0d9488 100%)', 
                  WebkitBackgroundClip: 'text', 
                  WebkitTextFillColor: 'transparent',
                  display: 'inline-block'
                }}>
                  Digital Twin Platform
                </span>
              </h1>

              {/* Supporting Text */}
              <p style={{ 
                fontSize: '1.02rem', 
                color: '#0f172a', 
                fontWeight: 500,
                lineHeight: 1.62, 
                marginBottom: '30px',
                maxWidth: '520px',
                textShadow: '0 1px 8px rgba(255, 255, 255, 0.95)'
              }}>
                Automated photogrammetry and computer vision pipeline transforming
                drone survey video and telemetry into georeferenced 3D models with high accuracy.
              </p>

              {/* CTA Buttons */}
              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '28px' }}>
                <button 
                  onClick={() => setActivePage('create-mission')}
                  className="geo-btn-primary"
                  style={{
                    borderRadius: '30px',
                    padding: '12px 24px',
                    fontWeight: 700,
                    boxShadow: '0 8px 24px rgba(2, 132, 199, 0.35)'
                  }}
                >
                  <Plane size={17} /> New Survey Mission
                </button>
                <button 
                  onClick={() => setActivePage('dashboard')}
                  className="geo-btn-secondary"
                  style={{
                    borderRadius: '30px',
                    padding: '12px 24px',
                    fontWeight: 700,
                    background: 'rgba(255, 255, 255, 0.92)',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.06)'
                  }}
                >
                  <Activity size={17} color="#0284c7" /> Pipeline Monitor
                </button>
              </div>

              {/* Micro Telemetry Strip */}
              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '36px' }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px', 
                  fontSize: '0.78rem', 
                  color: '#0f172a',
                  fontWeight: 600,
                  background: 'rgba(255, 255, 255, 0.75)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  padding: '5px 12px',
                  borderRadius: '20px',
                  border: '1px solid rgba(255, 255, 255, 0.7)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                }}>
                  <CheckCircle2 size={16} color="#059669" />
                  <span>WGS84 & ENU Datum</span>
                </div>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px', 
                  fontSize: '0.78rem', 
                  color: '#0f172a',
                  fontWeight: 600,
                  background: 'rgba(255, 255, 255, 0.75)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  padding: '5px 12px',
                  borderRadius: '20px',
                  border: '1px solid rgba(255, 255, 255, 0.7)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                }}>
                  <CheckCircle2 size={16} color="#059669" />
                  <span>CE90 / LE90 Certified</span>
                </div>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px', 
                  fontSize: '0.78rem', 
                  color: '#0f172a',
                  fontWeight: 600,
                  background: 'rgba(255, 255, 255, 0.75)',
                  backdropFilter: 'blur(8px)',
                  WebkitBackdropFilter: 'blur(8px)',
                  padding: '5px 12px',
                  borderRadius: '20px',
                  border: '1px solid rgba(255, 255, 255, 0.7)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                }}>
                  <CheckCircle2 size={16} color="#059669" />
                  <span>Zero Geometry Hallucination</span>
                </div>
              </div>

              {/* Bottom Left Scroll to Explore */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '5px 12px',
                  borderRadius: '20px',
                  background: 'rgba(255, 255, 255, 0.85)',
                  border: '1px solid rgba(203, 213, 225, 0.7)',
                  color: '#64748b',
                  fontSize: '0.76rem',
                  fontWeight: 600
                }}>
                  <Mouse size={14} color="#0284c7" />
                  <span>Scroll to explore</span>
                </div>
                <div style={{ width: '100px', height: '1px', background: 'linear-gradient(90deg, rgba(148, 163, 184, 0.5) 0%, transparent 100%)' }} />
              </div>
            </div>

            {/* Right Hero Visual Centerpiece: Floating Aerial Photogrammetry Workstation Card */}
            <div style={{ position: 'relative' }}>
              <div style={{ 
                background: 'rgba(255, 255, 255, 0.76)', 
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                borderRadius: '22px', 
                padding: '20px', 
                border: '1px solid rgba(255, 255, 255, 0.65)',
                boxShadow: '0 24px 60px rgba(15, 23, 42, 0.16)'
              }}>
                {/* Telemetry HUD Top Bar */}
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

                {/* 3D Blueprint CAD Viewport */}
                <div style={{ 
                  height: '280px', 
                  borderRadius: '14px', 
                  background: 'linear-gradient(135deg, #091322 0%, #0c182c 100%)', 
                  position: 'relative', 
                  overflow: 'hidden',
                  boxShadow: '0 12px 32px rgba(15, 23, 42, 0.2), inset 0 0 40px rgba(0,0,0,0.6)',
                  border: '1px solid rgba(56, 189, 248, 0.28)'
                }}>
                  {/* Top-left target crosshair */}
                  <div style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 3, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Crosshair size={18} color="rgba(56, 189, 248, 0.7)" />
                  </div>

                  {/* Right-edge CAD tool buttons */}
                  <div style={{
                    position: 'absolute',
                    top: '12px',
                    right: '12px',
                    zIndex: 3,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}>
                    {[
                      { icon: Box, label: '3D Box' },
                      { icon: Layers, label: 'Layers' },
                      { icon: Ruler, label: 'Measure' },
                      { icon: Maximize2, label: 'Expand' }
                    ].map((btn, idx) => (
                      <div
                        key={idx}
                        title={btn.label}
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '6px',
                          background: 'rgba(15, 23, 42, 0.75)',
                          border: '1px solid rgba(56, 189, 248, 0.25)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#94a3b8',
                          cursor: 'pointer'
                        }}
                      >
                        <btn.icon size={13} color="#38bdf8" />
                      </div>
                    ))}
                  </div>

                  {/* 3D Isometric SVG Blueprint: Multi-story Building & Yellow Tower Crane */}
                  <svg 
                    width="100%" 
                    height="100%" 
                    viewBox="0 0 460 280" 
                    preserveAspectRatio="xMidYMid slice"
                    style={{ position: 'absolute', inset: 0, zIndex: 1 }}
                  >
                    <defs>
                      <pattern id="isoGrid" width="28" height="28" patternUnits="userSpaceOnUse">
                        <path d="M 28 0 L 0 28 M 0 0 L 28 28" fill="none" stroke="rgba(56, 189, 248, 0.08)" strokeWidth="0.8" />
                      </pattern>
                    </defs>

                    {/* Background Isometric Grid */}
                    <rect width="100%" height="100%" fill="url(#isoGrid)" />

                    {/* Ground Reference Plane */}
                    <polygon 
                      points="230,250 380,185 230,125 80,185" 
                      fill="rgba(2, 132, 199, 0.04)" 
                      stroke="rgba(56, 189, 248, 0.25)" 
                      strokeWidth="1.2" 
                      strokeDasharray="4 3" 
                    />

                    {/* 3D Bounding Box Guides */}
                    <line x1="80" y1="185" x2="80" y2="75" stroke="rgba(56, 189, 248, 0.3)" strokeDasharray="3 3" />
                    <line x1="380" y1="185" x2="380" y2="75" stroke="rgba(56, 189, 248, 0.3)" strokeDasharray="3 3" />
                    <line x1="230" y1="250" x2="230" y2="140" stroke="rgba(56, 189, 248, 0.3)" strokeDasharray="3 3" />
                    <polygon points="230,140 380,75 230,15 80,75" fill="none" stroke="rgba(56, 189, 248, 0.3)" strokeDasharray="3 3" />

                    {/* Multi-story Construction Frame (Level 0, 1, 2, 3, Roof) */}
                    {/* Floor 0 (Base) */}
                    <polygon points="230,230 350,175 230,120 110,175" fill="rgba(14, 165, 233, 0.08)" stroke="#38bdf8" strokeWidth="1.2" />

                    {/* Floor 1 */}
                    <polygon points="230,205 350,150 230,95 110,150" fill="rgba(14, 165, 233, 0.06)" stroke="#38bdf8" strokeWidth="1.2" />
                    {/* Floor 2 */}
                    <polygon points="230,180 350,125 230,70 110,125" fill="rgba(14, 165, 233, 0.06)" stroke="#38bdf8" strokeWidth="1.2" />
                    {/* Floor 3 (Roof Slab) */}
                    <polygon points="230,155 350,100 230,45 110,100" fill="rgba(14, 165, 233, 0.12)" stroke="#22d3ee" strokeWidth="1.5" />

                    {/* Vertical Columns */}
                    <line x1="110" y1="175" x2="110" y2="100" stroke="#38bdf8" strokeWidth="1.5" />
                    <line x1="230" y1="230" x2="230" y2="155" stroke="#38bdf8" strokeWidth="1.8" />
                    <line x1="350" y1="175" x2="350" y2="100" stroke="#38bdf8" strokeWidth="1.5" />
                    <line x1="230" y1="120" x2="230" y2="45" stroke="rgba(56, 189, 248, 0.4)" strokeWidth="1" strokeDasharray="3 2" />

                    {/* Intermediate Columns */}
                    <line x1="170" y1="202" x2="170" y2="128" stroke="#38bdf8" strokeWidth="1.2" />
                    <line x1="290" y1="202" x2="290" y2="128" stroke="#38bdf8" strokeWidth="1.2" />
                    <line x1="170" y1="148" x2="170" y2="72" stroke="rgba(56, 189, 248, 0.4)" strokeWidth="0.8" strokeDasharray="2 2" />
                    <line x1="290" y1="148" x2="290" y2="72" stroke="rgba(56, 189, 248, 0.4)" strokeWidth="0.8" strokeDasharray="2 2" />

                    {/* Interior Cross Bracing (X-trusses) */}
                    <line x1="110" y1="175" x2="170" y2="128" stroke="rgba(56, 189, 248, 0.35)" strokeWidth="0.8" />
                    <line x1="170" y1="202" x2="110" y2="150" stroke="rgba(56, 189, 248, 0.35)" strokeWidth="0.8" />
                    <line x1="170" y1="128" x2="230" y2="155" stroke="rgba(56, 189, 248, 0.35)" strokeWidth="0.8" />
                    <line x1="230" y1="205" x2="170" y2="150" stroke="rgba(56, 189, 248, 0.35)" strokeWidth="0.8" />
                    <line x1="230" y1="230" x2="290" y2="128" stroke="rgba(56, 189, 248, 0.35)" strokeWidth="0.8" />
                    <line x1="290" y1="202" x2="230" y2="180" stroke="rgba(56, 189, 248, 0.35)" strokeWidth="0.8" />
                    <line x1="290" y1="128" x2="350" y2="175" stroke="rgba(56, 189, 248, 0.35)" strokeWidth="0.8" />
                    <line x1="350" y1="150" x2="290" y2="150" stroke="rgba(56, 189, 248, 0.35)" strokeWidth="0.8" />

                    {/* Yellow Tower Crane on Roof */}
                    <line x1="270" y1="72" x2="270" y2="18" stroke="#fbbf24" strokeWidth="2.5" />
                    <line x1="267" y1="72" x2="273" y2="72" stroke="#f59e0b" strokeWidth="1.2" />
                    <line x1="267" y1="54" x2="273" y2="54" stroke="#f59e0b" strokeWidth="1.2" />
                    <line x1="267" y1="36" x2="273" y2="36" stroke="#f59e0b" strokeWidth="1.2" />
                    <line x1="267" y1="18" x2="273" y2="18" stroke="#f59e0b" strokeWidth="1.2" />
                    <line x1="267" y1="72" x2="273" y2="54" stroke="#f59e0b" strokeWidth="0.9" />
                    <line x1="267" y1="54" x2="273" y2="36" stroke="#f59e0b" strokeWidth="0.9" />
                    <line x1="267" y1="36" x2="273" y2="18" stroke="#f59e0b" strokeWidth="0.9" />

                    {/* Operator Cabin */}
                    <rect x="264" y="16" width="10" height="8" rx="1" fill="#f59e0b" stroke="#d97706" strokeWidth="0.8" />

                    {/* Crane Tower Peak / A-frame */}
                    <polygon points="270,6 266,16 274,16" fill="#fbbf24" stroke="#d97706" strokeWidth="0.8" />

                    {/* Horizontal Jib / Boom extending right */}
                    <line x1="230" y1="16" x2="385" y2="16" stroke="#fbbf24" strokeWidth="2" />
                    <line x1="230" y1="16" x2="270" y2="16" stroke="#fbbf24" strokeWidth="2" />
                    <rect x="220" y="13" width="14" height="7" rx="1" fill="#78350f" stroke="#fbbf24" strokeWidth="0.8" />

                    {/* Jib Tie Cable from apex */}
                    <line x1="270" y1="6" x2="360" y2="16" stroke="#fde68a" strokeWidth="0.9" strokeDasharray="2 1" />
                    <line x1="270" y1="6" x2="225" y2="16" stroke="#fde68a" strokeWidth="0.9" strokeDasharray="2 1" />

                    {/* Hoist Trolley & Cable line descending down */}
                    <rect x="332" y="14" width="6" height="4" fill="#fbbf24" />
                    <line x1="335" y1="18" x2="335" y2="60" stroke="#fef08a" strokeWidth="1" strokeDasharray="2 2" />
                    <polygon points="332,60 338,60 335,64" fill="#f59e0b" />

                    {/* Point Cloud Sparkle Particles around the site */}
                    {[
                      { cx: 120, cy: 110, r: 1.5 },
                      { cx: 145, cy: 95, r: 1.2 },
                      { cx: 180, cy: 80, r: 1.8 },
                      { cx: 215, cy: 65, r: 1.3 },
                      { cx: 250, cy: 85, r: 1.6 },
                      { cx: 285, cy: 110, r: 1.4 },
                      { cx: 320, cy: 95, r: 1.5 },
                      { cx: 340, cy: 130, r: 1.2 },
                      { cx: 160, cy: 160, r: 1.5 },
                      { cx: 220, cy: 175, r: 1.8 },
                      { cx: 270, cy: 165, r: 1.3 },
                      { cx: 310, cy: 145, r: 1.6 },
                      { cx: 130, cy: 140, r: 1.4 },
                      { cx: 195, cy: 135, r: 1.2 },
                      { cx: 240, cy: 210, r: 1.5 },
                      { cx: 260, cy: 195, r: 1.7 },
                      { cx: 180, cy: 185, r: 1.3 },
                      { cx: 300, cy: 180, r: 1.4 }
                    ].map((pt, i) => (
                      <circle key={i} cx={pt.cx} cy={pt.cy} r={pt.r} fill="#67e8f9" opacity="0.85" />
                    ))}
                  </svg>

                  {/* 4-column telemetry bar inside bottom of viewport */}
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    zIndex: 3,
                    background: 'rgba(9, 19, 34, 0.92)',
                    backdropFilter: 'blur(8px)',
                    borderTop: '1px solid rgba(56, 189, 248, 0.2)',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    padding: '8px 14px',
                    textAlign: 'center',
                    fontFamily: 'var(--font-mono)'
                  }}>
                    <div>
                      <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.62rem', letterSpacing: '0.04em' }}>ALTITUDE</span>
                      <strong style={{ color: '#38bdf8', fontSize: '0.8rem' }}>45m AGL</strong>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.62rem', letterSpacing: '0.04em' }}>GSD</span>
                      <strong style={{ color: '#34d399', fontSize: '0.8rem' }}>1.8 cm/px</strong>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.62rem', letterSpacing: '0.04em' }}>COORDS</span>
                      <strong style={{ color: '#f1f5f9', fontSize: '0.78rem' }}>37°46'N, 122°25'W</strong>
                    </div>
                    <div>
                      <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.62rem', letterSpacing: '0.04em' }}>OVERLAP</span>
                      <strong style={{ color: '#38bdf8', fontSize: '0.8rem' }}>80%</strong>
                    </div>
                  </div>
                </div>

                {/* Bottom Section: Reconstruction Health & Live Pipeline Workflow */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.35fr', gap: '14px', marginTop: '16px' }}>
                  {/* Reconstruction Health */}
                  <div style={{ 
                    background: 'rgba(255, 255, 255, 0.65)', 
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255, 255, 255, 0.75)', 
                    borderRadius: '12px', 
                    padding: '12px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px'
                  }}>
                    <div style={{ position: 'relative', width: '54px', height: '54px', flexShrink: 0 }}>
                      <svg width="54" height="54" viewBox="0 0 54 54">
                        <circle cx="27" cy="27" r="22" fill="none" stroke="#e2e8f0" strokeWidth="5" />
                        <circle 
                          cx="27" 
                          cy="27" 
                          r="22" 
                          fill="none" 
                          stroke="#0284c7" 
                          strokeWidth="5" 
                          strokeDasharray={2 * Math.PI * 22}
                          strokeDashoffset={0}
                          strokeLinecap="round"
                          transform="rotate(-90 27 27)"
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
                        fontSize: '0.78rem',
                        fontWeight: 800,
                        color: '#0f172a'
                      }}>
                        100%
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
                        Nominal pipeline health
                      </p>
                    </div>
                  </div>

                  {/* Live Pipeline Workflow */}
                  <div style={{ 
                    background: 'rgba(255, 255, 255, 0.65)', 
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)',
                    border: '1px solid rgba(255, 255, 255, 0.75)', 
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

                    {/* Stepper with 2 rows of 4 stages */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {/* Row 1 */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                        <div style={{ position: 'absolute', top: '7px', left: '10px', right: '10px', height: '2px', background: '#38bdf8', zIndex: 0 }} />
                        {[
                          { name: 'Ingest', status: 'done' },
                          { name: 'Quality', status: 'done' },
                          { name: 'Masking', status: 'done' },
                          { name: 'Tracking', status: 'active' }
                        ].map((s, idx) => (
                          <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1 }}>
                            <div style={{
                              width: '16px',
                              height: '16px',
                              borderRadius: '50%',
                              background: s.status === 'done' ? '#0284c7' : '#ffffff',
                              border: s.status === 'active' ? '3px solid #0284c7' : '2px solid #0284c7',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.55rem',
                              color: '#fff',
                              fontWeight: 700
                            }}>
                              {s.status === 'done' && '✓'}
                            </div>
                            <span style={{ fontSize: '0.62rem', fontWeight: 600, color: s.status === 'active' ? '#0284c7' : '#334155', marginTop: '3px' }}>
                              {s.name}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Row 2 */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                        <div style={{ position: 'absolute', top: '7px', left: '10px', right: '10px', height: '2px', background: '#e2e8f0', zIndex: 0 }} />
                        {[
                          { name: 'SfM Sparse', status: 'pending' },
                          { name: 'Dense MVS', status: 'pending' },
                          { name: 'Mesh 3D', status: 'pending' },
                          { name: 'Confidence', status: 'pending' }
                        ].map((s, idx) => (
                          <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1 }}>
                            <div style={{
                              width: '16px',
                              height: '16px',
                              borderRadius: '50%',
                              background: '#ffffff',
                              border: '2px solid #cbd5e1',
                              boxSizing: 'border-box'
                            }} />
                            <span style={{ fontSize: '0.62rem', fontWeight: 500, color: '#64748b', marginTop: '3px' }}>
                              {s.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
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
