import React, { useEffect, useState } from 'react';
import { Plane, Cpu, ShieldCheck, Activity, Layers, Upload, BarChart3, Box } from 'lucide-react';
import { apiClient } from '../api/client';

export default function Navbar({ activePage, setActivePage, activeMissionId, activeJobId }) {
  const [hardware, setHardware] = useState(null);

  useEffect(() => {
    apiClient.getSystemHardware()
      .then(data => setHardware(data))
      .catch(err => console.debug("Hardware check:", err));
  }, []);

  const navItems = [
    { id: 'landing', label: 'Overview', icon: Layers },
    { id: 'create-mission', label: 'New Mission', icon: Plane },
    { id: 'upload', label: 'Upload Data', icon: Upload },
    { id: 'dashboard', label: 'Pipeline Monitor', icon: Activity },
    { id: 'viewer', label: '3D Digital Twin', icon: Box },
    { id: 'analytics', label: 'Quality Analytics', icon: BarChart3 },
  ];

  const isLight = true;

  return (
    <header 
      className="sticky top-0 z-50 px-6 py-3"
      style={{
        background: isLight ? 'rgba(255, 255, 255, 0.88)' : 'rgba(10, 16, 29, 0.90)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: isLight ? '1px solid rgba(14, 165, 233, 0.2)' : '1px solid var(--border-subtle)',
        boxShadow: isLight ? '0 4px 20px rgba(15, 23, 42, 0.04)' : 'none',
        transition: 'all 0.25s ease'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        {/* Brand */}
        <div 
          onClick={() => setActivePage('landing')}
          style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
        >
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #0284c7, #0d9488)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: isLight ? '0 4px 12px rgba(2, 132, 199, 0.3)' : '0 0 15px rgba(6, 182, 212, 0.4)'
          }}>
            <Plane size={22} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.02em', color: isLight ? '#0f172a' : '#fff' }}>AEROSCAN</span>
              <span style={{ fontWeight: 800, fontSize: '1.1rem', color: isLight ? '#0284c7' : '#38bdf8' }}>3D</span>
            </div>
            <p style={{ fontSize: '0.65rem', color: isLight ? '#64748b' : 'var(--text-dim)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              UAV Photogrammetry Engine
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  background: isActive 
                    ? (isLight ? 'rgba(2, 132, 199, 0.12)' : 'rgba(6, 182, 212, 0.15)')
                    : 'transparent',
                  color: isActive 
                    ? (isLight ? '#0284c7' : '#38bdf8')
                    : (isLight ? '#475569' : 'var(--text-muted)'),
                  border: isActive 
                    ? (isLight ? '1px solid rgba(2, 132, 199, 0.28)' : '1px solid rgba(6, 182, 212, 0.3)')
                    : '1px solid transparent',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* System / GPU Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {hardware ? (
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '20px',
                background: isLight ? 'rgba(240, 249, 255, 0.9)' : 'rgba(15, 23, 42, 0.8)',
                border: isLight ? '1px solid rgba(14, 165, 233, 0.25)' : '1px solid var(--border-subtle)',
                fontSize: '0.75rem',
                boxShadow: isLight ? '0 2px 8px rgba(15, 23, 42, 0.04)' : 'none'
              }}
              title={JSON.stringify(hardware.device_capabilities, null, 2)}
            >
              <Cpu size={14} color={hardware.device_capabilities?.cuda_available ? '#059669' : '#0284c7'} />
              <span style={{ color: isLight ? '#64748b' : 'var(--text-muted)' }}>Device:</span>
              <span style={{ 
                fontWeight: 600, 
                color: hardware.device_capabilities?.cuda_available 
                  ? (isLight ? '#059669' : '#34d399')
                  : (isLight ? '#0284c7' : '#38bdf8')
              }}>
                {hardware.device_capabilities?.cuda_available 
                  ? `GPU (${hardware.device_capabilities.device_name})` 
                  : `CPU (${hardware.device_capabilities?.cpu_cores_logical || 4}T)`}
              </span>
            </div>
          ) : (
            <div className={isLight ? "telemetry-chip" : "badge badge-cyan"}>
              <ShieldCheck size={12} /> System Ready
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
