import React, { useState } from 'react';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import CreateMissionPage from './pages/CreateMissionPage';
import VideoUploadPage from './pages/VideoUploadPage';
import ProcessingDashboard from './pages/ProcessingDashboard';
import DigitalTwinViewerPage from './pages/DigitalTwinViewerPage';
import AnalyticsReportPage from './pages/AnalyticsReportPage';

export default function App() {
  const [activePage, setActivePage] = useState('landing');
  const [activeMissionId, setActiveMissionId] = useState(null);
  const [activeJobId, setActiveJobId] = useState(null);

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
            setActivePage={setActivePage}
          />
        );
      case 'analytics':
        return (
          <AnalyticsReportPage
            activeJobId={activeJobId}
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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
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
        padding: '20px',
        textAlign: 'center',
        borderTop: activePage === 'landing' ? '1px solid rgba(14, 165, 233, 0.2)' : '1px solid var(--border-subtle)',
        fontSize: '0.75rem',
        color: activePage === 'landing' ? '#64748b' : 'var(--text-dim)',
        background: activePage === 'landing' ? 'rgba(255, 255, 255, 0.88)' : 'rgba(6, 9, 15, 0.95)',
        backdropFilter: 'blur(12px)',
        transition: 'all 0.25s ease'
      }}>
        UAV Single-Pass 3D Reconstruction Platform • Photogrammetric Engine v1.0 • OpenCV & PyTorch Accelerated
      </footer>
    </div>
  );
}
