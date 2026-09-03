# Installation & Setup Guide: UAV 3D Digital Twin Platform

This document describes the environment prerequisites, installation procedures, and verification steps for setting up the commercial-grade UAV Photogrammetric 3D Reconstruction Platform.

---

## 1. System Requirements

### Hardware Requirements
- **CPU**: 4+ Cores (x86_64, Intel Core i5/i7/i9 or AMD Ryzen).
- **RAM**: Minimum 16 GB (32 GB recommended for high-resolution 4K UAV video surveys).
- **GPU (Optional but Recommended)**: NVIDIA GPU with CUDA 11.8+ support and ≥6 GB dedicated VRAM.
  - *Note*: If no GPU is present, the platform automatically switches to an optimized CPU SIMD multithreaded fallback pipeline.
- **Storage**: Minimum 20 GB free SSD disk space for video uploads and intermediate 3D mesh checkpoints.

### Software Prerequisites
- **Operating System**: Linux (Ubuntu 20.04/22.04 LTS), macOS, or Windows 10/11 (PowerShell/WSL2).
- **Python**: Version `3.10.x` or `3.11.x`.
- **Node.js**: Version `18.x` or `20.x LTS` (with `npm`).
- **FFmpeg**: Required for hardware-accelerated video demuxing and frame extraction (`ffmpeg` must be in system `$PATH`).

---

## 2. Backend Installation

### Step 2.1: Clone Repository & Create Virtual Environment
```bash
git clone https://github.com/Amit-1906/RECON-X.git
cd RECON-X

# Create Python virtual environment
python -m venv venv

# Activate virtual environment
# On Windows PowerShell:
.\venv\Scripts\Activate.ps1
# On Linux / macOS:
source venv/bin/activate
```

### Step 2.2: Install Python Dependencies
```bash
pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
```

### Step 2.3: Verify System Acceleration (GPU / CPU)
Run the hardware diagnostic utility:
```bash
python -c "from backend.app.core.device import device_manager; print(device_manager.capabilities.to_dict())"
```
Output confirms active device, CUDA availability, and total system RAM.

### Step 2.4: Initialize Database & Storage Directories
```bash
mkdir -p storage/uploads storage/artifacts storage/exports
```
The SQLite database (`storage/uav_reconstruction.db`) is automatically created and migrated on first startup.

---

## 3. Frontend Installation

### Step 3.1: Install Node.js Dependencies
```bash
cd frontend
npm install
```

### Step 3.2: Verify Frontend Production Build
```bash
npm run build
```
Verify that `dist/index.html` is generated with zero errors.

---

## 4. Running the Platform in Development Mode

### Terminal 1: Launch Backend API Server
```bash
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```
- Interactive API Docs: `http://127.0.0.1:8000/docs`
- Health Check: `http://127.0.0.1:8000/api/v1/system/health`

### Terminal 2: Launch Frontend Development Server
```bash
cd frontend
npm run dev
```
- Digital Twin Workstation Web UI: `http://localhost:5173/`

---

## 5. Automated Verification Suite

Run the full pytest automated test suite across all 15 photogrammetric stages:
```bash
python -m pytest backend/tests/ -v
```
All unit, integration, and contract tests must exit with code 0 (`PASS`).
