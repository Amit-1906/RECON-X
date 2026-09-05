/**
 * Vercel Serverless Function: API Gateway & Reverse Proxy
 *
 * Routes incoming `/api/*` requests to the dedicated FastAPI backend
 * specified by the `BACKEND_URL` environment variable.
 *
 * If `BACKEND_URL` is not yet configured, provides graceful mock responses
 * for system status and health checks so the frontend stays fully operational.
 */

export default async function handler(req, res) {
  const backendBase = process.env.BACKEND_URL || process.env.VITE_BACKEND_URL || process.env.API_URL;

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // If a persistent backend is configured, proxy the request to it
  if (backendBase) {
    try {
      const cleanBase = backendBase.replace(/\/+$/, '');
      const cleanUrl = req.url.startsWith('/') ? req.url : `/${req.url}`;
      const targetUrl = `${cleanBase}${cleanUrl}`;

      // Prepare headers
      const headers = { ...req.headers };
      delete headers.host;
      delete headers.connection;
      delete headers['content-length'];

      const fetchOptions = {
        method: req.method,
        headers,
      };

      // Forward request body for non-GET/HEAD methods
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        if (req.body) {
          fetchOptions.body = typeof req.body === 'object' ? JSON.stringify(req.body) : req.body;
          if (typeof req.body === 'object' && !headers['content-type']) {
            headers['content-type'] = 'application/json';
          }
        }
      }

      const response = await fetch(targetUrl, fetchOptions);

      // Copy response headers
      response.headers.forEach((value, key) => {
        if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      });

      res.status(response.status);

      // Handle binary/stream vs text/json
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json') || contentType.includes('text/')) {
        const text = await response.text();
        return res.send(text);
      } else {
        const buffer = await response.arrayBuffer();
        return res.send(Buffer.from(buffer));
      }
    } catch (proxyError) {
      console.error('Vercel API proxy error:', proxyError);
      return res.status(502).json({
        error: 'Bad Gateway: Failed to reach backend service',
        detail: proxyError.message,
        backend_url: backendBase
      });
    }
  }

  // Graceful fallback when BACKEND_URL is not set:
  const urlPath = (req.url || '').split('?')[0];

  if (urlPath === '/api/v1/system/health' || urlPath === '/api/health') {
    return res.status(200).json({
      status: 'ok',
      platform: 'UAV Single-Pass 3D Reconstruction Platform',
      version: '1.0.0',
      mode: 'vercel-edge-proxy',
      backend_configured: false,
      message: 'Vercel deployment is active. Set BACKEND_URL in Vercel project environment variables to connect your persistent GPU/FastAPI backend.'
    });
  }

  if (urlPath === '/api/v1/system/status') {
    return res.status(200).json({
      status: 'idle',
      queue_size: 0,
      active_jobs: 0,
      backend_configured: false
    });
  }

  if (urlPath === '/api/v1/system/hardware') {
    return res.status(200).json({
      cpu_count: 4,
      memory_gb: 16.0,
      gpu_available: false,
      gpu_name: 'Vercel Serverless Edge (GPU backend required for MVS)',
      preferred_device: 'cpu',
      backend_configured: false
    });
  }

  if (urlPath === '/api/v1/stages') {
    return res.status(200).json([
      { name: 'video_ingestion', label: 'Video Ingestion & Validation', order: 1 },
      { name: 'keyframe_selection', label: 'Keyframe Selection & Motion Analysis', order: 2 },
      { name: 'dynamic_filtering', label: 'Dynamic Object Masking', order: 3 },
      { name: 'sfm_rapid', label: 'Level 1: Rapid Sparse SfM', order: 4 },
      { name: 'dense_photogrammetry', label: 'Level 2: Dense MVS Reconstruction', order: 5 },
      { name: 'mesh_surface', label: 'Poisson Surface Meshing', order: 6 },
      { name: 'texture_export', label: 'Texture Mapping & GLB Export', order: 7 }
    ]);
  }

  if (urlPath === '/api/v1/missions' && req.method === 'GET') {
    return res.status(200).json([]);
  }

  if (urlPath.startsWith('/api/v1/jobs/mission/')) {
    return res.status(200).json([]);
  }

  return res.status(503).json({
    error: 'Backend Service Unavailable',
    detail: 'BACKEND_URL environment variable is not configured on Vercel.',
    instructions: 'Deploy your FastAPI backend on a VM/GPU server (e.g. AWS, GCP, Railway, DigitalOcean) and add BACKEND_URL=<your-backend-url> in Vercel Project Settings > Environment Variables.'
  });
}
