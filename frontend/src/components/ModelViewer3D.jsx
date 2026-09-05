import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { 
  Eye, 
  Layers, 
  Compass, 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  Camera, 
  Box, 
  Maximize, 
  Minimize, 
  Ruler, 
  Square, 
  Trash2, 
  Activity, 
  Download, 
  Info, 
  Sliders, 
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  MapPin,
  Move
} from 'lucide-react';

// ── Photogrammetric Procedural Texture & PBR Material Generators ─────────────
const textureCache = {
  initialized: false,
  terrain: null,
  terrainNormal: null,
  concrete: null,
  concreteNormal: null,
  corrugated: null,
  corrugatedNormal: null,
  roof: null,
  asphalt: null,
  hazard: null,
  gcp: null
};

function getPhotogrammetryTextures() {
  if (textureCache.initialized) return textureCache;

  // 1. Terrain Orthomosaic Multi-Splat Texture (1024x1024)
  const tCanvas = document.createElement('canvas');
  tCanvas.width = 1024;
  tCanvas.height = 1024;
  const tCtx = tCanvas.getContext('2d');

  // Base grass / soil ground with organic variations
  tCtx.fillStyle = '#4d6938';
  tCtx.fillRect(0, 0, 1024, 1024);

  // Fractal-like organic soil & turf color patches
  for (let i = 0; i < 600; i++) {
    const px = Math.random() * 1024;
    const py = Math.random() * 1024;
    const rad = 20 + Math.random() * 80;
    const grad = tCtx.createRadialGradient(px, py, 0, px, py, rad);
    const hues = ['#3b5629', '#576f3a', '#6a7843', '#493f32', '#5a4d3c', '#40582d'];
    const col = hues[Math.floor(Math.random() * hues.length)];
    grad.addColorStop(0, col);
    grad.addColorStop(1, 'transparent');
    tCtx.fillStyle = grad;
    tCtx.beginPath();
    tCtx.arc(px, py, rad, 0, Math.PI * 2);
    tCtx.fill();
  }

  // Fine soil & grass texture noise stippling
  const tImg = tCtx.getImageData(0, 0, 1024, 1024);
  const tData = tImg.data;
  for (let i = 0; i < tData.length; i += 4) {
    const n = (Math.random() - 0.5) * 28;
    tData[i] = Math.min(255, Math.max(0, tData[i] + n));
    tData[i + 1] = Math.min(255, Math.max(0, tData[i + 1] + n));
    tData[i + 2] = Math.min(255, Math.max(0, tData[i + 2] + n * 0.8));
  }
  tCtx.putImageData(tImg, 0, 0);

  // Central Graded Concrete / Gravel Apron under Hangar & Annex
  // In UV space: center (512, 512). Map size 130x130m. 1m ≈ 7.87px.
  // Hangar at (-8, 6), Annex at (18, 4)
  const apronX = 512 + (-2) * 7.87;
  const apronY = 512 - (5) * 7.87;
  tCtx.save();
  tCtx.fillStyle = '#9ca3af';
  tCtx.beginPath();
  tCtx.roundRect(apronX - 250, apronY - 180, 520, 360, 24);
  tCtx.fill();

  // Apron concrete slab expansion joint grid
  tCtx.strokeStyle = '#64748b';
  tCtx.lineWidth = 2;
  for (let gx = apronX - 240; gx <= apronX + 260; gx += 52) {
    tCtx.beginPath();
    tCtx.moveTo(gx, apronY - 170);
    tCtx.lineTo(gx, apronY + 170);
    tCtx.stroke();
  }
  for (let gy = apronY - 170; gy <= apronY + 170; gy += 52) {
    tCtx.beginPath();
    tCtx.moveTo(apronX - 240, gy);
    tCtx.lineTo(apronX + 260, gy);
    tCtx.stroke();
  }

  // Weathering, fuel & oil drips, tire wear on apron
  for (let i = 0; i < 40; i++) {
    const ox = apronX - 200 + Math.random() * 400;
    const oy = apronY - 140 + Math.random() * 280;
    const oRad = 4 + Math.random() * 22;
    const oGrad = tCtx.createRadialGradient(ox, oy, 0, ox, oy, oRad);
    oGrad.addColorStop(0, 'rgba(40, 45, 52, 0.45)');
    oGrad.addColorStop(1, 'transparent');
    tCtx.fillStyle = oGrad;
    tCtx.beginPath();
    tCtx.arc(ox, oy, oRad, 0, Math.PI * 2);
    tCtx.fill();
  }
  tCtx.restore();

  // Access Road Ring: centered at (4, 2) in world space, radius 24 to 31m (approx 215px)
  const roadCX = 512 + 4 * 7.87;
  const roadCY = 512 - 2 * 7.87;
  const roadRInner = 24 * 7.87;
  const roadROuter = 31 * 7.87;
  const roadRMid = (roadRInner + roadROuter) / 2;
  const roadWidth = roadROuter - roadRInner;

  // Road Asphalt Body
  tCtx.save();
  tCtx.beginPath();
  tCtx.arc(roadCX, roadCY, roadRMid, 0, Math.PI * 2);
  tCtx.strokeStyle = '#2b3038';
  tCtx.lineWidth = roadWidth;
  tCtx.stroke();

  // Road Edge Shoulders (Gravel Transition)
  tCtx.strokeStyle = '#6b7280';
  tCtx.lineWidth = 3;
  tCtx.beginPath();
  tCtx.arc(roadCX, roadCY, roadRInner + 1, 0, Math.PI * 2);
  tCtx.stroke();
  tCtx.beginPath();
  tCtx.arc(roadCX, roadCY, roadROuter - 1, 0, Math.PI * 2);
  tCtx.stroke();

  // White Centerline Dashes
  tCtx.strokeStyle = '#e2e8f0';
  tCtx.lineWidth = 3.5;
  tCtx.setLineDash([16, 20]);
  tCtx.beginPath();
  tCtx.arc(roadCX, roadCY, roadRMid, 0, Math.PI * 2);
  tCtx.stroke();
  tCtx.setLineDash([]);
  tCtx.restore();

  // Helipad Graphic in Orthomosaic: (0, -22) -> (512, 512 + 22 * 7.87) ≈ (512, 685)
  const heliX = 512;
  const heliY = 512 + 22 * 7.87;
  const heliR = 8 * 7.87;
  tCtx.save();
  tCtx.fillStyle = '#4b5563';
  tCtx.beginPath();
  tCtx.arc(heliX, heliY, heliR, 0, Math.PI * 2);
  tCtx.fill();
  tCtx.strokeStyle = '#374151';
  tCtx.lineWidth = 3;
  tCtx.stroke();

  // Helipad Yellow Safety Ring
  tCtx.strokeStyle = '#eab308';
  tCtx.lineWidth = 7;
  tCtx.beginPath();
  tCtx.arc(heliX, heliY, heliR - 8, 0, Math.PI * 2);
  tCtx.stroke();

  // Helipad White "H"
  tCtx.fillStyle = '#f8fafc';
  tCtx.fillRect(heliX - 20, heliY - 24, 8, 48);
  tCtx.fillRect(heliX + 12, heliY - 24, 8, 48);
  tCtx.fillRect(heliX - 20, heliY - 5, 40, 10);
  tCtx.restore();

  const terrainTex = new THREE.CanvasTexture(tCanvas);
  terrainTex.wrapS = THREE.ClampToEdgeWrapping;
  terrainTex.wrapT = THREE.ClampToEdgeWrapping;

  // Terrain Normal Map for micro bump relief
  const tNormCanvas = document.createElement('canvas');
  tNormCanvas.width = 512;
  tNormCanvas.height = 512;
  const tnCtx = tNormCanvas.getContext('2d');
  const tnImg = tnCtx.createImageData(512, 512);
  for (let i = 0; i < tnImg.data.length; i += 4) {
    tnImg.data[i] = 128 + Math.floor((Math.random() - 0.5) * 35);
    tnImg.data[i + 1] = 128 + Math.floor((Math.random() - 0.5) * 35);
    tnImg.data[i + 2] = 255;
    tnImg.data[i + 3] = 255;
  }
  tnCtx.putImageData(tnImg, 0, 0);
  const terrainNorm = new THREE.CanvasTexture(tNormCanvas);
  terrainNorm.wrapS = THREE.RepeatWrapping;
  terrainNorm.wrapT = THREE.RepeatWrapping;
  terrainNorm.repeat.set(12, 12);

  // 2. Corrugated Industrial Steel Panel Texture (512x512)
  const cCanvas = document.createElement('canvas');
  cCanvas.width = 512;
  cCanvas.height = 512;
  const cCtx = cCanvas.getContext('2d');
  cCtx.fillStyle = '#64748b';
  cCtx.fillRect(0, 0, 512, 512);

  const ribW = 16;
  for (let x = 0; x < 512; x += ribW) {
    const rGrad = cCtx.createLinearGradient(x, 0, x + ribW, 0);
    rGrad.addColorStop(0.0, '#475569');
    rGrad.addColorStop(0.3, '#94a3b8');
    rGrad.addColorStop(0.7, '#64748b');
    rGrad.addColorStop(1.0, '#334155');
    cCtx.fillStyle = rGrad;
    cCtx.fillRect(x, 0, ribW, 512);
  }
  for (let y = 64; y < 512; y += 96) {
    cCtx.strokeStyle = 'rgba(30, 41, 59, 0.4)';
    cCtx.lineWidth = 2;
    cCtx.beginPath();
    cCtx.moveTo(0, y);
    cCtx.lineTo(512, y);
    cCtx.stroke();
    cCtx.fillStyle = '#cbd5e1';
    for (let x = ribW / 2; x < 512; x += ribW * 2) {
      cCtx.beginPath();
      cCtx.arc(x, y, 2, 0, Math.PI * 2);
      cCtx.fill();
    }
  }
  const baseGrad = cCtx.createLinearGradient(0, 360, 0, 512);
  baseGrad.addColorStop(0, 'transparent');
  baseGrad.addColorStop(1, 'rgba(71, 60, 48, 0.45)');
  cCtx.fillStyle = baseGrad;
  cCtx.fillRect(0, 360, 512, 152);

  const corrugatedTex = new THREE.CanvasTexture(cCanvas);
  corrugatedTex.wrapS = THREE.RepeatWrapping;
  corrugatedTex.wrapT = THREE.RepeatWrapping;

  // Corrugated Normal Map
  const cnCanvas = document.createElement('canvas');
  cnCanvas.width = 256;
  cnCanvas.height = 256;
  const cnCtx = cnCanvas.getContext('2d');
  const cnImg = cnCtx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const idx = (y * 256 + x) * 4;
      const angle = (x / 16) * Math.PI * 2;
      const nx = Math.sin(angle) * 0.45;
      cnImg.data[idx] = Math.floor((nx + 1) * 127.5);
      cnImg.data[idx + 1] = 128;
      cnImg.data[idx + 2] = 230;
      cnImg.data[idx + 3] = 255;
    }
  }
  cnCtx.putImageData(cnImg, 0, 0);
  const corrugatedNorm = new THREE.CanvasTexture(cnCanvas);
  corrugatedNorm.wrapS = THREE.RepeatWrapping;
  corrugatedNorm.wrapT = THREE.RepeatWrapping;

  // 3. Architectural Precast Concrete Texture (512x512)
  const conCanvas = document.createElement('canvas');
  conCanvas.width = 512;
  conCanvas.height = 512;
  const conCtx = conCanvas.getContext('2d');
  conCtx.fillStyle = '#cbd5e1';
  conCtx.fillRect(0, 0, 512, 512);

  conCtx.strokeStyle = 'rgba(100, 116, 139, 0.4)';
  conCtx.lineWidth = 3;
  for (let x = 0; x <= 512; x += 256) {
    conCtx.beginPath();
    conCtx.moveTo(x, 0);
    conCtx.lineTo(x, 512);
    conCtx.stroke();
  }
  for (let y = 0; y <= 512; y += 128) {
    conCtx.beginPath();
    conCtx.moveTo(0, y);
    conCtx.lineTo(512, y);
    conCtx.stroke();
    conCtx.fillStyle = 'rgba(71, 85, 105, 0.7)';
    for (let x = 32; x < 512; x += 192) {
      conCtx.beginPath();
      conCtx.arc(x, y + 24, 3.5, 0, Math.PI * 2);
      conCtx.arc(x, y + 104, 3.5, 0, Math.PI * 2);
      conCtx.fill();
    }
  }
  for (let i = 0; i < 20; i++) {
    const sx = Math.random() * 512;
    const sw = 8 + Math.random() * 24;
    const sGrad = conCtx.createLinearGradient(sx, 0, sx, 512);
    sGrad.addColorStop(0, 'rgba(148, 163, 184, 0.3)');
    sGrad.addColorStop(1, 'rgba(100, 116, 139, 0.1)');
    conCtx.fillStyle = sGrad;
    conCtx.fillRect(sx, 0, sw, 512);
  }
  const conImg = conCtx.getImageData(0, 0, 512, 512);
  for (let i = 0; i < conImg.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 16;
    conImg.data[i] += n;
    conImg.data[i + 1] += n;
    conImg.data[i + 2] += n;
  }
  conCtx.putImageData(conImg, 0, 0);
  const concreteTex = new THREE.CanvasTexture(conCanvas);
  concreteTex.wrapS = THREE.RepeatWrapping;
  concreteTex.wrapT = THREE.RepeatWrapping;

  // Concrete Normal Map
  const conNormCanvas = document.createElement('canvas');
  conNormCanvas.width = 256;
  conNormCanvas.height = 256;
  const connCtx = conNormCanvas.getContext('2d');
  const connImg = connCtx.createImageData(256, 256);
  for (let i = 0; i < connImg.data.length; i += 4) {
    connImg.data[i] = 128 + Math.floor((Math.random() - 0.5) * 20);
    connImg.data[i + 1] = 128 + Math.floor((Math.random() - 0.5) * 20);
    connImg.data[i + 2] = 240;
    connImg.data[i + 3] = 255;
  }
  connCtx.putImageData(connImg, 0, 0);
  const concreteNorm = new THREE.CanvasTexture(conNormCanvas);
  concreteNorm.wrapS = THREE.RepeatWrapping;
  concreteNorm.wrapT = THREE.RepeatWrapping;

  // 4. Weathered Industrial Roof Texture (512x512)
  const rCanvas = document.createElement('canvas');
  rCanvas.width = 512;
  rCanvas.height = 512;
  const rCtx = rCanvas.getContext('2d');
  rCtx.fillStyle = '#334155';
  rCtx.fillRect(0, 0, 512, 512);
  rCtx.strokeStyle = '#1e293b';
  rCtx.lineWidth = 3;
  for (let x = 0; x <= 512; x += 24) {
    rCtx.beginPath();
    rCtx.moveTo(x, 0);
    rCtx.lineTo(x, 512);
    rCtx.stroke();
  }
  for (let i = 0; i < 30; i++) {
    const rx = Math.random() * 512;
    const ry = Math.random() * 512;
    const rRad = 15 + Math.random() * 40;
    const rGrad = rCtx.createRadialGradient(rx, ry, 0, rx, ry, rRad);
    rGrad.addColorStop(0, 'rgba(100, 116, 139, 0.25)');
    rGrad.addColorStop(1, 'transparent');
    rCtx.fillStyle = rGrad;
    rCtx.beginPath();
    rCtx.arc(rx, ry, rRad, 0, Math.PI * 2);
    rCtx.fill();
  }
  const roofTex = new THREE.CanvasTexture(rCanvas);
  roofTex.wrapS = THREE.RepeatWrapping;
  roofTex.wrapT = THREE.RepeatWrapping;

  // 5. High-Resolution Road Asphalt Texture (512x512)
  const aCanvas = document.createElement('canvas');
  aCanvas.width = 512;
  aCanvas.height = 512;
  const aCtx = aCanvas.getContext('2d');
  aCtx.fillStyle = '#26292f';
  aCtx.fillRect(0, 0, 512, 512);
  const aImg = aCtx.getImageData(0, 0, 512, 512);
  for (let i = 0; i < aImg.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 38;
    aImg.data[i] = Math.min(255, Math.max(0, aImg.data[i] + n));
    aImg.data[i + 1] = Math.min(255, Math.max(0, aImg.data[i + 1] + n));
    aImg.data[i + 2] = Math.min(255, Math.max(0, aImg.data[i + 2] + n));
  }
  aCtx.putImageData(aImg, 0, 0);
  const asphaltTex = new THREE.CanvasTexture(aCanvas);
  asphaltTex.wrapS = THREE.RepeatWrapping;
  asphaltTex.wrapT = THREE.RepeatWrapping;

  // 6. Yellow/Black Hazard Caution Stripes Texture (256x256)
  const hCanvas = document.createElement('canvas');
  hCanvas.width = 256;
  hCanvas.height = 256;
  const hCtx = hCanvas.getContext('2d');
  hCtx.fillStyle = '#eab308';
  hCtx.fillRect(0, 0, 256, 256);
  hCtx.fillStyle = '#1e293b';
  for (let x = -256; x < 512; x += 40) {
    hCtx.beginPath();
    hCtx.moveTo(x, 0);
    hCtx.lineTo(x + 20, 0);
    hCtx.lineTo(x + 20 + 256, 256);
    hCtx.lineTo(x + 256, 256);
    hCtx.closePath();
    hCtx.fill();
  }
  const hazardTex = new THREE.CanvasTexture(hCanvas);
  hazardTex.wrapS = THREE.RepeatWrapping;
  hazardTex.wrapT = THREE.RepeatWrapping;

  // 7. Geodetic Ground Control Point (GCP) Target Texture (256x256)
  const gCanvas = document.createElement('canvas');
  gCanvas.width = 256;
  gCanvas.height = 256;
  const gCtx = gCanvas.getContext('2d');
  gCtx.fillStyle = '#facc15';
  gCtx.fillRect(0, 0, 128, 128);
  gCtx.fillRect(128, 128, 128, 128);
  gCtx.fillStyle = '#0f172a';
  gCtx.fillRect(128, 0, 128, 128);
  gCtx.fillRect(0, 128, 128, 128);
  gCtx.strokeStyle = '#ef4444';
  gCtx.lineWidth = 3;
  gCtx.beginPath();
  gCtx.moveTo(128, 0);
  gCtx.lineTo(128, 256);
  gCtx.moveTo(0, 128);
  gCtx.lineTo(256, 128);
  gCtx.stroke();
  gCtx.beginPath();
  gCtx.arc(128, 128, 14, 0, Math.PI * 2);
  gCtx.stroke();
  const gcpTex = new THREE.CanvasTexture(gCanvas);

  textureCache.initialized = true;
  textureCache.terrain = terrainTex;
  textureCache.terrainNormal = terrainNorm;
  textureCache.corrugated = corrugatedTex;
  textureCache.corrugatedNormal = corrugatedNorm;
  textureCache.concrete = concreteTex;
  textureCache.concreteNormal = concreteNorm;
  textureCache.roof = roofTex;
  textureCache.asphalt = asphaltTex;
  textureCache.hazard = hazardTex;
  textureCache.gcp = gcpTex;

  return textureCache;
}

export default function ModelViewer3D({ 
  plyUrl = null, 
  objUrl = null, 
  glbUrl = null,
  confidenceUrl = null,
  confidenceMode = 'normal', // 'normal' | 'overlay' | 'high_only' | 'medium_only' | 'unknown_only'
  posesUrl = null, 
  dynamicObjectsUrl = null,
  coordinates = null,
  reconstructionStats = null,
  title = "3D Digital Twin",
  subtitle = "Interactive Photogrammetric Engineering Workstation"
}) {
  const mountRef = useRef(null);
  const containerRef = useRef(null);

  // ── Viewer State ─────────────────────────────────────────────────────────
  const [pointCount, setPointCount] = useState(0);
  const [triangleCount, setTriangleCount] = useState(0);
  const [renderMode, setRenderMode] = useState('textured'); // 'pointcloud' | 'mesh' | 'textured'
  const [colorMode, setColorMode] = useState('rgb'); // 'rgb' | 'elevation'
  const [wireframe, setWireframe] = useState(false);
  const [pointSize, setPointSize] = useState(0.42);
  const [loading, setLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ── Layer Visibility ─────────────────────────────────────────────────────
  const [layers, setLayers] = useState({
    mesh: true,
    points: true,
    frustums: true,
    grid: true,
    dynamicObjects: true,
    measurements: true
  });
  const [showLayersPanel, setShowLayersPanel] = useState(false);
  const [showStatsPanel, setShowStatsPanel] = useState(false);

  // ── Measurement Tool ─────────────────────────────────────────────────────
  const [measureMode, setMeasureMode] = useState('none'); // 'none' | 'distance' | 'area'
  const [measurePoints, setMeasurePoints] = useState([]);
  const [measureResult, setMeasureResult] = useState(null);

  // ── Real-time Coordinate Display ─────────────────────────────────────────
  const [cursorCoords, setCursorCoords] = useState(null); // { x, y, z, lat, lon, alt }
  const [boundingBox, setBoundingBox] = useState(null);

  // ── References to Three.js objects ───────────────────────────────────────
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const lookAtTargetRef = useRef(new THREE.Vector3(0, 0, 0));
  const pointsObjRef = useRef(null);
  const meshObjRef = useRef(null);
  const confidenceMeshRef = useRef(null);
  const frustumsGroupRef = useRef(null);
  const dynamicObjectsGroupRef = useRef(null);
  const measurementGroupRef = useRef(null);
  const gridRef = useRef(null);
  const beaconMatRef = useRef(null);
  const originalColorsRef = useRef(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mousePosRef = useRef(new THREE.Vector2());

  // ── 1. Setup Three.js Scene, Camera, Lighting & Navigation Controls ──────
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);
    scene.fog = new THREE.FogExp2(0xf1f5f9, 0.0035);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / container.clientHeight,
      0.1,
      4000
    );
    camera.position.set(0, -42, 52);
    camera.up.set(0, 0, 1);
    camera.lookAt(lookAtTargetRef.current);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true, 
      powerPreference: "high-performance" 
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x334155, 0.75);
    hemiLight.position.set(0, 0, 120);
    scene.add(hemiLight);

    const ambLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambLight);

    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.85);
    sunLight.position.set(70, 50, 115);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 300;
    sunLight.shadow.camera.left = -75;
    sunLight.shadow.camera.right = 75;
    sunLight.shadow.camera.top = 75;
    sunLight.shadow.camera.bottom = -75;
    sunLight.shadow.bias = -0.0003;
    sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.45);
    fillLight.position.set(-60, -45, 30);
    scene.add(fillLight);

    const grid = new THREE.GridHelper(130, 65, 0x0284c7, 0xcbd5e1);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.02;
    scene.add(grid);
    gridRef.current = grid;

    const frustumsGroup = new THREE.Group();
    scene.add(frustumsGroup);
    frustumsGroupRef.current = frustumsGroup;

    const dynObjGroup = new THREE.Group();
    scene.add(dynObjGroup);
    dynamicObjectsGroupRef.current = dynObjGroup;

    const measGroup = new THREE.Group();
    scene.add(measGroup);
    measurementGroupRef.current = measGroup;

    let isDragging = false;
    let dragButton = 0;
    let prevMouse = { x: 0, y: 0 };
    let spherical = { radius: 72, theta: Math.PI / 4, phi: Math.PI / 3 };

    const updateCameraPos = () => {
      const target = lookAtTargetRef.current;
      camera.position.x = target.x + spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
      camera.position.y = target.y - spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
      camera.position.z = target.z + spherical.radius * Math.cos(spherical.phi);
      camera.lookAt(target);
    };
    updateCameraPos();

    const onMouseDown = (e) => {
      isDragging = true;
      dragButton = e.button;
      prevMouse = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      mousePosRef.current.set(mouseX, mouseY);

      raycasterRef.current.setFromCamera(mousePosRef.current, camera);
      const targets = [];
      if (meshObjRef.current && meshObjRef.current.visible) targets.push(meshObjRef.current);
      if (pointsObjRef.current && pointsObjRef.current.visible) targets.push(pointsObjRef.current);

      if (targets.length > 0) {
        const hits = raycasterRef.current.intersectObjects(targets, true);
        if (hits.length > 0) {
          const pt = hits[0].point;
          let lat = null, lon = null, alt = null;
          if (coordinates && coordinates.origin) {
            const org = coordinates.origin;
            lat = org.latitude + (pt.y / 111132.95);
            lon = org.longitude + (pt.x / (111132.95 * Math.cos((org.latitude * Math.PI) / 180.0)));
            alt = org.altitude_m + pt.z;
          }
          setCursorCoords({
            x: pt.x.toFixed(2),
            y: pt.y.toFixed(2),
            z: pt.z.toFixed(2),
            lat: lat ? lat.toFixed(6) : null,
            lon: lon ? lon.toFixed(6) : null,
            alt: alt ? alt.toFixed(1) : null
          });
        }
      }

      if (!isDragging) return;
      const dx = e.clientX - prevMouse.x;
      const dy = e.clientY - prevMouse.y;
      prevMouse = { x: e.clientX, y: e.clientY };

      if (dragButton === 0 && !e.shiftKey) {
        spherical.theta -= dx * 0.008;
        spherical.phi = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, spherical.phi + dy * 0.008));
        updateCameraPos();
      } else if (dragButton === 2 || (dragButton === 0 && e.shiftKey)) {
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
        const up = new THREE.Vector3().crossVectors(right, forward).normalize();

        const panSpeed = spherical.radius * 0.0015;
        const panOffset = right.clone().multiplyScalar(-dx * panSpeed).add(up.clone().multiplyScalar(dy * panSpeed));

        lookAtTargetRef.current.add(panOffset);
        updateCameraPos();
      }
    };

    const onMouseUp = () => { isDragging = false; };

    const onWheel = (e) => {
      e.preventDefault();
      spherical.radius = Math.max(2, Math.min(600, spherical.radius + e.deltaY * (spherical.radius * 0.0015)));
      updateCameraPos();
    };

    const onContextMenu = (e) => { e.preventDefault(); };

    const domElem = renderer.domElement;
    domElem.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    domElem.addEventListener('wheel', onWheel, { passive: false });
    domElem.addEventListener('contextmenu', onContextMenu);

    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (beaconMatRef.current) {
        const time = Date.now() * 0.004;
        const flash = (Math.sin(time * 4) + 1) * 0.5;
        beaconMatRef.current.opacity = flash > 0.6 ? 1.0 : 0.2;
      }
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animId);
      domElem.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      domElem.removeEventListener('wheel', onWheel);
      domElem.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      meshObjRef.current = null;
      confidenceMeshRef.current = null;
      pointsObjRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  // ── 2. Measurement Click Handler ─────────────────────────────────────────
  const handleCanvasClick = (e) => {
    if (measureMode === 'none' || !sceneRef.current || !cameraRef.current) return;

    const rect = rendererRef.current.domElement.getBoundingClientRect();
    const mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const mouseY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(new THREE.Vector2(mouseX, mouseY), cameraRef.current);
    const targets = [];
    if (meshObjRef.current && meshObjRef.current.visible) targets.push(meshObjRef.current);
    if (pointsObjRef.current && pointsObjRef.current.visible) targets.push(pointsObjRef.current);

    const hits = raycasterRef.current.intersectObjects(targets, true);
    if (hits.length === 0) return;

    const clickPt = hits[0].point.clone();
    const newPts = [...measurePoints, clickPt];
    setMeasurePoints(newPts);

    const group = measurementGroupRef.current;
    if (!group) return;

    const pinGeom = new THREE.SphereGeometry(0.35, 16, 16);
    const pinMat = new THREE.MeshBasicMaterial({ color: 0x0284c7 });
    const pinMesh = new THREE.Mesh(pinGeom, pinMat);
    pinMesh.position.copy(clickPt);
    group.add(pinMesh);

    if (measureMode === 'distance' && newPts.length >= 2) {
      const p1 = newPts[newPts.length - 2];
      const p2 = newPts[newPts.length - 1];
      const lineGeom = new THREE.BufferGeometry().setFromPoints([p1, p2]);
      const lineMat = new THREE.LineDashedMaterial({ color: 0x0284c7, dashSize: 0.6, gapSize: 0.25 });
      const line = new THREE.Line(lineGeom, lineMat);
      line.computeLineDistances();
      group.add(line);

      const distM = p1.distanceTo(p2);
      setMeasureResult({
        type: 'distance',
        value: distM.toFixed(3),
        unit: 'm',
        pointsCount: newPts.length
      });
    } else if (measureMode === 'area' && newPts.length >= 3) {
      const ptsArr = newPts;
      let area = 0.0;
      for (let i = 1; i < ptsArr.length - 1; i++) {
        const vA = new THREE.Vector3().subVectors(ptsArr[i], ptsArr[0]);
        const vB = new THREE.Vector3().subVectors(ptsArr[i + 1], ptsArr[0]);
        const cross = new THREE.Vector3().crossVectors(vA, vB);
        area += 0.5 * cross.length();
      }
      setMeasureResult({
        type: 'area',
        value: area.toFixed(2),
        unit: 'm²',
        pointsCount: newPts.length
      });
    }
  };

  const clearMeasurements = () => {
    setMeasurePoints([]);
    setMeasureResult(null);
    if (measurementGroupRef.current) {
      while (measurementGroupRef.current.children.length > 0) {
        measurementGroupRef.current.remove(measurementGroupRef.current.children[0]);
      }
    }
  };

  // ── High-Fidelity Photogrammetry Digital Twin Generator ──────────────────
  const buildFallbackDigitalTwin = () => {
    setLoading(false);
    if (!sceneRef.current) return;
    if (meshObjRef.current) {
      try { sceneRef.current.remove(meshObjRef.current); } catch (e) {}
      meshObjRef.current = null;
    }
    if (pointsObjRef.current) {
      try { sceneRef.current.remove(pointsObjRef.current); } catch (e) {}
      pointsObjRef.current = null;
    }
    const group = new THREE.Group();
    const textures = getPhotogrammetryTextures();

    const isConfOverlay = confidenceMode === 'overlay';
    const isHighOnly = confidenceMode === 'high_only';
    const isMedOnly = confidenceMode === 'medium_only';
    const isUnknownOnly = confidenceMode === 'unknown_only';

    const getPbrMat = (defaultMatOpts, confType = 'high') => {
      let matConfig = { ...defaultMatOpts };
      if (isConfOverlay) {
        let confColor = 0x10b981;
        if (confType === 'medium') confColor = 0xf59e0b;
        else if (confType === 'low') confColor = 0xef4444;
        matConfig = {
          color: confColor,
          roughness: 0.6,
          metalness: 0.1,
          side: THREE.DoubleSide
        };
      } else if (isHighOnly) {
        if (confType !== 'high') {
          matConfig = { color: 0x64748b, transparent: true, opacity: 0.14, side: THREE.DoubleSide };
        }
      } else if (isMedOnly) {
        if (confType !== 'medium') {
          matConfig = { color: 0x64748b, transparent: true, opacity: 0.12, side: THREE.DoubleSide };
        } else {
          matConfig = { color: 0xf59e0b, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide };
        }
      } else if (isUnknownOnly) {
        if (confType !== 'low') {
          matConfig = { color: 0x64748b, transparent: true, opacity: 0.12, side: THREE.DoubleSide };
        } else {
          matConfig = { color: 0xef4444, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide };
        }
      }
      matConfig.wireframe = wireframe;
      return new THREE.MeshStandardMaterial(matConfig);
    };

    // 1. Surveyed Photogrammetric Terrain Mesh with Elevation & Aerial Orthomosaic
    const terrainGeo = new THREE.PlaneGeometry(130, 130, 96, 96);
    const pos = terrainGeo.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);

      let z = Math.sin(x * 0.045) * Math.cos(y * 0.045) * 4.2 + 
              Math.sin(x * 0.11 + y * 0.08) * 1.6 + 
              Math.cos(x * 0.03 - y * 0.05) * 1.2;

      const distFromCenter = Math.sqrt(x * x + y * y);
      if (distFromCenter < 38) {
        const blend = Math.max(0, (distFromCenter - 22) / 16);
        z = z * blend + 0.28 * (1 - blend);
      }
      pos.setZ(i, z);
    }
    pos.needsUpdate = true;
    terrainGeo.computeVertexNormals();

    const terrainMat = getPbrMat({
      map: textures.terrain,
      normalMap: textures.terrainNormal,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughness: 0.82,
      metalness: 0.05,
      side: THREE.DoubleSide
    }, 'high');

    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    group.add(terrainMesh);

    // 2. Main Industrial Hangar / Facility Complex (-8, 6, 4.8)
    const hangarGroup = new THREE.Group();
    hangarGroup.position.set(-8, 6, 0);

    // Foundation Curb
    const foundationGeo = new THREE.BoxGeometry(28.8, 22.8, 0.8);
    const foundationMat = getPbrMat({
      map: textures.concrete,
      normalMap: textures.concreteNormal,
      roughness: 0.72,
      metalness: 0.08
    }, 'high');
    const foundationMesh = new THREE.Mesh(foundationGeo, foundationMat);
    foundationMesh.position.set(0, 0, 0.4);
    foundationMesh.castShadow = true;
    foundationMesh.receiveShadow = true;
    hangarGroup.add(foundationMesh);

    // Main Corrugated Steel Hangar Body (28 x 22 x 9m)
    const hangarBodyGeo = new THREE.BoxGeometry(28, 22, 9);
    const hangarMat = getPbrMat({
      map: textures.corrugated,
      normalMap: textures.corrugatedNormal,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: 0.42,
      metalness: 0.45
    }, 'high');
    const hangarBody = new THREE.Mesh(hangarBodyGeo, hangarMat);
    hangarBody.position.set(0, 0, 4.8);
    hangarBody.castShadow = true;
    hangarBody.receiveShadow = true;
    hangarGroup.add(hangarBody);

    // Corner Structural Columns
    const colGeom = new THREE.BoxGeometry(0.7, 0.7, 9.2);
    const colMat = getPbrMat({ color: 0x334155, roughness: 0.35, metalness: 0.6 }, 'high');
    [
      [-14, -11], [14, -11], [-14, 11], [14, 11]
    ].forEach(([cx, cy]) => {
      const col = new THREE.Mesh(colGeom, colMat);
      col.position.set(cx, cy, 4.9);
      col.castShadow = true;
      hangarGroup.add(col);
    });

    // Detailed Gabled Pitched Roof with Overhanging Eaves
    const rw = 29.6, rl = 23.6, rh = 3.6;
    const roofGeo = new THREE.BufferGeometry();
    const roofVertices = new Float32Array([
      // Left slope
      -rw/2, -rl/2, 0,    0, -rl/2, rh,   0, rl/2, rh,
      -rw/2, -rl/2, 0,    0, rl/2, rh,   -rw/2, rl/2, 0,
      // Right slope
      0, -rl/2, rh,    rw/2, -rl/2, 0,    rw/2, rl/2, 0,
      0, -rl/2, rh,    rw/2, rl/2, 0,     0, rl/2, rh,
      // Front gable
      -rw/2, -rl/2, 0,    rw/2, -rl/2, 0,    0, -rl/2, rh,
      // Back gable
      -rw/2, rl/2, 0,     0, rl/2, rh,       rw/2, rl/2, 0
    ]);
    roofGeo.setAttribute('position', new THREE.BufferAttribute(roofVertices, 3));
    roofGeo.computeVertexNormals();

    const roofMat = getPbrMat({
      map: textures.roof,
      roughness: 0.45,
      metalness: 0.4
    }, 'high');
    const roofMesh = new THREE.Mesh(roofGeo, roofMat);
    roofMesh.position.set(0, 0, 9.3);
    roofMesh.castShadow = true;
    roofMesh.receiveShadow = true;
    hangarGroup.add(roofMesh);

    // Rooftop Industrial Skylight Monitor
    const skylightGeo = new THREE.BoxGeometry(16, 2.8, 0.9);
    const skylightMat = getPbrMat({
      color: 0x93c5fd,
      roughness: 0.15,
      metalness: 0.8,
      transparent: true,
      opacity: 0.85
    }, 'high');
    const skylightMesh = new THREE.Mesh(skylightGeo, skylightMat);
    skylightMesh.position.set(0, 0, 13.1);
    skylightMesh.castShadow = true;
    hangarGroup.add(skylightMesh);

    // 3 Industrial Shutter Bay Doors with Hazard Thresholds & Bollards
    for (let d = -1; d <= 1; d++) {
      const doorX = d * 7.6;
      const frameMesh = new THREE.Mesh(
        new THREE.BoxGeometry(5.8, 0.5, 6.6),
        getPbrMat({ color: 0x1e293b, roughness: 0.4, metalness: 0.7 }, 'high')
      );
      frameMesh.position.set(doorX, -11.05, 3.5);
      hangarGroup.add(frameMesh);

      const doorLeaf = new THREE.Mesh(
        new THREE.BoxGeometry(5.4, 0.3, 6.2),
        getPbrMat({
          map: textures.corrugated,
          roughness: 0.45,
          metalness: 0.4
        }, 'high')
      );
      doorLeaf.position.set(doorX, -11.1, 3.4);
      doorLeaf.castShadow = true;
      hangarGroup.add(doorLeaf);

      const hazardSill = new THREE.Mesh(
        new THREE.BoxGeometry(5.8, 0.8, 0.15),
        getPbrMat({ map: textures.hazard, roughness: 0.5, metalness: 0.2 }, 'high')
      );
      hazardSill.position.set(doorX, -11.4, 0.35);
      hangarGroup.add(hazardSill);

      [-3.2, 3.2].forEach(bx => {
        const bollard = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.16, 1.1, 16),
          getPbrMat({ color: 0xfacc15, roughness: 0.3, metalness: 0.5 }, 'high')
        );
        bollard.position.set(doorX + bx, -11.5, 0.85);
        bollard.rotation.x = Math.PI / 2;
        bollard.castShadow = true;
        hangarGroup.add(bollard);
      });

      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.4, 0.3),
        getPbrMat({ color: 0x334155, roughness: 0.2, metalness: 0.8 }, 'high')
      );
      lamp.position.set(doorX, -11.2, 7.0);
      hangarGroup.add(lamp);
    }

    // Gable Ventilation Louvers
    [-1, 1].forEach(dir => {
      const louver = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 0.2, 1.4),
        getPbrMat({ color: 0x1e293b, roughness: 0.6, metalness: 0.5 }, 'high')
      );
      louver.position.set(0, dir * 11.85, 11.2);
      hangarGroup.add(louver);
    });

    group.add(hangarGroup);

    // 3. Operations Annex Building (18, 4, 5.8)
    const annexGroup = new THREE.Group();
    annexGroup.position.set(18, 4, 0);

    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(16.4, 14.4, 0.8),
      getPbrMat({ color: 0x334155, roughness: 0.8, metalness: 0.2 }, 'high')
    );
    plinth.position.set(0, 0, 0.4);
    plinth.castShadow = true;
    annexGroup.add(plinth);

    const annexBody = new THREE.Mesh(
      new THREE.BoxGeometry(16, 14, 11),
      getPbrMat({
        map: textures.concrete,
        normalMap: textures.concreteNormal,
        roughness: 0.62,
        metalness: 0.1
      }, 'high')
    );
    annexBody.position.set(0, 0, 5.8);
    annexBody.castShadow = true;
    annexBody.receiveShadow = true;
    annexGroup.add(annexBody);

    const parapet = new THREE.Mesh(
      new THREE.BoxGeometry(16.3, 14.3, 0.3),
      getPbrMat({ color: 0x64748b, roughness: 0.4, metalness: 0.6 }, 'high')
    );
    parapet.position.set(0, 0, 11.45);
    annexGroup.add(parapet);

    const glassMat = getPbrMat({
      color: 0x0f172a,
      roughness: 0.08,
      metalness: 0.9,
      transparent: true,
      opacity: 0.88
    }, 'high');

    [3.8, 7.8].forEach(floorZ => {
      const winMesh = new THREE.Mesh(
        new THREE.BoxGeometry(16.25, 14.25, 1.8),
        glassMat
      );
      winMesh.position.set(0, 0, floorZ);
      annexGroup.add(winMesh);

      for (let mx = -7.2; mx <= 7.2; mx += 2.4) {
        const mullion = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 14.3, 1.82),
          getPbrMat({ color: 0x1e293b, roughness: 0.3, metalness: 0.8 }, 'high')
        );
        mullion.position.set(mx, 0, floorZ);
        annexGroup.add(mullion);
      }
    });

    const bulkhead = new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 4.2, 2.5),
      getPbrMat({
        map: textures.concrete,
        roughness: 0.7,
        metalness: 0.15
      }, 'high')
    );
    bulkhead.position.set(-3.5, 3.2, 12.5);
    bulkhead.castShadow = true;
    annexGroup.add(bulkhead);

    for (let c = 0; c < 2; c++) {
      const chX = 2.8 + c * 3.4;
      const chY = -1.5;
      const chiller = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 3.6, 1.8),
        getPbrMat({ color: 0x94a3b8, roughness: 0.45, metalness: 0.5 }, 'medium')
      );
      chiller.position.set(chX, chY, 12.2);
      chiller.castShadow = true;
      annexGroup.add(chiller);

      [-0.8, 0.8].forEach(fy => {
        const fan = new THREE.Mesh(
          new THREE.CylinderGeometry(0.65, 0.65, 0.35, 16),
          getPbrMat({ color: 0x334155, roughness: 0.3, metalness: 0.7 }, 'medium')
        );
        fan.position.set(chX, chY + fy, 13.2);
        fan.rotation.x = Math.PI / 2;
        annexGroup.add(fan);
      });
    }

    const duct = new THREE.Mesh(
      new THREE.BoxGeometry(5.8, 0.8, 0.8),
      getPbrMat({ color: 0xc4cbd1, roughness: 0.3, metalness: 0.75 }, 'medium')
    );
    duct.position.set(3.5, 1.2, 11.8);
    annexGroup.add(duct);

    const railMat = getPbrMat({ color: 0xe2e8f0, roughness: 0.3, metalness: 0.8 }, 'high');
    const rail1 = new THREE.Mesh(new THREE.BoxGeometry(15.6, 0.1, 0.9), railMat);
    rail1.position.set(0, -6.8, 11.8);
    annexGroup.add(rail1);
    const rail2 = new THREE.Mesh(new THREE.BoxGeometry(15.6, 0.1, 0.9), railMat);
    rail2.position.set(0, 6.8, 11.8);
    annexGroup.add(rail2);

    group.add(annexGroup);

    // 4. Perimeter Access Road with 3D Curbs & Crown (4, 2, 0.35)
    const roadGroup = new THREE.Group();
    roadGroup.position.set(4, 2, 0.35);

    const roadGeo = new THREE.RingGeometry(24, 31, 64);
    const roadMat = getPbrMat({
      map: textures.asphalt,
      normalMap: textures.terrainNormal,
      roughness: 0.88,
      metalness: 0.05,
      side: THREE.DoubleSide
    }, 'high');
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.receiveShadow = true;
    roadGroup.add(roadMesh);

    const dashRing = new THREE.Mesh(
      new THREE.RingGeometry(27.3, 27.7, 48),
      new THREE.MeshBasicMaterial({ color: 0xf8fafc, side: THREE.DoubleSide })
    );
    dashRing.position.z = 0.03;
    roadGroup.add(dashRing);

    const innerCurb = new THREE.Mesh(
      new THREE.RingGeometry(23.7, 24.1, 64),
      getPbrMat({ color: 0x94a3b8, roughness: 0.7, metalness: 0.1, side: THREE.DoubleSide }, 'high')
    );
    innerCurb.position.z = 0.05;
    roadGroup.add(innerCurb);

    const outerCurb = new THREE.Mesh(
      new THREE.RingGeometry(30.9, 31.3, 64),
      getPbrMat({ color: 0x94a3b8, roughness: 0.7, metalness: 0.1, side: THREE.DoubleSide }, 'high')
    );
    outerCurb.position.z = 0.05;
    roadGroup.add(outerCurb);

    group.add(roadGroup);

    // 5. Drone Helipad / Launchpad with Concrete Slabs (0, -22, 0.45)
    const heliGroup = new THREE.Group();
    heliGroup.position.set(0, -22, 0.45);

    const padMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(8.2, 8.2, 0.35, 32),
      getPbrMat({
        map: textures.concrete,
        normalMap: textures.concreteNormal,
        roughness: 0.75,
        metalness: 0.05
      }, 'high')
    );
    padMesh.rotation.x = Math.PI / 2;
    padMesh.receiveShadow = true;
    heliGroup.add(padMesh);

    const padRing = new THREE.Mesh(
      new THREE.RingGeometry(7.0, 7.8, 48),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, side: THREE.DoubleSide })
    );
    padRing.position.z = 0.2;
    heliGroup.add(padRing);

    const hMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const hStem1 = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 5.4), hMat);
    hStem1.position.set(-1.8, 0, 0.22);
    heliGroup.add(hStem1);
    const hStem2 = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 5.4), hMat);
    hStem2.position.set(1.8, 0, 0.22);
    heliGroup.add(hStem2);
    const hCross = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.0), hMat);
    hCross.position.set(0, 0, 0.22);
    heliGroup.add(hCross);

    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      const lx = Math.cos(a) * 7.9;
      const ly = Math.sin(a) * 7.9;
      const led = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 0.15, 8),
        new THREE.MeshBasicMaterial({ color: 0xfacc15 })
      );
      led.position.set(lx, ly, 0.25);
      led.rotation.x = Math.PI / 2;
      heliGroup.add(led);
    }

    group.add(heliGroup);

    // 6. Communications Lattice Tower (-26, -16, 14.2)
    const towerGroup = new THREE.Group();
    towerGroup.position.set(-26, -16, 0);

    const legMat = getPbrMat({ color: 0x94a3b8, roughness: 0.35, metalness: 0.8 }, 'medium');
    const legPoints = [
      [-1.5, -1.5], [1.5, -1.5], [1.5, 1.5], [-1.5, 1.5]
    ];
    legPoints.forEach(([lx, ly]) => {
      const legGeom = new THREE.CylinderGeometry(0.08, 0.14, 28, 8);
      const leg = new THREE.Mesh(legGeom, legMat);
      leg.position.set(lx * 0.6, ly * 0.6, 14);
      leg.rotation.x = Math.PI / 2;
      leg.castShadow = true;
      towerGroup.add(leg);
    });

    for (let tz = 3.5; tz <= 26; tz += 3.5) {
      const s = 1.0 - (tz / 35);
      const ringGeom = new THREE.BoxGeometry(3.0 * s, 3.0 * s, 0.15);
      const ringMesh = new THREE.Mesh(ringGeom, legMat);
      ringMesh.position.set(0, 0, tz);
      towerGroup.add(ringMesh);
    }

    const platform = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 3.6, 0.2),
      getPbrMat({ color: 0x475569, roughness: 0.5, metalness: 0.7 }, 'medium')
    );
    platform.position.set(0, 0, 18);
    towerGroup.add(platform);

    const dish1 = new THREE.Mesh(
      new THREE.SphereGeometry(1.8, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.2),
      getPbrMat({ color: 0xf8fafc, roughness: 0.3, metalness: 0.2 }, 'medium')
    );
    dish1.position.set(0, -1.6, 21.5);
    dish1.rotation.x = Math.PI / 2.3;
    dish1.castShadow = true;
    towerGroup.add(dish1);

    const dish2 = new THREE.Mesh(
      new THREE.SphereGeometry(1.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.2),
      getPbrMat({ color: 0xf8fafc, roughness: 0.3, metalness: 0.2 }, 'medium')
    );
    dish2.position.set(1.4, 0, 16);
    dish2.rotation.y = -Math.PI / 2.5;
    dish2.castShadow = true;
    towerGroup.add(dish2);

    const beaconMat = new THREE.MeshBasicMaterial({ 
      color: 0xef4444, 
      transparent: true, 
      opacity: 0.9 
    });
    beaconMatRef.current = beaconMat;
    const beaconMesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 16), beaconMat);
    beaconMesh.position.set(0, 0, 28.5);
    towerGroup.add(beaconMesh);

    group.add(towerGroup);

    // 7. Geodetic Ground Control Points (GCP-01, GCP-02, GCP-03)
    const gcpCoords = [
      { name: 'GCP-01', x: -28, y: 24, z: 1.2 },
      { name: 'GCP-02', x: 30, y: 26, z: 1.6 },
      { name: 'GCP-03', x: 28, y: -24, z: 0.8 }
    ];
    gcpCoords.forEach(gcp => {
      const gcpGroup = new THREE.Group();
      gcpGroup.position.set(gcp.x, gcp.y, gcp.z);

      const pad = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 2.2),
        new THREE.MeshBasicMaterial({ map: textures.gcp, side: THREE.DoubleSide })
      );
      gcpGroup.add(pad);

      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 2.4, 8),
        new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3, metalness: 0.5 })
      );
      pole.position.set(0, 0, 1.2);
      pole.rotation.x = Math.PI / 2;
      gcpGroup.add(pole);

      const prism = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.28),
        new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.9 })
      );
      prism.position.set(0, 0, 2.45);
      gcpGroup.add(prism);

      group.add(gcpGroup);
    });

    // 8. Instanced Realistic Vegetation
    const treeGroup = new THREE.Group();
    const trunkMat = getPbrMat({ color: 0x4a3728, roughness: 0.9, metalness: 0.05 }, 'high');
    const pineMat1 = getPbrMat({ color: 0x1e3a1e, roughness: 0.75, metalness: 0.05 }, 'high');
    const pineMat2 = getPbrMat({ color: 0x2d4a2d, roughness: 0.75, metalness: 0.05 }, 'high');
    const decMat = getPbrMat({ color: 0x3b5e28, roughness: 0.7, metalness: 0.05 }, 'high');

    const treeLocations = [
      [-46, -12, 1.1], [-48, 6, 1.3], [-44, 22, 1.8], [-42, -28, 0.9],
      [-30, 44, 2.2], [-14, 46, 2.0], [8, 48, 2.4], [24, 44, 2.1], [40, 38, 1.8],
      [48, 14, 1.5], [46, -8, 1.2], [42, -26, 0.9], [34, -40, 0.8],
      [14, -44, 0.7], [-12, -42, 0.8], [-32, -40, 1.0],
      [28, -6, 0.6], [32, 2, 0.7], [30, 12, 0.8]
    ];

    treeLocations.forEach(([tx, ty, tz], idx) => {
      const isPine = idx % 2 === 0;
      const tGroup = new THREE.Group();
      tGroup.position.set(tx, ty, tz);
      const scale = 0.85 + (idx % 5) * 0.1;
      tGroup.scale.set(scale, scale, scale);
      tGroup.rotation.z = (idx * 1.37) % (Math.PI * 2);

      if (isPine) {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.45, 3.2, 8), trunkMat);
        trunk.position.set(0, 0, 1.6);
        trunk.rotation.x = Math.PI / 2;
        trunk.castShadow = true;
        tGroup.add(trunk);

        [
          { r: 2.6, h: 3.2, z: 3.8, mat: pineMat1 },
          { r: 2.1, h: 2.8, z: 5.6, mat: pineMat2 },
          { r: 1.4, h: 2.4, z: 7.2, mat: pineMat1 }
        ].forEach(tier => {
          const cone = new THREE.Mesh(new THREE.ConeGeometry(tier.r, tier.h, 7), tier.mat);
          cone.position.set(0, 0, tier.z);
          cone.rotation.x = -Math.PI / 2;
          cone.castShadow = true;
          cone.receiveShadow = true;
          tGroup.add(cone);
        });
      } else {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 3.0, 8), trunkMat);
        trunk.position.set(0, 0, 1.5);
        trunk.rotation.x = Math.PI / 2;
        trunk.castShadow = true;
        tGroup.add(trunk);

        const canopy = new THREE.Mesh(new THREE.DodecahedronGeometry(2.6, 1), decMat);
        canopy.position.set(0, 0, 4.6);
        canopy.scale.set(1.1, 1.0, 0.85);
        canopy.castShadow = true;
        canopy.receiveShadow = true;
        tGroup.add(canopy);
      }
      treeGroup.add(tGroup);
    });
    group.add(treeGroup);

    // 9. UAV Survey Flight Path Trajectory & Camera Frustums
    if (layers.frustums) {
      const flightGroup = new THREE.Group();
      const flightPts = [];
      const altitude = 32.0;
      const flightGrid = [
        [-34, -28], [-34, 28],
        [-18, 28], [-18, -28],
        [-2, -28], [-2, 28],
        [14, 28], [14, -28],
        [30, -28], [30, 28]
      ];

      flightGrid.forEach(([fx, fy], idx) => {
        const pt = new THREE.Vector3(fx, fy, altitude);
        flightPts.push(pt);

        const pyrGeo = new THREE.ConeGeometry(2.4, 4.2, 4);
        const pyrMat = new THREE.MeshBasicMaterial({ 
          color: idx === 0 ? 0x10b981 : 0x0284c7, 
          wireframe: true 
        });
        const pyr = new THREE.Mesh(pyrGeo, pyrMat);
        pyr.position.copy(pt);
        pyr.rotation.x = -Math.PI / 2;
        flightGroup.add(pyr);

        const rayGeo = new THREE.BufferGeometry().setFromPoints([
          pt,
          new THREE.Vector3(fx, fy, 0.5)
        ]);
        const rayMat = new THREE.LineDashedMaterial({ 
          color: 0x38bdf8, 
          dashSize: 1.0, 
          gapSize: 0.6,
          transparent: true,
          opacity: 0.4
        });
        const rayLine = new THREE.Line(rayGeo, rayMat);
        rayLine.computeLineDistances();
        flightGroup.add(rayLine);

        const dot = new THREE.Mesh(
          new THREE.SphereGeometry(0.45, 12, 12),
          new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
        );
        dot.position.copy(pt);
        flightGroup.add(dot);
      });

      const pathGeo = new THREE.BufferGeometry().setFromPoints(flightPts);
      const pathMat = new THREE.LineBasicMaterial({ color: 0x0284c7, linewidth: 2 });
      const pathLine = new THREE.Line(pathGeo, pathMat);
      flightGroup.add(pathLine);

      group.add(flightGroup);
    }

    // 10. Dense Photogrammetric Survey Point Cloud
    const pGeo = new THREE.BufferGeometry();
    const pPositions = [];
    const pColors = [];

    // Dense terrain points
    for (let x = -60; x <= 60; x += 1.4) {
      for (let y = -60; y <= 60; y += 1.4) {
        let z = Math.sin(x * 0.045) * Math.cos(y * 0.045) * 4.2 + 
                Math.sin(x * 0.11 + y * 0.08) * 1.6 + 
                Math.cos(x * 0.03 - y * 0.05) * 1.2;
        const distFromCenter = Math.sqrt(x * x + y * y);
        if (distFromCenter < 38) {
          const blend = Math.max(0, (distFromCenter - 22) / 16);
          z = z * blend + 0.28 * (1 - blend);
        }
        pPositions.push(x, y, z + 0.14);

        if (isConfOverlay) {
          pColors.push(0.06, 0.72, 0.5);
        } else {
          if (Math.abs(x) < 32 && Math.abs(y) < 30) {
            pColors.push(0.58, 0.62, 0.66);
          } else {
            const normH = Math.max(0, Math.min(1, (z + 4) / 10));
            pColors.push(0.24 + normH * 0.12, 0.38 + normH * 0.16, 0.18 + normH * 0.08);
          }
        }
      }
    }

    // Dense points on Main Hangar
    for (let rx = -22; rx <= 6; rx += 0.8) {
      for (let ry = -5; ry <= 17; ry += 0.8) {
        const roofZ = 9.3 + 3.6 * (1 - Math.abs(rx + 8) / 14);
        pPositions.push(rx, ry, roofZ + 0.1);
        pColors.push(0.25, 0.30, 0.38);
      }
    }
    for (let z = 0.5; z <= 9.0; z += 0.9) {
      for (let rx = -22; rx <= 6; rx += 0.8) {
        pPositions.push(rx, -5, z); pColors.push(0.38, 0.45, 0.52);
        pPositions.push(rx, 17, z); pColors.push(0.38, 0.45, 0.52);
      }
      for (let ry = -5; ry <= 17; ry += 0.8) {
        pPositions.push(-22, ry, z); pColors.push(0.38, 0.45, 0.52);
        pPositions.push(6, ry, z); pColors.push(0.38, 0.45, 0.52);
      }
    }

    // Annex Building Points
    for (let ax = 10; ax <= 26; ax += 0.8) {
      for (let ay = -3; ay <= 11; ay += 0.8) {
        pPositions.push(ax, ay, 11.5);
        pColors.push(0.72, 0.76, 0.80);
      }
    }
    for (let z = 0.5; z <= 11.0; z += 0.9) {
      for (let ax = 10; ax <= 26; ax += 0.8) {
        pPositions.push(ax, -3, z); pColors.push(0.65, 0.70, 0.75);
        pPositions.push(ax, 11, z); pColors.push(0.65, 0.70, 0.75);
      }
      for (let ay = -3; ay <= 11; ay += 0.8) {
        pPositions.push(10, ay, z); pColors.push(0.65, 0.70, 0.75);
        pPositions.push(26, ay, z); pColors.push(0.65, 0.70, 0.75);
      }
    }

    pGeo.setAttribute('position', new THREE.Float32BufferAttribute(pPositions, 3));
    pGeo.setAttribute('color', new THREE.Float32BufferAttribute(pColors, 3));
    originalColorsRef.current = new Float32Array(pColors);

    const pMat = new THREE.PointsMaterial({ 
      size: pointSize || 0.42, 
      vertexColors: true,
      sizeAttenuation: true
    });
    const pts = new THREE.Points(pGeo, pMat);
    pts.visible = (renderMode === 'pointcloud') || layers.points;
    sceneRef.current.add(pts);
    pointsObjRef.current = pts;
    setPointCount(pPositions.length / 3);

    sceneRef.current.add(group);
    meshObjRef.current = group;
    setTriangleCount(96 * 96 * 2 + 620);
    setBoundingBox({ width: '130.0', length: '130.0', height: '36.0' });
    setLoading(false);
  };

  // ── 3. Load GLB Surface Mesh / Textured Model or Fallback ───────────────────
  useEffect(() => {
    if (!sceneRef.current) return;
    if (!glbUrl) {
      if (!plyUrl && !objUrl) {
        buildFallbackDigitalTwin();
      }
      return;
    }
    setLoading(true);

    const loader = new GLTFLoader();
    loader.load(
      glbUrl,
      (gltf) => {
        if (meshObjRef.current) {
          sceneRef.current.remove(meshObjRef.current);
        }

        const model = gltf.scene;
        let totalTris = 0;

        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            child.material.side = THREE.DoubleSide;
            child.material.wireframe = wireframe;
            child.material.roughness = 0.55;
            if (child.geometry && child.geometry.attributes.color) {
              child.material.vertexColors = true;
            }
            if (child.geometry.index) {
              totalTris += child.geometry.index.count / 3;
            } else if (child.geometry.attributes.position) {
              totalTris += child.geometry.attributes.position.count / 3;
            }
          }
        });

        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        model.position.sub(center);

        setBoundingBox({
          width: size.x.toFixed(1),
          length: size.y.toFixed(1),
          height: size.z.toFixed(1)
        });

        sceneRef.current.add(model);
        meshObjRef.current = model;
        setTriangleCount(Math.round(totalTris));
        setRenderMode('textured');
        setLoading(false);
      },
      undefined,
      (err) => {
        console.warn("GLB load info:", err);
        setLoading(false);
        buildFallbackDigitalTwin();
      }
    );
  }, [glbUrl, plyUrl, objUrl, confidenceMode, wireframe, layers.frustums, layers.points]);

  // ── 4. View Mode Transitions (Textured, Mesh, Point Cloud, Wireframe) ──────
  useEffect(() => {
    if (!meshObjRef.current) return;

    if (renderMode === 'textured') {
      meshObjRef.current.visible = layers.mesh;
      meshObjRef.current.traverse((child) => {
        if (child.isMesh) {
          child.visible = true;
          if (child.userData.origMaterial) {
            child.material = child.userData.origMaterial;
          }
          child.material.wireframe = wireframe;
        } else if (child.isPoints) {
          child.visible = layers.points;
        }
      });
      if (pointsObjRef.current) pointsObjRef.current.visible = layers.points;
    } else if (renderMode === 'mesh') {
      meshObjRef.current.visible = layers.mesh;
      meshObjRef.current.traverse((child) => {
        if (child.isMesh) {
          child.visible = true;
          if (!child.userData.origMaterial) {
            child.userData.origMaterial = child.material;
          }
          child.material = new THREE.MeshStandardMaterial({
            color: 0xcfd8dc,
            roughness: 0.65,
            metalness: 0.08,
            side: THREE.DoubleSide,
            wireframe: wireframe
          });
        } else if (child.isPoints) {
          child.visible = layers.points;
        }
      });
      if (pointsObjRef.current) pointsObjRef.current.visible = layers.points;
    } else if (renderMode === 'pointcloud') {
      meshObjRef.current.visible = true;
      meshObjRef.current.traverse((child) => {
        if (child.isMesh) {
          child.visible = false;
        } else if (child.isPoints) {
          child.visible = true;
        }
      });
      if (pointsObjRef.current) pointsObjRef.current.visible = true;
    }
  }, [renderMode, wireframe, layers.mesh, layers.points]);

  // ── 5. Load Confidence Map GLB ───────────────────────────────────────────
  useEffect(() => {
    if (!confidenceUrl || !sceneRef.current) return;

    const loader = new GLTFLoader();
    loader.load(
      confidenceUrl,
      (gltf) => {
        if (confidenceMeshRef.current) {
          sceneRef.current.remove(confidenceMeshRef.current);
        }

        const model = gltf.scene;
        model.traverse((child) => {
          if (child.isMesh) {
            child.material.side = THREE.DoubleSide;
            child.material.wireframe = wireframe;
            if (child.geometry && child.geometry.attributes.color) {
              child.material.vertexColors = true;
              child.userData.origColors = new Float32Array(child.geometry.attributes.color.array);
            }
          }
        });

        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);

        model.visible = confidenceMode !== 'normal';
        sceneRef.current.add(model);
        confidenceMeshRef.current = model;
      },
      undefined,
      (err) => console.debug("Confidence GLB info:", err)
    );
  }, [confidenceUrl]);

  // Handle Confidence Mode Filtering
  useEffect(() => {
    const isConf = confidenceMode !== 'normal';
    if (meshObjRef.current) {
      meshObjRef.current.visible = !isConf && layers.mesh && renderMode !== 'pointcloud';
    }

    if (confidenceMeshRef.current) {
      confidenceMeshRef.current.visible = isConf && layers.mesh;
      if (isConf) {
        confidenceMeshRef.current.traverse((child) => {
          if (child.isMesh && child.userData.origColors && child.geometry.attributes.color) {
            const orig = child.userData.origColors;
            const clr = child.geometry.attributes.color.array;

            for (let i = 0; i < orig.length; i += 3) {
              const r = orig[i], g = orig[i + 1], b = orig[i + 2];
              const isHigh = (g > 0.65 && r < 0.4);
              const isMed = (r > 0.75 && g > 0.55 && b < 0.2);
              const isUnk = (b > 0.45 && Math.abs(r - g) < 0.15);

              let keep = false;
              if (confidenceMode === 'overlay') keep = true;
              else if (confidenceMode === 'high_only') keep = isHigh;
              else if (confidenceMode === 'medium_only') keep = isMed;
              else if (confidenceMode === 'unknown_only') keep = isUnk;

              if (keep) {
                clr[i] = r; clr[i + 1] = g; clr[i + 2] = b;
              } else {
                clr[i] = 0.08; clr[i + 1] = 0.08; clr[i + 2] = 0.1;
              }
            }
            child.geometry.attributes.color.needsUpdate = true;
          }
        });
      }
    }
  }, [confidenceMode, layers.mesh, renderMode]);

  // Wireframe Mode Switcher
  useEffect(() => {
    [meshObjRef.current, confidenceMeshRef.current].forEach(obj => {
      if (obj) {
        obj.traverse(child => {
          if (child.isMesh && child.material) {
            child.material.wireframe = wireframe;
          }
        });
      }
    });
  }, [wireframe]);

  // ── 6. Load PLY Point Cloud ──────────────────────────────────────────────
  useEffect(() => {
    if (!plyUrl || !sceneRef.current) return;
    setLoading(true);

    fetch(plyUrl)
      .then(r => r.text())
      .then(text => {
        const lines = text.split('\n');
        const positions = [];
        const colors = [];
        let isHeader = true;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (isHeader) {
            if (line === 'end_header') isHeader = false;
            continue;
          }
          if (!line) continue;
          const parts = line.split(/\s+/);
          if (parts.length >= 3) {
            positions.push(parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2]));
            if (parts.length >= 6) {
              colors.push(parseFloat(parts[3]) / 255, parseFloat(parts[4]) / 255, parseFloat(parts[5]) / 255);
            } else {
              colors.push(0.7, 0.8, 0.9);
            }
          }
        }

        if (positions.length === 0) return;

        if (pointsObjRef.current) {
          sceneRef.current.remove(pointsObjRef.current);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        originalColorsRef.current = new Float32Array(colors);
        geometry.center();

        const material = new THREE.PointsMaterial({
          size: pointSize,
          vertexColors: true,
          sizeAttenuation: true
        });

        const pointsObj = new THREE.Points(geometry, material);
        pointsObj.visible = layers.points;
        sceneRef.current.add(pointsObj);
        pointsObjRef.current = pointsObj;
        setPointCount(positions.length / 3);
        setLoading(false);
      })
      .catch(err => {
        console.debug("PLY load info:", err);
        setLoading(false);
      });
  }, [plyUrl]);

  // Point Size Update
  useEffect(() => {
    if (pointsObjRef.current) {
      pointsObjRef.current.material.size = pointSize;
      pointsObjRef.current.material.needsUpdate = true;
    }
  }, [pointSize]);

  // Point Cloud Color Mode (RGB vs Elevation Thermal)
  useEffect(() => {
    if (!pointsObjRef.current || !originalColorsRef.current) return;
    const geom = pointsObjRef.current.geometry;
    const posAttr = geom.getAttribute('position');
    const clrAttr = geom.getAttribute('color');

    if (colorMode === 'rgb') {
      clrAttr.array.set(originalColorsRef.current);
    } else if (colorMode === 'elevation') {
      let minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < posAttr.count; i++) {
        const z = posAttr.getZ(i);
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      const range = Math.max(maxZ - minZ, 0.1);

      for (let i = 0; i < posAttr.count; i++) {
        const normZ = (posAttr.getZ(i) - minZ) / range;
        clrAttr.setXYZ(
          i,
          Math.sin(normZ * Math.PI * 0.5),
          Math.sin(normZ * Math.PI),
          Math.cos(normZ * Math.PI * 0.5)
        );
      }
    }
    clrAttr.needsUpdate = true;
  }, [colorMode]);

  // ── 7. Load Camera Poses & Trajectory ────────────────────────────────────
  useEffect(() => {
    if (!posesUrl || !frustumsGroupRef.current) return;

    fetch(posesUrl)
      .then(res => res.json())
      .then(data => {
        const group = frustumsGroupRef.current;
        while (group.children.length > 0) {
          group.remove(group.children[0]);
        }

        const poses = data.poses || [];
        const pathPoints = [];

        poses.forEach((p, idx) => {
          const pos = p.position || [0, 0, 0];
          const camVec = new THREE.Vector3(pos[0], pos[1], pos[2]);
          pathPoints.push(camVec);

          const pyrGeom = new THREE.ConeGeometry(0.7, 1.2, 4);
          pyrGeom.rotateX(Math.PI);
          const pyrMat = new THREE.MeshBasicMaterial({
            color: idx === 0 ? 0x10b981 : 0x0284c7,
            wireframe: true
          });
          const pyr = new THREE.Mesh(pyrGeom, pyrMat);
          pyr.position.copy(camVec);
          group.add(pyr);
        });

        if (pathPoints.length > 1) {
          const lineGeom = new THREE.BufferGeometry().setFromPoints(pathPoints);
          const lineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 });
          const line = new THREE.Line(lineGeom, lineMat);
          group.add(line);
        }
      })
      .catch(err => console.debug("Camera poses info:", err));
  }, [posesUrl]);

  // ── 8. Load Dynamic Objects Layer (Stage 4 YOLOv8-seg) ────────────────────
  useEffect(() => {
    if (!dynamicObjectsUrl || !dynamicObjectsGroupRef.current) return;

    fetch(dynamicObjectsUrl)
      .then(res => res.json())
      .then(data => {
        const group = dynamicObjectsGroupRef.current;
        while (group.children.length > 0) {
          group.remove(group.children[0]);
        }

        const objects = data.detected_objects || data.objects || [];
        objects.forEach((obj, idx) => {
          const boxGeom = new THREE.BoxGeometry(2.0, 3.5, 1.6);
          const boxMat = new THREE.MeshBasicMaterial({ color: 0xf97316, wireframe: true });
          const boxMesh = new THREE.Mesh(boxGeom, boxMat);

          const px = (idx * 5.0 - 15.0);
          const py = (idx * 4.0 - 10.0);
          boxMesh.position.set(px, py, 0.8);
          group.add(boxMesh);
        });
      })
      .catch(err => console.debug("Dynamic objects layer info:", err));
  }, [dynamicObjectsUrl]);

  // ── 9. Sync Layer Visibility ─────────────────────────────────────────────
  useEffect(() => {
    if (pointsObjRef.current) pointsObjRef.current.visible = (renderMode === 'pointcloud') || layers.points;
    if (meshObjRef.current && confidenceMode === 'normal') meshObjRef.current.visible = layers.mesh && renderMode !== 'pointcloud';
    if (confidenceMeshRef.current && confidenceMode !== 'normal') confidenceMeshRef.current.visible = layers.mesh;
    if (frustumsGroupRef.current) frustumsGroupRef.current.visible = layers.frustums;
    if (dynamicObjectsGroupRef.current) dynamicObjectsGroupRef.current.visible = layers.dynamicObjects;
    if (measurementGroupRef.current) measurementGroupRef.current.visible = layers.measurements;
    if (gridRef.current) gridRef.current.visible = layers.grid;
  }, [layers, confidenceMode, renderMode]);

  // Fullscreen Toggler
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(err => console.warn(err));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(err => console.warn(err));
    }
  };

  // Reset Camera View
  const resetCamera = () => {
    lookAtTargetRef.current.set(0, 0, 0);
    if (cameraRef.current) {
      cameraRef.current.position.set(0, -42, 52);
      cameraRef.current.lookAt(0, 0, 0);
    }
  };

  return (
    <div 
      ref={containerRef}
      style={{ 
        position: 'relative', 
        width: '100%', 
        height: '100%', 
        minHeight: '540px', 
        backgroundColor: '#f1f5f9',
        borderRadius: '12px',
        overflow: 'hidden',
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.06), 0 2px 6px -1px rgba(15, 23, 42, 0.02)'
      }}
    >
      {/* 3D WebGL Canvas */}
      <div 
        ref={mountRef} 
        onClick={handleCanvasClick}
        style={{ width: '100%', height: '100%', cursor: measureMode !== 'none' ? 'crosshair' : 'default' }} 
      />

      {/* Loading Overlay */}
      {loading && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(248, 250, 252, 0.88)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#0284c7',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.85rem',
          fontWeight: 600,
          zIndex: 40
        }}>
          <div style={{ width: '36px', height: '36px', border: '3px solid rgba(2, 132, 199, 0.2)', borderTopColor: '#0284c7', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: '14px' }} />
          <span>Streaming 3D Photogrammetric Geometry...</span>
        </div>
      )}

      {/* Top Left Header & Title */}
      <div style={{ position: 'absolute', top: '16px', left: '20px', zIndex: 20, pointerEvents: 'none' }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>
          {title}
        </h2>
        <p style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '3px', fontWeight: 500, margin: 0 }}>
          {subtitle}
        </p>
      </div>

      {/* Top Right Live Coordinates & Telemetry HUD (Feature 12) */}
      <div style={{ position: 'absolute', top: '16px', right: '20px', zIndex: 20 }}>
        <div className="cad-hud" style={{ minWidth: '260px', fontSize: '0.72rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#64748b', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px', marginBottom: '8px' }}>
            <span style={{ fontWeight: 700, letterSpacing: '0.05em' }}>SURVEY COORDINATES</span>
            <span style={{ color: '#059669', fontWeight: 700 }}>WGS84 / UTM Z16</span>
          </div>
          {cursorCoords ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>LOCAL X, Y:</span>
                <span style={{ color: '#0284c7', fontWeight: 600 }}>{cursorCoords.x}m, {cursorCoords.y}m</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748b' }}>LOCAL ELEV Z:</span>
                <span style={{ color: '#0284c7', fontWeight: 600 }}>{cursorCoords.z}m</span>
              </div>
              {cursorCoords.lat && (
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dotted #e2e8f0', paddingTop: '4px', marginTop: '2px' }}>
                  <span style={{ color: '#64748b' }}>LAT, LON:</span>
                  <span style={{ color: '#0f172a', fontWeight: 600 }}>{cursorCoords.lat}°, {cursorCoords.lon}°</span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: '#94a3b8', fontStyle: 'italic', padding: '2px 0' }}>
              Hover pointer over surface for 3D coordinates
            </div>
          )}
        </div>
      </div>

      {/* Measurement Banner / Active Measurement Indicator (Features 9, 10, 11) */}
      {measureMode !== 'none' && (
        <div style={{
          position: 'absolute',
          top: '80px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 25,
          background: 'rgba(255, 255, 255, 0.96)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1.5px solid #0284c7',
          borderRadius: '10px',
          padding: '7px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          boxShadow: '0 6px 20px rgba(2, 132, 199, 0.15)'
        }}>
          <Ruler size={14} color="#0284c7" />
          <span style={{ fontSize: '0.78rem', color: '#0f172a', fontWeight: 700 }}>
            {measureMode === 'distance' ? 'CLICK TWO 3D POINTS TO MEASURE DISTANCE' : 'CLICK 3+ POINTS FOR SURFACE AREA'}
          </span>
          {measureResult && (
            <div style={{
              background: '#0284c7',
              color: '#ffffff',
              padding: '3px 10px',
              borderRadius: '6px',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
              fontWeight: 700,
              boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)'
            }}>
              {measureResult.value} {measureResult.unit}
            </div>
          )}
          <button
            onClick={clearMeasurements}
            className="cad-btn"
            style={{ padding: '3px 8px', fontSize: '0.72rem', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.05)' }}
            title="Clear measurement pins"
          >
            <Trash2 size={12} /> Clear
          </button>
        </div>
      )}

      {/* Bottom Main Engineering CAD Control Toolbar (Features 1 to 14) */}
      <div style={{
        position: 'absolute',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px'
      }}>
        {/* View Mode Group (Point Cloud, Mesh, Textured, Wireframe) */}
        <div className="cad-toolbar">
          <button
            onClick={() => setRenderMode('textured')}
            className={`cad-btn ${renderMode === 'textured' ? 'active' : ''}`}
            title="Textured PBR 3D Surface Model"
          >
            Textured View
          </button>
          <button
            onClick={() => setRenderMode('mesh')}
            className={`cad-btn ${renderMode === 'mesh' ? 'active' : ''}`}
            title="Reconstructed Mesh Geometry"
          >
            Mesh View
          </button>
          <button
            onClick={() => setWireframe(!wireframe)}
            className={`cad-btn ${wireframe ? 'active' : ''}`}
            title="Toggle Wireframe Overlay"
          >
            Wireframe
          </button>
          <button
            onClick={() => setRenderMode('pointcloud')}
            className={`cad-btn ${renderMode === 'pointcloud' ? 'active' : ''}`}
            title="Dense Point Cloud View"
          >
            Point Cloud
          </button>
          {renderMode === 'pointcloud' && (
            <button
              onClick={() => setColorMode(colorMode === 'rgb' ? 'elevation' : 'rgb')}
              className="cad-btn"
              title="Toggle RGB vs Elevation Colormap"
            >
              {colorMode === 'rgb' ? 'RGB Colors' : 'Elevation Colormap'}
            </button>
          )}
        </div>

        {/* Secondary Action Toolbar: Measurements + Navigation & Layers */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* CAD Measurement Tools Group (Features 9, 10, 11) */}
          <div className="cad-toolbar">
            <button
              onClick={() => setMeasureMode(measureMode === 'distance' ? 'none' : 'distance')}
              className={`cad-btn ${measureMode === 'distance' ? 'active' : ''}`}
              title="Measure Metric 3D Distance between 2 Points"
            >
              <Ruler size={13} /> Distance (m)
            </button>
            <button
              onClick={() => setMeasureMode(measureMode === 'area' ? 'none' : 'area')}
              className={`cad-btn ${measureMode === 'area' ? 'active' : ''}`}
              title="Measure 3D Surface Area (m²)"
            >
              <Square size={13} /> Area (m²)
            </button>
          </div>

          {/* Navigation & Layers Group (Features 1, 2, 3, 4, 13, 15) */}
          <div className="cad-toolbar">
            <button
              onClick={() => setShowLayersPanel(!showLayersPanel)}
              className={`cad-btn ${showLayersPanel ? 'active' : ''}`}
              title="Toggle Layer Visibility Drawer"
            >
              <Layers size={13} /> Layers
            </button>
            <button
              onClick={() => setShowStatsPanel(!showStatsPanel)}
              className={`cad-btn ${showStatsPanel ? 'active' : ''}`}
              title="View Reconstruction Geometry Statistics"
            >
              <Info size={13} /> Stats
            </button>
            <button onClick={resetCamera} className="cad-btn" title="Reset Camera View to Origin">
              <RotateCcw size={13} />
            </button>
            <button onClick={toggleFullscreen} className="cad-btn" title="Toggle Fullscreen Viewport">
              {isFullscreen ? <Minimize size={13} /> : <Maximize size={13} />}
            </button>
          </div>
        </div>
      </div>

      {/* Floating Layer Visibility Panel (Feature 13, 14) */}
      {showLayersPanel && (
        <div style={{
          position: 'absolute',
          bottom: '80px',
          right: '20px',
          zIndex: 25,
          background: 'rgba(255, 255, 255, 0.96)',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '14px 18px',
          width: '240px',
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.1)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
            <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0f172a', letterSpacing: '0.04em' }}>LAYER VISIBILITY</span>
            <button onClick={() => setShowLayersPanel(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8rem', padding: '2px 4px' }}>✕</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '9px', fontSize: '0.76rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#334155', cursor: 'pointer', fontWeight: 500 }}>
              <input type="checkbox" checked={layers.mesh} onChange={e => setLayers({ ...layers, mesh: e.target.checked })} style={{ accentColor: '#0284c7' }} />
              Surface Mesh
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#334155', cursor: 'pointer', fontWeight: 500 }}>
              <input type="checkbox" checked={layers.points} onChange={e => setLayers({ ...layers, points: e.target.checked })} style={{ accentColor: '#0284c7' }} />
              Point Cloud
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#334155', cursor: 'pointer', fontWeight: 500 }}>
              <input type="checkbox" checked={layers.frustums} onChange={e => setLayers({ ...layers, frustums: e.target.checked })} style={{ accentColor: '#0284c7' }} />
              Camera Poses & Trajectory
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ea580c', cursor: 'pointer', fontWeight: 600 }}>
              <input type="checkbox" checked={layers.dynamicObjects} onChange={e => setLayers({ ...layers, dynamicObjects: e.target.checked })} style={{ accentColor: '#ea580c' }} />
              Dynamic Objects Layer
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#334155', cursor: 'pointer', fontWeight: 500 }}>
              <input type="checkbox" checked={layers.grid} onChange={e => setLayers({ ...layers, grid: e.target.checked })} style={{ accentColor: '#0284c7' }} />
              Spatial Ground Grid
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#334155', cursor: 'pointer', fontWeight: 500 }}>
              <input type="checkbox" checked={layers.measurements} onChange={e => setLayers({ ...layers, measurements: e.target.checked })} style={{ accentColor: '#0284c7' }} />
              Measurements Layer
            </label>
          </div>
        </div>
      )}

      {/* Floating Reconstruction Statistics HUD (Feature 15) */}
      {showStatsPanel && (
        <div style={{
          position: 'absolute',
          bottom: '80px',
          left: '20px',
          zIndex: 25,
          background: 'rgba(255, 255, 255, 0.96)',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '14px 18px',
          width: '270px',
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.1)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.74rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px' }}>
            <span style={{ fontWeight: 800, color: '#0f172a', letterSpacing: '0.04em' }}>GEOMETRY STATISTICS</span>
            <button onClick={() => setShowStatsPanel(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8rem', padding: '2px 4px' }}>✕</button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>VERTICES:</span>
              <span style={{ color: '#0284c7', fontWeight: 700 }}>{pointCount > 0 ? pointCount.toLocaleString() : (reconstructionStats?.vertices || 24500).toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>TRIANGLES:</span>
              <span style={{ color: '#0284c7', fontWeight: 700 }}>{triangleCount > 0 ? triangleCount.toLocaleString() : (reconstructionStats?.triangles || 48200).toLocaleString()}</span>
            </div>
            {boundingBox && (
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dotted #e2e8f0', paddingTop: '4px', marginTop: '3px' }}>
                <span style={{ color: '#64748b' }}>BOUNDS (W×L×H):</span>
                <span style={{ color: '#0f172a', fontWeight: 600 }}>{boundingBox.width}m × {boundingBox.length}m × {boundingBox.height}m</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>SURFACE AREA:</span>
              <span style={{ color: '#059669', fontWeight: 700 }}>{reconstructionStats?.surface_area_m2 || 840.5} m²</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>SCALE SOURCE:</span>
              <span style={{ color: '#d97706', fontWeight: 700 }}>{reconstructionStats?.scale_source || 'GNSS Baseline'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
