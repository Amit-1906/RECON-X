import React, { useState } from 'react';
import { Plane, Camera, Compass, Sliders, ArrowRight, CheckCircle2 } from 'lucide-react';
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
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 20px' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '2.2rem', fontWeight: 800, color: '#fff' }}>Configure UAV Mission</h1>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-muted)', marginTop: '4px' }}>
          Define flight telemetry parameters, sensor optics, and target ground sample resolution.
        </p>
      </div>

      {error && (
        <div style={{ background: 'rgba(244, 63, 94, 0.15)', border: '1px solid var(--danger)', padding: '12px 16px', borderRadius: '8px', color: '#fb7185', marginBottom: '24px' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Section 1: General Mission Details */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Plane size={18} color="#38bdf8" /> Mission Profile
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Mission Name *
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="form-input"
                  placeholder="e.g. Substation Site Inspection"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Drone Platform
                </label>
                <input
                  type="text"
                  name="drone_model"
                  value={formData.drone_model}
                  onChange={handleChange}
                  className="form-input"
                  placeholder="e.g. DJI Matrice 300 RTK"
                />
              </div>
            </div>

            <div style={{ marginTop: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                Description / Survey Notes
              </label>
              <textarea
                name="description"
                rows={2}
                value={formData.description}
                onChange={handleChange}
                className="form-input"
                placeholder="Details about flight trajectory, atmospheric conditions, or site coordinates"
              />
            </div>
          </div>

          {/* Section 2: Sensor & Optics */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Camera size={18} color="#38bdf8" /> Sensor & Optical Calibration
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Camera Payload
                </label>
                <input
                  type="text"
                  name="camera_model"
                  value={formData.camera_model}
                  onChange={handleChange}
                  className="form-input"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Sensor Width (mm)
                </label>
                <input
                  type="number"
                  step="0.1"
                  name="sensor_width_mm"
                  value={formData.sensor_width_mm}
                  onChange={handleChange}
                  className="form-input"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Focal Length (mm)
                </label>
                <input
                  type="number"
                  step="0.1"
                  name="focal_length_mm"
                  value={formData.focal_length_mm}
                  onChange={handleChange}
                  className="form-input"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Flight Profile & Target Resolution */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Compass size={18} color="#38bdf8" /> Photogrammetric Parameters
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Flight Altitude (m AGL)
                </label>
                <input
                  type="number"
                  step="1"
                  name="flight_altitude_m"
                  value={formData.flight_altitude_m}
                  onChange={handleChange}
                  className="form-input"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Target GSD (cm/pixel)
                </label>
                <input
                  type="number"
                  step="0.1"
                  name="target_gsd_cm"
                  value={formData.target_gsd_cm}
                  onChange={handleChange}
                  className="form-input"
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  Forward Overlap (%)
                </label>
                <input
                  type="number"
                  step="1"
                  name="overlap_forward_percent"
                  value={formData.overlap_forward_percent}
                  onChange={handleChange}
                  className="form-input"
                />
              </div>
            </div>

            {/* Interactive GSD Calculation Callout */}
            <div style={{
              marginTop: '20px',
              padding: '14px 18px',
              borderRadius: '8px',
              background: 'rgba(6, 182, 212, 0.08)',
              border: '1px solid rgba(6, 182, 212, 0.25)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>
                  Calculated Optical Ground Resolution
                </span>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Formula: GSD = (Altitude × SensorWidth) / (FocalLength × ImageWidth)
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="font-mono" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#38bdf8' }}>
                  {calculatedGsd} cm/px
                </span>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button
              type="button"
              onClick={() => setActivePage('landing')}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary"
              style={{ padding: '12px 28px' }}
            >
              {submitting ? 'Creating...' : 'Save & Proceed to Video Upload'} <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
