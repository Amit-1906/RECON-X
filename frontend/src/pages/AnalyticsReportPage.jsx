import React, { useState, useEffect } from 'react';
import { 
  BarChart2, 
  Layers, 
  Image as ImageIcon, 
  AlertTriangle, 
  CheckCircle2,
  RefreshCw,
  Sun,
  Eye,
  Activity,
  Zap,
  Filter,
  Scissors
} from 'lucide-react';
import { apiClient } from '../api/client';

export default function AnalyticsReportPage({ activeJobId }) {
  const [activeTab, setActiveTab] = useState('quality');
  const [qualityReport, setQualityReport] = useState(null);
  const [keyframesReport, setKeyframesReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Filter state
  const [filterClass, setFilterClass] = useState('ALL');

  useEffect(() => {
    if (!activeJobId) return;
    
    let isMounted = true;
    setLoading(true);
    
    Promise.all([
      apiClient.getFrameQualityReport(activeJobId).catch(err => null),
      apiClient.getKeyframesReport(activeJobId).catch(err => null)
    ]).then(([qReport, kReport]) => {
      if (isMounted) {
        setQualityReport(qReport);
        setKeyframesReport(kReport);
        setError(!qReport && !kReport ? "Reports not available for this job yet." : null);
        if (!qReport && kReport) setActiveTab('keyframes');
      }
    }).finally(() => {
      if (isMounted) setLoading(false);
    });
      
    return () => { isMounted = false; };
  }, [activeJobId]);

  if (!activeJobId) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
        <BarChart2 size={48} style={{ opacity: 0.2, margin: '0 auto 16px' }} />
        <h2>Analytics Dashboard</h2>
        <p>No active job selected. Please select a job from the pipeline monitor.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <RefreshCw size={32} className="spin" color="#38bdf8" style={{ animation: 'spin 1s linear infinite' }} />
        <p style={{ marginTop: '16px', color: 'var(--text-muted)' }}>Loading analytics...</p>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{
          background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)',
          borderRadius: '10px', padding: '24px', color: '#fca5a5',
          display: 'flex', alignItems: 'flex-start', gap: '16px'
        }}>
          <AlertTriangle size={24} style={{ flexShrink: 0 }} />
          <div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.1rem' }}>Report Unavailable</h3>
            <p style={{ margin: 0, opacity: 0.8 }}>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px' }}>
      
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <Activity size={28} color="#a78bfa" />
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#fff', margin: 0 }}>
            Analytics Dashboard
          </h1>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '32px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '12px' }}>
        <button
          onClick={() => setActiveTab('quality')}
          disabled={!qualityReport}
          style={{
            background: activeTab === 'quality' ? 'rgba(167,139,250,0.15)' : 'transparent',
            color: activeTab === 'quality' ? '#a78bfa' : (qualityReport ? '#e2e8f0' : 'var(--text-muted)'),
            border: `1px solid ${activeTab === 'quality' ? '#a78bfa55' : 'transparent'}`,
            padding: '8px 16px', borderRadius: '8px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px',
            cursor: qualityReport ? 'pointer' : 'not-allowed', transition: 'all 0.2s'
          }}
        >
          <Activity size={16} /> Phase 2: Frame Quality
        </button>
        <button
          onClick={() => setActiveTab('keyframes')}
          disabled={!keyframesReport}
          style={{
            background: activeTab === 'keyframes' ? 'rgba(56,189,248,0.15)' : 'transparent',
            color: activeTab === 'keyframes' ? '#38bdf8' : (keyframesReport ? '#e2e8f0' : 'var(--text-muted)'),
            border: `1px solid ${activeTab === 'keyframes' ? '#38bdf855' : 'transparent'}`,
            padding: '8px 16px', borderRadius: '8px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px',
            cursor: keyframesReport ? 'pointer' : 'not-allowed', transition: 'all 0.2s'
          }}
        >
          <Scissors size={16} /> Phase 3: Keyframes
        </button>
      </div>

      {activeTab === 'quality' && qualityReport && <QualityTab report={qualityReport} filterClass={filterClass} setFilterClass={setFilterClass} />}
      {activeTab === 'keyframes' && keyframesReport && <KeyframesTab report={keyframesReport} qualityReport={qualityReport} />}
      
    </div>
  );
}

// ── Quality Tab (Phase 2) ───────────────────────────────────────────────

function QualityTab({ report, filterClass, setFilterClass }) {
  const filteredFrames = filterClass === 'ALL' 
    ? report.frames 
    : report.frames.filter(f => f.classification === filterClass);

  const getBadgeStyle = (classification) => {
    switch (classification) {
      case 'HIGH': return { color: '#34d399', bg: 'rgba(52,211,153,0.15)', icon: CheckCircle2 };
      case 'MEDIUM': return { color: '#fbbf24', bg: 'rgba(251,191,36,0.15)', icon: Activity };
      case 'LOW': return { color: '#f87171', bg: 'rgba(248,113,113,0.15)', icon: AlertTriangle };
      default: return { color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', icon: Eye };
    }
  };

  const maxHistCount = Math.max(...report.histogram.map(b => b.count), 1);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        <StatCard label="Total Frames" value={report.total_frames} icon={Layers} color="#38bdf8" />
        <StatCard label="Mean Quality" value={`${report.mean_overall_quality}/100`} icon={Activity} color="#a78bfa" />
        <StatCard label="High Quality" value={report.high_quality_count} icon={CheckCircle2} color="#34d399" />
        <StatCard label="Low Quality (Rejected)" value={report.low_quality_count} icon={AlertTriangle} color="#f87171" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr', gap: '24px', marginBottom: '32px' }}>
        <div style={{
          background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '14px', padding: '24px'
        }}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: '1.05rem', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BarChart2 size={18} color="#a78bfa" /> Quality Distribution
          </h3>
          
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '180px', marginTop: '20px' }}>
            {report.histogram.map((bin, i) => {
              const heightPct = (bin.count / maxHistCount) * 100;
              const color = bin.bin_start >= 80 ? '#34d399' : (bin.bin_start >= 60 ? '#fbbf24' : '#f87171');
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ 
                    width: '100%', height: `${heightPct}%`, background: color, 
                    borderRadius: '4px 4px 0 0', transition: 'height 0.3s ease',
                    minHeight: bin.count > 0 ? '4px' : '0'
                  }} title={`${bin.count} frames (${bin.bin_start}-${bin.bin_end})`} />
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '6px', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                    {bin.bin_start}-{bin.bin_end}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div style={{
          background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '14px', padding: '24px', display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ImageIcon size={18} color="#38bdf8" /> Extracted Frames ({filteredFrames.length})
            </h3>
            <div style={{ display: 'flex', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '8px' }}>
              <FilterBtn label="ALL" current={filterClass} onClick={() => setFilterClass('ALL')} color="#94a3b8" />
              <FilterBtn label="HIGH" current={filterClass} onClick={() => setFilterClass('HIGH')} color="#34d399" />
              <FilterBtn label="MEDIUM" current={filterClass} onClick={() => setFilterClass('MEDIUM')} color="#fbbf24" />
              <FilterBtn label="LOW" current={filterClass} onClick={() => setFilterClass('LOW')} color="#f87171" />
            </div>
          </div>

          <div style={{ 
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', 
            overflowY: 'auto', maxHeight: '600px', paddingRight: '8px'
          }}>
            {filteredFrames.map(frame => {
              const b = getBadgeStyle(frame.classification);
              const BadgeIcon = b.icon;
              const imgUrl = `/api/v1/system/static?path=${encodeURIComponent(frame.filepath)}`;
              
              return (
                <div key={frame.frame_id} style={{
                  background: 'rgba(0,0,0,0.2)', border: `1px solid ${b.bg}`, borderRadius: '10px', overflow: 'hidden'
                }}>
                  <div style={{ height: '140px', background: '#111', position: 'relative' }}>
                     <img 
                        src={imgUrl} alt={frame.frame_id}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'relative', zIndex: 1 }}
                      />
                     <div style={{
                       position: 'absolute', top: '8px', right: '8px', zIndex: 2, background: b.bg, color: b.color,
                       border: `1px solid ${b.color}44`, padding: '2px 8px', borderRadius: '999px', fontSize: '0.7rem',
                       fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', backdropFilter: 'blur(4px)'
                     }}>
                       <BadgeIcon size={10} /> {frame.classification} ({frame.overall_quality})
                     </div>
                  </div>
                  
                  <div style={{ padding: '12px' }}>
                    <div style={{ fontSize: '0.75rem', color: '#e2e8f0', fontWeight: 600, marginBottom: '8px' }}>{frame.frame_id}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <MetricRow icon={Eye} label="Sharpness" value={Math.round(frame.sharpness * 100)} />
                      <MetricRow icon={Sun} label="Exposure" value={Math.round(frame.exposure * 100)} />
                      <MetricRow icon={Zap} label="Features" value={frame.feature_count} />
                      <MetricRow icon={Layers} label="Redundancy" value={Math.round(frame.redundancy * 100)} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}


// ── Keyframes Tab (Phase 3) ─────────────────────────────────────────────

function KeyframesTab({ report, qualityReport }) {
  const reductionLabel = `${report.total_input_frames} → ${report.keyframes_count}`;
  
  return (
    <>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '32px' }}>
        <div style={{ flex: 1 }}>
          <StatCard label="Frames Reduced" value={reductionLabel} icon={Scissors} color="#38bdf8" />
        </div>
        <div style={{ flex: 1 }}>
          <StatCard label="Reduction %" value={`${report.reduction_percent}%`} icon={Activity} color="#34d399" />
        </div>
      </div>

      <div style={{
        background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '14px', padding: '24px', display: 'flex', flexDirection: 'column'
      }}>
        
        <h3 style={{ margin: '0 0 20px 0', fontSize: '1.05rem', color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ImageIcon size={18} color="#38bdf8" /> Selected Keyframes
        </h3>

        <div style={{ 
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', 
          overflowY: 'auto', maxHeight: '600px', paddingRight: '8px'
        }}>
          {report.keyframes.map(kf => {
            const imgUrl = `/api/v1/system/static?path=${encodeURIComponent(kf.filepath)}`;
            
            return (
              <div key={kf.keyframe_id} style={{
                background: 'rgba(0,0,0,0.2)', border: `1px solid rgba(56,189,248,0.2)`, borderRadius: '10px', overflow: 'hidden'
              }}>
                <div style={{ height: '140px', background: '#111', position: 'relative' }}>
                   <img 
                      src={imgUrl} alt={`Keyframe ${kf.keyframe_id}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'relative', zIndex: 1 }}
                    />
                   <div style={{
                     position: 'absolute', top: '8px', right: '8px', zIndex: 2, background: 'rgba(56,189,248,0.15)',
                     color: '#38bdf8', border: `1px solid #38bdf844`, padding: '2px 8px', borderRadius: '999px',
                     fontSize: '0.7rem', fontWeight: 700, backdropFilter: 'blur(4px)'
                   }}>
                     KF {kf.keyframe_id}
                   </div>
                </div>
                
                <div style={{ padding: '12px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#e2e8f0', fontWeight: 600, marginBottom: '8px' }}>
                    {kf.original_frame_id}
                  </div>
                  
                  <div style={{ fontSize: '0.75rem', color: '#fbbf24', marginBottom: '8px' }}>
                    Reason: <strong>{kf.selection_reason}</strong>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <MetricRow icon={Eye} label="Quality" value={kf.quality_score} />
                    <MetricRow icon={Zap} label="Feat Score" value={Math.round(kf.feature_score * 100)} />
                    <MetricRow icon={Layers} label="Similarity" value={Math.round(kf.similarity_to_previous * 100)} />
                    <MetricRow icon={Activity} label="Time" value={`${kf.timestamp_sec.toFixed(1)}s`} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ── Shared Helpers ────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '10px', padding: '16px', display: 'flex', alignItems: 'center', gap: '16px'
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: '10px', background: `${color}15`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
      }}>
        <Icon size={22} color={color} />
      </div>
      <div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>{label}</div>
        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#e2e8f0', lineHeight: 1 }}>{value}</div>
      </div>
    </div>
  );
}

function FilterBtn({ label, current, onClick, color }) {
  const active = current === label;
  return (
    <button onClick={onClick} style={{
      background: active ? `${color}22` : 'transparent',
      color: active ? color : 'var(--text-muted)',
      border: `1px solid ${active ? color + '44' : 'transparent'}`,
      padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600,
      cursor: 'pointer', transition: 'all 0.2s'
    }}>
      {label}
    </button>
  );
}

function MetricRow({ icon: Icon, label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)' }}>
        <Icon size={10} /> {label}
      </div>
      <div style={{ color: '#e2e8f0', fontWeight: 600 }}>{value}</div>
    </div>
  );
}
