import React, { useState } from 'react';
import { 
  Play, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  RefreshCw, 
  ChevronRight, 
  FileText, 
  Database,
  ArrowRight
} from 'lucide-react';
import StatusBadge from './StatusBadge';

const STAGE_DESCRIPTIONS = {
  preprocessing: "Extracts video frames at target sampling rate, normalizes color space, applies CLAHE contrast.",
  frame_quality: "Calculates Laplacian variance sharpness, luminance distribution, and motion blur.",
  keyframe_selection: "Prunes redundant stationary frames using optical flow and visual baseline displacement.",
  pose_estimation: "SIFT/ORB feature detection, RANSAC epipolar geometry, and 6-DoF camera trajectory recovery.",
  geometry: "Multi-view triangulation of feature correspondences into metric 3D point coordinates with reprojection filter.",
  dense_point_cloud: "Semi-Global Block Matching (SGBM) stereo disparity fields projected into dense 3D point cloud.",
  mesh_generation: "2.5D/3D Delaunay spatial surface triangulation, normal calculation, and Wavefront OBJ output.",
  texture_mapping: "Projective UV texture synthesis from keyframes onto mesh faces with MTL material definitions.",
  georeferencing: "7-parameter Sim(3) Helmert transformation aligning coordinates to WGS84 and EPSG:3857.",
  confidence_estimation: "Per-point geometric uncertainty from ray intersection parallax angle and observation redundancy.",
  validation: "Photogrammetric engineering certification: GSD, point cloud completeness, reprojection residual checks."
};

export default function StagePipelineView({ stages = [], currentStage, onResumeStage, isRunning }) {
  const [selectedStage, setSelectedStage] = useState(null);

  const activeDetail = selectedStage || stages.find(s => s.stage_name === currentStage) || stages[0];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>
      {/* Stages Pipeline List */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>Reconstruction Pipeline</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              11 Independent Modular Photogrammetric Stages with Atomic Checkpoints
            </p>
          </div>
          <div className="badge badge-cyan">
            {stages.filter(s => s.status === 'completed').length} / {stages.length} Stages Finished
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {stages.map((stage, idx) => {
            const isSelected = activeDetail?.stage_name === stage.stage_name;
            const isCurrent = currentStage === stage.stage_name && stage.status === 'running';

            return (
              <div
                key={stage.stage_name}
                onClick={() => setSelectedStage(stage)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: isSelected 
                    ? 'rgba(6, 182, 212, 0.12)' 
                    : 'rgba(255, 255, 255, 0.02)',
                  border: isSelected 
                    ? '1px solid rgba(6, 182, 212, 0.4)' 
                    : '1px solid rgba(255, 255, 255, 0.05)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    background: stage.status === 'completed' 
                      ? 'rgba(16, 185, 129, 0.2)' 
                      : (stage.status === 'running' ? 'rgba(6, 182, 212, 0.2)' : 'rgba(255, 255, 255, 0.05)'),
                    color: stage.status === 'completed' ? '#34d399' : (stage.status === 'running' ? '#38bdf8' : 'var(--text-dim)'),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 700
                  }}>
                    {idx + 1}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#fff' }}>
                        {stage.stage_name.replace(/_/g, ' ').toUpperCase()}
                      </span>
                      {stage.execution_time_seconds > 0 && (
                        <span className="font-mono" style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                          {stage.execution_time_seconds}s
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {STAGE_DESCRIPTIONS[stage.stage_name] || "Reconstruction stage module"}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <StatusBadge status={stage.status} />
                  <ChevronRight size={16} color="var(--text-dim)" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Stage Detail Drawer */}
      <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span className="badge badge-cyan">Stage {activeDetail?.stage_order}</span>
            <StatusBadge status={activeDetail?.status} />
          </div>

          <h4 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', textTransform: 'capitalize' }}>
            {activeDetail?.stage_name.replace(/_/g, ' ')}
          </h4>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.4 }}>
            {STAGE_DESCRIPTIONS[activeDetail?.stage_name]}
          </p>

          <hr style={{ borderColor: 'var(--border-subtle)', margin: '16px 0' }} />

          {/* Metrics list */}
          <div style={{ marginBottom: '16px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
              Execution Metrics
            </span>
            {activeDetail?.metrics_json ? (
              <pre className="font-mono" style={{
                background: 'rgba(0, 0, 0, 0.4)',
                padding: '10px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                color: '#38bdf8',
                maxHeight: '180px',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap'
              }}>
                {JSON.stringify(JSON.parse(activeDetail.metrics_json), null, 2)}
              </pre>
            ) : (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontStyle: 'italic' }}>
                No runtime metrics recorded yet.
              </p>
            )}
          </div>

          {/* Error Details if Failed */}
          {activeDetail?.error_detail && (
            <div style={{
              background: 'rgba(244, 63, 94, 0.1)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              padding: '10px',
              borderRadius: '6px',
              marginBottom: '16px'
            }}>
              <span style={{ fontSize: '0.75rem', color: '#fb7185', fontWeight: 600, display: 'block' }}>
                Failure Diagnostic
              </span>
              <p style={{ fontSize: '0.75rem', color: '#fca5a5', marginTop: '4px' }}>
                {activeDetail.error_detail}
              </p>
            </div>
          )}

          {/* Checkpoint Path */}
          {activeDetail?.checkpoint_dir && (
            <div style={{ marginBottom: '16px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                Intermediate Checkpoint
              </span>
              <div className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                {activeDetail.checkpoint_dir}
              </div>
            </div>
          )}
        </div>

        {/* Action Button: Resume from this stage */}
        <button
          onClick={() => onResumeStage(activeDetail?.stage_name)}
          disabled={isRunning}
          className="btn-primary"
          style={{ width: '100%', justifyContent: 'center' }}
        >
          <RefreshCw size={14} /> Resume From Stage {activeDetail?.stage_order}
        </button>
      </div>
    </div>
  );
}
