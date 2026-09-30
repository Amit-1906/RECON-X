/**
 * API client for interacting with the UAV 3D Reconstruction Platform backend.
 */
const API_BASE = '/api/v1';

/**
 * Safe JSON parser — gives a clear error when backend is down or returns empty body.
 */
async function safeJson(res) {
  const text = await res.text();
  if (!text || text.trim() === '') {
    throw new Error('Backend server is not responding. Please start the backend on port 8000.');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Server returned invalid response (status ${res.status}). Is the backend running?`);
  }
}

async function safeFetch(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (networkErr) {
    throw new Error('Cannot connect to backend server. Please run: python backend/run.py');
  }
  return res;
}

export const apiClient = {
  // ── System ────────────────────────────────────────────────────────────────
  async getSystemHardware() {
    const res = await safeFetch(`${API_BASE}/system/hardware`);
    if (!res.ok) throw new Error('Failed to fetch hardware status');
    return safeJson(res);
  },

  async getSystemStatus() {
    const res = await safeFetch(`${API_BASE}/system/status`);
    if (!res.ok) throw new Error('Failed to fetch system status');
    return safeJson(res);
  },

  async getHealth() {
    const res = await safeFetch(`${API_BASE}/system/health`);
    return safeJson(res);
  },

  // ── Missions ──────────────────────────────────────────────────────────────
  async listMissions() {
    const res = await safeFetch(`${API_BASE}/missions`);
    if (!res.ok) throw new Error('Failed to fetch missions');
    return safeJson(res);
  },

  async getMission(missionId) {
    const res = await safeFetch(`${API_BASE}/missions/${missionId}`);
    if (!res.ok) throw new Error(`Failed to fetch mission ${missionId}`);
    return safeJson(res);
  },

  async createMission(data) {
    const res = await safeFetch(`${API_BASE}/missions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await safeJson(res);
      throw new Error(err.detail || 'Failed to create mission');
    }
    return safeJson(res);
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
    const res = await safeFetch(`${API_BASE}/missions/${missionId}/telemetry`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      const err = await safeJson(res);
      throw new Error(err.detail || 'Telemetry upload failed');
    }
    return safeJson(res);
  },

  /**
   * Trigger asynchronous frame extraction.
   * Returns 202 immediately — poll getMissionStatus() for live progress.
   */
  async extractFrames(missionId, { intervalSec = 0.5, maxDimension = 1920, jpegQuality = 90 } = {}) {
    const res = await safeFetch(`${API_BASE}/missions/${missionId}/extract-frames`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interval_sec: intervalSec,
        max_dimension: maxDimension,
        jpeg_quality: jpegQuality,
      }),
    });
    if (!res.ok) {
      const err = await safeJson(res);
      throw new Error(err.detail || 'Failed to start frame extraction');
    }
    return safeJson(res);
  },

  /**
   * Poll ingestion status: UPLOADED | VALIDATING | EXTRACTING | COMPLETED | FAILED.
   * @param {boolean} includeFrames — include the full frame list (expensive; use only on COMPLETED)
   */
  async getMissionStatus(missionId, includeFrames = false) {
    const url = `${API_BASE}/missions/${missionId}/status${includeFrames ? '?include_frames=true' : ''}`;
    const res = await safeFetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ingestion status for mission ${missionId}`);
    return safeJson(res);
  },

  /** Paginated list of extracted IngestionFrame records for a mission. */
  async getMissionFrames(missionId, skip = 0, limit = 100) {
    const res = await safeFetch(`${API_BASE}/missions/${missionId}/frames?skip=${skip}&limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch mission frames');
    return safeJson(res);
  },

  // ── Jobs ──────────────────────────────────────────────────────────────────
  async createJob(missionId, preferredDevice = 'auto') {
    const res = await safeFetch(`${API_BASE}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mission_id: missionId, preferred_device: preferredDevice })
    });
    if (!res.ok) {
      const err = await safeJson(res);
      throw new Error(err.detail || 'Failed to dispatch job');
    }
    return safeJson(res);
  },

  async getJob(jobId) {
    const res = await safeFetch(`${API_BASE}/jobs/${jobId}`);
    if (!res.ok) throw new Error(`Failed to fetch job ${jobId}`);
    return safeJson(res);
  },

  async resumeJob(jobId, fromStage = null) {
    const url = fromStage
      ? `${API_BASE}/jobs/${jobId}/resume?from_stage=${encodeURIComponent(fromStage)}`
      : `${API_BASE}/jobs/${jobId}/resume`;
    const res = await safeFetch(url, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to resume job');
    return safeJson(res);
  },

  async cancelJob(jobId) {
    const res = await safeFetch(`${API_BASE}/jobs/${jobId}/cancel`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to cancel job');
    return safeJson(res);
  },

  getExportBundleUrl(jobId) {
    return `${API_BASE}/results/${jobId}/export-bundle`;
  },

  async getMissionJobs(missionId) {
    const res = await safeFetch(`${API_BASE}/jobs/mission/${missionId}`);
    if (!res.ok) throw new Error('Failed to fetch jobs');
    return safeJson(res);
  },

  // ── Results ───────────────────────────────────────────────────────────────
  async getQualityReport(jobId) {
    const res = await safeFetch(`${API_BASE}/results/${jobId}/quality-report`);
    if (!res.ok) throw new Error('Failed to fetch quality report');
    return safeJson(res);
  },

  async getFrameQualityReport(jobId) {
    const res = await safeFetch(`${API_BASE}/results/${jobId}/frame-quality`);
    if (!res.ok) throw new Error('Failed to fetch frame quality report');
    return safeJson(res);
  },

  async getKeyframesReport(jobId) {
    const res = await safeFetch(`${API_BASE}/results/${jobId}/keyframes`);
    if (!res.ok) throw new Error('Failed to fetch keyframes report');
    return safeJson(res);
  },

  async getDynamicObjectsReport(jobId) {
    const res = await safeFetch(`${API_BASE}/results/${jobId}/dynamic-objects`);
    if (!res.ok) throw new Error('Failed to fetch dynamic objects report');
    return safeJson(res);
  },

  async getDynamicAnalyticsReport(jobId) {
    const res = await safeFetch(`${API_BASE}/results/${jobId}/dynamic-analytics`);
    if (!res.ok) throw new Error('Failed to fetch dynamic analytics report');
    return safeJson(res);
  },

  async getIlluminationReport(jobId) {
    const res = await safeFetch(`${API_BASE}/results/${jobId}/illumination`);
    if (!res.ok) throw new Error('Failed to fetch illumination report');
    return safeJson(res);
  },

  async getTrajectoryReport(jobId) {
    const res = await safeFetch(`${API_BASE}/results/${jobId}/trajectory`);
    if (!res.ok) throw new Error('Failed to fetch trajectory report');
    return safeJson(res);
  },

  async getReconstructionReport(jobId) {
    const res = await safeFetch(`${API_BASE}/results/${jobId}/reconstruction`);
    if (!res.ok) throw new Error('Failed to fetch reconstruction report');
    return safeJson(res);
  },

  async getDenseReport(jobId) {
    const res = await safeFetch(`${API_BASE}/results/${jobId}/dense`);
    if (!res.ok) throw new Error('Failed to fetch dense report');
    return safeJson(res);
  },

  async getBenchmarkReport(jobId) {
    const res = await safeFetch(`${API_BASE}/results/${jobId}/benchmark`);
    if (!res.ok) throw new Error('Failed to fetch benchmark report');
    return safeJson(res);
  },

  async getArtifacts(jobId) {
    const res = await safeFetch(`${API_BASE}/results/${jobId}/artifacts`);
    if (!res.ok) throw new Error('Failed to fetch artifacts');
    return safeJson(res);
  },

  async getJobArtifacts(jobId) {
    return this.getArtifacts(jobId);
  },

  getArtifactDownloadUrl(jobId, artifactType) {
    return `${API_BASE}/results/${jobId}/download/${artifactType}`;
  },

  // ── Stages ────────────────────────────────────────────────────────────────
  async listStages() {
    const res = await safeFetch(`${API_BASE}/stages`);
    return safeJson(res);
  },
};
