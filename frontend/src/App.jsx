import React, { useState } from 'react';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import CreateMissionPage from './pages/CreateMissionPage';
import VideoUploadPage from './pages/VideoUploadPage';
import ProcessingDashboard from './pages/ProcessingDashboard';
import DigitalTwinViewerPage from './pages/DigitalTwinViewerPage';
import AnalyticsReportPage from './pages/AnalyticsReportPage';

export default function App() {
  const [activePage, setActivePage] = useState(() => {
    const path = window.location.pathname.replace('/', '').toLowerCase();
    if (['landing', 'create-mission', 'upload', 'dashboard', 'viewer', 'analytics'].includes(path)) {
      return path;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get('jobId') || params.get('page') === 'viewer') return 'viewer';
    if (params.get('page')) return params.get('page');
    return 'landing';
  });

  const [activeMissionId, setActiveMissionId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('missionId') || null;
  });

  const [activeJobId, setActiveJobId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('jobId') || null;
  });

  const renderPage = () => {
    switch (activePage) {
      case 'landing':
        return (
          <LandingPage
            setActivePage={setActivePage}
            setActiveMissionId={setActiveMissionId}
            setActiveJobId={setActiveJobId}
          />
        );
      case 'create-mission':
        return (
          <CreateMissionPage
            setActivePage={setActivePage}
            setActiveMissionId={setActiveMissionId}
          />
        );
      case 'upload':
        return (
          <VideoUploadPage
            activeMissionId={activeMissionId}
            setActiveMissionId={setActiveMissionId}
            setActivePage={setActivePage}
            setActiveJobId={setActiveJobId}
          />
        );
      case 'dashboard':
        return (
          <ProcessingDashboard
            activeJobId={activeJobId}
            setActiveJobId={setActiveJobId}
            activeMissionId={activeMissionId}
            setActivePage={setActivePage}
          />
        );
      case 'viewer':
        return (
          <DigitalTwinViewerPage
            activeJobId={activeJobId}
            setActiveJobId={setActiveJobId}
            setActivePage={setActivePage}
          />
        );
      case 'analytics':
        return (
          <AnalyticsReportPage
            activeJobId={activeJobId}
            setActiveJobId={setActiveJobId}
            setActivePage={setActivePage}
          />
        );
      default:
        return (
          <LandingPage
            setActivePage={setActivePage}
            setActiveMissionId={setActiveMissionId}
            setActiveJobId={setActiveJobId}
          />
        );
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)' }}>
      <Navbar
        activePage={activePage}
        setActivePage={setActivePage}
        activeMissionId={activeMissionId}
        activeJobId={activeJobId}
      />
      <main style={{ flex: 1 }}>
        {renderPage()}
      </main>
      <footer style={{
        padding: '16px 24px',
        borderTop: '1px solid var(--border-subtle)',
        fontSize: '0.74rem',
        color: 'var(--text-muted)',
        background: 'var(--bg-surface)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.04em' }}>RECON-X</span>
          <span style={{ color: 'var(--border-strong)' }}>•</span>
          <span>Spatial Intelligence &amp; Photogrammetric Reconstruction Engine</span>
          <span style={{ color: 'var(--border-strong)' }}>•</span>
          <span className="font-mono" style={{ fontSize: '0.7rem' }}>v1.0-PROD</span>
        </div>
        <div className="font-mono" style={{ fontSize: '0.7rem', display: 'flex', gap: '16px', color: 'var(--text-muted)' }}>
          <span>DATUM: WGS84 / EPSG:4326</span>
          <span>COMPUTE: PYTORCH + OPENCV ACCELERATED</span>
        </div>
      </footer>
    </div>
  );
}
