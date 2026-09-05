import React, { useState } from 'react';
import { 
  Plane, 
  Camera, 
  Compass, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  Layers, 
  Box, 
  Crosshair, 
  Calculator, 
  Info, 
  Mountain, 
  Sliders, 
  ClipboardCheck, 
  X, 
  Sparkles,
  Lightbulb,
  ChevronDown,
  User,
  Navigation
} from 'lucide-react';
import { apiClient } from '../api/client';

export default function CreateMissionPage({ setActivePage, setActiveMissionId }) {
  const [formData, setFormData] = useState({
    name: 'Industrial Survey Alpha',
    description: 'High-resolution photogrammetric 3D digital twin of survey site',
    drone_model: 'DJI Matrice 300 RTK',
    camera_model: 'Zenmuse P1',
    sensor_width_mm: 35.9,
    sensor_height_mm: 24.0,
    focal_length_mm: 35.0,
    flight_altitude_m: 60.0,
    target_gsd_cm: 1.5,
    overlap_forward_percent: 80.0,
    overlap_side_percent: 70.0
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Theoretical GSD computation: GSD = (Altitude [m] * SensorWidth [mm]) / (FocalLength [mm] * ImageWidth [px]) * 100
  // Standard full-frame 4K/8K image width assumption ~8192px or 4K ~4000px
  const calculatedGsd = ((formData.flight_altitude_m * formData.sensor_width_mm) / (formData.focal_length_mm * 5472) * 100).toFixed(2);

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const mission = await apiClient.createMission(formData);
      setActiveMissionId(mission.id);
      setActivePage('upload');
    } catch (err) {
      setError(err.message || 'Failed to create mission');
      setSubmitting(false);
    }
  };

  return (
    <div className="geospatial-canvas" style={{ minHeight: '100vh', position: 'relative', overflowX: 'hidden' }}>
      {/* Topographic Contour Overlay Background */}
      <div className="topographic-overlay" />

      {/* Datalist Presets for Drones & Cameras */}
      <datalist id="drone-platform-presets">
        <option value="DJI Matrice 300 RTK" />
        <option value="DJI Mavic 3 Enterprise" />
        <option value="DJI Inspire 3" />
        <option value="WingtraOne GEN II" />
        <option value="Freefly Alta X" />
        <option value="senseFly eBee X" />
      </datalist>

      <datalist id="camera-payload-presets">
        <option value="Zenmuse P1" />
        <option value="Zenmuse L1" />
        <option value="Sony ILX-LR1 (61MP)" />
        <option value="Hasselblad L2D-20c" />
        <option value="Phase One iXM-100" />
      </datalist>

      <div className="uav-planner-container">
        
        {/* ── HEADER / HERO SECTION ────────────────────────────────────────── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '24px',
          marginBottom: '32px',
          position: 'relative',
          paddingBottom: '24px',
          borderBottom: '1px solid rgba(14, 165, 233, 0.16)'
        }}>
          {/* Left Title & Navigation */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', maxWidth: '680px' }}>
            <button
              type="button"
              onClick={() => setActivePage('landing')}
              title="Return to Mission Overview"
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: '#ffffff',
                border: '1px solid rgba(14, 165, 233, 0.25)',
                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#0369a1',
                flexShrink: 0,
                marginTop: '4px',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#0284c7'; e.currentTarget.style.transform = 'translateX(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(14, 165, 233, 0.25)'; e.currentTarget.style.transform = 'none'; }}
            >
              <ArrowLeft size={20} />
            </button>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span className="telemetry-chip">
                  <Navigation size={12} /> TELEMETRY & SENSOR SUITE
                </span>
                <span className="telemetry-chip" style={{ color: '#0d9488', borderColor: 'rgba(13, 148, 136, 0.25)', background: 'rgba(13, 148, 136, 0.08)' }}>
                  STAGE 01 / CONFIG
                </span>
              </div>
              <h1 style={{
                fontSize: '2.35rem',
                fontWeight: 800,
                color: '#0f172a',
                letterSpacing: '-0.025em',
                lineHeight: 1.15
              }}>
                Configure <span style={{ color: '#0284c7' }}>UAV</span> Mission
              </h1>
              <p style={{ fontSize: '0.96rem', color: '#64748b', marginTop: '6px', lineHeight: 1.5 }}>
                Define flight telemetry parameters, sensor optics, and target ground sample resolution.
              </p>
            </div>
          </div>

          {/* Right Header: Surveying UAV + Digital Terrain Visualization */}
          <div style={{
            position: 'relative',
            width: '380px',
            height: '140px',
            borderRadius: '16px',
            overflow: 'hidden',
            background: 'linear-gradient(135deg, rgba(255,255,255,0.7) 0%, rgba(224,242,254,0.5) 100%)',
            border: '1px solid rgba(14, 165, 233, 0.2)',
            boxShadow: '0 4px 18px rgba(2, 132, 199, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <img 
              src="/uav_survey_hero.jpg" 
              alt="UAV Photogrammetry Survey" 
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity: 0.94,
                mixBlendMode: 'multiply'
              }}
            />
            {/* Coordinate / Elevation HUD Badge */}
            <div style={{
              position: 'absolute',
              bottom: '10px',
              left: '12px',
              background: 'rgba(255, 255, 255, 0.92)',
              backdropFilter: 'blur(8px)',
              padding: '4px 10px',
              borderRadius: '6px',
              border: '1px solid rgba(14, 165, 233, 0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
              <span style={{ fontSize: '0.7rem', fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#0369a1' }}>
                SURVEY GRID: ACTIVE (RTK FIX)
              </span>
            </div>
          </div>
        </div>

        {/* Error Alert if API error */}
        {error && (
          <div style={{
            background: 'rgba(244, 63, 94, 0.1)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            padding: '14px 18px',
            borderRadius: '12px',
            color: '#e11d48',
            marginBottom: '28px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '0.9rem',
            fontWeight: 500
          }}>
            <X size={18} color="#e11d48" />
            <span>{error}</span>
          </div>
        )}

        {/* ── MAIN 3-COLUMN WORKSPACE ────────────────────────────────────────── */}
        <div className="uav-grid-layout">
          
          {/* 1. LEFT WORKFLOW RAIL (VISUAL ONLY) */}
          <div className="uav-workflow-rail">
            <div className="uav-rail-line" />
            
            {/* 01: Profile (Active) */}
            <div 
              className="uav-rail-node active"
              title="01 Mission Profile"
            >
              <Navigation size={18} />
            </div>

            {/* 02: Sensor */}
            <div 
              className="uav-rail-node"
              title="02 Sensor & Optical Calibration"
            >
              <Camera size={18} />
            </div>

            {/* 03: Photogrammetry */}
            <div 
              className="uav-rail-node"
              title="03 Photogrammetric Parameters"
            >
              <Crosshair size={18} />
            </div>

            {/* 04: Summary */}
            <div 
              className="uav-rail-node"
              title="04 Mission Summary"
            >
              <Calculator size={18} />
            </div>

            {/* Ready */}
            <div 
              className="uav-rail-node"
              title="Ready for Video Ingestion"
              style={{ marginBottom: '24px' }}
            >
              <ClipboardCheck size={18} />
            </div>

            {/* Geospatial Dot Grid Decoration */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 4px)',
              gap: '4px',
              opacity: 0.35,
              marginTop: '8px'
            }}>
              {[...Array(12)].map((_, i) => (
                <div key={i} style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#0284c7' }} />
              ))}
            </div>
          </div>

          {/* 2. CENTER CONTENT COLUMN (MAIN FORM) */}
          <form onSubmit={handleSubmit} style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* ── CARD 01: MISSION PROFILE ────────────────────────────────── */}
              <div className="geo-card" style={{ padding: '28px 30px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '22px' }}>
                  <div className="uav-section-num">01</div>
                  <div>
                    <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      MISSION PROFILE
                      <Info size={15} color="#94a3b8" style={{ cursor: 'help' }} />
                    </h2>
                    <p style={{ fontSize: '0.84rem', color: '#64748b', marginTop: '2px' }}>
                      Basic information about your UAV survey mission
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
                  {/* Mission Name */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
                      Mission Name <span style={{ color: '#e11d48' }}>*</span>
                    </label>
                    <div className="uav-field-wrapper">
                      <input
                        type="text"
                        name="name"
                        required
                        value={formData.name}
                        onChange={handleChange}
                        className="uav-input"
                        placeholder="e.g. Substation Site Inspection"
                        style={{ paddingRight: '40px' }}
                      />
                      <User size={16} color="#94a3b8" style={{ position: 'absolute', right: '14px', pointerEvents: 'none' }} />
                    </div>
                  </div>

                  {/* Drone Platform */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
                      Drone Platform
                    </label>
                    <div className="uav-field-wrapper">
                      <input
                        type="text"
                        name="drone_model"
                        list="drone-platform-presets"
                        value={formData.drone_model}
                        onChange={handleChange}
                        className="uav-input"
                        placeholder="e.g. DJI Matrice 300 RTK"
                        style={{ paddingRight: '40px' }}
                      />
                      <ChevronDown size={16} color="#94a3b8" style={{ position: 'absolute', right: '14px', pointerEvents: 'none' }} />
                    </div>
                  </div>
                </div>

                {/* Description / Notes */}
                <div style={{ marginTop: '20px' }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
                    Description / Survey Notes
                  </label>
                  <textarea
                    name="description"
                    rows={3}
                    value={formData.description}
                    onChange={handleChange}
                    className="uav-input"
                    style={{ resize: 'vertical' }}
                    placeholder="Details about flight trajectory, atmospheric conditions, or site coordinates"
                  />
                </div>
              </div>

              {/* ── CARD 02: SENSOR & OPTICAL CALIBRATION ───────────────────── */}
              <div className="geo-card" style={{ padding: '28px 30px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '22px' }}>
                  <div className="uav-section-num">02</div>
                  <div>
                    <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      SENSOR & OPTICAL CALIBRATION
                      <Info size={15} color="#94a3b8" style={{ cursor: 'help' }} />
                    </h2>
                    <p style={{ fontSize: '0.84rem', color: '#64748b', marginTop: '2px' }}>
                      Camera sensor specifications and optical calibration parameters
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px' }}>
                  {/* Camera Payload */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
                      Camera Payload
                    </label>
                    <div className="uav-field-wrapper">
                      <input
                        type="text"
                        name="camera_model"
                        list="camera-payload-presets"
                        value={formData.camera_model}
                        onChange={handleChange}
                        className="uav-input"
                        placeholder="e.g. Zenmuse P1"
                        style={{ paddingRight: '36px' }}
                      />
                      <ChevronDown size={16} color="#94a3b8" style={{ position: 'absolute', right: '14px', pointerEvents: 'none' }} />
                    </div>
                  </div>

                  {/* Sensor Width */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
                      Sensor Width (mm)
                    </label>
                    <div className="uav-field-wrapper">
                      <input
                        type="number"
                        step="0.1"
                        name="sensor_width_mm"
                        value={formData.sensor_width_mm}
                        onChange={handleChange}
                        className="uav-input"
                        style={{ paddingRight: '52px' }}
                      />
                      <span className="uav-unit-badge">mm</span>
                    </div>
                  </div>

                  {/* Focal Length */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
                      Focal Length (mm)
                    </label>
                    <div className="uav-field-wrapper">
                      <input
                        type="number"
                        step="0.1"
                        name="focal_length_mm"
                        value={formData.focal_length_mm}
                        onChange={handleChange}
                        className="uav-input"
                        style={{ paddingRight: '52px' }}
                      />
                      <span className="uav-unit-badge">mm</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── CARD 03: PHOTOGRAMMETRIC PARAMETERS ─────────────────────── */}
              <div className="geo-card" style={{ padding: '28px 30px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '22px' }}>
                  <div className="uav-section-num">03</div>
                  <div>
                    <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      PHOTOGRAMMETRIC PARAMETERS
                      <Info size={15} color="#94a3b8" style={{ cursor: 'help' }} />
                    </h2>
                    <p style={{ fontSize: '0.84rem', color: '#64748b', marginTop: '2px' }}>
                      Flight parameters and ground sampling configuration
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px' }}>
                  {/* Flight Altitude */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
                      Flight Altitude (m AGL)
                    </label>
                    <div className="uav-field-wrapper">
                      <input
                        type="number"
                        step="1"
                        name="flight_altitude_m"
                        value={formData.flight_altitude_m}
                        onChange={handleChange}
                        className="uav-input"
                        style={{ paddingRight: '44px' }}
                      />
                      <span className="uav-unit-badge">m</span>
                    </div>
                  </div>

                  {/* Target GSD */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
                      Target GSD (cm/pixel)
                    </label>
                    <div className="uav-field-wrapper">
                      <input
                        type="number"
                        step="0.1"
                        name="target_gsd_cm"
                        value={formData.target_gsd_cm}
                        onChange={handleChange}
                        className="uav-input"
                        style={{ paddingRight: '64px' }}
                      />
                      <span className="uav-unit-badge">cm/px</span>
                    </div>
                  </div>

                  {/* Forward Overlap */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>
                      Forward Overlap (%)
                    </label>
                    <div className="uav-field-wrapper">
                      <input
                        type="number"
                        step="1"
                        name="overlap_forward_percent"
                        value={formData.overlap_forward_percent}
                        onChange={handleChange}
                        className="uav-input"
                        style={{ paddingRight: '44px' }}
                      />
                      <span className="uav-unit-badge">%</span>
                    </div>
                  </div>
                </div>

                {/* Engineering Result Panel: CALCULATED OPTICAL GROUND RESOLUTION */}
                <div style={{
                  marginTop: '24px',
                  padding: '16px 22px',
                  borderRadius: '12px',
                  background: 'rgba(6, 182, 212, 0.07)',
                  border: '1.5px solid rgba(6, 182, 212, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '16px',
                  boxShadow: '0 2px 10px rgba(6, 182, 212, 0.05)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      background: 'rgba(2, 132, 199, 0.12)',
                      border: '1px solid rgba(2, 132, 199, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#0284c7'
                    }}>
                      <Calculator size={20} />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        CALCULATED OPTICAL GROUND RESOLUTION
                      </span>
                      <p style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '3px', fontFamily: 'var(--font-mono)' }}>
                        Formula: GSD = (Altitude × SensorWidth) / (FocalLength × ImageWidth)
                      </p>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span className="font-mono" style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0284c7', letterSpacing: '-0.02em' }}>
                      {calculatedGsd} <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0d9488' }}>cm/px</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* ── CARD 04: MISSION SUMMARY ────────────────────────────────── */}
              <div className="geo-card" style={{ padding: '28px 30px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '20px' }}>
                  <div className="uav-section-num">04</div>
                  <div>
                    <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      MISSION SUMMARY
                      <Info size={15} color="#94a3b8" style={{ cursor: 'help' }} />
                    </h2>
                    <p style={{ fontSize: '0.84rem', color: '#64748b', marginTop: '2px' }}>
                      Review your mission configuration before proceeding
                    </p>
                  </div>
                </div>

                {/* 3 Compact Telemetry Metric Tiles */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                  {/* Tile 1: Altitude (Blue Accent) */}
                  <div 
                    className="uav-metric-tile"
                    style={{
                      background: 'rgba(2, 132, 199, 0.05)',
                      border: '1px solid rgba(2, 132, 199, 0.2)'
                    }}
                  >
                    <div style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '10px',
                      background: 'rgba(2, 132, 199, 0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#0284c7'
                    }}>
                      <Mountain size={22} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                        ALTITUDE
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                        <span className="font-mono" style={{ fontSize: '1.55rem', fontWeight: 800, color: '#0f172a' }}>
                          {formData.flight_altitude_m || 0}
                        </span>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0369a1' }}>
                          m AGL
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tile 2: Target GSD (Teal Accent) */}
                  <div 
                    className="uav-metric-tile"
                    style={{
                      background: 'rgba(13, 148, 136, 0.05)',
                      border: '1px solid rgba(13, 148, 136, 0.2)'
                    }}
                  >
                    <div style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '10px',
                      background: 'rgba(13, 148, 136, 0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#0d9488'
                    }}>
                      <Crosshair size={22} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                        TARGET GSD
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                        <span className="font-mono" style={{ fontSize: '1.55rem', fontWeight: 800, color: '#0f172a' }}>
                          {formData.target_gsd_cm || 0}
                        </span>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0d9488' }}>
                          cm/px
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Tile 3: Overlap (Soft Violet Accent) */}
                  <div 
                    className="uav-metric-tile"
                    style={{
                      background: 'rgba(139, 92, 246, 0.05)',
                      border: '1px solid rgba(139, 92, 246, 0.2)'
                    }}
                  >
                    <div style={{
                      width: '42px',
                      height: '42px',
                      borderRadius: '10px',
                      background: 'rgba(139, 92, 246, 0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#8b5cf6'
                    }}>
                      <Layers size={22} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                        OVERLAP
                      </div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                        <span className="font-mono" style={{ fontSize: '1.55rem', fontWeight: 800, color: '#0f172a' }}>
                          {formData.overlap_forward_percent || 0}%
                        </span>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#8b5cf6' }}>
                          Forward
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── BOTTOM ACTION BAR ───────────────────────────────────────── */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '8px'
              }}>
                <button
                  type="button"
                  onClick={() => setActivePage('landing')}
                  className="geo-btn-secondary"
                  style={{ padding: '12px 24px', fontSize: '0.9rem' }}
                >
                  <X size={16} /> Cancel
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="geo-btn-primary"
                  style={{
                    padding: '13px 32px',
                    fontSize: '0.92rem',
                    background: 'linear-gradient(135deg, #0284c7 0%, #06b6d4 100%)',
                    boxShadow: '0 4px 18px rgba(2, 132, 199, 0.35)',
                    opacity: submitting ? 0.7 : 1,
                    cursor: submitting ? 'not-allowed' : 'pointer'
                  }}
                >
                  <span>{submitting ? 'Creating Mission...' : 'Save & Proceed to Video Upload'}</span>
                  <ArrowRight size={18} />
                </button>
              </div>

              {/* Tip Callout Banner */}
              <div style={{
                background: 'rgba(2, 132, 199, 0.05)',
                border: '1px solid rgba(2, 132, 199, 0.15)',
                borderRadius: '10px',
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}>
                <Lightbulb size={16} color="#0284c7" />
                <span style={{ fontSize: '0.8rem', color: '#475569' }}>
                  <strong>Tip:</strong> Ensure values match your flight plan for optimal 3D digital twin reconstruction accuracy.
                </span>
              </div>
            </div>
          </form>

          {/* 3. RIGHT MISSION PREVIEW (STICKY PANEL) ────────────────────────── */}
          <div className="uav-preview-panel" style={{ position: 'sticky', top: '90px' }}>
            <div className="geo-card" style={{ padding: '24px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
                paddingBottom: '14px',
                marginBottom: '18px'
              }}>
                <h3 style={{
                  fontSize: '0.88rem',
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#0f172a'
                }}>
                  MISSION PREVIEW
                </h3>
                <span style={{
                  fontSize: '0.7rem',
                  fontFamily: 'var(--font-mono)',
                  color: '#0284c7',
                  background: 'rgba(2, 132, 199, 0.08)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontWeight: 600
                }}>
                  LIVE SYNC
                </span>
              </div>

              {/* Circular Geospatial Compass & Aerial Preview */}
              <div className="compass-ring">
                <span className="compass-label compass-n">N</span>
                <span className="compass-label compass-s">S</span>
                <span className="compass-label compass-e">E</span>
                <span className="compass-label compass-w">W</span>

                <div className="compass-inner-map">
                  <img
                    src="/survey_orthomosaic_preview.jpg"
                    alt="Aerial Survey Orthomosaic Preview"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />
                  {/* Drone Position Reticle */}
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '32px',
                    height: '32px',
                    border: '1.5px solid #38bdf8',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 0 12px rgba(56, 189, 248, 0.8)'
                  }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#0284c7' }} />
                  </div>
                </div>
              </div>

              {/* Mission Information Items */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '18px' }}>
                {/* Platform */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '8px',
                    background: 'rgba(2, 132, 199, 0.08)',
                    border: '1px solid rgba(2, 132, 199, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#0284c7',
                    flexShrink: 0
                  }}>
                    <Navigation size={16} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Platform</div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {formData.drone_model || 'DJI Matrice 300 RTK'}
                    </div>
                  </div>
                </div>

                {/* Payload */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '8px',
                    background: 'rgba(14, 165, 233, 0.08)',
                    border: '1px solid rgba(14, 165, 233, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#0284c7',
                    flexShrink: 0
                  }}>
                    <Camera size={16} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Payload</div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {formData.camera_model || 'Zenmuse P1'}
                    </div>
                  </div>
                </div>

                {/* Mission Type */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '8px',
                    background: 'rgba(13, 148, 136, 0.08)',
                    border: '1px solid rgba(13, 148, 136, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#0d9488',
                    flexShrink: 0
                  }}>
                    <Layers size={16} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Mission Type</div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
                      Photogrammetry
                    </div>
                  </div>
                </div>

                {/* Expected Output */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '8px',
                    background: 'rgba(99, 102, 241, 0.08)',
                    border: '1px solid rgba(99, 102, 241, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#6366f1',
                    flexShrink: 0
                  }}>
                    <Box size={16} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Expected Output</div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a' }}>
                      3D Digital Twin
                    </div>
                  </div>
                </div>

                {/* Datum */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '8px',
                    background: 'rgba(2, 132, 199, 0.08)',
                    border: '1px solid rgba(2, 132, 199, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#0284c7',
                    flexShrink: 0
                  }}>
                    <Crosshair size={16} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>Datum</div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a', fontFamily: 'var(--font-mono)' }}>
                      WGS84 / EPSG:4326
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Box */}
              <div style={{
                marginTop: '22px',
                padding: '12px 14px',
                borderRadius: '10px',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#10b981',
                  flexShrink: 0
                }}>
                  <CheckCircle2 size={16} />
                </div>
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#065f46' }}>
                    All parameters look good
                  </div>
                  <div style={{ fontSize: '0.73rem', color: '#047857' }}>
                    You're ready to proceed!
                  </div>
                </div>
              </div>

            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
