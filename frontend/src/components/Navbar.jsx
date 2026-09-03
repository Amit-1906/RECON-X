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

  return (
    <header className="glass-header sticky top-0 z-50 px-6 py-3 flex items-center justify-between">
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
            background: 'linear-gradient(135deg, #06b6d4, #0284c7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(6, 182, 212, 0.4)'
          }}>
            <Plane size={22} color="#ffffff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.02em', color: '#fff' }}>AEROSCAN</span>
              <span style={{ fontWeight: 800, fontSize: '1.1rem', color: '#38bdf8' }}>3D</span>
            </div>
            <p style={{ fontSize: '0.65rem', color: 'var(--text-dim)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
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
                  background: isActive ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                  color: isActive ? '#38bdf8' : 'var(--text-muted)',
                  border: isActive ? '1px solid rgba(6, 182, 212, 0.3)' : '1px solid transparent',
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
                padding: '6px 12px',
                borderRadius: '20px',
                background: 'rgba(15, 23, 42, 0.8)',
                border: '1px solid var(--border-subtle)',
                fontSize: '0.75rem'
              }}
              title={JSON.stringify(hardware.device_capabilities, null, 2)}
            >
              <Cpu size={14} color={hardware.device_capabilities?.cuda_available ? '#10b981' : '#38bdf8'} />
              <span style={{ color: 'var(--text-muted)' }}>Device:</span>
              <span style={{ 
                fontWeight: 600, 
                color: hardware.device_capabilities?.cuda_available ? '#34d399' : '#38bdf8' 
              }}>
                {hardware.device_capabilities?.cuda_available 
                  ? `GPU (${hardware.device_capabilities.device_name})` 
                  : `CPU (${hardware.device_capabilities?.cpu_cores_logical || 4}T)`}
              </span>
            </div>
          ) : (
            <div className="badge badge-cyan">
              <ShieldCheck size={12} /> System Ready
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
