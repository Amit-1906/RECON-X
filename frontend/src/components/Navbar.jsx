import React, { useEffect, useState } from 'react';
import { Plane, Cpu, ShieldCheck, Activity, Layers, Upload, BarChart3, Box } from 'lucide-react';
import { apiClient } from '../api/client';

// ─── VISUAL CONSTANTS ────────────────────────────────────────────────────────
// Only visual tokens — no logic changes whatsoever.
const NAV_STYLES = {
  // Outer header shell
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    // Exact reference match: white-to-sky glassy strip
    background: 'rgba(248, 252, 255, 0.82)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderBottom: '1.5px solid rgba(14, 165, 233, 0.18)',
    boxShadow:
      '0 2px 24px rgba(14, 165, 233, 0.07), 0 1px 4px rgba(15, 23, 42, 0.04)',
    padding: '0 28px',
    height: '64px',
    display: 'flex',
    alignItems: 'center',
    transition: 'all 0.25s ease',
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
    gap: '12px',
    cursor: 'pointer',
    flexShrink: 0,
    userSelect: 'none',
  },
  brandLogo: {
    width: '40px',
    height: '40px',
    borderRadius: '11px',
    background: 'linear-gradient(135deg, #0284c7 0%, #0ea5e9 50%, #06b6d4 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow:
      '0 4px 14px rgba(2, 132, 199, 0.30), 0 0 0 1.5px rgba(14, 165, 233, 0.2)',
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
    fontSize: '1.08rem',
    letterSpacing: '-0.02em',
    color: '#0f172a',
    fontFamily: 'var(--font-sans)',
  },
  brandNameAccent: {
    fontWeight: 800,
    fontSize: '1.08rem',
    color: '#0284c7',
    letterSpacing: '-0.02em',
    fontFamily: 'var(--font-sans)',
  },
  brandSub: {
    fontSize: '0.6rem',
    color: '#94a3b8',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    fontWeight: 500,
    fontFamily: 'var(--font-sans)',
    marginTop: '1px',
  },

  // ── Centre Nav ─────────────────────────────────────────────────────────────
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    // Light frosted pill container around all tabs — matches reference exactly
    background: 'rgba(241, 248, 255, 0.7)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    border: '1.5px solid rgba(14, 165, 233, 0.16)',
    borderRadius: '16px',
    padding: '5px 6px',
    boxShadow: 'inset 0 1px 3px rgba(14, 165, 233, 0.06)',
  },

  // Active tab pill
  tabActive: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '7px 16px',
    borderRadius: '11px',
    background: 'linear-gradient(135deg, rgba(2,132,199,0.14) 0%, rgba(14,165,233,0.10) 100%)',
    border: '1.5px solid rgba(2, 132, 199, 0.28)',
    color: '#0369a1',
    fontWeight: 700,
    fontSize: '0.84rem',
    cursor: 'pointer',
    boxShadow: '0 2px 10px rgba(2, 132, 199, 0.12), 0 1px 3px rgba(2, 132, 199, 0.08)',
    letterSpacing: '-0.01em',
    transition: 'all 0.2s ease',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-sans)',
  },

  // Inactive tab
  tabInactive: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '7px 14px',
    borderRadius: '11px',
    background: 'transparent',
    border: '1.5px solid transparent',
    color: '#475569',
    fontWeight: 500,
    fontSize: '0.84rem',
    cursor: 'pointer',
    transition: 'all 0.18s ease',
    whiteSpace: 'nowrap',
    letterSpacing: '-0.01em',
    fontFamily: 'var(--font-sans)',
  },

  // ── Right / Status ─────────────────────────────────────────────────────────
  statusPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 15px',
    borderRadius: '20px',
    background: 'rgba(240, 253, 250, 0.85)',
    border: '1.5px solid rgba(5, 150, 105, 0.22)',
    fontSize: '0.78rem',
    fontFamily: 'var(--font-sans)',
    boxShadow: '0 2px 8px rgba(5, 150, 105, 0.06)',
    flexShrink: 0,
    letterSpacing: '-0.005em',
  },
  gpuPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 15px',
    borderRadius: '20px',
    background: 'rgba(240, 249, 255, 0.85)',
    border: '1.5px solid rgba(14, 165, 233, 0.22)',
    fontSize: '0.78rem',
    fontFamily: 'var(--font-sans)',
    boxShadow: '0 2px 8px rgba(14, 165, 233, 0.06)',
    flexShrink: 0,
    letterSpacing: '-0.005em',
  },

  // Pulsing green dot for "System Ready"
  greenDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#10b981',
    boxShadow: '0 0 0 2px rgba(16, 185, 129, 0.25)',
    flexShrink: 0,
  },
};

// ─── HOVER HELPER ─────────────────────────────────────────────────────────────
// Pure CSS-in-JS hover via React state — no external libraries.
function NavTab({ item, isActive, onClick }) {
  const [hovered, setHovered] = useState(false);
  const Icon = item.icon;

  const style = isActive
    ? NAV_STYLES.tabActive
    : {
        ...NAV_STYLES.tabInactive,
        ...(hovered
          ? {
              background: 'rgba(14, 165, 233, 0.08)',
              border: '1.5px solid rgba(14, 165, 233, 0.18)',
              color: '#0284c7',
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
        size={15}
        color={isActive ? '#0369a1' : hovered ? '#0284c7' : '#64748b'}
        strokeWidth={isActive ? 2.3 : 2}
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
    { id: 'dashboard',      label: 'Pipeline Monitor',  icon: Activity  },
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
            <Plane size={21} color="#ffffff" strokeWidth={2.2} />
          </div>
          <div style={NAV_STYLES.brandTextWrap}>
            <div style={NAV_STYLES.brandNameRow}>
              <span style={NAV_STYLES.brandNamePrimary}>AEROSCAN</span>
              <span style={NAV_STYLES.brandNameAccent}>3D</span>
            </div>
            <p style={NAV_STYLES.brandSub}>UAV Photogrammetry Engine</p>
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
