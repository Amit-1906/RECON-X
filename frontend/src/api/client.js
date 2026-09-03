/**
 * API client for interacting with the UAV 3D Reconstruction Platform backend.
 */
const API_BASE = '/api/v1';

export const apiClient = {
  // ── System ────────────────────────────────────────────────────────────────
  async getSystemHardware() {
    const res = await fetch(`${API_BASE}/system/hardware`);
    if (!res.ok) throw new Error('Failed to fetch hardware status');
    return res.json();
  },

  async getHealth() {
    const res = await fetch(`${API_BASE}/system/health`);
    return res.json();
  },

  // ── Missions ──────────────────────────────────────────────────────────────
  async listMissions() {
    const res = await fetch(`${API_BASE}/missions`);
    if (!res.ok) throw new Error('Failed to fetch missions');
    return res.json();
  },

  async getMission(missionId) {
    const res = await fetch(`${API_BASE}/missions/${missionId}`);
    if (!res.ok) throw new Error(`Failed to fetch mission ${missionId}`);
    return res.json();
  },

  async createMission(data) {
    const res = await fetch(`${API_BASE}/missions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to create mission');
    }
    return res.json();
  },

  // ── Phase 1: Video Ingestion ──────────────────────────────────────────────

  /**
   * Upload a drone video to the Phase 1 ingestion endpoint.
   * Returns MissionResponse with video probe data (fps, resolution, duration, etc).
   * Supports optional upload progress callback via XMLHttpRequest.
   * @param {string} missionId
   * @param {File} file
   * @param {(pct: number) => void} [onProgress]
   */
  uploadMissionVideo(missionId, file, onProgress) {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', file);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/missions/${missionId}/upload`);

      if (onProgress) {
        xhr.upload.onprogress = (evt) => {
          if (evt.lengthComputable) {
            onProgress(Math.round((evt.loaded / evt.total) * 100));
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            reject(new Error('Invalid JSON response from upload endpoint'));
          }
        } else {
          try {
            const errBody = JSON.parse(xhr.responseText);
            reject(new Error(errBody.detail || `Upload failed with status ${xhr.status}`));
          } catch {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Network error during video upload'));
      xhr.send(formData);
    });
  },

  /** Alias — kept for backward compat with existing components. */
  async uploadVideo(missionId, file, onProgress) {
    return this.uploadMissionVideo(missionId, file, onProgress);
  },

  /** Upload companion GPS telemetry (SRT / CSV / GPX). */
  async uploadTelemetry(missionId, file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/missions/${missionId}/telemetry`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Telemetry upload failed');
    }
    return res.json();
  },

  /**
   * Trigger asynchronous frame extraction.
   * Returns 202 immediately — poll getMissionStatus() for live progress.
   */
  async extractFrames(missionId, { intervalSec = 0.5, maxDimension = 1920, jpegQuality = 90 } = {}) {
    const res = await fetch(`${API_BASE}/missions/${missionId}/extract-frames`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interval_sec: intervalSec,
        max_dimension: maxDimension,
        jpeg_quality: jpegQuality,
      }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to start frame extraction');
    }
    return res.json();
  },

  /**
   * Poll ingestion status: UPLOADED | VALIDATING | EXTRACTING | COMPLETED | FAILED.
   * @param {boolean} includeFrames — include the full frame list (expensive; use only on COMPLETED)
   */
  async getMissionStatus(missionId, includeFrames = false) {
    const url = `${API_BASE}/missions/${missionId}/status${includeFrames ? '?include_frames=true' : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ingestion status for mission ${missionId}`);
    return res.json();
  },

  /** Paginated list of extracted IngestionFrame records for a mission. */
  async getMissionFrames(missionId, skip = 0, limit = 100) {
    const res = await fetch(`${API_BASE}/missions/${missionId}/frames?skip=${skip}&limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch mission frames');
    return res.json();
  },

  // ── Jobs ──────────────────────────────────────────────────────────────────
  async createJob(missionId, preferredDevice = 'auto') {
    const res = await fetch(`${API_BASE}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mission_id: missionId, preferred_device: preferredDevice })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to dispatch job');
    }
    return res.json();
  },

  async getJob(jobId) {
    const res = await fetch(`${API_BASE}/jobs/${jobId}`);
    if (!res.ok) throw new Error(`Failed to fetch job ${jobId}`);
    return res.json();
  },

  async resumeJob(jobId, fromStage = null) {
    const url = fromStage
      ? `${API_BASE}/jobs/${jobId}/resume?from_stage=${encodeURIComponent(fromStage)}`
      : `${API_BASE}/jobs/${jobId}/resume`;
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to resume job');
    return res.json();
  },

  async getMissionJobs(missionId) {
    const res = await fetch(`${API_BASE}/jobs/mission/${missionId}`);
    if (!res.ok) throw new Error('Failed to fetch jobs');
    return res.json();
  },

  // ── Results ───────────────────────────────────────────────────────────────
  async getQualityReport(jobId) {
    const res = await fetch(`${API_BASE}/results/${jobId}/quality-report`);
    if (!res.ok) throw new Error('Failed to fetch quality report');
    return res.json();
  },

  async getFrameQualityReport(jobId) {
    const res = await fetch(`${API_BASE}/results/${jobId}/frame-quality`);
    if (!res.ok) throw new Error('Failed to fetch frame quality report');
    return res.json();
  },

  async getKeyframesReport(jobId) {
    const res = await fetch(`${API_BASE}/results/${jobId}/keyframes`);
    if (!res.ok) throw new Error('Failed to fetch keyframes report');
    return res.json();
  },

  async getDynamicObjectsReport(jobId) {
    const res = await fetch(`${API_BASE}/results/${jobId}/dynamic-objects`);
    if (!res.ok) throw new Error('Failed to fetch dynamic objects report');
    return res.json();
  },

  async getArtifacts(jobId) {
    const res = await fetch(`${API_BASE}/results/${jobId}/artifacts`);
    if (!res.ok) throw new Error('Failed to fetch artifacts');
    return res.json();
  },

  getArtifactDownloadUrl(jobId, artifactType) {
    return `${API_BASE}/results/${jobId}/download/${artifactType}`;
  },

  // ── Stages ────────────────────────────────────────────────────────────────
  async listStages() {
    const res = await fetch(`${API_BASE}/stages`);
    return res.json();
  },
};
