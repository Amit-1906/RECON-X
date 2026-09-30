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
  dynamic_masking: "YOLOv8-seg dynamic object detection and masking to prevent moving objects from corrupting 3D reconstruction.",
  illumination_preprocessing: "Illumination-aware preprocessing: reduces exposure drift, extreme shadows, and contrast variations.",
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
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '18px' }}>
      {/* Stages Pipeline List */}
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '22px',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1.08rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em', margin: 0 }}>
              Reconstruction Pipeline
            </h3>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px', margin: 0 }}>
              13 Independent Modular Photogrammetric Stages with Atomic Checkpoints
            </p>
          </div>
          <div className="badge badge-cyan" style={{ fontWeight: 700 }}>
            {stages.filter(s => s.status === 'completed').length} / {stages.length} Stages Finished
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                  padding: '11px 15px',
                  borderRadius: 'var(--radius-md)',
                  background: isSelected 
                    ? '#f0fdf4' 
                    : 'var(--bg-surface)',
                  border: isSelected 
                    ? '1.5px solid #0f766e' 
                    : '1px solid var(--border-subtle)',
                  boxShadow: isSelected ? 'var(--shadow-xs)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.12s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '4px',
                    background: stage.status === 'completed' 
                      ? 'var(--status-ready-bg)' 
                      : (stage.status === 'running' ? 'var(--status-active-bg)' : '#f1f5f9'),
                    color: stage.status === 'completed' ? 'var(--status-ready)' : (stage.status === 'running' ? 'var(--status-active)' : 'var(--text-muted)'),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)'
                  }}>
                    {idx + 1}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.86rem', color: isSelected ? '#0f766e' : 'var(--text-primary)' }}>
                        {stage.stage_name.replace(/_/g, ' ').toUpperCase()}
                      </span>
                      {stage.execution_time_seconds > 0 && (
                        <span className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                          {stage.execution_time_seconds}s
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '1px', margin: 0 }}>
                      {STAGE_DESCRIPTIONS[stage.stage_name] || "Reconstruction stage module"}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <StatusBadge status={stage.status} />
                  <ChevronRight size={15} color={isSelected ? '#0f766e' : '#94a3b8'} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Stage Detail Drawer */}
      <div style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '22px',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span className="telemetry-chip" style={{ fontWeight: 700 }}>Stage {activeDetail?.stage_order}</span>
            <StatusBadge status={activeDetail?.status} />
          </div>

          <h4 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'capitalize', letterSpacing: '-0.02em', margin: 0 }}>
            {activeDetail?.stage_name.replace(/_/g, ' ')}
          </h4>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.5, margin: '6px 0 0 0' }}>
            {STAGE_DESCRIPTIONS[activeDetail?.stage_name]}
          </p>

          <hr style={{ borderColor: 'var(--border-subtle)', margin: '16px 0' }} />

          {/* Metrics list */}
          <div style={{ marginBottom: '16px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', display: 'block', marginBottom: '6px', fontFamily: 'var(--font-mono)' }}>
              Execution Metrics
            </span>
            {activeDetail?.metrics_json ? (
              <pre className="font-mono" style={{
                background: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-subtle)',
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.72rem',
                color: 'var(--text-primary)',
                maxHeight: '160px',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                fontWeight: 500
              }}>
                {JSON.stringify(JSON.parse(activeDetail.metrics_json), null, 2)}
              </pre>
            ) : (
              <p style={{ fontSize: '0.76rem', color: 'var(--text-dim)', fontStyle: 'italic', margin: 0 }}>
                No runtime metrics recorded yet.
              </p>
            )}
          </div>

          {/* Error Details if Failed */}
          {activeDetail?.error_detail && (
            <div style={{
              background: 'var(--status-danger-bg)',
              border: '1px solid var(--status-danger-border)',
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '16px'
            }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--status-danger)', fontWeight: 700, display: 'block' }}>
                Failure Diagnostic
              </span>
              <p style={{ fontSize: '0.74rem', color: 'var(--status-danger)', marginTop: '3px', margin: '3px 0 0 0' }}>
                {activeDetail.error_detail}
              </p>
            </div>
          )}

          {/* Checkpoint Path */}
          {activeDetail?.checkpoint_dir && (
            <div style={{ marginBottom: '16px' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', display: 'block', marginBottom: '4px', fontFamily: 'var(--font-mono)' }}>
                Intermediate Checkpoint
              </span>
              <div className="font-mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', wordBreak: 'break-all', background: 'var(--bg-surface-subtle)', padding: '6px 8px', borderRadius: 'var(--radius-xs)', border: '1px solid var(--border-subtle)' }}>
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
          style={{ width: '100%', justifyContent: 'center', padding: '9px 14px' }}
        >
          <RefreshCw size={13} /> Resume From Stage {activeDetail?.stage_order}
        </button>
      </div>
    </div>
  );
}
