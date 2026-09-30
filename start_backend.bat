@echo off
echo Installing required AI inference and scientific packages...
pip install torch torchvision
pip install matplotlib scipy trimesh py-cpuinfo

echo Starting Recon 3D Backend API Server...
cd /d "c:\Users\aamit\Desktop\SIH-001"
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
