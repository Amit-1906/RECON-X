# Production Deployment Guide: UAV 3D Digital Twin Platform

This document describes production deployment architectures, containerization with Docker, reverse proxy configuration with Nginx, process management with Systemd, and industrial security controls.

---

## 1. Production Architecture Overview

```
                        [ HTTPS Request : 443 ]
                                   │
                                   ▼
                    ┌──────────────────────────────┐
                    │      Nginx Reverse Proxy     │
                    │   (SSL/TLS, Static Assets)   │
                    └──────────────┬───────────────┘
                                   │
                ┌──────────────────┴──────────────────┐
                │                                     │
                ▼                                     ▼
     ┌──────────────────────┐              ┌──────────────────────┐
     │  FastAPI Backend API │              │   React / Vite Web   │
     │ (Uvicorn Worker Node)│              │  Static Client SPA   │
     │      Port: 8000      │              │      Port: 5173      │
     └──────────┬───────────┘              └──────────────────────┘
                │
     ┌──────────┴───────────┐
     │  Background Pipeline │
     │  Worker Pool (MVS)   │
     │ (CUDA / SIMD Multi)  │
     └──────────────────────┘
```

---

## 2. Environment Variables & Security Configuration

Configure production environment variables in `.env` or system environment:

```ini
# Environment Mode
ENVIRONMENT=production
DEBUG=false

# Storage & Upload Limits
STORAGE_ROOT=/var/lib/uav-reconstruction/storage
MAX_UPLOAD_SIZE_MB=2048
ALLOWED_VIDEO_EXTENSIONS=.mp4,.mov,.avi,.mkv

# Security & CORS
CORS_ORIGINS=["https://uav-twin.yourdomain.com"]
SECRET_KEY=change-this-to-a-cryptographically-secure-random-token

# Hardware Settings
PREFERRED_DEVICE=auto          # auto | cuda | cpu
CUDA_DEVICE_ID=0
NUM_WORKER_THREADS=4
MAX_VRAM_GB=8.0
ALLOW_CPU_FALLBACK=true
```

---

## 3. Production Deployment Options

### Option A: Systemd Service (Ubuntu 22.04 LTS)

#### 1. Create Systemd Service File
`/etc/systemd/system/uav-reconstruction.service`:
```ini
[Unit]
Description=UAV 3D Reconstruction Photogrammetry Engine
After=network.target

[Service]
User=uavuser
Group=uavuser
WorkingDirectory=/opt/uav-reconstruction
Environment="PATH=/opt/uav-reconstruction/venv/bin"
EnvironmentFile=/opt/uav-reconstruction/.env
ExecStart=/opt/uav-reconstruction/venv/bin/uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --workers 4 --proxy-headers
Restart=always
RestartSec=5s
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

#### 2. Start & Enable Service
```bash
sudo systemctl daemon-reload
sudo systemctl enable uav-reconstruction
sudo systemctl start uav-reconstruction
sudo systemctl status uav-reconstruction
```

---

### Option B: Nginx Reverse Proxy Configuration

`/etc/nginx/sites-available/uav-reconstruction.conf`:
```nginx
server {
    listen 80;
    server_name uav-twin.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name uav-twin.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/uav-twin.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/uav-twin.yourdomain.com/privkey.pem;

    # Enforce 2GB client upload payload limit
    client_max_body_size 2048M;
    client_body_timeout 300s;
    proxy_read_timeout 600s;

    # 1. Serve Frontend Production Assets
    root /opt/uav-reconstruction/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # 2. Reverse Proxy Backend API Requests
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 3. Cache Immutable 3D Models & Texture Assets
    location ~* \.(glb|ply|obj|png|jpg)$ {
        expires 7d;
        add_header Cache-Control "public, no-transform";
    }
}
```

---

## 4. Production Security Hardening Checklist

1. **Magic-Byte Binary Validation**: Upload service enforces header byte verification (`ftyp`, `RIFF`, EBML) to prevent executable payload injection.
2. **Directory Traversal Protection**: Uploaded filenames are sanitized with `Path(name).name`, preventing path escape (`../../etc/passwd`).
3. **Chunked Streaming Limits**: Ingested files exceeding 2048 MB are aborted immediately with HTTP `413 Payload Too Large`.
4. **Graceful Job Cancellation**: `POST /api/v1/jobs/{job_id}/cancel` halts background GPU/CPU computation without thread deadlocks or checkpoint corruption.
5. **Atomic Resumption**: Checkpoints saved under `storage/artifacts/{job_id}/{stage_name}/` remain intact upon job failure, allowing instantaneous restart from failed stages.
