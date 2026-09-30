import React, { useEffect, useState } from 'react';
import { Plane, Cpu, ShieldCheck, Activity, Layers, Upload, BarChart3, Box } from 'lucide-react';
import { apiClient } from '../api/client';

// ─── VISUAL CONSTANTS ────────────────────────────────────────────────────────
// Light Spatial-Tech Aesthetic — Restrained, High-Precision Aerospace Top Bar
const NAV_STYLES = {
  // Outer header shell
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    background: '#ffffff',
    borderBottom: '1px solid var(--border-subtle)',
    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
    padding: '0 24px',
    height: '58px',
    display: 'flex',
    alignItems: 'center',
    transition: 'border-color 0.2s ease',
  },

  // Flex row that fills the header
  inner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: '16px',
  },

  // ── Brand ──────────────────────────────────────────────────────────────────
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
    flexShrink: 0,
    userSelect: 'none',
  },
  brandLogo: {
    width: '34px',
    height: '34px',
    borderRadius: '6px',
    background: '#0f172a',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.15)',
    flexShrink: 0,
  },
  brandTextWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  brandNameRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '5px',
    lineHeight: 1,
  },
  brandNamePrimary: {
    fontWeight: 800,
    fontSize: '1.02rem',
    letterSpacing: '-0.02em',
    color: '#0f172a',
    fontFamily: 'var(--font-sans)',
  },
  brandNameAccent: {
    fontWeight: 700,
    fontSize: '0.85rem',
    color: '#0f766e',
    letterSpacing: '0.04em',
    fontFamily: 'var(--font-mono)',
  },
  brandSub: {
    fontSize: '0.58rem',
    color: '#64748b',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    fontWeight: 600,
    fontFamily: 'var(--font-mono)',
    marginTop: '2px',
  },

  // ── Centre Nav ─────────────────────────────────────────────────────────────
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    background: '#f1f5f9',
    border: '1px solid var(--border-subtle)',
    borderRadius: '8px',
    padding: '3px',
  },

  // Active tab pill
  tabActive: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 13px',
    borderRadius: '6px',
    background: '#ffffff',
    border: '1px solid var(--border-subtle)',
    color: '#0f172a',
    fontWeight: 600,
    fontSize: '0.8rem',
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)',
    letterSpacing: '-0.01em',
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-sans)',
  },

  // Inactive tab
  tabInactive: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '6px',
    background: 'transparent',
    border: '1px solid transparent',
    color: '#475569',
    fontWeight: 500,
    fontSize: '0.8rem',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    whiteSpace: 'nowrap',
    letterSpacing: '-0.01em',
    fontFamily: 'var(--font-sans)',
  },

  // ── Right / Status ─────────────────────────────────────────────────────────
  statusPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '5px 12px',
    borderRadius: '6px',
    background: '#ffffff',
    border: '1px solid var(--border-subtle)',
    fontSize: '0.74rem',
    fontFamily: 'var(--font-mono)',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
    flexShrink: 0,
    letterSpacing: '-0.01em',
  },
  gpuPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '5px 12px',
    borderRadius: '6px',
    background: '#ffffff',
    border: '1px solid var(--border-subtle)',
    fontSize: '0.74rem',
    fontFamily: 'var(--font-mono)',
    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
    flexShrink: 0,
    letterSpacing: '-0.01em',
  },

  greenDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#059669',
    boxShadow: '0 0 0 2px rgba(5, 150, 105, 0.2)',
    flexShrink: 0,
  },
};

// ─── HOVER HELPER ─────────────────────────────────────────────────────────────
function NavTab({ item, isActive, onClick }) {
  const [hovered, setHovered] = useState(false);
  const Icon = item.icon;

  const style = isActive
    ? NAV_STYLES.tabActive
    : {
        ...NAV_STYLES.tabInactive,
        ...(hovered
          ? {
              background: 'rgba(255, 255, 255, 0.7)',
              color: '#0f172a',
            }
          : {}),
      };

  return (
    <button
      key={item.id}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={style}
    >
      <Icon
        size={14}
        color={isActive ? '#0f766e' : hovered ? '#0f172a' : '#64748b'}
        strokeWidth={isActive ? 2.2 : 1.8}
      />
      <span>{item.label}</span>
    </button>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
// ALL LOGIC BELOW IS IDENTICAL TO THE ORIGINAL — only visual styles changed above.
export default function Navbar({ activePage, setActivePage, activeMissionId, activeJobId }) {
  const [hardware, setHardware] = useState(null);

  useEffect(() => {
    apiClient.getSystemHardware()
      .then(data => setHardware(data))
      .catch(err => console.debug("Hardware check:", err));
  }, []);

  const navItems = [
    { id: 'landing',        label: 'Overview',         icon: Layers    },
    { id: 'create-mission', label: 'New Mission',       icon: Plane     },
    { id: 'upload',         label: 'Upload Data',       icon: Upload    },
    { id: 'dashboard',      label: 'Mission Console',   icon: Activity  },
    { id: 'viewer',         label: '3D Digital Twin',   icon: Box       },
    { id: 'analytics',      label: 'Quality Analytics', icon: BarChart3 },
  ];

  const isCuda = hardware?.device_capabilities?.cuda_available;
  const deviceName = isCuda
    ? `GPU (${hardware.device_capabilities.device_name})`
    : `CPU (${hardware?.device_capabilities?.cpu_cores_logical || 4}T)`;

  return (
    <header style={NAV_STYLES.header}>
      <div style={NAV_STYLES.inner}>

        {/* ── Brand ─────────────────────────────────────────────────────── */}
        <div
          onClick={() => setActivePage('landing')}
          style={NAV_STYLES.brand}
        >
          <div style={NAV_STYLES.brandLogo}>
            <Plane size={17} color="#ffffff" strokeWidth={2.2} />
          </div>
          <div style={NAV_STYLES.brandTextWrap}>
            <div style={NAV_STYLES.brandNameRow}>
              <span style={NAV_STYLES.brandNamePrimary}>RECON</span>
              <span style={NAV_STYLES.brandNameAccent}>-X</span>
            </div>
            <p style={NAV_STYLES.brandSub}>Spatial Intelligence Platform</p>
          </div>
        </div>

        {/* ── Navigation Tabs ───────────────────────────────────────────── */}
        <nav style={NAV_STYLES.nav}>
          {navItems.map(item => (
            <NavTab
              key={item.id}
              item={item}
              isActive={activePage === item.id}
              onClick={() => setActivePage(item.id)}
            />
          ))}
        </nav>

        {/* ── System / GPU Status ───────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          {hardware ? (
            <div
              style={isCuda ? NAV_STYLES.gpuPill : NAV_STYLES.statusPill}
              title={JSON.stringify(hardware.device_capabilities, null, 2)}
            >
              <Cpu
                size={14}
                color={isCuda ? '#059669' : '#0284c7'}
                strokeWidth={2}
              />
              <span style={{ color: '#64748b', fontWeight: 500 }}>Device:</span>
              <span style={{
                fontWeight: 700,
                color: isCuda ? '#059669' : '#0284c7',
                letterSpacing: '-0.01em',
              }}>
                {deviceName}
              </span>
            </div>
          ) : (
            <div style={NAV_STYLES.statusPill}>
              <div style={NAV_STYLES.greenDot} />
              <ShieldCheck size={13} color="#059669" strokeWidth={2.2} />
              <span style={{ fontWeight: 600, color: '#059669', letterSpacing: '-0.01em' }}>
                System Ready
              </span>
            </div>
          )}
        </div>

      </div>
    </header>
  );
}
