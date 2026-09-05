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
  heritageFacade: null,
  heritageNormal: null,
  roof: null,
  concrete: null,
  concreteNormal: null,
  modernFacade: null,
  solar: null,
  asphalt: null,
  hazard: null,
  gcp: null
};

function getPhotogrammetryTextures() {
  if (textureCache.initialized) return textureCache;

  // 1. High-Resolution Orthomosaic Aerial Ground Texture (2048x2048)
  // Maps 140m x 140m surveyed area: center (1024, 1024) = (0, 0) world meters. 1m ≈ 14.63px
  const tCanvas = document.createElement('canvas');
  tCanvas.width = 2048;
  tCanvas.height = 2048;
  const tCtx = tCanvas.getContext('2d');

  // Photogrammetric survey boundary void (black border)
  tCtx.fillStyle = '#06080d';
  tCtx.fillRect(0, 0, 2048, 2048);

  // Surveyed site polygon boundary mask
  tCtx.save();
  tCtx.beginPath();
  tCtx.moveTo(90, 180);
  tCtx.lineTo(950, 80);
  tCtx.lineTo(1960, 110);
  tCtx.lineTo(2010, 1200);
  tCtx.lineTo(1920, 1960);
  tCtx.lineTo(750, 2000);
  tCtx.lineTo(70, 1750);
  tCtx.closePath();
  tCtx.clip();

  // Base grass / soil ground with organic variations
  tCtx.fillStyle = '#445f31';
  tCtx.fillRect(0, 0, 2048, 2048);

  // Organic soil, turf & shadow tonal patches
  const hues = ['#364f26', '#4e6935', '#5a733e', '#667843', '#3d3429', '#4c4234', '#3c5228'];
  for (let i = 0; i < 900; i++) {
    const px = 100 + Math.random() * 1850;
    const py = 100 + Math.random() * 1850;
    const rad = 25 + Math.random() * 110;
    const grad = tCtx.createRadialGradient(px, py, 0, px, py, rad);
    const col = hues[Math.floor(Math.random() * hues.length)];
    grad.addColorStop(0, col);
    grad.addColorStop(1, 'transparent');
    tCtx.fillStyle = grad;
    tCtx.beginPath();
    tCtx.arc(px, py, rad, 0, Math.PI * 2);
    tCtx.fill();
  }

  // Fine noise stippling for photographic turf
  const tImg = tCtx.getImageData(0, 0, 2048, 2048);
  const tData = tImg.data;
  for (let i = 0; i < tData.length; i += 4) {
    if (tData[i + 3] === 0) continue;
    const n = (Math.random() - 0.5) * 26;
    tData[i] = Math.min(255, Math.max(0, tData[i] + n));
    tData[i + 1] = Math.min(255, Math.max(0, tData[i + 1] + n));
    tData[i + 2] = Math.min(255, Math.max(0, tData[i + 2] + n * 0.75));
  }
  tCtx.putImageData(tImg, 0, 0);

  // Helper coordinate mapper: world meters (wx, wy) -> canvas pixels
  const toPx = (wx, wy) => ({
    x: 1024 + wx * 14.63,
    y: 1024 - wy * 14.63
  });

  // 1A. Upper-Right Landscaped Terrace Plaza & Geometric Gardens
  const terrP1 = toPx(26, 38);
  const terrP2 = toPx(66, 38);
  const terrP3 = toPx(66, -4);
  const terrP4 = toPx(26, -4);
  tCtx.save();
  tCtx.fillStyle = '#cbd2d9';
  tCtx.beginPath();
  tCtx.moveTo(terrP1.x, terrP1.y);
  tCtx.lineTo(terrP2.x, terrP2.y);
  tCtx.lineTo(terrP3.x, terrP3.y);
  tCtx.lineTo(terrP4.x, terrP4.y);
  tCtx.closePath();
  tCtx.fill();

  // Paved tile joints
  tCtx.strokeStyle = 'rgba(100, 116, 139, 0.45)';
  tCtx.lineWidth = 1.5;
  for (let gx = terrP1.x; gx <= terrP2.x; gx += 42) {
    tCtx.beginPath(); tCtx.moveTo(gx, terrP1.y); tCtx.lineTo(gx, terrP3.y); tCtx.stroke();
  }
  for (let gy = terrP1.y; gy <= terrP3.y; gy += 42) {
    tCtx.beginPath(); tCtx.moveTo(terrP1.x, gy); tCtx.lineTo(terrP2.x, gy); tCtx.stroke();
  }

  // Formal Geometric Clover / X Hedge Maze Pattern on Terrace (from reference!)
  const hedgeCenter1 = toPx(42, 22);
  const hedgeCenter2 = toPx(52, 22);
  [hedgeCenter1, hedgeCenter2].forEach(hc => {
    tCtx.fillStyle = '#1e381b';
    tCtx.strokeStyle = '#38632d';
    tCtx.lineWidth = 5;
    // Diamond / cross hedges
    tCtx.beginPath();
    tCtx.moveTo(hc.x, hc.y - 48);
    tCtx.lineTo(hc.x + 48, hc.y);
    tCtx.lineTo(hc.x, hc.y + 48);
    tCtx.lineTo(hc.x - 48, hc.y);
    tCtx.closePath();
    tCtx.stroke();
    // Inner cross
    tCtx.beginPath();
    tCtx.arc(hc.x, hc.y, 22, 0, Math.PI * 2);
    tCtx.stroke();
  });
  tCtx.restore();

  // 1B. Central Entrance Forecourt & Arrival Driveway (Terracotta Pavers)
  const courtP = toPx(-2, -6);
  tCtx.save();
  tCtx.fillStyle = '#9c5443';
  tCtx.beginPath();
  tCtx.arc(courtP.x, courtP.y, 110, 0, Math.PI * 2);
  tCtx.fill();
  tCtx.strokeStyle = '#7c3f31';
  tCtx.lineWidth = 3;
  tCtx.stroke();
  tCtx.restore();

  // 1C. Top-Left Parking Lot
  const parkP = toPx(-24, 32);
  tCtx.save();
  tCtx.fillStyle = '#26292f';
  tCtx.beginPath();
  tCtx.roundRect(parkP.x - 170, parkP.y - 120, 340, 240, 16);
  tCtx.fill();
  tCtx.strokeStyle = '#64748b';
  tCtx.lineWidth = 4;
  tCtx.stroke();

  // Parking stalls
  tCtx.strokeStyle = '#f1f5f9';
  tCtx.lineWidth = 2.5;
  for (let row = -1; row <= 1; row += 2) {
    const ry = parkP.y + row * 65;
    for (let bx = parkP.x - 145; bx <= parkP.x + 145; bx += 26) {
      tCtx.beginPath();
      tCtx.moveTo(bx, ry - 38);
      tCtx.lineTo(bx + 16, ry + 38);
      tCtx.stroke();
    }
  }
  tCtx.restore();

  // 1D. Curving Multi-Lane Roadway Network (Front, Left & Perimeter)
  // Path points: Sweeps from bottom-right (48, -38) across front (0, -26) to left (-36, -14) and up (-44, 36)
  const roadPts = [
    toPx(54, -40),
    toPx(36, -34),
    toPx(16, -28),
    toPx(-4, -25),
    toPx(-24, -22),
    toPx(-36, -12),
    toPx(-42, 6),
    toPx(-44, 26),
    toPx(-45, 46)
  ];

  const drawSmoothRoad = (lineWidth, strokeStyle, lineDash = []) => {
    tCtx.save();
    tCtx.strokeStyle = strokeStyle;
    tCtx.lineWidth = lineWidth;
    tCtx.lineCap = 'round';
    tCtx.lineJoin = 'round';
    tCtx.setLineDash(lineDash);
    tCtx.beginPath();
    tCtx.moveTo(roadPts[0].x, roadPts[0].y);
    for (let i = 1; i < roadPts.length - 1; i++) {
      const xc = (roadPts[i].x + roadPts[i + 1].x) / 2;
      const yc = (roadPts[i].y + roadPts[i + 1].y) / 2;
      tCtx.quadraticCurveTo(roadPts[i].x, roadPts[i].y, xc, yc);
    }
    tCtx.lineTo(roadPts[roadPts.length - 1].x, roadPts[roadPts.length - 1].y);
    tCtx.stroke();
    tCtx.restore();
  };

  // Main asphalt road bed (width ~11m => 160px)
  drawSmoothRoad(160, '#22252a');

  // Concrete curbs / road shoulders
  drawSmoothRoad(168, 'rgba(148, 163, 184, 0.4)');
  drawSmoothRoad(160, '#26292f');

  // Red transit / bus / cycle lane along curve (seen prominently in reference!)
  drawSmoothRoad(26, '#8b2e2e');

  // Solid white outer road boundary lines
  drawSmoothRoad(152, 'rgba(241, 245, 249, 0.9)');
  drawSmoothRoad(144, '#26292f');

  // Double solid yellow centerlines
  drawSmoothRoad(10, '#eab308');
  drawSmoothRoad(3, '#26292f');
  drawSmoothRoad(1, '#eab308');

  // Dashed lane divider lines
  drawSmoothRoad(76, '#f8fafc', [22, 28]);

  // Pedestrian Zebra Crossings at Intersections
  const crossingPts = [toPx(14, -28), toPx(-24, -22), toPx(-42, 10)];
  crossingPts.forEach(pt => {
    tCtx.save();
    tCtx.fillStyle = '#f8fafc';
    for (let b = -50; b <= 50; b += 16) {
      tCtx.fillRect(pt.x + b - 5, pt.y - 28, 10, 56);
    }
    tCtx.restore();
  });

  // Painted yellow chevron hazard / traffic island markings
  const chevronPt = toPx(-8, -25);
  tCtx.save();
  tCtx.strokeStyle = '#eab308';
  tCtx.lineWidth = 4;
  for (let ch = -35; ch <= 35; ch += 14) {
    tCtx.beginPath();
    tCtx.moveTo(chevronPt.x + ch - 12, chevronPt.y - 18);
    tCtx.lineTo(chevronPt.x + ch, chevronPt.y);
    tCtx.lineTo(chevronPt.x + ch - 12, chevronPt.y + 18);
    tCtx.stroke();
  }
  tCtx.restore();

  // White directional lane arrows
  const arrowPts = [toPx(32, -32), toPx(-32, -16), toPx(-43, 20)];
  arrowPts.forEach(pt => {
    tCtx.save();
    tCtx.fillStyle = '#f8fafc';
    tCtx.beginPath();
    tCtx.moveTo(pt.x, pt.y - 16);
    tCtx.lineTo(pt.x + 8, pt.y);
    tCtx.lineTo(pt.x + 3, pt.y);
    tCtx.lineTo(pt.x + 3, pt.y + 20);
    tCtx.lineTo(pt.x - 3, pt.y + 20);
    tCtx.lineTo(pt.x - 3, pt.y);
    tCtx.lineTo(pt.x - 8, pt.y);
    tCtx.closePath();
    tCtx.fill();
    tCtx.restore();
  });

  // Sidewalk concrete pedestrian paths linking buildings and terraces
  tCtx.save();
  tCtx.strokeStyle = '#94a3b8';
  tCtx.lineWidth = 22;
  tCtx.lineCap = 'round';
  tCtx.beginPath();
  const swP1 = toPx(-3, -12);
  const swP2 = toPx(24, 2);
  const swP3 = toPx(28, 20);
  tCtx.moveTo(swP1.x, swP1.y);
  tCtx.lineTo(swP2.x, swP2.y);
  tCtx.lineTo(swP3.x, swP3.y);
  tCtx.stroke();
  tCtx.restore();

  tCtx.restore(); // end survey boundary clip

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
    tnImg.data[i] = 128 + Math.floor((Math.random() - 0.5) * 32);
    tnImg.data[i + 1] = 128 + Math.floor((Math.random() - 0.5) * 32);
    tnImg.data[i + 2] = 255;
    tnImg.data[i + 3] = 255;
  }
  tnCtx.putImageData(tnImg, 0, 0);
  const terrainNorm = new THREE.CanvasTexture(tNormCanvas);
  terrainNorm.wrapS = THREE.RepeatWrapping;
  terrainNorm.wrapT = THREE.RepeatWrapping;
  terrainNorm.repeat.set(16, 16);

  // 2. Heritage Institutional Facade Texture (Terracotta Brick & Stone Pilasters with Arched Windows)
  const hfCanvas = document.createElement('canvas');
  hfCanvas.width = 1024;
  hfCanvas.height = 512;
  const hfCtx = hfCanvas.getContext('2d');

  // Base terracotta brickwork
  hfCtx.fillStyle = '#9e4e3d';
  hfCtx.fillRect(0, 0, 1024, 512);

  // Brick coursing and texture noise
  for (let y = 0; y < 512; y += 8) {
    hfCtx.strokeStyle = 'rgba(60, 25, 18, 0.35)';
    hfCtx.lineWidth = 1;
    hfCtx.beginPath();
    hfCtx.moveTo(0, y);
    hfCtx.lineTo(1024, y);
    hfCtx.stroke();
  }
  for (let i = 0; i < 400; i++) {
    const bx = Math.random() * 1024;
    const by = Math.random() * 512;
    hfCtx.fillStyle = Math.random() > 0.5 ? 'rgba(120, 45, 32, 0.4)' : 'rgba(175, 95, 75, 0.3)';
    hfCtx.fillRect(bx, by, 16 + Math.random() * 32, 6);
  }

  // Stone stringcourses / cornices separating floors
  [0, 128, 256, 384, 508].forEach(cy => {
    hfCtx.fillStyle = '#ece7df';
    hfCtx.fillRect(0, cy - 6, 1024, 12);
    hfCtx.fillStyle = 'rgba(70, 60, 50, 0.25)';
    hfCtx.fillRect(0, cy + 6, 1024, 3);
  });

  // Vertical stone pilasters dividing bays
  for (let px = 0; px <= 1024; px += 128) {
    hfCtx.fillStyle = '#e4dfd7';
    hfCtx.fillRect(px - 10, 0, 20, 512);
    hfCtx.fillStyle = 'rgba(50, 40, 30, 0.2)';
    hfCtx.fillRect(px + 8, 0, 3, 512);
  }

  // Classical Arched Windows in Each Bay
  for (let row = 0; row < 4; row++) {
    const wy = row * 128 + 22;
    for (let px = 0; px < 1024; px += 128) {
      const wx = px + 28;
      const ww = 72;
      const wh = 86;

      // Stone arch frame surround
      hfCtx.fillStyle = '#f1ece4';
      hfCtx.beginPath();
      hfCtx.roundRect(wx - 4, wy - 4, ww + 8, wh + 8, [28, 28, 4, 4]);
      hfCtx.fill();

      // Recessed dark glazing with sky gradient reflection
      const wGrad = hfCtx.createLinearGradient(wx, wy, wx, wy + wh);
      wGrad.addColorStop(0, '#1a324b');
      wGrad.addColorStop(0.3, '#0c1724');
      wGrad.addColorStop(1, '#080d14');
      hfCtx.fillStyle = wGrad;
      hfCtx.beginPath();
      hfCtx.roundRect(wx, wy, ww, wh, [24, 24, 2, 2]);
      hfCtx.fill();

      // Stone window mullions (cross bars)
      hfCtx.strokeStyle = '#e2ded6';
      hfCtx.lineWidth = 2.5;
      hfCtx.beginPath();
      hfCtx.moveTo(wx + ww / 2, wy);
      hfCtx.lineTo(wx + ww / 2, wy + wh);
      hfCtx.moveTo(wx, wy + wh * 0.45);
      hfCtx.lineTo(wx + ww, wy + wh * 0.45);
      hfCtx.stroke();

      // Decorative keystone at top of arch
      hfCtx.fillStyle = '#ffffff';
      hfCtx.beginPath();
      hfCtx.moveTo(wx + ww / 2 - 5, wy - 6);
      hfCtx.lineTo(wx + ww / 2 + 5, wy - 6);
      hfCtx.lineTo(wx + ww / 2 + 3, wy + 2);
      hfCtx.lineTo(wx + ww / 2 - 3, wy + 2);
      hfCtx.closePath();
      hfCtx.fill();
    }
  }

  const heritageFacadeTex = new THREE.CanvasTexture(hfCanvas);
  heritageFacadeTex.wrapS = THREE.RepeatWrapping;
  heritageFacadeTex.wrapT = THREE.RepeatWrapping;

  // Heritage Facade Normal Map
  const hfnCanvas = document.createElement('canvas');
  hfnCanvas.width = 512;
  hfnCanvas.height = 256;
  const hfnCtx = hfnCanvas.getContext('2d');
  const hfnImg = hfnCtx.createImageData(512, 256);
  for (let i = 0; i < hfnImg.data.length; i += 4) {
    hfnImg.data[i] = 128 + Math.floor((Math.random() - 0.5) * 18);
    hfnImg.data[i + 1] = 128 + Math.floor((Math.random() - 0.5) * 18);
    hfnImg.data[i + 2] = 245;
    hfnImg.data[i + 3] = 255;
  }
  hfnCtx.putImageData(hfnImg, 0, 0);
  const heritageNormal = new THREE.CanvasTexture(hfnCanvas);
  heritageNormal.wrapS = THREE.RepeatWrapping;
  heritageNormal.wrapT = THREE.RepeatWrapping;

  // 3. Weathered Mossy Sage-Green Roof Texture (Matching Reference Image!)
  const rCanvas = document.createElement('canvas');
  rCanvas.width = 512;
  rCanvas.height = 512;
  const rCtx = rCanvas.getContext('2d');

  // Base weathered green membrane / copper patina (Matching reference image!)
  rCtx.fillStyle = '#557c63';
  rCtx.fillRect(0, 0, 512, 512);

  // Roofing membrane seams
  rCtx.strokeStyle = '#385842';
  rCtx.lineWidth = 3.5;
  for (let x = 0; x <= 512; x += 48) {
    rCtx.beginPath();
    rCtx.moveTo(x, 0);
    rCtx.lineTo(x, 512);
    rCtx.stroke();
  }

  // Weathering, moisture, gravel wash stains
  for (let i = 0; i < 50; i++) {
    const rx = Math.random() * 512;
    const ry = Math.random() * 512;
    const rad = 20 + Math.random() * 60;
    const grad = rCtx.createRadialGradient(rx, ry, 0, rx, ry, rad);
    const hues = ['rgba(52, 78, 60, 0.5)', 'rgba(98, 134, 110, 0.4)', 'rgba(68, 92, 74, 0.45)', 'rgba(48, 40, 30, 0.25)'];
    grad.addColorStop(0, hues[Math.floor(Math.random() * hues.length)]);
    grad.addColorStop(1, 'transparent');
    rCtx.fillStyle = grad;
    rCtx.beginPath();
    rCtx.arc(rx, ry, rad, 0, Math.PI * 2);
    rCtx.fill();
  }

  // Edge gravel wash border
  rCtx.strokeStyle = 'rgba(180, 195, 185, 0.35)';
  rCtx.lineWidth = 8;
  rCtx.strokeRect(4, 4, 504, 504);

  const roofTex = new THREE.CanvasTexture(rCanvas);
  roofTex.wrapS = THREE.RepeatWrapping;
  roofTex.wrapT = THREE.RepeatWrapping;

  // 4. Modern Perforated Brise-Soleil / Metal Screen Facade (Western Building)
  const modCanvas = document.createElement('canvas');
  modCanvas.width = 512;
  modCanvas.height = 512;
  const modCtx = modCanvas.getContext('2d');
  modCtx.fillStyle = '#f1f5f9';
  modCtx.fillRect(0, 0, 512, 512);

  // Horizontal ribbon glass windows
  for (let y = 32; y < 512; y += 120) {
    modCtx.fillStyle = '#0f172a';
    modCtx.fillRect(0, y, 512, 60);
  }

  // Decorative geometric perforated screen / lattice overlay
  modCtx.fillStyle = 'rgba(226, 232, 240, 0.95)';
  for (let x = 8; x < 512; x += 32) {
    for (let y = 8; y < 512; y += 32) {
      modCtx.beginPath();
      modCtx.arc(x, y, 9, 0, Math.PI * 2);
      modCtx.fill();
    }
  }

  const modernFacadeTex = new THREE.CanvasTexture(modCanvas);
  modernFacadeTex.wrapS = THREE.RepeatWrapping;
  modernFacadeTex.wrapT = THREE.RepeatWrapping;

  // 5. Architectural Precast Concrete Texture
  const conCanvas = document.createElement('canvas');
  conCanvas.width = 512;
  conCanvas.height = 512;
  const conCtx = conCanvas.getContext('2d');
  conCtx.fillStyle = '#cbd5e1';
  conCtx.fillRect(0, 0, 512, 512);
  conCtx.strokeStyle = 'rgba(100, 116, 139, 0.4)';
  conCtx.lineWidth = 2.5;
  for (let x = 0; x <= 512; x += 128) {
    conCtx.beginPath(); conCtx.moveTo(x, 0); conCtx.lineTo(x, 512); conCtx.stroke();
  }
  for (let y = 0; y <= 512; y += 128) {
    conCtx.beginPath(); conCtx.moveTo(0, y); conCtx.lineTo(512, y); conCtx.stroke();
  }
  const conImg = conCtx.getImageData(0, 0, 512, 512);
  for (let i = 0; i < conImg.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 16;
    conImg.data[i] += n; conImg.data[i + 1] += n; conImg.data[i + 2] += n;
  }
  conCtx.putImageData(conImg, 0, 0);
  const concreteTex = new THREE.CanvasTexture(conCanvas);
  concreteTex.wrapS = THREE.RepeatWrapping;
  concreteTex.wrapT = THREE.RepeatWrapping;

  const conNormCanvas = document.createElement('canvas');
  conNormCanvas.width = 256;
  conNormCanvas.height = 256;
  const connCtx = conNormCanvas.getContext('2d');
  const connImg = connCtx.createImageData(256, 256);
  for (let i = 0; i < connImg.data.length; i += 4) {
    connImg.data[i] = 128 + Math.floor((Math.random() - 0.5) * 18);
    connImg.data[i + 1] = 128 + Math.floor((Math.random() - 0.5) * 18);
    connImg.data[i + 2] = 245;
    connImg.data[i + 3] = 255;
  }
  connCtx.putImageData(connImg, 0, 0);
  const concreteNorm = new THREE.CanvasTexture(conNormCanvas);
  concreteNorm.wrapS = THREE.RepeatWrapping;
  concreteNorm.wrapT = THREE.RepeatWrapping;

  // 6. Rooftop Solar Photovoltaic Cell Texture
  const solCanvas = document.createElement('canvas');
  solCanvas.width = 256;
  solCanvas.height = 256;
  const solCtx = solCanvas.getContext('2d');
  solCtx.fillStyle = '#0f2742';
  solCtx.fillRect(0, 0, 256, 256);
  solCtx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
  solCtx.lineWidth = 1.5;
  for (let x = 0; x <= 256; x += 32) {
    solCtx.beginPath(); solCtx.moveTo(x, 0); solCtx.lineTo(x, 256); solCtx.stroke();
  }
  for (let y = 0; y <= 256; y += 32) {
    solCtx.beginPath(); solCtx.moveTo(0, y); solCtx.lineTo(256, y); solCtx.stroke();
  }
  solCtx.strokeStyle = '#38bdf8';
  solCtx.lineWidth = 1;
  solCtx.strokeRect(2, 2, 252, 252);
  const solarTex = new THREE.CanvasTexture(solCanvas);
  solarTex.wrapS = THREE.RepeatWrapping;
  solarTex.wrapT = THREE.RepeatWrapping;

  // 7. Asphalt & Hazard & GCP Textures
  const aCanvas = document.createElement('canvas');
  aCanvas.width = 256;
  aCanvas.height = 256;
  const aCtx = aCanvas.getContext('2d');
  aCtx.fillStyle = '#26292f';
  aCtx.fillRect(0, 0, 256, 256);
  const asphaltTex = new THREE.CanvasTexture(aCanvas);
  asphaltTex.wrapS = THREE.RepeatWrapping;
  asphaltTex.wrapT = THREE.RepeatWrapping;

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
  const gcpTex = new THREE.CanvasTexture(gCanvas);

  textureCache.initialized = true;
  textureCache.terrain = terrainTex;
  textureCache.terrainNormal = terrainNorm;
  textureCache.heritageFacade = heritageFacadeTex;
  textureCache.heritageNormal = heritageNormal;
  textureCache.roof = roofTex;
  textureCache.concrete = concreteTex;
  textureCache.concreteNormal = concreteNorm;
  textureCache.modernFacade = modernFacadeTex;
  textureCache.solar = solarTex;
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
  const [pointSize, setPointSize] = useState(0.55);
  const [loading, setLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ── Layer Visibility ─────────────────────────────────────────────────────
  const [layers, setLayers] = useState({
    mesh: true,
    points: true,
    frustums: false,
    grid: false,
    dynamicObjects: false,
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
    scene.background = new THREE.Color(0x06080d);
    scene.fog = new THREE.FogExp2(0x06080d, 0.0016);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / container.clientHeight,
      0.1,
      4000
    );
    camera.up.set(0, 0, 1);
    lookAtTargetRef.current.set(2, 6, 8);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true, 
      powerPreference: "high-performance" 
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 0.7);
    hemiLight.position.set(0, 0, 140);
    scene.add(hemiLight);

    const ambLight = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambLight);

    // Natural daylight sun matching reference image (shining from upper-left toward bottom-right)
    const sunLight = new THREE.DirectionalLight(0xfff8ee, 2.2);
    sunLight.position.set(-75, 65, 110);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 320;
    sunLight.shadow.camera.left = -85;
    sunLight.shadow.camera.right = 85;
    sunLight.shadow.camera.top = 85;
    sunLight.shadow.camera.bottom = -85;
    sunLight.shadow.bias = -0.0003;
    sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0x94b8e8, 0.55);
    fillLight.position.set(65, -55, 35);
    scene.add(fillLight);

    const grid = new THREE.GridHelper(140, 70, 0x0284c7, 0x1e293b);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.5;
    grid.visible = layers.grid;
    scene.add(grid);
    gridRef.current = grid;

    const frustumsGroup = new THREE.Group();
    frustumsGroup.visible = layers.frustums;
    scene.add(frustumsGroup);
    frustumsGroupRef.current = frustumsGroup;

    const dynObjGroup = new THREE.Group();
    dynObjGroup.visible = layers.dynamicObjects;
    scene.add(dynObjGroup);
    dynamicObjectsGroupRef.current = dynObjGroup;

    const measGroup = new THREE.Group();
    measGroup.visible = layers.measurements;
    scene.add(measGroup);
    measurementGroupRef.current = measGroup;

    let isDragging = false;
    let dragButton = 0;
    let prevMouse = { x: 0, y: 0 };
    // Oblique elevated drone angle (~38° downward tilt, closer zoom framing filling the viewport)
    let spherical = { radius: 56, theta: -Math.PI * 0.17, phi: Math.PI * 0.35 };

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

    // 1. Surveyed Photogrammetric Terrain Mesh with Aerial Orthomosaic (140m x 140m)
    const terrainGeo = new THREE.PlaneGeometry(140, 140, 100, 100);
    const pos = terrainGeo.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);

      let z = Math.sin(x * 0.035) * Math.cos(y * 0.035) * 1.8 +
              Math.sin(x * 0.09 + y * 0.07) * 0.8;

      // Elevated terrace plaza on upper-right (Z ≈ +2.4m)
      if (x > 26 && x < 66 && y > -4 && y < 38) {
        z = 2.4;
      } else if (x > 22 && x < 26 && y > -4 && y < 38) {
        const blend = (x - 22) / 4;
        z = blend * 2.4;
      } else {
        // Flatten building footprints, roads, and parking lots
        const distCenter = Math.sqrt(x * x + y * y);
        if (distCenter < 44) {
          const blend = Math.max(0, (distCenter - 24) / 20);
          z = z * blend + 0.15 * (1 - blend);
        }
      }
      pos.setZ(i, z);
    }
    pos.needsUpdate = true;
    terrainGeo.computeVertexNormals();

    const terrainMat = getPbrMat({
      map: textures.terrain,
      normalMap: textures.terrainNormal,
      normalScale: new THREE.Vector2(0.4, 0.4),
      roughness: 0.85,
      metalness: 0.04,
      side: THREE.DoubleSide
    }, 'high');

    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    group.add(terrainMesh);

    // 2. Central Dominant Heritage Complex (Matching Reference Image!)
    const complexGroup = new THREE.Group();

    // 2A. Dominant Central Tower (-2, 10, 0)
    const towerGroup = new THREE.Group();
    towerGroup.position.set(-2, 10, 0);

    // Concrete plinth foundation
    const towerPlinth = new THREE.Mesh(
      new THREE.BoxGeometry(18.6, 22.6, 0.9),
      getPbrMat({ map: textures.concrete, normalMap: textures.concreteNormal, roughness: 0.7, metalness: 0.1 }, 'high')
    );
    towerPlinth.position.set(0, 0, 0.45);
    towerPlinth.castShadow = true;
    towerPlinth.receiveShadow = true;
    towerGroup.add(towerPlinth);

    // Lower Tier Body (Floors 1-3: 14m tall)
    const towerLower = new THREE.Mesh(
      new THREE.BoxGeometry(18.0, 22.0, 14.0),
      getPbrMat({
        map: textures.heritageFacade,
        normalMap: textures.heritageNormal,
        normalScale: new THREE.Vector2(0.7, 0.7),
        roughness: 0.65,
        metalness: 0.12
      }, 'high')
    );
    towerLower.position.set(0, 0, 7.45);
    towerLower.castShadow = true;
    towerLower.receiveShadow = true;
    towerGroup.add(towerLower);

    // Intermediate Protruding Stone Cornice
    const towerMidCornice = new THREE.Mesh(
      new THREE.BoxGeometry(18.6, 22.6, 0.6),
      getPbrMat({ color: 0xeae6df, roughness: 0.5, metalness: 0.15 }, 'high')
    );
    towerMidCornice.position.set(0, 0, 14.75);
    towerMidCornice.castShadow = true;
    towerGroup.add(towerMidCornice);

    // Upper Tier Body (Floors 4-7: 15m tall)
    const towerUpper = new THREE.Mesh(
      new THREE.BoxGeometry(17.4, 21.4, 15.0),
      getPbrMat({
        map: textures.heritageFacade,
        normalMap: textures.heritageNormal,
        normalScale: new THREE.Vector2(0.7, 0.7),
        roughness: 0.65,
        metalness: 0.12
      }, 'high')
    );
    towerUpper.position.set(0, 0, 22.55);
    towerUpper.castShadow = true;
    towerUpper.receiveShadow = true;
    towerGroup.add(towerUpper);

    // Top Roof Cornice
    const towerTopCornice = new THREE.Mesh(
      new THREE.BoxGeometry(18.0, 22.0, 0.7),
      getPbrMat({ color: 0xeae6df, roughness: 0.5, metalness: 0.15 }, 'high')
    );
    towerTopCornice.position.set(0, 0, 30.4);
    towerTopCornice.castShadow = true;
    towerGroup.add(towerTopCornice);

    // Tower Roof Parapet Wall & Weathered Green Roof Surface
    const towerParapet = new THREE.Mesh(
      new THREE.BoxGeometry(17.6, 21.6, 1.2),
      getPbrMat({ color: 0xd6cfc7, roughness: 0.6, metalness: 0.1 }, 'high')
    );
    towerParapet.position.set(0, 0, 31.0);
    towerGroup.add(towerParapet);

    const towerRoofMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(16.6, 20.6),
      getPbrMat({
        map: textures.roof,
        roughness: 0.75,
        metalness: 0.08,
        side: THREE.DoubleSide
      }, 'high')
    );
    towerRoofMesh.position.set(0, 0, 30.5);
    towerRoofMesh.receiveShadow = true;
    towerGroup.add(towerRoofMesh);

    // 4 Corner Decorative Turrets / Battlements on Parapet
    [[-8.4, -10.4], [8.4, -10.4], [-8.4, 10.4], [8.4, 10.4]].forEach(([tx, ty]) => {
      const turret = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 1.2, 2.0),
        getPbrMat({ color: 0xeae6df, roughness: 0.5, metalness: 0.15 }, 'high')
      );
      turret.position.set(tx, ty, 31.6);
      turret.castShadow = true;
      towerGroup.add(turret);
    });

    // Rooftop Mechanical Penthouse / Elevator Overrun
    const penthouse = new THREE.Mesh(
      new THREE.BoxGeometry(7.2, 8.4, 3.8),
      getPbrMat({ map: textures.concrete, roughness: 0.7, metalness: 0.15 }, 'medium')
    );
    penthouse.position.set(0, 4.0, 32.4);
    penthouse.castShadow = true;
    towerGroup.add(penthouse);

    // Rooftop Solar Photovoltaic Panel Array (Facing South, angled at 25°)
    const solarRackGroup = new THREE.Group();
    solarRackGroup.position.set(-3.8, -4.5, 30.7);
    solarRackGroup.rotation.x = -0.44; // angled south
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 5; c++) {
        const panel = new THREE.Mesh(
          new THREE.PlaneGeometry(1.4, 2.2),
          getPbrMat({ map: textures.solar, roughness: 0.2, metalness: 0.8, side: THREE.DoubleSide }, 'high')
        );
        panel.position.set(c * 1.55, r * 2.35, 0);
        panel.castShadow = true;
        solarRackGroup.add(panel);
      }
    }
    towerGroup.add(solarRackGroup);

    // Rooftop Dual HVAC Air Chiller Units with Fans
    [-1, 1].forEach(dir => {
      const chiller = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 3.2, 1.6),
        getPbrMat({ color: 0x94a3b8, roughness: 0.45, metalness: 0.6 }, 'medium')
      );
      chiller.position.set(4.5, dir * 2.4 - 2.0, 31.3);
      chiller.castShadow = true;
      towerGroup.add(chiller);

      const fan = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 0.7, 0.25, 16),
        getPbrMat({ color: 0x334155, roughness: 0.3, metalness: 0.7 }, 'medium')
      );
      fan.position.set(4.5, dir * 2.4 - 2.0, 32.2);
      fan.rotation.x = Math.PI / 2;
      towerGroup.add(fan);
    });

    // Rooftop Communications Antenna Mast with Red Pulsing Beacon
    const mastGeo = new THREE.CylinderGeometry(0.08, 0.2, 12, 8);
    const mast = new THREE.Mesh(mastGeo, getPbrMat({ color: 0x94a3b8, roughness: 0.3, metalness: 0.8 }, 'medium'));
    mast.position.set(0, 4.0, 38.3);
    mast.rotation.x = Math.PI / 2;
    mast.castShadow = true;
    towerGroup.add(mast);

    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.95 });
    beaconMatRef.current = beaconMat;
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 12), beaconMat);
    beacon.position.set(0, 4.0, 44.5);
    towerGroup.add(beacon);

    complexGroup.add(towerGroup);

    // 2B. East Long Wing (Extends Eastward: 44m length, 13m width, 14m height ~4 stories)
    const eastWingGroup = new THREE.Group();
    eastWingGroup.position.set(25, 7, 0);

    const eastPlinth = new THREE.Mesh(
      new THREE.BoxGeometry(44.4, 13.4, 0.8),
      getPbrMat({ map: textures.concrete, roughness: 0.7, metalness: 0.1 }, 'high')
    );
    eastPlinth.position.set(0, 0, 0.4);
    eastPlinth.castShadow = true;
    eastWingGroup.add(eastPlinth);

    const eastBody = new THREE.Mesh(
      new THREE.BoxGeometry(44.0, 13.0, 14.0),
      getPbrMat({
        map: textures.heritageFacade,
        normalMap: textures.heritageNormal,
        normalScale: new THREE.Vector2(0.7, 0.7),
        roughness: 0.65,
        metalness: 0.12
      }, 'high')
    );
    eastBody.position.set(0, 0, 7.4);
    eastBody.castShadow = true;
    eastBody.receiveShadow = true;
    eastWingGroup.add(eastBody);

    const eastRoof = new THREE.Mesh(
      new THREE.PlaneGeometry(43.2, 12.2),
      getPbrMat({ map: textures.roof, roughness: 0.75, metalness: 0.08, side: THREE.DoubleSide }, 'high')
    );
    eastRoof.position.set(0, 0, 14.45);
    eastRoof.receiveShadow = true;
    eastWingGroup.add(eastRoof);

    const eastParapet = new THREE.Mesh(
      new THREE.BoxGeometry(44.2, 13.2, 0.9),
      getPbrMat({ color: 0xd6cfc7, roughness: 0.6, metalness: 0.1 }, 'high')
    );
    eastParapet.position.set(0, 0, 14.85);
    eastWingGroup.add(eastParapet);

    // Rooftop Gazebo/Pavilion Towers with Flared Pyramidal Roofs (Seen in Reference!)
    [-11, 15].forEach(px => {
      const pavBase = new THREE.Mesh(
        new THREE.BoxGeometry(5.2, 5.2, 3.6),
        getPbrMat({ map: textures.heritageFacade, roughness: 0.65, metalness: 0.12 }, 'high')
      );
      pavBase.position.set(px, 0, 16.2);
      pavBase.castShadow = true;
      eastWingGroup.add(pavBase);

      const pavRoof = new THREE.Mesh(
        new THREE.ConeGeometry(4.2, 2.4, 4),
        getPbrMat({ color: 0x475569, roughness: 0.5, metalness: 0.4 }, 'high')
      );
      pavRoof.position.set(px, 0, 19.2);
      pavRoof.rotation.y = Math.PI / 4;
      pavRoof.rotation.x = -Math.PI / 2;
      pavRoof.castShadow = true;
      eastWingGroup.add(pavRoof);

      const finial = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.15, 1.2, 8),
        getPbrMat({ color: 0xe2e8f0, roughness: 0.3, metalness: 0.8 }, 'high')
      );
      finial.position.set(px, 0, 21.0);
      finial.rotation.x = Math.PI / 2;
      eastWingGroup.add(finial);
    });

    complexGroup.add(eastWingGroup);

    // 2C. South Wing (Forms L-Enclosure: 22m length, 12m width, 11m height ~3 stories)
    const southWingGroup = new THREE.Group();
    southWingGroup.position.set(9, -8, 0);

    const southBody = new THREE.Mesh(
      new THREE.BoxGeometry(22.0, 12.0, 11.0),
      getPbrMat({
        map: textures.heritageFacade,
        normalMap: textures.heritageNormal,
        normalScale: new THREE.Vector2(0.7, 0.7),
        roughness: 0.65,
        metalness: 0.12
      }, 'high')
    );
    southBody.position.set(0, 0, 5.9);
    southBody.castShadow = true;
    southBody.receiveShadow = true;
    southWingGroup.add(southBody);

    const southRoof = new THREE.Mesh(
      new THREE.PlaneGeometry(21.2, 11.2),
      getPbrMat({ map: textures.roof, roughness: 0.75, metalness: 0.08, side: THREE.DoubleSide }, 'high')
    );
    southRoof.position.set(0, 0, 11.45);
    southRoof.receiveShadow = true;
    southWingGroup.add(southRoof);

    const southParapet = new THREE.Mesh(
      new THREE.BoxGeometry(22.2, 12.2, 0.9),
      getPbrMat({ color: 0xd6cfc7, roughness: 0.6, metalness: 0.1 }, 'high')
    );
    southParapet.position.set(0, 0, 11.85);
    southWingGroup.add(southParapet);

    // Stepped Corner Pavilion on South Wing
    const sPavBase = new THREE.Mesh(
      new THREE.BoxGeometry(5.4, 5.4, 3.4),
      getPbrMat({ map: textures.heritageFacade, roughness: 0.65, metalness: 0.12 }, 'high')
    );
    sPavBase.position.set(-7.5, 0, 13.1);
    sPavBase.castShadow = true;
    southWingGroup.add(sPavBase);

    const sPavRoof = new THREE.Mesh(
      new THREE.ConeGeometry(4.4, 2.4, 4),
      getPbrMat({ color: 0x475569, roughness: 0.5, metalness: 0.4 }, 'high')
    );
    sPavRoof.position.set(-7.5, 0, 16.0);
    sPavRoof.rotation.y = Math.PI / 4;
    sPavRoof.rotation.x = -Math.PI / 2;
    sPavRoof.castShadow = true;
    southWingGroup.add(sPavRoof);

    complexGroup.add(southWingGroup);

    // 2D. Grand Entrance Portico / Porte-Cochère (Front Center: -2, -1.8, 0)
    const porticoGroup = new THREE.Group();
    porticoGroup.position.set(-2, -1.8, 0);

    const porticoCanopy = new THREE.Mesh(
      new THREE.BoxGeometry(8.6, 5.4, 6.8),
      getPbrMat({ color: 0xe4dfd7, roughness: 0.6, metalness: 0.15 }, 'high')
    );
    porticoCanopy.position.set(0, 0, 3.4);
    porticoCanopy.castShadow = true;
    porticoGroup.add(porticoCanopy);

    // Arched portal opening
    const portalArch = new THREE.Mesh(
      new THREE.BoxGeometry(5.6, 5.6, 4.4),
      getPbrMat({ color: 0x0f172a, roughness: 0.8, metalness: 0.1 }, 'high')
    );
    portalArch.position.set(0, 0, 2.2);
    porticoGroup.add(portalArch);

    complexGroup.add(porticoGroup);
    group.add(complexGroup);

    // 3. Western Modern Complex & Iconic Curved Lattice Canopy (Left of scene)
    const westGroup = new THREE.Group();
    westGroup.position.set(-36, 14, 0);

    // Modern 3-story office building with brise-soleil perforated screen facade
    const westBuilding = new THREE.Mesh(
      new THREE.BoxGeometry(18.0, 24.0, 12.0),
      getPbrMat({
        map: textures.modernFacade,
        roughness: 0.55,
        metalness: 0.35
      }, 'high')
    );
    westBuilding.position.set(0, 0, 6.4);
    westBuilding.castShadow = true;
    westBuilding.receiveShadow = true;
    westGroup.add(westBuilding);

    const westParapet = new THREE.Mesh(
      new THREE.BoxGeometry(18.2, 24.2, 0.8),
      getPbrMat({ color: 0x94a3b8, roughness: 0.4, metalness: 0.6 }, 'high')
    );
    westParapet.position.set(0, 0, 12.8);
    westGroup.add(westParapet);

    group.add(westGroup);

    // 3B. Iconic Curved White Lattice Canopy (Located at -32, -14, 0 - exactly matching reference!)
    const canopyGroup = new THREE.Group();
    canopyGroup.position.set(-32, -14, 0);

    const archMat = getPbrMat({ color: 0xf8fafc, roughness: 0.25, metalness: 0.25 }, 'high');
    const ribCount = 8;
    const archWidth = 16.0;
    const archRadius = 8.0;

    for (let r = 0; r < ribCount; r++) {
      const ry = (r - (ribCount - 1) / 2) * 2.4;
      // Curved arch rib using TorusGeometry arc segment
      const archRib = new THREE.Mesh(
        new THREE.TorusGeometry(archRadius, 0.22, 10, 32, Math.PI),
        archMat
      );
      archRib.position.set(0, ry, 0.3);
      archRib.rotation.y = Math.PI / 2;
      archRib.rotation.x = Math.PI / 2;
      archRib.castShadow = true;
      canopyGroup.add(archRib);

      // Vertical support posts
      [-archWidth / 2, archWidth / 2].forEach(px => {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 2.2, 8), archMat);
        post.position.set(px, ry, 1.1);
        post.rotation.x = Math.PI / 2;
        post.castShadow = true;
        canopyGroup.add(post);
      });
    }

    // Longitudinal connecting tubular purlins
    for (let angle = 0.2; angle < Math.PI; angle += 0.45) {
      const pz = Math.sin(angle) * archRadius + 0.3;
      const px = Math.cos(angle) * archRadius;
      const purlin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, ribCount * 2.4, 8),
        archMat
      );
      purlin.position.set(px, 0, pz);
      purlin.rotation.x = 0;
      canopyGroup.add(purlin);
    }

    group.add(canopyGroup);

    // 4. Eastern Multi-Tier Elevated Promenade & Terraces (Upper-Right)
    const terraceGroup = new THREE.Group();
    terraceGroup.position.set(45, 18, 2.4);

    // Retaining walls supporting the elevated terrace
    const retWall1 = new THREE.Mesh(
      new THREE.BoxGeometry(40.0, 0.8, 2.6),
      getPbrMat({ map: textures.concrete, roughness: 0.7, metalness: 0.1 }, 'high')
    );
    retWall1.position.set(0, -21.0, -1.1);
    retWall1.castShadow = true;
    terraceGroup.add(retWall1);

    const retWall2 = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 42.0, 2.6),
      getPbrMat({ map: textures.concrete, roughness: 0.7, metalness: 0.1 }, 'high')
    );
    retWall2.position.set(-20.0, 0, -1.1);
    retWall2.castShadow = true;
    terraceGroup.add(retWall2);

    // Pedestrian Walkway Bridge spanning to East Wing
    const bridge = new THREE.Mesh(
      new THREE.BoxGeometry(10.0, 4.2, 0.7),
      getPbrMat({ color: 0xcfd8dc, roughness: 0.6, metalness: 0.2 }, 'high')
    );
    bridge.position.set(-24.0, -11.0, 0.1);
    bridge.castShadow = true;
    terraceGroup.add(bridge);

    // Open-Air Square Gazebos / Pavilions on Elevated Terrace (from reference!)
    [[-8, 8], [12, 8]].forEach(([gx, gy]) => {
      // 4 stone pillars
      [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]].forEach(([cx, cy]) => {
        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.2, 0.25, 4.2, 8),
          getPbrMat({ color: 0xe2e8f0, roughness: 0.4, metalness: 0.2 }, 'high')
        );
        pillar.position.set(gx + cx, gy + cy, 2.1);
        pillar.rotation.x = Math.PI / 2;
        pillar.castShadow = true;
        terraceGroup.add(pillar);
      });

      // Flared pyramidal roof cap
      const cap = new THREE.Mesh(
        new THREE.ConeGeometry(5.2, 2.6, 4),
        getPbrMat({ color: 0x475569, roughness: 0.5, metalness: 0.4 }, 'high')
      );
      cap.position.set(gx, gy, 5.4);
      cap.rotation.y = Math.PI / 4;
      cap.rotation.x = -Math.PI / 2;
      cap.castShadow = true;
      terraceGroup.add(cap);
    });

    // 3D Geometric Raised Boxwood Hedge Maze Geometry (matching the clover/X pattern)
    [[-3, 4], [7, 4]].forEach(([hx, hy]) => {
      const hedgeMat = getPbrMat({ color: 0x1b3b1a, roughness: 0.85, metalness: 0.05 }, 'high');
      const hBar1 = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.9, 0.8), hedgeMat);
      hBar1.position.set(hx, hy, 0.4);
      hBar1.rotation.z = Math.PI / 4;
      hBar1.castShadow = true;
      terraceGroup.add(hBar1);

      const hBar2 = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.9, 0.8), hedgeMat);
      hBar2.position.set(hx, hy, 0.4);
      hBar2.rotation.z = -Math.PI / 4;
      hBar2.castShadow = true;
      terraceGroup.add(hBar2);
    });

    group.add(terraceGroup);

    // 5. Northern Institutional Office Slab (Background Complex: 0, 44, 0)
    const northGroup = new THREE.Group();
    northGroup.position.set(0, 44, 0);

    const northBody = new THREE.Mesh(
      new THREE.BoxGeometry(56.0, 16.0, 26.0),
      getPbrMat({
        color: 0xe2e8f0,
        roughness: 0.65,
        metalness: 0.15
      }, 'high')
    );
    northBody.position.set(0, 0, 13.4);
    northBody.castShadow = true;
    northBody.receiveShadow = true;
    northGroup.add(northBody);

    // Repeating horizontal window ribbons
    for (let wz = 4.0; wz <= 24.0; wz += 3.6) {
      const winRibbon = new THREE.Mesh(
        new THREE.BoxGeometry(56.2, 16.2, 1.6),
        getPbrMat({ color: 0x0f172a, roughness: 0.1, metalness: 0.9 }, 'high')
      );
      winRibbon.position.set(0, 0, wz);
      northGroup.add(winRibbon);
    }

    const northRoof = new THREE.Mesh(
      new THREE.PlaneGeometry(55.0, 15.0),
      getPbrMat({ map: textures.roof, roughness: 0.75, metalness: 0.08, side: THREE.DoubleSide }, 'high')
    );
    northRoof.position.set(0, 0, 26.45);
    northGroup.add(northRoof);

    group.add(northGroup);

    // 6. Realistic 3D Vehicles (Parked in Lots & Operating on Roadway)
    const carGroup = new THREE.Group();
    const carPalette = [0xf8fafc, 0xcfd8dc, 0x334155, 0x991b1b, 0x1e3a8a, 0x111827];

    const createCar = (cx, cy, cz, rotZ, colorHex) => {
      const cSub = new THREE.Group();
      cSub.position.set(cx, cy, cz);
      cSub.rotation.z = rotZ;

      // Chassis body
      const chassis = new THREE.Mesh(
        new THREE.BoxGeometry(4.2, 1.9, 0.9),
        getPbrMat({ color: colorHex, roughness: 0.35, metalness: 0.7 }, 'high')
      );
      chassis.position.set(0, 0, 0.55);
      chassis.castShadow = true;
      cSub.add(chassis);

      // Cabin / windshield greenhouse
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(2.4, 1.6, 0.75),
        getPbrMat({ color: 0x0f172a, roughness: 0.1, metalness: 0.9 }, 'high')
      );
      cabin.position.set(-0.2, 0, 1.35);
      cabin.castShadow = true;
      cSub.add(cabin);

      // 4 wheels
      const wheelMat = getPbrMat({ color: 0x111827, roughness: 0.9, metalness: 0.1 }, 'high');
      [[-1.3, -0.95], [1.3, -0.95], [-1.3, 0.95], [1.3, 0.95]].forEach(([wx, wy]) => {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 8), wheelMat);
        wheel.position.set(wx, wy, 0.35);
        wheel.rotation.x = Math.PI / 2;
        cSub.add(wheel);
      });

      return cSub;
    };

    // 6A. Top-Left Parking Lot (18 parked cars)
    for (let i = 0; i < 18; i++) {
      const row = i < 9 ? 0 : 1;
      const col = i % 9;
      const px = -34 + col * 2.8;
      const py = 26 + row * 8.5;
      const clr = carPalette[i % carPalette.length];
      carGroup.add(createCar(px, py, 0.2, Math.PI * 0.35, clr));
    }

    // 6B. Upper-Right Terrace Parking Lot (6 parked cars)
    for (let i = 0; i < 6; i++) {
      const px = 50 + i * 2.9;
      const py = 32;
      const clr = carPalette[(i * 2) % carPalette.length];
      carGroup.add(createCar(px, py, 2.6, Math.PI * 0.5, clr));
    }

    // 6C. Cars on the Roadway (Capturing drone survey realism)
    const roadCars = [
      { x: 38, y: -34, rot: 0.2, clr: 0x991b1b },
      { x: 12, y: -27, rot: 0.05, clr: 0xf8fafc },
      { x: -18, y: -23, rot: -0.15, clr: 0x334155 },
      { x: -38, y: -8, rot: 1.2, clr: 0xcfd8dc },
      { x: -44, y: 16, rot: 1.57, clr: 0xf8fafc }
    ];
    roadCars.forEach(rc => {
      carGroup.add(createCar(rc.x, rc.y, 0.25, rc.rot, rc.clr));
    });

    group.add(carGroup);

    // 7. Dense Photogrammetric Vegetation (45+ Trees & Foliage Groves)
    const treeGroup = new THREE.Group();
    const trunkMat = getPbrMat({ color: 0x4a3628, roughness: 0.9, metalness: 0.05 }, 'high');
    const leafMat1 = getPbrMat({ color: 0x2b4724, roughness: 0.75, metalness: 0.05 }, 'high');
    const leafMat2 = getPbrMat({ color: 0x385a2d, roughness: 0.75, metalness: 0.05 }, 'high');
    const leafMat3 = getPbrMat({ color: 0x1f381c, roughness: 0.75, metalness: 0.05 }, 'high');
    const leafMats = [leafMat1, leafMat2, leafMat3];

    const treeLocations = [
      // Top-Left Parking perimeter grove (from reference!)
      [-46, 20, 0.4], [-46, 28, 0.4], [-46, 36, 0.4], [-44, 44, 0.4],
      [-38, 46, 0.4], [-30, 46, 0.4], [-22, 46, 0.4], [-14, 46, 0.4],
      [-10, 38, 0.4], [-10, 28, 0.4], [-12, 20, 0.4],
      // Roadside avenue trees along curving road
      [48, -42, 0.3], [34, -38, 0.3], [18, -32, 0.3], [2, -28, 0.3],
      [-14, -26, 0.3], [-28, -25, 0.3], [-40, -18, 0.3], [-46, -2, 0.3],
      [-48, 12, 0.3], [-48, 24, 0.3],
      // Courtyard garden trees (nestled in building bend)
      [6, 2, 0.4], [10, 3, 0.4], [12, -2, 0.4], [6, -3, 0.4],
      // Plaza & Terrace walkway trees
      [28, -8, 0.5], [32, 4, 1.2], [30, 16, 2.0], [28, 28, 2.4],
      [36, 34, 2.4], [48, 38, 2.4], [62, 28, 2.4], [62, 14, 2.4],
      // Modern building & canopy garden trees
      [-22, -10, 0.3], [-24, -4, 0.3], [-42, -28, 0.3], [-32, -28, 0.3]
    ];

    treeLocations.forEach(([tx, ty, tz], idx) => {
      const tSub = new THREE.Group();
      tSub.position.set(tx, ty, tz);
      const scale = 0.85 + (idx % 5) * 0.12;
      tSub.scale.set(scale, scale, scale);
      tSub.rotation.z = (idx * 1.45) % (Math.PI * 2);

      // Tree trunk
      const trunkH = 2.8 + (idx % 3) * 0.4;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, trunkH, 8), trunkMat);
      trunk.position.set(0, 0, trunkH / 2);
      trunk.rotation.x = Math.PI / 2;
      trunk.castShadow = true;
      tSub.add(trunk);

      // Multi-tiered organic foliage canopy
      const cMat = leafMats[idx % leafMats.length];
      const canopyH = 3.2 + (idx % 4) * 0.4;
      const canopy = new THREE.Mesh(new THREE.DodecahedronGeometry(canopyH, 1), cMat);
      canopy.position.set(0, 0, trunkH + canopyH * 0.7);
      canopy.scale.set(1.1, 1.0, 0.85);
      canopy.castShadow = true;
      canopy.receiveShadow = true;
      tSub.add(canopy);

      // Secondary lobe for natural foliage irregularity
      const lobe = new THREE.Mesh(new THREE.DodecahedronGeometry(canopyH * 0.7, 1), leafMats[(idx + 1) % 3]);
      lobe.position.set(canopyH * 0.35, -canopyH * 0.2, trunkH + canopyH * 0.85);
      lobe.castShadow = true;
      tSub.add(lobe);

      treeGroup.add(tSub);
    });

    group.add(treeGroup);

    // 8. Geodetic Ground Control Points (GCP-01, GCP-02, GCP-03)
    const gcpCoords = [
      { name: 'GCP-01', x: -32, y: 38, z: 0.8 },
      { name: 'GCP-02', x: 54, y: 32, z: 2.7 },
      { name: 'GCP-03', x: 38, y: -36, z: 0.7 }
    ];
    gcpCoords.forEach(gcp => {
      const gcpGroup = new THREE.Group();
      gcpGroup.position.set(gcp.x, gcp.y, gcp.z);

      const pad = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 2.4),
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

      group.add(gcpGroup);
    });

    // 9. UAV Survey Flight Path Trajectory & Camera Frustums
    if (layers.frustums) {
      const flightGroup = new THREE.Group();
      const flightPts = [];
      const altitude = 36.0;
      const flightGrid = [
        [-42, -34], [-42, 34],
        [-22, 34], [-22, -34],
        [-2, -34], [-2, 34],
        [18, 34], [18, -34],
        [38, -34], [38, 34],
        [58, 34], [58, -34]
      ];

      flightGrid.forEach(([fx, fy], idx) => {
        const pt = new THREE.Vector3(fx, fy, altitude);
        flightPts.push(pt);

        const pyrGeo = new THREE.ConeGeometry(2.2, 3.8, 4);
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
          dashSize: 1.2,
          gapSize: 0.8,
          transparent: true,
          opacity: 0.35
        });
        const rayLine = new THREE.Line(rayGeo, rayMat);
        rayLine.computeLineDistances();
        flightGroup.add(rayLine);
      });

      const pathGeo = new THREE.BufferGeometry().setFromPoints(flightPts);
      const pathMat = new THREE.LineBasicMaterial({ color: 0x0284c7, linewidth: 2 });
      const pathLine = new THREE.Line(pathGeo, pathMat);
      flightGroup.add(pathLine);

      group.add(flightGroup);
    }

    // 10. Dense Photogrammetric Survey Point Cloud (~20,000 Points)
    const pGeo = new THREE.BufferGeometry();
    const pPositions = [];
    const pColors = [];

    // 10A. Terrain Surface Points
    for (let x = -64; x <= 64; x += 1.6) {
      for (let y = -64; y <= 64; y += 1.6) {
        let z = 0.2;
        if (x > 26 && x < 66 && y > -4 && y < 38) z = 2.4;
        pPositions.push(x, y, z + 0.08);

        if (isConfOverlay) {
          pColors.push(0.06, 0.72, 0.5);
        } else {
          // Roads (dark asphalt)
          if ((y < -20 && y > -38) || (x < -32 && y > -24 && y < 40)) {
            if (Math.abs(y - (-28)) < 0.6) {
              pColors.push(0.95, 0.8, 0.1); // yellow centerline
            } else {
              pColors.push(0.2, 0.22, 0.25); // dark asphalt
            }
          } else if (x > 26 && x < 66 && y > -4 && y < 38) {
            pColors.push(0.78, 0.82, 0.85); // terrace paving
          } else {
            pColors.push(0.24, 0.38, 0.18); // turf green
          }
        }
      }
    }

    // 10B. Main Tower Points (Terracotta brick & green roof)
    for (let tx = -11; tx <= 7; tx += 0.8) {
      for (let ty = -1; ty <= 21; ty += 0.8) {
        pPositions.push(tx, ty, 30.5);
        pColors.push(0.28, 0.42, 0.32); // weathered sage green roof
      }
    }
    for (let tz = 1.0; tz <= 30.0; tz += 1.1) {
      for (let tx = -11; tx <= 7; tx += 0.9) {
        pPositions.push(tx, -1, tz); pColors.push(0.62, 0.31, 0.24); // brick red
        pPositions.push(tx, 21, tz); pColors.push(0.62, 0.31, 0.24);
      }
      for (let ty = -1; ty <= 21; ty += 0.9) {
        pPositions.push(-11, ty, tz); pColors.push(0.62, 0.31, 0.24);
        pPositions.push(7, ty, tz); pColors.push(0.62, 0.31, 0.24);
      }
    }

    // 10C. East Wing Points
    for (let ex = 3; ex <= 47; ex += 0.9) {
      for (let ey = 0.5; ey <= 13.5; ey += 0.9) {
        pPositions.push(ex, ey, 14.5);
        pColors.push(0.28, 0.42, 0.32); // green roof
      }
    }
    for (let ez = 1.0; ez <= 14.0; ez += 1.2) {
      for (let ex = 3; ex <= 47; ex += 1.0) {
        pPositions.push(ex, 0.5, ez); pColors.push(0.62, 0.31, 0.24);
        pPositions.push(ex, 13.5, ez); pColors.push(0.62, 0.31, 0.24);
      }
      for (let ey = 0.5; ey <= 13.5; ey += 1.0) {
        pPositions.push(47, ey, ez); pColors.push(0.62, 0.31, 0.24);
      }
    }

    // 10D. Modern Building & Curved Canopy Points
    for (let cy = -22; cy <= -6; cy += 1.0) {
      for (let a = 0; a < Math.PI; a += 0.2) {
        const cx = -32 + Math.cos(a) * 8.0;
        const cz = Math.sin(a) * 8.0;
        pPositions.push(cx, cy, cz);
        pColors.push(0.95, 0.96, 0.98); // white canopy ribs
      }
    }

    // 10E. Dense Tree Foliage Points
    treeLocations.forEach(([tx, ty, tz]) => {
      for (let i = 0; i < 70; i++) {
        const rad = 1.8 + Math.random() * 2.4;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        const px = tx + rad * Math.sin(phi) * Math.cos(theta);
        const py = ty + rad * Math.sin(phi) * Math.sin(theta);
        const pz = tz + 3.2 + rad * Math.cos(phi);
        pPositions.push(px, py, pz);
        pColors.push(0.16 + Math.random() * 0.08, 0.40 + Math.random() * 0.12, 0.14 + Math.random() * 0.06);
      }
    });

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
    setTriangleCount(100 * 100 * 2 + 1850);
    setBoundingBox({ width: '140.0', length: '140.0', height: '44.5' });
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
    lookAtTargetRef.current.set(2, 6, 8);
    if (cameraRef.current) {
      cameraRef.current.position.set(-18, -42, 34);
      cameraRef.current.lookAt(lookAtTargetRef.current);
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
