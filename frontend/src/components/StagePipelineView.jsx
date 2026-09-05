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
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>
      {/* Stages Pipeline List */}
      <div style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '14px',
        padding: '24px',
        boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.05), 0 2px 6px -1px rgba(15, 23, 42, 0.02)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>
              Reconstruction Pipeline
            </h3>
            <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '3px', margin: 0 }}>
              13 Independent Modular Photogrammetric Stages with Atomic Checkpoints
            </p>
          </div>
          <div className="badge badge-cyan" style={{ fontWeight: 700 }}>
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
                  padding: '13px 18px',
                  borderRadius: '10px',
                  background: isSelected 
                    ? 'rgba(2, 132, 199, 0.08)' 
                    : '#f8fafc',
                  border: isSelected 
                    ? '1.5px solid #0284c7' 
                    : '1px solid #e2e8f0',
                  boxShadow: isSelected ? '0 2px 8px rgba(2, 132, 199, 0.15)' : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '8px',
                    background: stage.status === 'completed' 
                      ? 'rgba(16, 185, 129, 0.14)' 
                      : (stage.status === 'running' ? 'rgba(2, 132, 199, 0.14)' : '#e2e8f0'),
                    color: stage.status === 'completed' ? '#059669' : (stage.status === 'running' ? '#0284c7' : '#64748b'),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.78rem',
                    fontWeight: 800
                  }}>
                    {idx + 1}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.92rem', color: isSelected ? '#0284c7' : '#0f172a' }}>
                        {stage.stage_name.replace(/_/g, ' ').toUpperCase()}
                      </span>
                      {stage.execution_time_seconds > 0 && (
                        <span className="font-mono" style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                          {stage.execution_time_seconds}s
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '0.76rem', color: '#64748b', marginTop: '2px', margin: 0 }}>
                      {STAGE_DESCRIPTIONS[stage.stage_name] || "Reconstruction stage module"}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <StatusBadge status={stage.status} />
                  <ChevronRight size={16} color={isSelected ? '#0284c7' : '#94a3b8'} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Stage Detail Drawer */}
      <div style={{
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '14px',
        padding: '24px',
        boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.05), 0 2px 6px -1px rgba(15, 23, 42, 0.02)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span className="badge badge-cyan" style={{ fontWeight: 700 }}>Stage {activeDetail?.stage_order}</span>
            <StatusBadge status={activeDetail?.status} />
          </div>

          <h4 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', textTransform: 'capitalize', letterSpacing: '-0.02em', margin: 0 }}>
            {activeDetail?.stage_name.replace(/_/g, ' ')}
          </h4>
          <p style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '8px', lineHeight: 1.5, margin: '8px 0 0 0' }}>
            {STAGE_DESCRIPTIONS[activeDetail?.stage_name]}
          </p>

          <hr style={{ borderColor: '#f1f5f9', margin: '18px 0' }} />

          {/* Metrics list */}
          <div style={{ marginBottom: '18px' }}>
            <span style={{ fontSize: '0.74rem', color: '#475569', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', display: 'block', marginBottom: '8px' }}>
              Execution Metrics
            </span>
            {activeDetail?.metrics_json ? (
              <pre className="font-mono" style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                padding: '12px',
                borderRadius: '8px',
                fontSize: '0.74rem',
                color: '#0284c7',
                maxHeight: '180px',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                fontWeight: 500
              }}>
                {JSON.stringify(JSON.parse(activeDetail.metrics_json), null, 2)}
              </pre>
            ) : (
              <p style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic', margin: 0 }}>
                No runtime metrics recorded yet.
              </p>
            )}
          </div>

          {/* Error Details if Failed */}
          {activeDetail?.error_detail && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              padding: '12px',
              borderRadius: '8px',
              marginBottom: '18px'
            }}>
              <span style={{ fontSize: '0.75rem', color: '#dc2626', fontWeight: 700, display: 'block' }}>
                Failure Diagnostic
              </span>
              <p style={{ fontSize: '0.76rem', color: '#991b1b', marginTop: '4px', margin: '4px 0 0 0' }}>
                {activeDetail.error_detail}
              </p>
            </div>
          )}

          {/* Checkpoint Path */}
          {activeDetail?.checkpoint_dir && (
            <div style={{ marginBottom: '18px' }}>
              <span style={{ fontSize: '0.74rem', color: '#475569', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', display: 'block', marginBottom: '4px' }}>
                Intermediate Checkpoint
              </span>
              <div className="font-mono" style={{ fontSize: '0.72rem', color: '#64748b', wordBreak: 'break-all', background: '#f8fafc', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
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
          style={{ width: '100%', justifyContent: 'center', padding: '10px 16px' }}
        >
          <RefreshCw size={14} /> Resume From Stage {activeDetail?.stage_order}
        </button>
      </div>
    </div>
  );
}
