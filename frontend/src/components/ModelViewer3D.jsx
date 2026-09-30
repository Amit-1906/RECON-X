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
  brickFacade: null,
  brickNormal: null,
  tileRoof: null,
  tileRoofNormal: null,
  rotundaFacade: null,
  copperDome: null,
  civicFacade: null,
  civicNormal: null,
  labFacade: null,
  labNormal: null,
  glassCurtain: null,
  roofMembrane: null,
  concrete: null,
  concreteNormal: null,
  solar: null,
  asphalt: null,
  hvac: null,
  water: null,
  gcp: null,
  hazard: null,
  pavers: null
};

// Seeded pseudo-random for deterministic textures
function seededRand(seed) {
  let s = seed;
  return function() {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function getPhotogrammetryTextures() {
  if (textureCache.initialized) return textureCache;

  // 1. High-Resolution Orthomosaic Aerial Ground Texture (2048x2048)
  // Maps 160m x 160m surveyed site: center (1024, 1024) = (0, 0) world meters. 1m ≈ 12.8px
  const tCanvas = document.createElement('canvas');
  tCanvas.width = 2048;
  tCanvas.height = 2048;
  const tCtx = tCanvas.getContext('2d');

  // Photogrammetric survey boundary void (deep dark space)
  tCtx.fillStyle = '#060a10';
  tCtx.fillRect(0, 0, 2048, 2048);

  const toPx = (wx, wy) => ({
    x: 1024 + wx * 12.8,
    y: 1024 - wy * 12.8
  });

  // Organic survey coverage boundary polygon
  tCtx.save();
  tCtx.beginPath();
  tCtx.moveTo(60, 180);
  tCtx.lineTo(440, 50);
  tCtx.lineTo(1020, 40);
  tCtx.lineTo(1620, 70);
  tCtx.lineTo(1980, 110);
  tCtx.lineTo(2015, 650);
  tCtx.lineTo(2025, 1380);
  tCtx.lineTo(1960, 1970);
  tCtx.lineTo(1380, 2020);
  tCtx.lineTo(660, 2025);
  tCtx.lineTo(55, 1840);
  tCtx.lineTo(40, 1050);
  tCtx.closePath();
  tCtx.clip();

  // Multi-tone lush lawn turf with realistic soil mottling
  const rnd = seededRand(101);
  tCtx.fillStyle = '#3a4e28';
  tCtx.fillRect(0, 0, 2048, 2048);

  const grassHues = [
    '#314722', '#3d562c', '#466232', '#364d26', '#41592e',
    '#4e6936', '#3b5228', '#2e4220', '#56733c', '#3f572c',
    '#293b1d', '#445f30', '#4c6734', '#354b24', '#3e562b'
  ];
  for (let i = 0; i < 800; i++) {
    const px = rnd() * 2048;
    const py = rnd() * 2048;
    const rad = 30 + rnd() * 180;
    const col = grassHues[Math.floor(rnd() * grassHues.length)];
    const grad = tCtx.createRadialGradient(px, py, 0, px, py, rad);
    grad.addColorStop(0, col);
    grad.addColorStop(1, 'transparent');
    tCtx.fillStyle = grad;
    tCtx.beginPath();
    tCtx.arc(px, py, rad, 0, Math.PI * 2);
    tCtx.fill();
  }

  // Micro-stipple noise for photographic aerial grain
  const tImg = tCtx.getImageData(0, 0, 2048, 2048);
  const tData = tImg.data;
  for (let i = 0; i < tData.length; i += 4) {
    if (tData[i + 3] === 0) continue;
    const n = (rnd() - 0.5) * 18;
    tData[i] = Math.min(255, Math.max(0, tData[i] + n));
    tData[i + 1] = Math.min(255, Math.max(0, tData[i + 1] + n * 0.9));
    tData[i + 2] = Math.min(255, Math.max(0, tData[i + 2] + n * 0.5));
  }
  tCtx.putImageData(tImg, 0, 0);

  // Organic soil & mulch garden beds
  for (let i = 0; i < 90; i++) {
    const px = 140 + rnd() * 1760;
    const py = 140 + rnd() * 1760;
    const rad = 15 + rnd() * 55;
    tCtx.fillStyle = `rgba(${Math.floor(82 + rnd() * 32)}, ${Math.floor(62 + rnd() * 22)}, ${Math.floor(38 + rnd() * 18)}, ${0.25 + rnd() * 0.35})`;
    tCtx.beginPath();
    tCtx.arc(px, py, rad, 0, Math.PI * 2);
    tCtx.fill();
  }

  // === 1A. GRAND CENTRAL COLLEGIATE QUAD PAVING ===
  // Paved quadrangle between (-18, -20) and (26, 6)
  const q1 = toPx(-20, 6); const q2 = toPx(28, 6);
  const q3 = toPx(28, -20); const q4 = toPx(-20, -20);
  tCtx.save();
  // Warm buff sandstone paving base
  tCtx.fillStyle = '#dcd6c8';
  tCtx.beginPath();
  tCtx.moveTo(q1.x, q1.y); tCtx.lineTo(q2.x, q2.y);
  tCtx.lineTo(q3.x, q3.y); tCtx.lineTo(q4.x, q4.y);
  tCtx.closePath();
  tCtx.fill();

  // Herringbone terracotta brick paver bands
  tCtx.strokeStyle = 'rgba(140, 65, 45, 0.45)';
  tCtx.lineWidth = 1.6;
  for (let gx = q1.x; gx <= q2.x; gx += 28) {
    tCtx.beginPath(); tCtx.moveTo(gx, q1.y); tCtx.lineTo(gx, q3.y); tCtx.stroke();
  }
  for (let gy = q1.y; gy <= q3.y; gy += 28) {
    tCtx.beginPath(); tCtx.moveTo(q1.x, gy); tCtx.lineTo(q2.x, gy); tCtx.stroke();
  }

  // Radial limestone & granite compass rose medallion in courtyard center (4, -7)
  const cMed = toPx(4, -7);
  [16, 36, 56, 78, 100].forEach((r, idx) => {
    tCtx.strokeStyle = idx % 2 === 0 ? '#8c3826' : '#6b7280';
    tCtx.lineWidth = 2.4;
    tCtx.beginPath();
    tCtx.arc(cMed.x, cMed.y, r, 0, Math.PI * 2);
    tCtx.stroke();
  });
  // Star rays on medallion
  for (let a = 0; a < 8; a++) {
    const ang = (a * Math.PI) / 4;
    tCtx.beginPath();
    tCtx.moveTo(cMed.x, cMed.y);
    tCtx.lineTo(cMed.x + Math.cos(ang) * 98, cMed.y + Math.sin(ang) * 98);
    tCtx.stroke();
  }
  tCtx.restore();

  // === 1B. SUNKEN REFLECTING POOL / CANAL BASE ===
  // At (12, -4), size 26m x 10m
  const can1 = toPx(-1, 1); const can2 = toPx(25, 1);
  const can3 = toPx(25, -9); const can4 = toPx(-1, -9);
  tCtx.save();
  const poolGrad = tCtx.createLinearGradient(can1.x, can1.y, can3.x, can3.y);
  poolGrad.addColorStop(0, '#0c2638');
  poolGrad.addColorStop(0.5, '#123950');
  poolGrad.addColorStop(1, '#091c2a');
  tCtx.fillStyle = poolGrad;
  tCtx.fillRect(can1.x, can1.y, can2.x - can1.x, can3.y - can1.y);
  // Carved limestone coping border
  tCtx.strokeStyle = '#e2e8f0';
  tCtx.lineWidth = 5.0;
  tCtx.strokeRect(can1.x - 2, can1.y - 2, (can2.x - can1.x) + 4, (can3.y - can1.y) + 4);
  tCtx.restore();

  // === 1C. WEST PARKING LOT ===
  const wPark = toPx(-46, -2);
  const wParkW = 34 * 12.8; const wParkH = 22 * 12.8;
  tCtx.save();
  tCtx.fillStyle = '#1c1f24';
  tCtx.beginPath();
  tCtx.roundRect(wPark.x - wParkW / 2, wPark.y - wParkH / 2, wParkW, wParkH, 8);
  tCtx.fill();

  // Aggregate surface variation
  for (let i = 0; i < 220; i++) {
    const apx = wPark.x - wParkW / 2 + rnd() * wParkW;
    const apy = wPark.y - wParkH / 2 + rnd() * wParkH;
    tCtx.fillStyle = `rgba(${Math.floor(25 + rnd() * 24)}, ${Math.floor(27 + rnd() * 24)}, ${Math.floor(31 + rnd() * 24)}, 0.65)`;
    tCtx.fillRect(apx, apy, 2 + rnd() * 6, 2 + rnd() * 6);
  }
  // Parking stall lines
  tCtx.strokeStyle = '#facc15';
  tCtx.lineWidth = 2.2;
  const wStallY1 = wPark.y - wParkH / 2 + 35;
  const wStallY2 = wPark.y + wParkH / 2 - 35;
  for (let bx = wPark.x - wParkW / 2 + 25; bx <= wPark.x + wParkW / 2 - 25; bx += 36) {
    tCtx.beginPath(); tCtx.moveTo(bx, wPark.y - wParkH / 2 + 10); tCtx.lineTo(bx, wStallY1); tCtx.stroke();
    tCtx.beginPath(); tCtx.moveTo(bx, wPark.y + wParkH / 2 - 10); tCtx.lineTo(bx, wStallY2); tCtx.stroke();
  }
  // Center drive divider
  tCtx.strokeStyle = 'rgba(250, 204, 21, 0.5)';
  tCtx.setLineDash([14, 16]);
  tCtx.beginPath(); tCtx.moveTo(wPark.x - wParkW / 2 + 20, wPark.y); tCtx.lineTo(wPark.x + wParkW / 2 - 20, wPark.y); tCtx.stroke();
  tCtx.setLineDash([]);
  // Blue ADA Accessible stall
  tCtx.fillStyle = '#0284c7';
  tCtx.fillRect(wPark.x - wParkW / 2 + 26, wPark.y - wParkH / 2 + 12, 34, 22);
  tCtx.restore();

  // === 1D. NORTH-EAST RESEARCH & OPERATIONS PARKING LOT ===
  const nePark = toPx(46, 32);
  const neParkW = 28 * 12.8; const neParkH = 16 * 12.8;
  tCtx.save();
  tCtx.fillStyle = '#1c1f24';
  tCtx.beginPath();
  tCtx.roundRect(nePark.x - neParkW / 2, nePark.y - neParkH / 2, neParkW, neParkH, 6);
  tCtx.fill();
  tCtx.strokeStyle = '#f1f5f9';
  tCtx.lineWidth = 2;
  for (let bx = nePark.x - neParkW / 2 + 20; bx <= nePark.x + neParkW / 2 - 20; bx += 32) {
    tCtx.beginPath(); tCtx.moveTo(bx, nePark.y - neParkH / 2 + 8); tCtx.lineTo(bx, nePark.y - neParkH / 2 + 38); tCtx.stroke();
  }
  tCtx.restore();

  // === 1E. REALISTIC CURVING BOULEVARD & INTERSECTION ROAD NETWORK ===
  const roadPts = [
    toPx(-68, -42), toPx(-46, -38), toPx(-24, -34),
    toPx(0, -31), toPx(24, -28), toPx(48, -25), toPx(68, -22)
  ];
  const loopPts = [
    toPx(24, -28), toPx(24, -12), toPx(24, 6),
    toPx(30, 22), toPx(46, 30), toPx(64, 32)
  ];

  const drawSmoothPath = (pts, lineWidth, strokeStyle, lineDash = []) => {
    tCtx.save();
    tCtx.strokeStyle = strokeStyle;
    tCtx.lineWidth = lineWidth;
    tCtx.lineCap = 'round';
    tCtx.lineJoin = 'round';
    tCtx.setLineDash(lineDash);
    tCtx.beginPath();
    tCtx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const xc = (pts[i].x + pts[i + 1].x) / 2;
      const yc = (pts[i].y + pts[i + 1].y) / 2;
      tCtx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
    }
    tCtx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    tCtx.stroke();
    tCtx.restore();
  };

  // 1. Concrete curbs & shoulders
  drawSmoothPath(roadPts, 154, '#64748b');
  drawSmoothPath(loopPts, 126, '#64748b');

  // 2. Asphalt base course
  drawSmoothPath(roadPts, 146, '#1a1d22');
  drawSmoothPath(loopPts, 118, '#1a1d22');

  // Asphalt surface patch variations
  for (let ri = 0; ri < 50; ri++) {
    const idx = Math.floor(rnd() * (roadPts.length - 1));
    const pt = roadPts[idx];
    const nPt = roadPts[idx + 1] || pt;
    const mx = (pt.x + nPt.x) / 2 + (rnd() - 0.5) * 45;
    const my = (pt.y + nPt.y) / 2 + (rnd() - 0.5) * 45;
    tCtx.save();
    tCtx.fillStyle = `rgba(${Math.floor(40 + rnd() * 26)}, ${Math.floor(42 + rnd() * 24)}, ${Math.floor(46 + rnd() * 24)}, 0.45)`;
    tCtx.beginPath();
    tCtx.ellipse(mx, my, 18 + rnd() * 45, 9 + rnd() * 25, rnd() * Math.PI, 0, Math.PI * 2);
    tCtx.fill();
    tCtx.restore();
  }

  // 3. Solid white edge lines (fog lines)
  drawSmoothPath(roadPts, 134, 'rgba(240, 245, 250, 0.9)');
  drawSmoothPath(roadPts, 128, '#1a1d22');
  drawSmoothPath(loopPts, 108, 'rgba(240, 245, 250, 0.9)');
  drawSmoothPath(loopPts, 102, '#1a1d22');

  // 4. Double solid yellow centerline on main boulevard
  drawSmoothPath(roadPts, 10, '#eab308');
  drawSmoothPath(roadPts, 3.2, '#1a1d22');
  drawSmoothPath(roadPts, 1.2, '#eab308');

  // Dashed yellow centerline on campus loop road
  drawSmoothPath(loopPts, 2.5, '#eab308', [18, 22]);

  // Dashed white lane dividers
  drawSmoothPath(roadPts, 68, 'rgba(245, 248, 252, 0.9)', [22, 28]);

  // Pedestrian zebra crossings with stop lines
  const crossings = [toPx(-36, -36), toPx(2, -31), toPx(42, -26), toPx(24, -2)];
  crossings.forEach(cpt => {
    tCtx.save();
    tCtx.fillStyle = 'rgba(248, 250, 252, 0.95)';
    for (let b = -48; b <= 48; b += 15) {
      tCtx.fillRect(cpt.x + b - 4.5, cpt.y - 25, 9, 50);
    }
    tCtx.fillRect(cpt.x - 52, cpt.y - 32, 104, 4.5);
    tCtx.restore();
  });

  // Concrete pedestrian walkways
  const swPaths = [
    [toPx(-42, -14), toPx(-24, -20), toPx(-16, -18)],
    [toPx(20, -18), toPx(38, -16), toPx(48, -14)],
    [toPx(6, 6), toPx(6, 16), toPx(22, 16)],
    [toPx(-32, 16), toPx(-18, 16), toPx(-4, 14)],
    [toPx(4, -8), toPx(4, 4)],
    [toPx(-38, -12), toPx(-20, -12)]
  ];
  swPaths.forEach(spath => {
    tCtx.save();
    tCtx.strokeStyle = '#cbd5e1';
    tCtx.lineWidth = 18;
    tCtx.lineCap = 'round';
    tCtx.lineJoin = 'round';
    tCtx.beginPath();
    tCtx.moveTo(spath[0].x, spath[0].y);
    for (let i = 1; i < spath.length; i++) tCtx.lineTo(spath[i].x, spath[i].y);
    tCtx.stroke();
    // Sidewalk expansion joints
    tCtx.strokeStyle = 'rgba(71, 85, 105, 0.35)';
    tCtx.lineWidth = 1.5;
    for (let i = 0; i < spath.length - 1; i++) {
      const p1 = spath[i]; const p2 = spath[i + 1];
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const steps = Math.floor(dist / 20);
      for (let s = 1; s < steps; s++) {
        const sx = p1.x + (p2.x - p1.x) * (s / steps);
        const sy = p1.y + (p2.y - p1.y) * (s / steps);
        tCtx.beginPath();
        tCtx.moveTo(sx - 7, sy - 7); tCtx.lineTo(sx + 7, sy + 7);
        tCtx.stroke();
      }
    }
    tCtx.restore();
  });

  tCtx.restore(); // end survey boundary clip

  const terrainTex = new THREE.CanvasTexture(tCanvas);
  terrainTex.wrapS = THREE.ClampToEdgeWrapping;
  terrainTex.wrapT = THREE.ClampToEdgeWrapping;

  // Terrain Normal Map
  const tNormCanvas = document.createElement('canvas');
  tNormCanvas.width = 512; tNormCanvas.height = 512;
  const tnCtx = tNormCanvas.getContext('2d');
  const tnImg = tnCtx.createImageData(512, 512);
  for (let i = 0; i < tnImg.data.length; i += 4) {
    tnImg.data[i] = 128 + Math.floor((Math.random() - 0.5) * 28);
    tnImg.data[i + 1] = 128 + Math.floor((Math.random() - 0.5) * 28);
    tnImg.data[i + 2] = 255;
    tnImg.data[i + 3] = 255;
  }
  tnCtx.putImageData(tnImg, 0, 0);
  const terrainNorm = new THREE.CanvasTexture(tNormCanvas);
  terrainNorm.wrapS = THREE.RepeatWrapping;
  terrainNorm.wrapT = THREE.RepeatWrapping;
  terrainNorm.repeat.set(16, 16);

  // 2. Realistic Flemish-Bond Terracotta Brick & Limestone Facade Texture (1024x1024)
  const bfCanvas = document.createElement('canvas');
  bfCanvas.width = 1024; bfCanvas.height = 1024;
  const bfCtx = bfCanvas.getContext('2d');

  // Mortar base color
  bfCtx.fillStyle = '#d8d2c8';
  bfCtx.fillRect(0, 0, 1024, 1024);

  // Flemish bond brick coursing (alternating stretchers and headers with clay tone variation)
  const brickShades = ['#8d3725', '#9a402d', '#7c2e1f', '#a44733', '#73291b', '#923c2a'];
  const rowHeight = 16;
  for (let row = 0; row < 64; row++) {
    const y = row * rowHeight;
    const isHeaderRow = row % 2 === 1;
    let x = 0;
    while (x < 1024) {
      const isHeader = isHeaderRow ? (Math.floor(x / 24) % 2 === 0) : (Math.floor(x / 48) % 2 === 1);
      const bWidth = isHeader ? 22 : 46;
      const shade = brickShades[Math.floor(rnd() * brickShades.length)];
      bfCtx.fillStyle = shade;
      bfCtx.fillRect(x + 1.5, y + 1.5, bWidth - 3, rowHeight - 3);

      // Subtle brick texture noise
      if (rnd() > 0.6) {
        bfCtx.fillStyle = 'rgba(0,0,0,0.12)';
        bfCtx.fillRect(x + 2, y + 2, bWidth - 4, (rowHeight - 4) / 2);
      }
      x += bWidth;
    }
  }

  // Buff limestone quoins on left and right corners
  for (let qy = 0; qy < 1024; qy += 64) {
    const qW = (qy / 64) % 2 === 0 ? 70 : 44;
    // Left quoin
    bfCtx.fillStyle = '#e5dfd2';
    bfCtx.fillRect(0, qy + 2, qW, 60);
    bfCtx.strokeStyle = 'rgba(80,70,60,0.3)';
    bfCtx.strokeRect(0, qy + 2, qW, 60);

    // Right quoin
    bfCtx.fillStyle = '#e5dfd2';
    bfCtx.fillRect(1024 - qW, qy + 2, qW, 60);
    bfCtx.strokeStyle = 'rgba(80,70,60,0.3)';
    bfCtx.strokeRect(1024 - qW, qy + 2, qW, 60);
  }

  // Limestone horizontal beltcourses & dentil cornice bands
  [256, 512, 768, 1010].forEach(cy => {
    bfCtx.fillStyle = '#ded7c8';
    bfCtx.fillRect(0, cy - 8, 1024, 16);
    bfCtx.fillStyle = 'rgba(60,50,40,0.35)';
    bfCtx.fillRect(0, cy + 8, 1024, 4);

    // Dentil tooth blocks along cornice
    for (let dx = 10; dx < 1024; dx += 20) {
      bfCtx.fillStyle = '#f0eae0';
      bfCtx.fillRect(dx, cy - 6, 10, 10);
      bfCtx.fillStyle = 'rgba(0,0,0,0.25)';
      bfCtx.fillRect(dx, cy + 4, 10, 2);
    }
  });

  // Architectural arched collegiate windows with limestone headers & multi-pane glazing
  for (let fl = 0; fl < 4; fl++) {
    const wy = fl * 256 + 50;
    for (let bx = 110; bx < 920; bx += 140) {
      const ww = 74; const wh = 130;
      // Arched limestone surround
      bfCtx.fillStyle = '#e5ded1';
      bfCtx.fillRect(bx - 6, wy - 6, ww + 12, wh + 12);

      // Dark bronze frame
      bfCtx.fillStyle = '#262422';
      bfCtx.fillRect(bx - 2, wy - 2, ww + 4, wh + 4);

      // Deep sky reflection glass
      const wGrad = bfCtx.createLinearGradient(bx, wy, bx, wy + wh);
      wGrad.addColorStop(0, '#1a334d');
      wGrad.addColorStop(0.4, '#0c1d2e');
      wGrad.addColorStop(1, '#07101a');
      bfCtx.fillStyle = wGrad;
      bfCtx.fillRect(bx, wy, ww, wh);

      // White mullion grid (6-pane classic sash window)
      bfCtx.fillStyle = '#e2e8f0';
      bfCtx.fillRect(bx + ww / 2 - 1.5, wy, 3, wh);
      bfCtx.fillRect(bx, wy + wh * 0.33, ww, 2.5);
      bfCtx.fillRect(bx, wy + wh * 0.66, ww, 2.5);

      // Protruding stone window sill
      bfCtx.fillStyle = '#eae4d8';
      bfCtx.fillRect(bx - 8, wy + wh, ww + 16, 8);
      bfCtx.fillStyle = 'rgba(0,0,0,0.3)';
      bfCtx.fillRect(bx - 8, wy + wh + 8, ww + 16, 3);
    }
  }

  const brickFacadeTex = new THREE.CanvasTexture(bfCanvas);
  brickFacadeTex.wrapS = THREE.RepeatWrapping;
  brickFacadeTex.wrapT = THREE.RepeatWrapping;

  // Brick Facade Normal Map (relief for mortar joints & stone trims)
  const bfnCanvas = document.createElement('canvas');
  bfnCanvas.width = 512; bfnCanvas.height = 512;
  const bfnCtx = bfnCanvas.getContext('2d');
  const bfnImg = bfnCtx.createImageData(512, 512);
  for (let i = 0; i < bfnImg.data.length; i += 4) {
    bfnImg.data[i] = 128 + Math.floor((Math.random() - 0.5) * 26);
    bfnImg.data[i + 1] = 128 + Math.floor((Math.random() - 0.5) * 26);
    bfnImg.data[i + 2] = 240;
    bfnImg.data[i + 3] = 255;
  }
  bfnCtx.putImageData(bfnImg, 0, 0);
  const brickNormal = new THREE.CanvasTexture(bfnCanvas);
  brickNormal.wrapS = THREE.RepeatWrapping;
  brickNormal.wrapT = THREE.RepeatWrapping;

  // 3. Spanish Terracotta Barrel Tile & Slate Roof Texture (1024x1024)
  const trCanvas = document.createElement('canvas');
  trCanvas.width = 1024; trCanvas.height = 1024;
  const trCtx = trCanvas.getContext('2d');

  // Base terracotta clay tone
  trCtx.fillStyle = '#8f3e2b';
  trCtx.fillRect(0, 0, 1024, 1024);

  // Barrel tile curved rows (vertical ridges and shadow channels)
  const tileWidth = 32;
  for (let x = 0; x < 1024; x += tileWidth) {
    const tileGrad = trCtx.createLinearGradient(x, 0, x + tileWidth, 0);
    tileGrad.addColorStop(0, '#5a2215'); // shadow groove
    tileGrad.addColorStop(0.25, '#994430'); // mid tone
    tileGrad.addColorStop(0.55, '#c85e45'); // convex ridge highlight
    tileGrad.addColorStop(0.85, '#994430'); // mid tone
    tileGrad.addColorStop(1, '#5a2215'); // shadow groove
    trCtx.fillStyle = tileGrad;
    trCtx.fillRect(x, 0, tileWidth, 1024);
  }

  // Horizontal tile overlap shadow lines every 48px
  for (let y = 0; y < 1024; y += 48) {
    trCtx.fillStyle = 'rgba(30, 10, 5, 0.55)';
    trCtx.fillRect(0, y, 1024, 6);
    trCtx.fillStyle = 'rgba(255, 180, 150, 0.25)';
    trCtx.fillRect(0, y + 6, 1024, 2);
  }

  // Subtle natural weathering & lichen variations
  for (let i = 0; i < 70; i++) {
    const rx = rnd() * 1024; const ry = rnd() * 1024;
    const rad = 8 + rnd() * 32;
    trCtx.fillStyle = `rgba(${Math.floor(70 + rnd() * 30)}, ${Math.floor(80 + rnd() * 30)}, ${Math.floor(50 + rnd() * 20)}, ${0.15 + rnd() * 0.25})`;
    trCtx.beginPath(); trCtx.arc(rx, ry, rad, 0, Math.PI * 2); trCtx.fill();
  }

  const tileRoofTex = new THREE.CanvasTexture(trCanvas);
  tileRoofTex.wrapS = THREE.RepeatWrapping;
  tileRoofTex.wrapT = THREE.RepeatWrapping;
  tileRoofTex.repeat.set(4, 4);

  // Tile Roof Normal Map (sinusoidal ridge relief)
  const trnCanvas = document.createElement('canvas');
  trnCanvas.width = 512; trnCanvas.height = 512;
  const trnCtx = trnCanvas.getContext('2d');
  const trnImg = trnCtx.createImageData(512, 512);
  const tPitch = 512 / 16;
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const idx = (y * 512 + x) * 4;
      const phase = ((x % tPitch) / tPitch) * Math.PI * 2;
      const nx = Math.cos(phase);
      trnImg.data[idx] = Math.floor(128 + nx * 70);
      trnImg.data[idx + 1] = 128 + Math.floor((Math.random() - 0.5) * 12);
      trnImg.data[idx + 2] = 235;
      trnImg.data[idx + 3] = 255;
    }
  }
  trnCtx.putImageData(trnImg, 0, 0);
  const tileRoofNormal = new THREE.CanvasTexture(trnCanvas);
  tileRoofNormal.wrapS = THREE.RepeatWrapping;
  tileRoofNormal.wrapT = THREE.RepeatWrapping;
  tileRoofNormal.repeat.set(4, 4);

  // 4. Classical Fluted Rotunda Limestone Facade (1024x512)
  const rf2Canvas = document.createElement('canvas');
  rf2Canvas.width = 1024; rf2Canvas.height = 512;
  const rf2Ctx = rf2Canvas.getContext('2d');

  rf2Ctx.fillStyle = '#eae4d8';
  rf2Ctx.fillRect(0, 0, 1024, 512);

  // Fluted column striping
  for (let x = 0; x < 1024; x += 64) {
    for (let f = 4; f < 60; f += 8) {
      rf2Ctx.fillStyle = 'rgba(70, 60, 50, 0.18)';
      rf2Ctx.fillRect(x + f, 80, 4, 380);
      rf2Ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      rf2Ctx.fillRect(x + f + 4, 80, 2, 380);
    }
  }
  // Classical entablature & frieze band
  rf2Ctx.fillStyle = '#ded6c6';
  rf2Ctx.fillRect(0, 0, 1024, 80);
  rf2Ctx.fillStyle = 'rgba(60,50,40,0.3)';
  rf2Ctx.fillRect(0, 75, 1024, 5);
  // Triglyphs along frieze
  for (let x = 16; x < 1024; x += 64) {
    rf2Ctx.fillStyle = '#cfc6b5';
    rf2Ctx.fillRect(x, 15, 32, 50);
  }

  const rotundaFacadeTex = new THREE.CanvasTexture(rf2Canvas);
  rotundaFacadeTex.wrapS = THREE.RepeatWrapping;
  rotundaFacadeTex.wrapT = THREE.RepeatWrapping;

  // 5. Oxidized Copper Dome Patina Texture (512x512)
  const cdCanvas = document.createElement('canvas');
  cdCanvas.width = 512; cdCanvas.height = 512;
  const cdCtx = cdCanvas.getContext('2d');

  // Rich verdigris turquoise copper tone
  cdCtx.fillStyle = '#42937d';
  cdCtx.fillRect(0, 0, 512, 512);

  // Weathering and water runoff streaks
  for (let i = 0; i < 60; i++) {
    const rx = rnd() * 512; const ry = rnd() * 512;
    const rad = 15 + rnd() * 65;
    const tones = ['#4fa38c', '#37826d', '#5db79e', '#2c6c59', '#3b7866'];
    const cGrad = cdCtx.createRadialGradient(rx, ry, 0, rx, ry, rad);
    cGrad.addColorStop(0, tones[Math.floor(rnd() * tones.length)]);
    cGrad.addColorStop(1, 'transparent');
    cdCtx.fillStyle = cGrad;
    cdCtx.beginPath(); cdCtx.arc(rx, ry, rad, 0, Math.PI * 2); cdCtx.fill();
  }

  // Vertical standing seams every 32px
  for (let x = 0; x < 512; x += 32) {
    cdCtx.fillStyle = 'rgba(20, 50, 40, 0.6)';
    cdCtx.fillRect(x, 0, 3, 512);
    cdCtx.fillStyle = 'rgba(160, 240, 220, 0.4)';
    cdCtx.fillRect(x + 3, 0, 1.5, 512);
  }

  const copperDomeTex = new THREE.CanvasTexture(cdCanvas);
  copperDomeTex.wrapS = THREE.RepeatWrapping;
  copperDomeTex.wrapT = THREE.RepeatWrapping;

  // 6. Contemporary Civic Innovation Facade Texture (1024x512)
  const cfCanvas = document.createElement('canvas');
  cfCanvas.width = 1024; cfCanvas.height = 512;
  const cfCtx = cfCanvas.getContext('2d');
  cfCtx.fillStyle = '#e2ded7';
  cfCtx.fillRect(0, 0, 1024, 512);
  [0, 85, 170, 255, 340, 425, 510].forEach(fy => {
    cfCtx.fillStyle = '#cbd5e1';
    cfCtx.fillRect(0, fy - 6, 1024, 12);
    cfCtx.fillStyle = 'rgba(51, 65, 85, 0.3)';
    cfCtx.fillRect(0, fy + 6, 1024, 3);
  });
  for (let bx = 0; bx <= 1024; bx += 96) {
    cfCtx.fillStyle = '#d1cac0';
    cfCtx.fillRect(bx - 6, 0, 12, 512);
    cfCtx.fillStyle = 'rgba(70, 60, 50, 0.22)';
    cfCtx.fillRect(bx + 6, 0, 3, 512);
  }
  for (let row = 0; row < 6; row++) {
    const wy = row * 85 + 16;
    for (let bx = 0; bx < 1024; bx += 96) {
      const wx = bx + 14; const ww = 68; const wh = 55;
      cfCtx.fillStyle = '#334155';
      cfCtx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
      const wGrad = cfCtx.createLinearGradient(wx, wy, wx, wy + wh);
      wGrad.addColorStop(0, '#1a344e');
      wGrad.addColorStop(0.35, '#0d1d2d');
      wGrad.addColorStop(1, '#08111a');
      cfCtx.fillStyle = wGrad;
      cfCtx.fillRect(wx, wy, ww, wh);
      cfCtx.fillStyle = '#64748b';
      cfCtx.fillRect(wx + ww / 2 - 1, wy, 2, wh);
      cfCtx.fillStyle = '#94a3b8';
      cfCtx.fillRect(wx - 3, wy - 4, ww + 6, 3);
    }
  }
  const civicFacadeTex = new THREE.CanvasTexture(cfCanvas);
  civicFacadeTex.wrapS = THREE.RepeatWrapping;
  civicFacadeTex.wrapT = THREE.RepeatWrapping;

  const cfnCanvas = document.createElement('canvas');
  cfnCanvas.width = 512; cfnCanvas.height = 256;
  const cfnCtx = cfnCanvas.getContext('2d');
  const cfnImg = cfnCtx.createImageData(512, 256);
  for (let i = 0; i < cfnImg.data.length; i += 4) {
    cfnImg.data[i] = 128 + Math.floor((Math.random() - 0.5) * 20);
    cfnImg.data[i + 1] = 128 + Math.floor((Math.random() - 0.5) * 20);
    cfnImg.data[i + 2] = 245;
    cfnImg.data[i + 3] = 255;
  }
  cfnCtx.putImageData(cfnImg, 0, 0);
  const civicNormal = new THREE.CanvasTexture(cfnCanvas);
  civicNormal.wrapS = THREE.RepeatWrapping;
  civicNormal.wrapT = THREE.RepeatWrapping;

  // 7. Research Lab Facade (Terracotta & Metal Composite Panels)
  const lfCanvas = document.createElement('canvas');
  lfCanvas.width = 1024; lfCanvas.height = 512;
  const lfCtx = lfCanvas.getContext('2d');
  lfCtx.fillStyle = '#a65440';
  lfCtx.fillRect(0, 0, 1024, 512);
  for (let y = 0; y < 512; y += 16) {
    lfCtx.strokeStyle = 'rgba(60, 25, 18, 0.35)';
    lfCtx.lineWidth = 1.2;
    lfCtx.beginPath(); lfCtx.moveTo(0, y); lfCtx.lineTo(1024, y); lfCtx.stroke();
  }
  for (let row = 0; row < 4; row++) {
    const ry = row * 128 + 36;
    lfCtx.fillStyle = '#e2e8f0';
    lfCtx.fillRect(0, ry - 10, 1024, 76);
    lfCtx.fillStyle = '#0f172a';
    lfCtx.fillRect(0, ry, 1024, 56);
    lfCtx.fillStyle = '#64748b';
    for (let vx = 0; vx <= 1024; vx += 48) {
      lfCtx.fillRect(vx - 1.5, ry, 3, 56);
    }
  }
  const labFacadeTex = new THREE.CanvasTexture(lfCanvas);
  labFacadeTex.wrapS = THREE.RepeatWrapping;
  labFacadeTex.wrapT = THREE.RepeatWrapping;

  const lfnCanvas = document.createElement('canvas');
  lfnCanvas.width = 512; lfnCanvas.height = 256;
  const lfnCtx = lfnCanvas.getContext('2d');
  const lfnImg = lfnCtx.createImageData(512, 256);
  for (let i = 0; i < lfnImg.data.length; i += 4) {
    lfnImg.data[i] = 128 + Math.floor((Math.random() - 0.5) * 16);
    lfnImg.data[i + 1] = 128 + Math.floor((Math.random() - 0.5) * 16);
    lfnImg.data[i + 2] = 248;
    lfnImg.data[i + 3] = 255;
  }
  lfnCtx.putImageData(lfnImg, 0, 0);
  const labNormal = new THREE.CanvasTexture(lfnCanvas);
  labNormal.wrapS = THREE.RepeatWrapping;
  labNormal.wrapT = THREE.RepeatWrapping;

  // 8. Structural Glass Curtain Wall Texture
  const gwCanvas = document.createElement('canvas');
  gwCanvas.width = 512; gwCanvas.height = 512;
  const gwCtx = gwCanvas.getContext('2d');
  const gGrad = gwCtx.createLinearGradient(0, 0, 0, 512);
  gGrad.addColorStop(0, '#1e3a5f');
  gGrad.addColorStop(0.4, '#102238');
  gGrad.addColorStop(1, '#09131f');
  gwCtx.fillStyle = gGrad;
  gwCtx.fillRect(0, 0, 512, 512);
  gwCtx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
  gwCtx.lineWidth = 2;
  for (let x = 0; x <= 512; x += 42) {
    gwCtx.beginPath(); gwCtx.moveTo(x, 0); gwCtx.lineTo(x, 512); gwCtx.stroke();
  }
  for (let y = 0; y <= 512; y += 42) {
    gwCtx.beginPath(); gwCtx.moveTo(0, y); gwCtx.lineTo(512, y); gwCtx.stroke();
  }
  const glassCurtainTex = new THREE.CanvasTexture(gwCanvas);
  glassCurtainTex.wrapS = THREE.RepeatWrapping;
  glassCurtainTex.wrapT = THREE.RepeatWrapping;

  // 9. Commercial Flat Roof Membrane Texture
  const rfCanvas = document.createElement('canvas');
  rfCanvas.width = 1024; rfCanvas.height = 1024;
  const rfCtx = rfCanvas.getContext('2d');
  const rndR = seededRand(88);
  rfCtx.fillStyle = '#6b7280';
  rfCtx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 90; i++) {
    const rx = rndR() * 1024; const ry = rndR() * 1024;
    const rad = 20 + rndR() * 110;
    const stains = [
      'rgba(55, 65, 81, 0.45)', 'rgba(75, 85, 99, 0.4)',
      'rgba(40, 48, 60, 0.5)', 'rgba(107, 114, 128, 0.25)'
    ];
    const grad = rfCtx.createRadialGradient(rx, ry, 0, rx, ry, rad);
    grad.addColorStop(0, stains[Math.floor(rndR() * stains.length)]);
    grad.addColorStop(1, 'transparent');
    rfCtx.fillStyle = grad;
    rfCtx.beginPath(); rfCtx.arc(rx, ry, rad, 0, Math.PI * 2); rfCtx.fill();
  }
  rfCtx.strokeStyle = 'rgba(31, 41, 55, 0.65)';
  rfCtx.lineWidth = 3.5;
  for (let x = 0; x <= 1024; x += 64) {
    rfCtx.beginPath(); rfCtx.moveTo(x, 0); rfCtx.lineTo(x, 1024); rfCtx.stroke();
  }
  for (let y = 0; y <= 1024; y += 160) {
    rfCtx.beginPath(); rfCtx.moveTo(0, y); rfCtx.lineTo(1024, y); rfCtx.stroke();
  }
  for (let i = 0; i < 260; i++) {
    const side = Math.floor(rndR() * 4);
    let gpx, gpy;
    if (side === 0) { gpx = rndR() * 1024; gpy = rndR() * 35; }
    else if (side === 1) { gpx = rndR() * 1024; gpy = 989 + rndR() * 35; }
    else if (side === 2) { gpx = rndR() * 35; gpy = rndR() * 1024; }
    else { gpx = 989 + rndR() * 35; gpy = rndR() * 1024; }
    const grTone = Math.floor(130 + rndR() * 50);
    rfCtx.fillStyle = `rgb(${grTone}, ${grTone + 2}, ${grTone + 4})`;
    rfCtx.beginPath(); rfCtx.arc(gpx, gpy, 2 + rndR() * 4, 0, Math.PI * 2); rfCtx.fill();
  }
  const roofTex = new THREE.CanvasTexture(rfCanvas);
  roofTex.wrapS = THREE.RepeatWrapping;
  roofTex.wrapT = THREE.RepeatWrapping;

  // 10. Precast Architectural Concrete Texture
  const conCanvas = document.createElement('canvas');
  conCanvas.width = 512; conCanvas.height = 512;
  const conCtx = conCanvas.getContext('2d');
  conCtx.fillStyle = '#cbd5e1';
  conCtx.fillRect(0, 0, 512, 512);
  conCtx.strokeStyle = 'rgba(100, 116, 139, 0.45)';
  conCtx.lineWidth = 2;
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
  conNormCanvas.width = 256; conNormCanvas.height = 256;
  const connCtx = conNormCanvas.getContext('2d');
  const connImg = connCtx.createImageData(256, 256);
  for (let i = 0; i < connImg.data.length; i += 4) {
    connImg.data[i] = 128 + Math.floor((Math.random() - 0.5) * 18);
    connImg.data[i + 1] = 128 + Math.floor((Math.random() - 0.5) * 18);
    connImg.data[i + 2] = 245; connImg.data[i + 3] = 255;
  }
  connCtx.putImageData(connImg, 0, 0);
  const concreteNorm = new THREE.CanvasTexture(conNormCanvas);
  concreteNorm.wrapS = THREE.RepeatWrapping;
  concreteNorm.wrapT = THREE.RepeatWrapping;

  // 11. Photovoltaic Solar Panel Array Texture
  const solCanvas = document.createElement('canvas');
  solCanvas.width = 256; solCanvas.height = 256;
  const solCtx = solCanvas.getContext('2d');
  solCtx.fillStyle = '#0f243e';
  solCtx.fillRect(0, 0, 256, 256);
  solCtx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
  solCtx.lineWidth = 1.2;
  for (let x = 0; x <= 256; x += 32) {
    solCtx.beginPath(); solCtx.moveTo(x, 0); solCtx.lineTo(x, 256); solCtx.stroke();
  }
  for (let y = 0; y <= 256; y += 32) {
    solCtx.beginPath(); solCtx.moveTo(0, y); solCtx.lineTo(256, y); solCtx.stroke();
  }
  solCtx.strokeStyle = '#38bdf8';
  solCtx.lineWidth = 1.5;
  solCtx.strokeRect(2, 2, 252, 252);
  const solarTex = new THREE.CanvasTexture(solCanvas);
  solarTex.wrapS = THREE.RepeatWrapping;
  solarTex.wrapT = THREE.RepeatWrapping;

  // 12. Industrial HVAC Louver Texture
  const hvacCanvas = document.createElement('canvas');
  hvacCanvas.width = 256; hvacCanvas.height = 256;
  const hvacCtx = hvacCanvas.getContext('2d');
  hvacCtx.fillStyle = '#94a3b8';
  hvacCtx.fillRect(0, 0, 256, 256);
  hvacCtx.fillStyle = '#334155';
  for (let y = 12; y < 256; y += 18) {
    hvacCtx.fillRect(8, y, 240, 9);
  }
  const hvacTex = new THREE.CanvasTexture(hvacCanvas);
  hvacTex.wrapS = THREE.RepeatWrapping;
  hvacTex.wrapT = THREE.RepeatWrapping;

  // 13. Water Reflective Surface Texture
  const wCanvas = document.createElement('canvas');
  wCanvas.width = 256; wCanvas.height = 256;
  const wCtx = wCanvas.getContext('2d');
  wCtx.fillStyle = '#0f2c42';
  wCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 40; i++) {
    wCtx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
    wCtx.lineWidth = 2.5;
    wCtx.beginPath();
    wCtx.arc(Math.random() * 256, Math.random() * 256, 10 + Math.random() * 40, 0, Math.PI * 2);
    wCtx.stroke();
  }
  const waterTex = new THREE.CanvasTexture(wCanvas);
  waterTex.wrapS = THREE.RepeatWrapping;
  waterTex.wrapT = THREE.RepeatWrapping;

  // 14. Geodetic Ground Control Point (GCP) Target
  const gCanvas = document.createElement('canvas');
  gCanvas.width = 256; gCanvas.height = 256;
  const gCtx = gCanvas.getContext('2d');
  gCtx.fillStyle = '#facc15';
  gCtx.fillRect(0, 0, 128, 128); gCtx.fillRect(128, 128, 128, 128);
  gCtx.fillStyle = '#0f172a';
  gCtx.fillRect(128, 0, 128, 128); gCtx.fillRect(0, 128, 128, 128);
  const gcpTex = new THREE.CanvasTexture(gCanvas);

  textureCache.initialized = true;
  textureCache.terrain = terrainTex;
  textureCache.terrainNormal = terrainNorm;
  textureCache.brickFacade = brickFacadeTex;
  textureCache.brickNormal = brickNormal;
  textureCache.tileRoof = tileRoofTex;
  textureCache.tileRoofNormal = tileRoofNormal;
  textureCache.rotundaFacade = rotundaFacadeTex;
  textureCache.copperDome = copperDomeTex;
  textureCache.civicFacade = civicFacadeTex;
  textureCache.civicNormal = civicNormal;
  textureCache.labFacade = labFacadeTex;
  textureCache.labNormal = labNormal;
  textureCache.glassCurtain = glassCurtainTex;
  textureCache.roofMembrane = roofTex;
  textureCache.concrete = concreteTex;
  textureCache.concreteNormal = concreteNorm;
  textureCache.solar = solarTex;
  textureCache.hvac = hvacTex;
  textureCache.water = waterTex;
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
  subtitle = "Interactive Photogrammetric Engineering Workstation",
  activeJobId = null,
  jobInfo = null,
  confidenceStats = null,
  onConfidenceModeChange = null
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
    measurements: true,
    terrain: true,
    structures: true,
    vegetation: true
  });
  const [showScenePanel, setShowScenePanel] = useState(false);
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
  const lookAtTargetRef = useRef(new THREE.Vector3(0, 4, 6));
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
    scene.fog = new THREE.FogExp2(0x06080d, 0.0014);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      42,
      container.clientWidth / container.clientHeight,
      0.1,
      4000
    );
    camera.up.set(0, 0, 1);
    lookAtTargetRef.current.set(0, 4, 6);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true, 
      powerPreference: "high-performance" 
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.16;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Natural Sky & Ambient Lighting
    const hemiLight = new THREE.HemisphereLight(0xdceaf8, 0x3d4e28, 0.90);
    hemiLight.position.set(0, 0, 180);
    scene.add(hemiLight);

    const ambLight = new THREE.AmbientLight(0xfff8f2, 0.44);
    scene.add(ambLight);

    // Primary natural daylight sun (North-West high azimuth, ~48° elevation)
    const sunLight = new THREE.DirectionalLight(0xfff6e2, 2.7);
    sunLight.position.set(-85, 75, 120);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 4096;
    sunLight.shadow.mapSize.height = 4096;
    sunLight.shadow.camera.near = 5;
    sunLight.shadow.camera.far = 400;
    sunLight.shadow.camera.left = -110;
    sunLight.shadow.camera.right = 110;
    sunLight.shadow.camera.top = 110;
    sunLight.shadow.camera.bottom = -110;
    sunLight.shadow.bias = -0.0002;
    sunLight.shadow.normalBias = 0.015;
    scene.add(sunLight);

    // Secondary fill (sky bounce from East)
    const fillLight = new THREE.DirectionalLight(0xa5c9ed, 0.50);
    fillLight.position.set(80, -70, 45);
    scene.add(fillLight);

    // Warm ground bounce fill for photogrammetry realism
    const bounceLight = new THREE.DirectionalLight(0xeddba6, 0.20);
    bounceLight.position.set(0, 0, -25);
    scene.add(bounceLight);

    const grid = new THREE.GridHelper(160, 80, 0x0284c7, 0x1e293b);
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
    // Elevated oblique drone angle (~42° downward tilt, radius 95m framing entire site)
    let spherical = { radius: 95, theta: -Math.PI * 0.22, phi: Math.PI * 0.38 };

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
      spherical.radius = Math.max(4, Math.min(700, spherical.radius + e.deltaY * (spherical.radius * 0.0015)));
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

  // ── High-Fidelity Drone Photogrammetry Digital Twin Generator ─────────────
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

    // Helper: Procedural Hipped/Pitched Roof Mesh with UV Mapping
    const createPitchedRoofMesh = (width, depth, height, mat, ridgeAlongX = true) => {
      const geo = new THREE.BufferGeometry();
      const hw = width / 2;
      const hd = depth / 2;
      const rh = height;
      const ridgeLen = ridgeAlongX ? Math.max(0.1, width - depth * 0.8) : Math.max(0.1, depth - width * 0.8);
      const hr = ridgeLen / 2;

      let vertices, uvs, indices;
      if (ridgeAlongX) {
        vertices = new Float32Array([
          // Base corners 0, 1, 2, 3
          -hw, -hd, 0,
           hw, -hd, 0,
           hw,  hd, 0,
          -hw,  hd, 0,
          // Ridge line 4, 5
          -hr, 0, rh,
           hr, 0, rh
        ]);
        uvs = new Float32Array([
          0, 0,
          1, 0,
          1, 1,
          0, 1,
          0.3, 0.5,
          0.7, 0.5
        ]);
        indices = [
          // South slope
          0, 1, 5,   0, 5, 4,
          // North slope
          2, 3, 4,   2, 4, 5,
          // West hip triangle
          3, 0, 4,
          // East hip triangle
          1, 2, 5,
          // Bottom (double-sided or closed)
          0, 3, 2,   0, 2, 1
        ];
      } else {
        vertices = new Float32Array([
          -hw, -hd, 0,
           hw, -hd, 0,
           hw,  hd, 0,
          -hw,  hd, 0,
          0, -hr, rh,
          0,  hr, rh
        ]);
        uvs = new Float32Array([
          0, 0,
          1, 0,
          1, 1,
          0, 1,
          0.5, 0.3,
          0.5, 0.7
        ]);
        indices = [
          // West slope
          3, 0, 4,   3, 4, 5,
          // East slope
          1, 2, 5,   1, 5, 4,
          // South hip
          0, 1, 4,
          // North hip
          2, 3, 5,
          // Bottom
          0, 3, 2,   0, 2, 1
        ];
      }
      geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();

      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    };

    // Helper: Add 3D Arched Colonnade Loggia
    const createArchedLoggia = (length, depth, height, archCount, colR = 0.32) => {
      const loggia = new THREE.Group();
      const stoneMat = getPbrMat({ color: 0xe5dfd2, roughness: 0.65, metalness: 0.08 }, 'high');
      const archSpan = length / archCount;
      const pierW = colR * 2.2;

      for (let i = 0; i <= archCount; i++) {
        const px = -length / 2 + i * archSpan;
        // Column column shaft
        const col = new THREE.Mesh(new THREE.CylinderGeometry(colR * 0.85, colR, height - 1.2, 12), stoneMat);
        col.position.set(px, 0, (height - 1.2) / 2);
        col.rotation.x = Math.PI / 2;
        col.castShadow = true;
        loggia.add(col);

        // Column base plinth
        const base = new THREE.Mesh(new THREE.BoxGeometry(pierW, pierW, 0.35), stoneMat);
        base.position.set(px, 0, 0.175);
        base.castShadow = true;
        loggia.add(base);

        // Column capital
        const cap = new THREE.Mesh(new THREE.BoxGeometry(pierW * 1.1, pierW * 1.1, 0.35), stoneMat);
        cap.position.set(px, 0, height - 1.2 + 0.175);
        cap.castShadow = true;
        loggia.add(cap);

        // Arch span connecting to next pier
        if (i < archCount) {
          const archCenter = px + archSpan / 2;
          const archLintel = new THREE.Mesh(new THREE.BoxGeometry(archSpan - pierW * 0.4, 0.45, 0.9), stoneMat);
          archLintel.position.set(archCenter, 0, height - 0.45);
          archLintel.castShadow = true;
          loggia.add(archLintel);

          // Keystone detail
          const keystone = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.52, 0.6), stoneMat);
          keystone.position.set(archCenter, 0, height - 0.4);
          keystone.castShadow = true;
          loggia.add(keystone);
        }
      }

      // Ceiling vault underside
      const ceiling = new THREE.Mesh(new THREE.BoxGeometry(length, depth, 0.3), stoneMat);
      ceiling.position.set(0, -depth / 2, height - 0.15);
      ceiling.receiveShadow = true;
      loggia.add(ceiling);

      return loggia;
    };

    // Helper: Add 3D Balustrade with handrail and balusters
    const createBalustrade = (length, alongX = true) => {
      const balGroup = new THREE.Group();
      const stoneMat = getPbrMat({ color: 0xded8cc, roughness: 0.6, metalness: 0.08 }, 'high');
      const railH = 0.9;
      const balCount = Math.max(3, Math.floor(length / 1.2));
      const spacing = length / balCount;

      // Top handrail
      const railGeo = alongX ? new THREE.BoxGeometry(length, 0.28, 0.16) : new THREE.BoxGeometry(0.28, length, 0.16);
      const handrail = new THREE.Mesh(railGeo, stoneMat);
      handrail.position.set(0, 0, railH);
      handrail.castShadow = true;
      balGroup.add(handrail);

      // Bottom base curb
      const curbGeo = alongX ? new THREE.BoxGeometry(length, 0.32, 0.18) : new THREE.BoxGeometry(0.32, length, 0.18);
      const baseCurb = new THREE.Mesh(curbGeo, stoneMat);
      baseCurb.position.set(0, 0, 0.09);
      baseCurb.castShadow = true;
      balGroup.add(baseCurb);

      // Baluster spindles
      for (let b = 0; b <= balCount; b++) {
        const offset = -length / 2 + b * spacing;
        const baluster = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, railH - 0.24, 8), stoneMat);
        if (alongX) {
          baluster.position.set(offset, 0, railH / 2);
        } else {
          baluster.position.set(0, offset, railH / 2);
        }
        baluster.rotation.x = Math.PI / 2;
        baluster.castShadow = true;
        balGroup.add(baluster);
      }
      return balGroup;
    };

    // ── 1. Surveyed Photogrammetric Contoured Terrain Mesh (160m x 160m) ──
    const terrainGeo = new THREE.PlaneGeometry(160, 160, 120, 120);
    const pos = terrainGeo.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);

      // Regional slope: NW higher (2.2m), SE lower (0.2m) + gentle natural rolling hills
      let z = 1.1 + (y * 0.015) - (x * 0.012) +
              Math.sin(x * 0.038) * Math.cos(y * 0.038) * 0.85 +
              Math.sin(x * 0.08 + y * 0.06) * 0.35;

      // Sunken Reflecting Pool Canal depression at (12, -4), size 26m x 10m
      if (x >= -1 && x <= 25 && y >= -9 && y <= 1) {
        z = -0.65; // sunken pool basin floor
      } else if (x >= -18 && x <= 26 && y >= -20 && y <= 6) {
        // Central collegiate quadrangle leveled terrace
        z = 0.55;
      } else if (x >= -46 && x <= 46 && y >= 6 && y <= 34) {
        // Main Complex terrace foundation pad
        z = 1.25;
      } else if (x >= -56 && x <= -28 && y >= 10 && y <= 34) {
        // West Rotunda terrace
        z = 1.75;
      } else if (x >= -52 && x <= -24 && y >= -36 && y <= -8) {
        // Academic Quad terrace
        z = 0.60;
      } else if (x >= 34 && x <= 66 && y >= -30 && y <= -6) {
        // Engineering Hub terrace
        z = 0.75;
      } else if (x >= 32 && x <= 58 && y >= 16 && y <= 38) {
        // Research Center terrace
        z = 1.50;
      } else if (y < -22 && y > -42) {
        // Road corridor smooth grade
        const rBlend = Math.abs(y - (-31)) / 10;
        if (rBlend < 1.0) z = z * rBlend + 0.35 * (1 - rBlend);
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

    // ── 2. Sunken Reflecting Canal Basin & Stone Footbridge (12, -4) ──
    const canalGroup = new THREE.Group();
    canalGroup.position.set(12, -4, 0);

    // Reflecting water surface
    const waterGeo = new THREE.PlaneGeometry(25.8, 9.8);
    const waterMat = getPbrMat({
      map: textures.water,
      color: 0x1a465c,
      roughness: 0.12,
      metalness: 0.85,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide
    }, 'high');
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.position.set(0, 0, -0.15);
    waterMesh.receiveShadow = true;
    canalGroup.add(waterMesh);

    // Stone retaining coping walls around canal perimeter
    const copingMat = getPbrMat({ color: 0xded8cc, roughness: 0.6, metalness: 0.08 }, 'high');
    // North wall
    const cNorth = new THREE.Mesh(new THREE.BoxGeometry(26.4, 0.6, 1.2), copingMat);
    cNorth.position.set(0, 5.1, 0.0);
    cNorth.castShadow = true;
    canalGroup.add(cNorth);
    // South wall
    const cSouth = new THREE.Mesh(new THREE.BoxGeometry(26.4, 0.6, 1.2), copingMat);
    cSouth.position.set(0, -5.1, 0.0);
    cSouth.castShadow = true;
    canalGroup.add(cSouth);
    // West wall
    const cWest = new THREE.Mesh(new THREE.BoxGeometry(0.6, 10.6, 1.2), copingMat);
    cWest.position.set(-13.1, 0, 0.0);
    cWest.castShadow = true;
    canalGroup.add(cWest);
    // East wall
    const cEast = new THREE.Mesh(new THREE.BoxGeometry(0.6, 10.6, 1.2), copingMat);
    cEast.position.set(13.1, 0, 0.0);
    cEast.castShadow = true;
    canalGroup.add(cEast);

    // Arched Classical Stone Footbridge crossing canal at center (x: 0)
    const bridgeGroup = new THREE.Group();
    bridgeGroup.position.set(0, 0, 0.2);
    // Bridge deck
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.6, 10.8, 0.35), copingMat);
    deck.position.set(0, 0, 0.55);
    deck.castShadow = true;
    bridgeGroup.add(deck);
    // Bridge arch underside
    const bArch = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 4.8, 3.5, 16, 1, false, 0, Math.PI), copingMat);
    bArch.rotation.z = Math.PI / 2;
    bArch.rotation.x = Math.PI / 2;
    bArch.position.set(0, 0, -0.4);
    bridgeGroup.add(bArch);
    // Bridge balustrades on East and West sides
    const bBalW = createBalustrade(10.6, false);
    bBalW.position.set(-1.6, 0, 0.72);
    bridgeGroup.add(bBalW);
    const bBalE = createBalustrade(10.6, false);
    bBalE.position.set(1.6, 0, 0.72);
    bridgeGroup.add(bBalE);
    canalGroup.add(bridgeGroup);

    group.add(canalGroup);

    // ── 3. Main Complex: Grand Collegiate Headquarters (x: 4, y: 14, z: 1.25) ──
    const mainComplexGroup = new THREE.Group();
    mainComplexGroup.position.set(4, 14, 1.25);

    // Shared materials
    const brickMat = getPbrMat({
      map: textures.brickFacade,
      normalMap: textures.brickNormal,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.65,
      metalness: 0.12
    }, 'high');

    const tileRoofMat = getPbrMat({
      map: textures.tileRoof,
      normalMap: textures.tileRoofNormal,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.58,
      metalness: 0.15
    }, 'high');

    const limestoneMat = getPbrMat({ color: 0xede6d8, roughness: 0.62, metalness: 0.08 }, 'high');
    const copperDomeMat = getPbrMat({ map: textures.copperDome, roughness: 0.45, metalness: 0.5 }, 'high');

    // ── 3A. Central 7-Story Observation & Clock Tower (0, 0) ──
    const towerGroup = new THREE.Group();
    towerGroup.position.set(0, 0, 0);

    // Rusticated Limestone Podium Base (Floors 0-1, height 3.2m)
    const towerPodium = new THREE.Mesh(
      new THREE.BoxGeometry(18.4, 16.4, 3.2),
      limestoneMat
    );
    towerPodium.position.set(0, 0, 1.6);
    towerPodium.castShadow = true;
    towerPodium.receiveShadow = true;
    towerGroup.add(towerPodium);

    // Monumental Granite Entrance Steps on South
    for (let st = 0; st < 5; st++) {
      const stepW = 12.0 - st * 0.6;
      const stepD = 1.0;
      const stepH = 0.28;
      const step = new THREE.Mesh(new THREE.BoxGeometry(stepW, stepD, stepH), limestoneMat);
      step.position.set(0, -8.2 - st * 0.9, st * stepH + stepH / 2);
      step.castShadow = true;
      step.receiveShadow = true;
      towerGroup.add(step);
    }

    // Tower Shaft Lower Body (Floors 2-4: 14m tall, Flemish brick)
    const towerShaft = new THREE.Mesh(
      new THREE.BoxGeometry(16.0, 14.0, 14.0),
      brickMat
    );
    towerShaft.position.set(0, 0, 3.2 + 7.0);
    towerShaft.castShadow = true;
    towerShaft.receiveShadow = true;
    towerGroup.add(towerShaft);

    // 4 Corner Limestone Quoins on Lower Shaft
    [-8.0, 8.0].forEach(qx => {
      [-7.0, 7.0].forEach(qy => {
        const quoin = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 14.0), limestoneMat);
        quoin.position.set(qx, qy, 10.2);
        quoin.castShadow = true;
        towerGroup.add(quoin);
      });
    });

    // Protruding Stone Window Ledges & Lintels on south facade
    for (let fl = 0; fl < 3; fl++) {
      const fz = 4.8 + fl * 4.2;
      const sill = new THREE.Mesh(new THREE.BoxGeometry(14.8, 0.4, 0.22), limestoneMat);
      sill.position.set(0, -7.1, fz);
      sill.castShadow = true;
      towerGroup.add(sill);

      const lintel = new THREE.Mesh(new THREE.BoxGeometry(14.8, 0.4, 0.28), limestoneMat);
      lintel.position.set(0, -7.1, fz + 2.8);
      lintel.castShadow = true;
      towerGroup.add(lintel);
    }

    // Cantilevered Floor 4 Observation Balcony Cornice
    const balconyCornice = new THREE.Mesh(new THREE.BoxGeometry(17.6, 15.6, 0.8), limestoneMat);
    balconyCornice.position.set(0, 0, 17.6);
    balconyCornice.castShadow = true;
    towerGroup.add(balconyCornice);

    // Stone Balustrade surrounding the Floor 4 balcony
    const balSouth = createBalustrade(17.4, true);
    balSouth.position.set(0, -7.6, 18.0);
    towerGroup.add(balSouth);
    const balNorth = createBalustrade(17.4, true);
    balNorth.position.set(0, 7.6, 18.0);
    towerGroup.add(balNorth);
    const balWest = createBalustrade(15.4, false);
    balWest.position.set(-8.6, 0, 18.0);
    towerGroup.add(balWest);
    const balEast = createBalustrade(15.4, false);
    balEast.position.set(8.6, 0, 18.0);
    towerGroup.add(balEast);

    // Tower Shaft Upper Body (Floors 5-6: Clock Tower Stage, 10m tall, stepped setback)
    const towerUpper = new THREE.Mesh(new THREE.BoxGeometry(12.4, 10.4, 10.0), brickMat);
    towerUpper.position.set(0, 0, 18.0 + 5.0);
    towerUpper.castShadow = true;
    towerUpper.receiveShadow = true;
    towerGroup.add(towerUpper);

    // 4 Large Circular Clock Faces on all 4 elevations (Diameter 3.4m)
    const clockGeo = new THREE.CylinderGeometry(1.7, 1.7, 0.25, 24);
    const clockFaceMat = getPbrMat({ color: 0x0f172a, roughness: 0.3, metalness: 0.8 }, 'high');
    const clockGoldMat = getPbrMat({ color: 0xfacc15, roughness: 0.25, metalness: 0.9 }, 'high');

    const addClockDial = (px, py, pz, rotX, rotY) => {
      const cDial = new THREE.Mesh(clockGeo, clockFaceMat);
      cDial.position.set(px, py, pz);
      cDial.rotation.x = rotX;
      cDial.rotation.z = rotY;
      towerGroup.add(cDial);

      // Gold rim
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.12, 12, 24), clockGoldMat);
      rim.position.set(px, py, pz);
      rim.rotation.x = rotX;
      rim.rotation.z = rotY;
      towerGroup.add(rim);

      // Gold clock hands
      const handH = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.08), clockGoldMat);
      handH.position.set(px, py, pz + 0.15);
      handH.rotation.z = 0.8;
      towerGroup.add(handH);
      const handM = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.4, 0.08), clockGoldMat);
      handM.position.set(px, py, pz + 0.15);
      handM.rotation.z = -0.4;
      towerGroup.add(handM);
    };
    addClockDial(0, -5.3, 23.0, Math.PI / 2, 0); // South clock
    addClockDial(0, 5.3, 23.0, Math.PI / 2, 0);  // North clock
    addClockDial(-6.3, 0, 23.0, 0, Math.PI / 2); // West clock
    addClockDial(6.3, 0, 23.0, 0, Math.PI / 2);  // East clock

    // Floor 7 Belvedere Open Arched Colonnade (Height 4.8m)
    const belvedereGroup = new THREE.Group();
    belvedereGroup.position.set(0, 0, 28.0);

    const belBase = new THREE.Mesh(new THREE.BoxGeometry(11.6, 9.6, 0.6), limestoneMat);
    belBase.position.set(0, 0, 0.3);
    belvedereGroup.add(belBase);

    // 12 Colonnade Columns supporting belvedere roof
    const colMat = limestoneMat;
    [-4.8, -1.6, 1.6, 4.8].forEach(cx => {
      [-3.8, 3.8].forEach(cy => {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 4.0, 12), colMat);
        col.position.set(cx, cy, 2.3);
        col.rotation.x = Math.PI / 2;
        col.castShadow = true;
        belvedereGroup.add(col);
      });
    });
    [-3.8, 3.8].forEach(cx => {
      [-1.2, 1.2].forEach(cy => {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 4.0, 12), colMat);
        col.position.set(cx, cy, 2.3);
        col.rotation.x = Math.PI / 2;
        col.castShadow = true;
        belvedereGroup.add(col);
      });
    });

    const belEntablature = new THREE.Mesh(new THREE.BoxGeometry(12.0, 10.0, 0.8), limestoneMat);
    belEntablature.position.set(0, 0, 4.7);
    belEntablature.castShadow = true;
    belvedereGroup.add(belEntablature);
    towerGroup.add(belvedereGroup);

    // Spanish Barrel Tile Hipped Roof atop Belvedere (Height 5.2m)
    const towerRoof = createPitchedRoofMesh(12.4, 10.4, 5.2, tileRoofMat, true);
    towerRoof.position.set(0, 0, 33.5);
    towerGroup.add(towerRoof);

    // Oxidized Copper Lantern Cupola on roof ridge
    const cupolaGroup = new THREE.Group();
    cupolaGroup.position.set(0, 0, 38.7);

    const cupolaBase = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.1, 1.8, 8), copperDomeMat);
    cupolaBase.position.set(0, 0, 0.9);
    cupolaBase.rotation.x = Math.PI / 2;
    cupolaBase.castShadow = true;
    cupolaGroup.add(cupolaBase);

    const cupolaDome = new THREE.Mesh(new THREE.SphereGeometry(1.85, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), copperDomeMat);
    cupolaDome.position.set(0, 0, 1.8);
    cupolaDome.castShadow = true;
    cupolaGroup.add(cupolaDome);

    // Spire Mast with Aircraft Warning Beacon
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.18, 8.0, 8),
      getPbrMat({ color: 0x94a3b8, roughness: 0.3, metalness: 0.8 }, 'high')
    );
    mast.position.set(0, 0, 5.8);
    mast.rotation.x = Math.PI / 2;
    cupolaGroup.add(mast);

    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.95 });
    beaconMatRef.current = beaconMat;
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 12), beaconMat);
    beacon.position.set(0, 0, 9.8);
    cupolaGroup.add(beacon);

    towerGroup.add(cupolaGroup);

    // Monumental 2-Story Entrance Portico (South side of tower)
    const porticoGroup = new THREE.Group();
    porticoGroup.position.set(0, -9.2, 0);

    // 4 Classical Limestone Columns
    [-4.2, -1.4, 1.4, 4.2].forEach(cx => {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, 6.8, 16), limestoneMat);
      col.position.set(cx, -1.5, 3.4);
      col.rotation.x = Math.PI / 2;
      col.castShadow = true;
      porticoGroup.add(col);

      const colBase = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 0.45), limestoneMat);
      colBase.position.set(cx, -1.5, 0.22);
      colBase.castShadow = true;
      porticoGroup.add(colBase);
    });

    // Portico Pediment with Classical Tympanum
    const pedimentBeam = new THREE.Mesh(new THREE.BoxGeometry(11.2, 3.8, 0.8), limestoneMat);
    pedimentBeam.position.set(0, -0.6, 7.2);
    pedimentBeam.castShadow = true;
    porticoGroup.add(pedimentBeam);

    const tympanum = createPitchedRoofMesh(11.4, 3.8, 2.2, limestoneMat, true);
    tympanum.position.set(0, -0.6, 7.6);
    porticoGroup.add(tympanum);

    // Double Grand Entrance Doors (Deep bronze with arched transom)
    const doorFrame = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 0.8, 5.2),
      getPbrMat({ color: 0x1c1917, roughness: 0.4, metalness: 0.6 }, 'high')
    );
    doorFrame.position.set(0, 0.6, 2.6);
    porticoGroup.add(doorFrame);

    const doorPanels = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 0.4, 4.6),
      getPbrMat({ color: 0x78350f, roughness: 0.45, metalness: 0.2 }, 'high')
    );
    doorPanels.position.set(0, 0.4, 2.3);
    porticoGroup.add(doorPanels);

    towerGroup.add(porticoGroup);
    mainComplexGroup.add(towerGroup);

    // ── 3B. Flanking Symmetrical East & West Wings ──
    const createCollegiateWing = (posX, isEast = true) => {
      const wingGroup = new THREE.Group();
      wingGroup.position.set(posX, 0, 0);

      // Wing dimensions: 36m long, 14m deep, 13.5m tall
      const wingL = 36.0; const wingD = 14.0; const wingH = 13.5;

      // Rusticated Limestone Plinth
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(wingL + 0.6, wingD + 0.6, 1.2), limestoneMat);
      plinth.position.set(0, 0, 0.6);
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      wingGroup.add(plinth);

      // Main Flemish-bond Brick Body
      const body = new THREE.Mesh(new THREE.BoxGeometry(wingL, wingD, wingH), brickMat);
      body.position.set(0, 0, wingH / 2 + 0.6);
      body.castShadow = true;
      body.receiveShadow = true;
      wingGroup.add(body);

      // Ground Floor Covered Arched Loggia Colonnade along South facade
      const loggia = createArchedLoggia(wingL - 2, 3.2, 4.2, 7, 0.32);
      loggia.position.set(0, -wingD / 2 - 0.2, 1.2);
      wingGroup.add(loggia);

      // Limestone Beltcourses between floors
      [5.2, 9.4].forEach(bz => {
        const belt = new THREE.Mesh(new THREE.BoxGeometry(wingL + 0.4, wingD + 0.4, 0.35), limestoneMat);
        belt.position.set(0, 0, bz);
        belt.castShadow = true;
        wingGroup.add(belt);
      });

      // Eaves Dentil Cornice & Parapet
      const cornice = new THREE.Mesh(new THREE.BoxGeometry(wingL + 0.8, wingD + 0.8, 0.65), limestoneMat);
      cornice.position.set(0, 0, wingH + 0.6);
      cornice.castShadow = true;
      wingGroup.add(cornice);

      // Stone Balustrade around the perimeter of roof eaves
      const balS = createBalustrade(wingL - 1, true);
      balS.position.set(0, -wingD / 2 + 0.2, wingH + 0.9);
      wingGroup.add(balS);
      const balN = createBalustrade(wingL - 1, true);
      balN.position.set(0, wingD / 2 - 0.2, wingH + 0.9);
      wingGroup.add(balN);

      // Urn Finials on balustrade corners
      [-wingL / 2 + 0.6, wingL / 2 - 0.6].forEach(ux => {
        [-wingD / 2 + 0.4, wingD / 2 - 0.4].forEach(uy => {
          const urn = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.14, 0.8, 8), limestoneMat);
          urn.position.set(ux, uy, wingH + 1.8);
          urn.rotation.x = Math.PI / 2;
          urn.castShadow = true;
          wingGroup.add(urn);
        });
      });

      // Pitched Spanish Terracotta Tile Roof (Hipped, height 5.8m)
      const roof = createPitchedRoofMesh(wingL, wingD, 5.8, tileRoofMat, true);
      roof.position.set(0, 0, wingH + 0.9);
      wingGroup.add(roof);

      // 5 Projecting 3D Gabled Dormer Windows along South roof slope
      for (let d = 0; d < 5; d++) {
        const dx = -wingL / 2 + 5.0 + d * 6.5;
        const dormer = new THREE.Group();
        dormer.position.set(dx, -wingD / 2 + 1.6, wingH + 1.8);

        // Dormer walls
        const dWalls = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, 2.2), limestoneMat);
        dWalls.position.set(0, 0, 1.1);
        dWalls.castShadow = true;
        dormer.add(dWalls);

        // Dormer pitched tile roof
        const dRoof = createPitchedRoofMesh(2.5, 2.8, 1.2, tileRoofMat, false);
        dRoof.position.set(0, 0, 2.2);
        dormer.add(dRoof);

        // Dormer window pane
        const dGlass = new THREE.Mesh(
          new THREE.PlaneGeometry(1.4, 1.5),
          getPbrMat({ color: 0x0f172a, roughness: 0.1, metalness: 0.9 }, 'high')
        );
        dGlass.position.set(0, -1.32, 1.2);
        dormer.add(dGlass);

        wingGroup.add(dormer);
      }

      return wingGroup;
    };

    // East Wing (Science & Library) at x: 27
    const eastWing = createCollegiateWing(27.0, true);
    mainComplexGroup.add(eastWing);

    // West Wing (Humanities & Administration) at x: -27
    const westWing = createCollegiateWing(-27.0, false);
    mainComplexGroup.add(westWing);

    group.add(mainComplexGroup);

    // ── 4. Building 1: West Science & Auditorium Rotunda (-42, 22, z: 1.75) ──
    const rotundaGroup = new THREE.Group();
    rotundaGroup.position.set(-42, 22, 1.75);

    // Concentric Circular Limestone Podium Steps (Diameter 24m)
    [
      { r: 12.2, h: 0.35, z: 0.175 },
      { r: 11.4, h: 0.35, z: 0.525 },
      { r: 10.6, h: 0.40, z: 0.900 }
    ].forEach(st => {
      const step = new THREE.Mesh(new THREE.CylinderGeometry(st.r, st.r, st.h, 32), limestoneMat);
      step.position.set(0, 0, st.z);
      step.rotation.x = Math.PI / 2;
      step.castShadow = true;
      step.receiveShadow = true;
      rotundaGroup.add(step);
    });

    // Cylindrical Rotunda Drum Body (Diameter 18m, height 10.5m)
    const drumMat = getPbrMat({
      map: textures.rotundaFacade,
      roughness: 0.60,
      metalness: 0.12
    }, 'high');
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(9.0, 9.0, 10.5, 32), drumMat);
    drum.position.set(0, 0, 1.1 + 5.25);
    drum.rotation.x = Math.PI / 2;
    drum.castShadow = true;
    drum.receiveShadow = true;
    rotundaGroup.add(drum);

    // Circular Perimeter Colonnade of 16 Fluted Columns
    for (let c = 0; c < 16; c++) {
      const ang = (c * Math.PI * 2) / 16;
      const cx = Math.cos(ang) * 10.2;
      const cy = Math.sin(ang) * 10.2;

      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.44, 9.5, 12), limestoneMat);
      col.position.set(cx, cy, 1.1 + 4.75);
      col.rotation.x = Math.PI / 2;
      col.castShadow = true;
      rotundaGroup.add(col);

      // Capital
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.4), limestoneMat);
      cap.position.set(cx, cy, 1.1 + 9.5);
      cap.castShadow = true;
      rotundaGroup.add(cap);
    }

    // Circular Classical Entablature Ring & Balustrade
    const entablature = new THREE.Mesh(
      new THREE.CylinderGeometry(10.8, 10.8, 1.2, 32),
      limestoneMat
    );
    entablature.position.set(0, 0, 1.1 + 10.8);
    entablature.rotation.x = Math.PI / 2;
    entablature.castShadow = true;
    rotundaGroup.add(entablature);

    // Hemispherical Oxidized Copper Dome (Diameter 17.6m, height 7.5m)
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(8.8, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      copperDomeMat
    );
    dome.position.set(0, 0, 1.1 + 11.4);
    dome.scale.set(1.0, 1.0, 0.85);
    dome.castShadow = true;
    dome.receiveShadow = true;
    rotundaGroup.add(dome);

    // Classical Octagonal Copper Lantern Cupola & Spire atop Dome
    const rLantern = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.7, 2.2, 8),
      copperDomeMat
    );
    rLantern.position.set(0, 0, 1.1 + 11.4 + 7.5 + 1.1);
    rLantern.rotation.x = Math.PI / 2;
    rLantern.castShadow = true;
    rotundaGroup.add(rLantern);

    const rFinial = new THREE.Mesh(
      new THREE.ConeGeometry(0.4, 3.2, 8),
      getPbrMat({ color: 0xfacc15, roughness: 0.25, metalness: 0.9 }, 'high')
    );
    rFinial.position.set(0, 0, 1.1 + 11.4 + 7.5 + 2.2 + 1.6);
    rFinial.rotation.x = -Math.PI / 2;
    rotundaGroup.add(rFinial);

    group.add(rotundaGroup);

    // ── 5. Building 2: NE Advanced Technology & Research Center (44, 26, z: 1.5) ──
    const bldg2Group = new THREE.Group();
    bldg2Group.position.set(44, 26, 1.5);

    const b2Plinth = new THREE.Mesh(new THREE.BoxGeometry(36.4, 16.4, 0.8), limestoneMat);
    b2Plinth.position.set(0, 0, 0.4);
    b2Plinth.castShadow = true;
    bldg2Group.add(b2Plinth);

    const b2Body = new THREE.Mesh(
      new THREE.BoxGeometry(36.0, 16.0, 14.0),
      getPbrMat({
        map: textures.labFacade,
        normalMap: textures.labNormal,
        roughness: 0.62,
        metalness: 0.18
      }, 'high')
    );
    b2Body.position.set(0, 0, 7.4);
    b2Body.castShadow = true;
    b2Body.receiveShadow = true;
    bldg2Group.add(b2Body);

    const b2Parapet = new THREE.Mesh(new THREE.BoxGeometry(36.2, 16.2, 0.9), limestoneMat);
    b2Parapet.position.set(0, 0, 14.85);
    bldg2Group.add(b2Parapet);

    const b2Roof = new THREE.Mesh(
      new THREE.PlaneGeometry(35.2, 15.2),
      getPbrMat({ map: textures.roofMembrane, roughness: 0.75, metalness: 0.08, side: THREE.DoubleSide }, 'high')
    );
    b2Roof.position.set(0, 0, 14.45);
    b2Roof.receiveShadow = true;
    bldg2Group.add(b2Roof);

    // Rooftop Mechanical Penthouse Enclosure (12m x 8m x 3.8m)
    const penthouse = new THREE.Mesh(
      new THREE.BoxGeometry(12.0, 8.0, 3.8),
      getPbrMat({ map: textures.concrete, roughness: 0.65, metalness: 0.2 }, 'medium')
    );
    penthouse.position.set(-6.0, 1.5, 16.35);
    penthouse.castShadow = true;
    bldg2Group.add(penthouse);

    // Dual-fan Industrial HVAC Air Chillers
    [1, -1].forEach(dir => {
      const chiller = new THREE.Mesh(
        new THREE.BoxGeometry(3.0, 4.2, 1.8),
        getPbrMat({ map: textures.hvac, roughness: 0.45, metalness: 0.65 }, 'medium')
      );
      chiller.position.set(8.5, dir * 4.2, 15.35);
      chiller.castShadow = true;
      bldg2Group.add(chiller);

      [-1.0, 1.0].forEach(fy => {
        const fan = new THREE.Mesh(
          new THREE.CylinderGeometry(0.7, 0.7, 0.25, 16),
          getPbrMat({ color: 0x1e293b, roughness: 0.3, metalness: 0.8 }, 'medium')
        );
        fan.position.set(8.5, dir * 4.2 + fy, 16.35);
        fan.rotation.x = Math.PI / 2;
        bldg2Group.add(fan);
      });
    });

    // Angled Solar Photovoltaic Panel Array (South-facing at 28° tilt)
    const solarArray = new THREE.Group();
    solarArray.position.set(-8.0, -3.5, 14.8);
    solarArray.rotation.x = -0.48;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 7; c++) {
        const panel = new THREE.Mesh(
          new THREE.PlaneGeometry(1.6, 2.5),
          getPbrMat({ map: textures.solar, roughness: 0.18, metalness: 0.88, side: THREE.DoubleSide }, 'high')
        );
        panel.position.set(c * 1.75, r * 2.65, 0);
        panel.castShadow = true;
        solarArray.add(panel);
      }
    }
    bldg2Group.add(solarArray);

    // Stainless Steel Laboratory Exhaust Flues
    [-2, 2].forEach(fx => {
      const flue = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.35, 4.2, 12),
        getPbrMat({ color: 0xcfd8dc, roughness: 0.2, metalness: 0.9 }, 'medium')
      );
      flue.position.set(-6 + fx, 4.0, 18.2);
      flue.rotation.x = Math.PI / 2;
      flue.castShadow = true;
      bldg2Group.add(flue);
    });

    group.add(bldg2Group);

    // ── 6. Building 3: SW Historic Collegiate Quadrangle (-38, -20, z: 0.6) ──
    const bldg3Group = new THREE.Group();
    bldg3Group.position.set(-38, -20, 0.6);

    // L-Shaped Collegiate Brick Quad (Wing A: 32m x 11m, Wing B: 11m x 20m)
    const b3WingA = new THREE.Mesh(new THREE.BoxGeometry(32.0, 11.0, 11.5), brickMat);
    b3WingA.position.set(0, 0, 5.75);
    b3WingA.castShadow = true;
    b3WingA.receiveShadow = true;
    bldg3Group.add(b3WingA);

    const b3WingB = new THREE.Mesh(new THREE.BoxGeometry(11.0, 18.0, 11.5), brickMat);
    b3WingB.position.set(10.5, 14.5, 5.75);
    b3WingB.castShadow = true;
    b3WingB.receiveShadow = true;
    bldg3Group.add(b3WingB);

    // Steeply Pitched Slate Gabled Roofs with Copper Cresting
    const b3RoofA = createPitchedRoofMesh(32.4, 11.4, 5.2, tileRoofMat, true);
    b3RoofA.position.set(0, 0, 11.5);
    bldg3Group.add(b3RoofA);

    const b3RoofB = createPitchedRoofMesh(11.4, 18.4, 5.2, tileRoofMat, false);
    b3RoofB.position.set(10.5, 14.5, 11.5);
    bldg3Group.add(b3RoofB);

    // Central Pointed Arched Carriage Tunnel Passageway (Opening through Wing A)
    const tunnelArch = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 2.4, 11.2, 16, 1, false, 0, Math.PI),
      limestoneMat
    );
    tunnelArch.position.set(0, 0, 3.8);
    tunnelArch.rotation.z = Math.PI / 2;
    tunnelArch.rotation.x = Math.PI / 2;
    bldg3Group.add(tunnelArch);

    // Tall Stone & Brick Chimneys
    [-11, 7].forEach(cx => {
      const chim = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 8.5), brickMat);
      chim.position.set(cx, 0, 13.5);
      chim.castShadow = true;
      bldg3Group.add(chim);

      const chimCap = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.0, 0.5), limestoneMat);
      chimCap.position.set(cx, 0, 18.0);
      bldg3Group.add(chimCap);
    });

    group.add(bldg3Group);

    // ── 7. Building 4: SE Engineering Hub & Utility Substation (50, -18, z: 0.8) ──
    const bldg4Group = new THREE.Group();
    bldg4Group.position.set(50, -18, 0.8);

    const b4Body = new THREE.Mesh(new THREE.BoxGeometry(30.0, 15.0, 11.0), brickMat);
    b4Body.position.set(0, 0, 5.5);
    b4Body.castShadow = true;
    b4Body.receiveShadow = true;
    bldg4Group.add(b4Body);

    // 2 Overhead Metal Roll-Up Bay Doors on West elevation
    [-5.5, 5.5].forEach(dx => {
      const bayDoor = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 4.2, 4.8),
        getPbrMat({ color: 0x475569, roughness: 0.4, metalness: 0.75 }, 'high')
      );
      bayDoor.position.set(-15.1, dx, 2.4);
      bayDoor.castShadow = true;
      bldg4Group.add(bayDoor);
    });

    const b4Roof = new THREE.Mesh(
      new THREE.PlaneGeometry(29.2, 14.2),
      getPbrMat({ map: textures.roofMembrane, roughness: 0.75, metalness: 0.08, side: THREE.DoubleSide }, 'high')
    );
    b4Roof.position.set(0, 0, 11.05);
    b4Roof.receiveShadow = true;
    bldg4Group.add(b4Roof);

    // Substation Compound with Electrical Transformers
    const subGroup = new THREE.Group();
    subGroup.position.set(0, -13.0, 0);

    // Gravel bed
    const gravel = new THREE.Mesh(
      new THREE.PlaneGeometry(16.0, 9.0),
      getPbrMat({ color: 0x64748b, roughness: 0.9, metalness: 0.1, side: THREE.DoubleSide }, 'high')
    );
    gravel.position.set(0, 0, 0.05);
    subGroup.add(gravel);

    // 2 High-Voltage Transformers
    [-4.0, 4.0].forEach(tx => {
      const xfmr = new THREE.Mesh(
        new THREE.BoxGeometry(3.2, 2.4, 2.8),
        getPbrMat({ color: 0x334155, roughness: 0.5, metalness: 0.6 }, 'medium')
      );
      xfmr.position.set(tx, 0, 1.4);
      xfmr.castShadow = true;
      subGroup.add(xfmr);

      // Ceramic bushing insulators on top
      [-0.8, 0, 0.8].forEach(bx => {
        const bush = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.16, 1.1, 8),
          getPbrMat({ color: 0x991b1b, roughness: 0.3, metalness: 0.4 }, 'medium')
        );
        bush.position.set(tx + bx, 0, 3.35);
        bush.rotation.x = Math.PI / 2;
        subGroup.add(bush);
      });
    });

    bldg4Group.add(subGroup);
    group.add(bldg4Group);

    // ── 8. Building 5: Victorian Garden Conservatory / Orangery (6, -16, z: 0.4) ──
    const consGroup = new THREE.Group();
    consGroup.position.set(6, -16, 0.4);

    // Low brick foundation knee-wall
    const cKneeWall = new THREE.Mesh(new THREE.BoxGeometry(18.2, 10.2, 0.9), brickMat);
    cKneeWall.position.set(0, 0, 0.45);
    cKneeWall.castShadow = true;
    consGroup.add(cKneeWall);

    // Glass curtain walls
    const cGlass = new THREE.Mesh(
      new THREE.BoxGeometry(18.0, 10.0, 4.2),
      getPbrMat({
        map: textures.glassCurtain,
        roughness: 0.1,
        metalness: 0.9,
        transparent: true,
        opacity: 0.82
      }, 'high')
    );
    cGlass.position.set(0, 0, 3.0);
    cGlass.castShadow = true;
    consGroup.add(cGlass);

    // Barrel-Vaulted Glass & Steel Roof
    const vaultGeo = new THREE.CylinderGeometry(5.0, 5.0, 18.0, 24, 1, false, 0, Math.PI);
    const vaultMat = getPbrMat({
      color: 0x38bdf8,
      roughness: 0.1,
      metalness: 0.85,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide
    }, 'high');
    const vault = new THREE.Mesh(vaultGeo, vaultMat);
    vault.position.set(0, 0, 5.1);
    vault.rotation.z = Math.PI / 2;
    vault.castShadow = true;
    consGroup.add(vault);

    // Dark green structural steel ribs
    for (let r = -8; r <= 8; r += 4) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(5.05, 0.12, 8, 24, Math.PI), limestoneMat);
      rib.position.set(r, 0, 5.1);
      rib.rotation.y = Math.PI / 2;
      consGroup.add(rib);
    }

    // Silhouetted lush tropical plants visible inside
    for (let p = -6; p <= 6; p += 3) {
      const plant = new THREE.Mesh(
        new THREE.SphereGeometry(1.6, 8, 6),
        getPbrMat({ color: 0x166534, roughness: 0.8, metalness: 0.05 }, 'high')
      );
      plant.position.set(p, (Math.random() - 0.5) * 4, 2.0);
      plant.scale.set(0.9, 0.9, 1.4);
      consGroup.add(plant);
    }

    group.add(consGroup);

    // ── 9. Raised Concrete Road Curbs & Boulevard Streetlights ──
    const kerbMat = getPbrMat({ color: 0x94a3b8, roughness: 0.65, metalness: 0.1 }, 'high');
    const roadKerbPts = [
      new THREE.Vector2(-68, -42), new THREE.Vector2(-46, -38), new THREE.Vector2(-24, -34),
      new THREE.Vector2(0, -31), new THREE.Vector2(24, -28), new THREE.Vector2(48, -25), new THREE.Vector2(68, -22)
    ];

    for (let ki = 0; ki < roadKerbPts.length - 1; ki++) {
      const a = roadKerbPts[ki]; const b = roadKerbPts[ki + 1];
      const dx = b.x - a.x; const dy = b.y - a.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const mx = (a.x + b.x) / 2; const my = (a.y + b.y) / 2;
      const angle = Math.atan2(dy, dx);

      const kNorth = new THREE.Mesh(new THREE.BoxGeometry(len, 0.45, 0.22), kerbMat);
      kNorth.position.set(mx - (dy / len) * 8.2, my + (dx / len) * 8.2, 0.45);
      kNorth.rotation.z = angle;
      kNorth.castShadow = true;
      group.add(kNorth);

      const kSouth = new THREE.Mesh(new THREE.BoxGeometry(len, 0.45, 0.22), kerbMat);
      kSouth.position.set(mx + (dy / len) * 8.2, my - (dx / len) * 8.2, 0.45);
      kSouth.rotation.z = angle;
      kSouth.castShadow = true;
      group.add(kSouth);
    }

    // Cobra-head LED Streetlight Poles
    [-54, -28, -2, 24, 50].forEach(sx => {
      const poleGroup = new THREE.Group();
      poleGroup.position.set(sx, -22 + (sx * 0.12), 0.5);

      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.18, 9.5, 8),
        getPbrMat({ color: 0x64748b, roughness: 0.35, metalness: 0.8 }, 'high')
      );
      pole.position.set(0, 0, 4.75);
      pole.rotation.x = Math.PI / 2;
      pole.castShadow = true;
      poleGroup.add(pole);

      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 2.4, 0.15),
        getPbrMat({ color: 0x64748b, roughness: 0.35, metalness: 0.8 }, 'high')
      );
      arm.position.set(0, -1.0, 9.5);
      arm.rotation.x = 0.3;
      poleGroup.add(arm);

      const luminaire = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.9, 0.2),
        getPbrMat({ color: 0xf8fafc, roughness: 0.2, metalness: 0.5 }, 'high')
      );
      luminaire.position.set(0, -2.0, 9.2);
      poleGroup.add(luminaire);

      group.add(poleGroup);
    });

    // ── 10. 28 Detailed 3D Environmental Vehicles ──
    const carGroup = new THREE.Group();
    const carPalette = [0xf8fafc, 0xcfd8dc, 0x334155, 0xb91c1c, 0x1e3a8a, 0x111827, 0x475569];

    const createCar = (cx, cy, cz, rotZ, colorHex, isSUV = false) => {
      const cSub = new THREE.Group();
      cSub.position.set(cx, cy, cz);
      cSub.rotation.z = rotZ;

      const bodyL = isSUV ? 4.6 : 4.2;
      const bodyW = isSUV ? 2.1 : 1.9;
      const bodyH = isSUV ? 1.1 : 0.9;

      const chassis = new THREE.Mesh(
        new THREE.BoxGeometry(bodyL, bodyW, bodyH),
        getPbrMat({ color: colorHex, roughness: 0.3, metalness: 0.75 }, 'high')
      );
      chassis.position.set(0, 0, bodyH / 2 + 0.1);
      chassis.castShadow = true;
      cSub.add(chassis);

      const cabinL = isSUV ? 2.8 : 2.3;
      const cabinW = bodyW * 0.86;
      const cabinH = isSUV ? 0.85 : 0.72;
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(cabinL, cabinW, cabinH),
        getPbrMat({ color: 0x0f172a, roughness: 0.08, metalness: 0.92 }, 'high')
      );
      cabin.position.set(-0.2, 0, bodyH + cabinH / 2 + 0.05);
      cabin.castShadow = true;
      cSub.add(cabin);

      const wheelMat = getPbrMat({ color: 0x111827, roughness: 0.9, metalness: 0.1 }, 'high');
      [[-bodyL * 0.32, -bodyW * 0.5], [bodyL * 0.32, -bodyW * 0.5], [-bodyL * 0.32, bodyW * 0.5], [bodyL * 0.32, bodyW * 0.5]].forEach(([wx, wy]) => {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 8), wheelMat);
        wheel.position.set(wx, wy, 0.36);
        wheel.rotation.x = Math.PI / 2;
        cSub.add(wheel);
      });

      const hlMat = new THREE.MeshBasicMaterial({ color: 0xfffbe6 });
      const tlMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
      [-0.6, 0.6].forEach(wy => {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 0.18), hlMat);
        hl.position.set(bodyL / 2 + 0.02, wy, 0.65);
        cSub.add(hl);
        const tl = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 0.18), tlMat);
        tl.position.set(-bodyL / 2 - 0.02, wy, 0.65);
        cSub.add(tl);
      });

      return cSub;
    };

    // West Parking Lot (18 vehicles)
    for (let i = 0; i < 18; i++) {
      const row = i < 9 ? 0 : 1;
      const col = i % 9;
      const px = -56 + col * 2.8;
      const py = -8 + row * 12.0;
      const clr = carPalette[i % carPalette.length];
      carGroup.add(createCar(px, py, 0.55, Math.PI * 0.5, clr, i % 3 === 0));
    }

    // NE Operations Lot (8 service vehicles)
    for (let i = 0; i < 8; i++) {
      const px = 37 + i * 2.6;
      const py = 31;
      const clr = carPalette[(i * 2) % carPalette.length];
      carGroup.add(createCar(px, py, 1.7, 0, clr, true));
    }

    // Active Traffic on Boulevard & Loop Road (10 vehicles)
    const trafficCars = [
      { x: -52, y: -38, rot: 0.18, clr: 0xb91c1c, suv: false },
      { x: -24, y: -33, rot: 0.14, clr: 0xf8fafc, suv: true },
      { x: 6, y: -30, rot: 0.12, clr: 0x1e3a8a, suv: false },
      { x: 36, y: -26, rot: 0.14, clr: 0x334155, suv: false },
      { x: 56, y: -23, rot: 0.15, clr: 0xcfd8dc, suv: true },
      { x: 24, y: -6, rot: Math.PI * 0.5, clr: 0x111827, suv: false },
      { x: 26, y: 16, rot: Math.PI * 0.45, clr: 0xf8fafc, suv: true },
      { x: -40, y: -36, rot: 0.16, clr: 0x475569, suv: false },
      { x: -8, y: -31, rot: 0.12, clr: 0xb91c1c, suv: true },
      { x: 48, y: -24, rot: 0.14, clr: 0x1e3a8a, suv: false }
    ];
    trafficCars.forEach(tc => {
      carGroup.add(createCar(tc.x, tc.y, 0.5, tc.rot, tc.clr, tc.suv));
    });

    group.add(carGroup);

    // ── 11. Multi-Species Photogrammetric Vegetation (115+ Trees, 135+ Shrubs) ──
    const treeGroup = new THREE.Group();
    const trunkMat = getPbrMat({ color: 0x3d2b1f, roughness: 0.95, metalness: 0.02 }, 'high');
    const trunkMat2 = getPbrMat({ color: 0x4a3626, roughness: 0.92, metalness: 0.02 }, 'high');

    const leafPalette = [
      getPbrMat({ color: 0x22421e, roughness: 0.84, metalness: 0.04 }, 'high'), // deep forest
      getPbrMat({ color: 0x2d5024, roughness: 0.82, metalness: 0.04 }, 'high'), // classic foliage
      getPbrMat({ color: 0x365a2a, roughness: 0.80, metalness: 0.05 }, 'high'), // medium olive
      getPbrMat({ color: 0x3c6430, roughness: 0.78, metalness: 0.04 }, 'high'), // vibrant green
      getPbrMat({ color: 0x1b3618, roughness: 0.86, metalness: 0.03 }, 'high'), // dark conifer
      getPbrMat({ color: 0x426834, roughness: 0.76, metalness: 0.05 }, 'high'), // sunlit canopy
      getPbrMat({ color: 0x6e4a3b, roughness: 0.82, metalness: 0.04 }, 'high')  // flowering blush
    ];

    const treeArchitectures = [
      // 0: Spreading mature oak
      { trunkH: 3.8, trunkR: 0.42, trunkFlare: 0.62, crowns: [
        { ox: 0, oy: 0, oz: 0.8, rx: 1.6, ry: 1.6, rz: 0.75 },
        { ox: 1.2, oy: 0.4, oz: 0.35, rx: 1.05, ry: 1.05, rz: 0.65 },
        { ox: -1.1, oy: 0.6, oz: 0.45, rx: 0.95, ry: 0.95, rz: 0.60 },
        { ox: 0.4, oy: -1.2, oz: 0.5, rx: 0.95, ry: 0.95, rz: 0.62 },
        { ox: -0.6, oy: 0.9, oz: 0.85, rx: 0.78, ry: 0.78, rz: 0.58 }
      ], baseR: 3.8 },
      // 1: Upright columnar poplar
      { trunkH: 5.2, trunkR: 0.25, trunkFlare: 0.34, crowns: [
        { ox: 0, oy: 0, oz: 0.2, rx: 0.85, ry: 0.85, rz: 1.15 },
        { ox: 0.45, oy: 0.2, oz: 0.55, rx: 0.65, ry: 0.65, rz: 0.85 },
        { ox: -0.35, oy: -0.3, oz: 0.75, rx: 0.60, ry: 0.60, rz: 0.75 }
      ], baseR: 2.2 },
      // 2: Rounded landscape maple
      { trunkH: 2.6, trunkR: 0.30, trunkFlare: 0.42, crowns: [
        { ox: 0, oy: 0, oz: 0.25, rx: 1.15, ry: 1.15, rz: 0.95 },
        { ox: 0.75, oy: 0.3, oz: 0.25, rx: 0.80, ry: 0.80, rz: 0.75 },
        { ox: -0.65, oy: 0.4, oz: 0.25, rx: 0.75, ry: 0.75, rz: 0.70 }
      ], baseR: 2.7 },
      // 3: Dense conifer / pine
      { trunkH: 4.6, trunkR: 0.32, trunkFlare: 0.48, crowns: [
        { ox: 0, oy: 0, oz: 0.1, rx: 1.3, ry: 1.3, rz: 0.6 },
        { ox: 0, oy: 0, oz: 0.6, rx: 1.0, ry: 1.0, rz: 0.55 },
        { ox: 0, oy: 0, oz: 1.1, rx: 0.7, ry: 0.7, rz: 0.5 }
      ], baseR: 2.5 },
      // 4: Flowering dogwood
      { trunkH: 2.8, trunkR: 0.18, trunkFlare: 0.26, crowns: [
        { ox: 0, oy: 0, oz: 0.3, rx: 0.85, ry: 0.85, rz: 0.80 },
        { ox: 0.5, oy: 0.2, oz: 0.2, rx: 0.55, ry: 0.55, rz: 0.50 }
      ], baseR: 1.9 },
      // 5: Weeping willow (drooping branches near water)
      { trunkH: 3.4, trunkR: 0.38, trunkFlare: 0.55, crowns: [
        { ox: 0, oy: 0, oz: 0.5, rx: 1.4, ry: 1.4, rz: 0.85 },
        { ox: 0.8, oy: 0.6, oz: 0.2, rx: 0.9, ry: 0.9, rz: 1.1 },
        { ox: -0.8, oy: -0.6, oz: 0.2, rx: 0.9, ry: 0.9, rz: 1.1 }
      ], baseR: 3.2 }
    ];

    const buildTree = (tx, ty, tz, archIdx, scale, colorIdx, lean = 0) => {
      const arch = treeArchitectures[archIdx % treeArchitectures.length];
      const tSub = new THREE.Group();
      tSub.position.set(tx, ty, tz);
      tSub.scale.set(scale, scale, scale);
      if (lean) tSub.rotation.y = lean;

      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(arch.trunkR * 0.7, arch.trunkFlare, arch.trunkH, 7, 1, false),
        archIdx % 2 === 0 ? trunkMat : trunkMat2
      );
      trunk.rotation.x = Math.PI / 2;
      trunk.position.set(0, 0, arch.trunkH / 2);
      trunk.castShadow = true;
      tSub.add(trunk);

      const primaryMat = leafPalette[colorIdx % leafPalette.length];
      const secondaryMat = leafPalette[(colorIdx + 2) % leafPalette.length];
      arch.crowns.forEach((c, ci) => {
        const cMat = ci % 2 === 0 ? primaryMat : secondaryMat;
        const crownMesh = new THREE.Mesh(
          new THREE.SphereGeometry(arch.baseR, 8, 6),
          cMat
        );
        crownMesh.position.set(c.ox * arch.baseR, c.oy * arch.baseR, arch.trunkH + c.oz * arch.baseR);
        crownMesh.scale.set(c.rx, c.ry, c.rz);
        crownMesh.castShadow = true;
        crownMesh.receiveShadow = true;
        tSub.add(crownMesh);
      });

      return tSub;
    };

    // Strategic campus tree placements (115+ trees)
    const treeSpecs = [
      // South Boulevard roadside avenue trees
      [-64, -48, 0.4, 0, 0.95, 1, 0.05], [-50, -44, 0.4, 1, 0.90, 3, -0.06], [-36, -40, 0.4, 0, 1.05, 0, 0.08],
      [-22, -37, 0.4, 2, 0.88, 2, -0.04], [-8, -34, 0.4, 1, 0.92, 4, 0.06], [6, -32, 0.4, 0, 1.00, 1, -0.08],
      [20, -30, 0.4, 3, 0.95, 4, 0.05], [34, -28, 0.4, 1, 0.88, 2, -0.05], [48, -26, 0.4, 0, 1.08, 0, 0.07],
      [62, -24, 0.4, 2, 0.85, 3, -0.07],
      // North loop road trees
      [20, 10, 0.8, 1, 0.85, 1, 0.0], [22, 22, 1.2, 4, 0.80, 2, 0.0], [32, 34, 1.6, 0, 0.95, 0, 0.08],
      [52, 38, 1.6, 2, 0.90, 3, -0.06], [64, 26, 1.4, 3, 0.92, 4, 0.05],
      // West parking lot perimeter grove
      [-66, -14, 0.6, 3, 1.00, 4, 0.0], [-66, -2, 0.6, 0, 1.05, 0, 0.08], [-66, 10, 0.8, 1, 0.92, 2, -0.06],
      [-56, 12, 0.9, 2, 0.85, 1, 0.05], [-34, 8, 0.8, 4, 0.78, 3, -0.04],
      // Building 1 (Rotunda) perimeter trees
      [-54, 32, 1.8, 0, 1.02, 1, 0.06], [-38, 36, 1.8, 2, 0.88, 3, -0.08], [-26, 32, 1.6, 1, 0.90, 0, 0.05],
      // Quadrangle trees (Building 3)
      [-54, -22, 0.6, 3, 0.95, 4, 0.0], [-48, -36, 0.5, 0, 0.92, 2, 0.08], [-26, -36, 0.5, 2, 0.85, 1, -0.05],
      [-36, -8, 0.6, 4, 0.82, 6, 0.0], [-26, -12, 0.6, 1, 0.88, 1, 0.0],
      // Reflecting canal perimeter weeping willows (arch 5)
      [-3, 4, 0.4, 5, 0.92, 1, 0.06], [12, 4, 0.4, 5, 0.95, 3, -0.05], [26, 4, 0.4, 5, 0.90, 0, 0.04],
      [-3, -12, 0.4, 5, 0.92, 2, -0.06], [12, -12, 0.4, 5, 0.95, 1, 0.05], [26, -12, 0.4, 5, 0.90, 3, -0.04],
      // Grand Quadrangle ornamental trees
      [-14, -6, 0.65, 4, 0.82, 6, 0.0], [-14, -14, 0.65, 4, 0.82, 6, 0.0], [22, -6, 0.65, 4, 0.85, 6, 0.0],
      [22, -14, 0.65, 4, 0.85, 6, 0.0], [8, 6, 0.9, 0, 0.92, 0, 0.06], [-2, 6, 0.9, 2, 0.86, 3, -0.06],
      // East wing & Building 4 parkland
      [42, -4, 0.8, 0, 0.98, 1, 0.08], [58, -4, 0.8, 1, 0.90, 2, -0.05], [64, -14, 0.8, 3, 0.96, 4, 0.0],
      [58, -28, 0.7, 0, 1.05, 0, 0.07], [42, -28, 0.7, 2, 0.88, 3, -0.05],
      // North backdrop forest
      [-12, 34, 1.4, 0, 1.10, 1, 0.08], [4, 36, 1.4, 3, 1.05, 4, -0.05], [18, 34, 1.5, 0, 1.08, 0, 0.06],
      [30, 28, 1.5, 2, 0.92, 2, -0.07], [-2, 40, 1.6, 3, 1.15, 4, 0.0], [12, 42, 1.6, 0, 1.12, 0, 0.08],
      // Additional campus infill trees
      [-48, 8, 1.2, 1, 0.86, 1, 0.0], [-46, -4, 0.8, 2, 0.84, 2, 0.0], [2, 28, 1.4, 0, 0.96, 3, 0.05],
      [8, 30, 1.4, 4, 0.80, 6, 0.0], [48, 12, 1.2, 1, 0.92, 1, -0.04], [52, 2, 1.0, 3, 0.94, 4, 0.0]
    ];

    const treeLocations = treeSpecs.map(s => [s[0], s[1], s[2]]);

    treeSpecs.forEach(spec => {
      const [tx, ty, tz, archIdx, scale, colorIdx, lean] = spec;
      treeGroup.add(buildTree(tx, ty, tz, archIdx, scale, colorIdx, lean));
    });

    // 135+ Low Landscape Boxwood Shrubs hugging building foundations & walkways
    const shrubMat = getPbrMat({ color: 0x224c1f, roughness: 0.82, metalness: 0.04 }, 'high');
    const shrubGeo = new THREE.SphereGeometry(0.75, 7, 5);
    const shrubLocs = [];
    // Along front of East Wing
    for (let x = 10; x <= 44; x += 2.2) shrubLocs.push([x, 6.2, 1.25]);
    // Along front of West Wing
    for (let x = -44; x <= -10; x += 2.2) shrubLocs.push([x, 6.2, 1.25]);
    // Along Quad terrace
    for (let x = -18; x <= 26; x += 3.2) shrubLocs.push([x, -19.5, 0.6]);
    // Along sunken canal coping
    for (let x = -1; x <= 25; x += 2.8) {
      shrubLocs.push([x, 1.6, 0.4]);
      shrubLocs.push([x, -9.6, 0.4]);
    }
    shrubLocs.forEach(([sx, sy, sz]) => {
      const shrub = new THREE.Mesh(shrubGeo, shrubMat);
      shrub.position.set(sx, sy, sz + 0.45);
      shrub.scale.set(1.0, 1.0, 0.75);
      shrub.castShadow = true;
      treeGroup.add(shrub);
    });

    group.add(treeGroup);

    // ── 12. Geodetic Ground Control Points (GCP-01, GCP-02, GCP-03) ──
    const gcpCoords = [
      { name: 'GCP-01', x: -48, y: 32, z: 2.1 },
      { name: 'GCP-02', x: 54, y: 24, z: 1.8 },
      { name: 'GCP-03', x: 28, y: -34, z: 0.8 }
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

    // ── 13. Dense Photogrammetric Survey Point Cloud (~88,000 Points) ──
    const pGeo = new THREE.BufferGeometry();
    const pPositions = [];
    const pColors = [];

    // 13A. Terrain & Ground Surface Points (Step = 1.4m across 160m x 160m)
    for (let px = -76; px <= 76; px += 1.4) {
      for (let py = -76; py <= 76; py += 1.4) {
        // Organic drone coverage boundary mask
        if (px * px + py * py > 76 * 76) continue;

        let pz = 1.1 + (py * 0.015) - (px * 0.012) +
                 Math.sin(px * 0.038) * Math.cos(py * 0.038) * 0.85;

        let r = 0.22, g = 0.34, b = 0.16; // default turf green

        // Road corridor points (dark asphalt with yellow/white lines)
        if (py < -20 && py > -42) {
          pz = 0.35;
          r = 0.14; g = 0.15; b = 0.17;
          if (Math.abs(py - (-31)) < 0.4) { // yellow line
            r = 0.90; g = 0.72; b = 0.12;
          }
        } else if (px > -18 && px < 26 && py > -20 && py < 6) {
          // Quad sandstone pavers
          pz = 0.55;
          r = 0.80; g = 0.76; b = 0.70;
        } else if (px > -1 && px < 25 && py > -9 && py < 1) {
          // Sunken canal water
          pz = -0.15;
          r = 0.08; g = 0.24; b = 0.34;
        } else if (px < -38 && py < 8 && py > -14) {
          // West parking lot asphalt
          pz = 0.55;
          r = 0.16; g = 0.17; b = 0.19;
        }

        pPositions.push(px, py, pz);
        pColors.push(r, g, b);
      }
    }

    // 13B. Main Complex Roof & Wall Points
    // Tower Roof (Terracotta tiles: z 33.5 to 38.7)
    for (let bx = -6; bx <= 6; bx += 0.6) {
      for (let by = -5; by <= 5; by += 0.6) {
        const pz = 33.5 + (1 - Math.max(Math.abs(bx)/6, Math.abs(by)/5)) * 5.2;
        pPositions.push(4 + bx, 14 + by, pz);
        pColors.push(0.68, 0.30, 0.20);
      }
    }
    // East Wing Roof (Tile roof: z 14.4 to 19.8)
    for (let bx = -17; bx <= 17; bx += 0.7) {
      for (let by = -6.5; by <= 6.5; by += 0.7) {
        const pz = 14.4 + (1 - Math.abs(by)/6.5) * 5.4;
        pPositions.push(31 + bx, 14 + by, pz);
        pColors.push(0.65, 0.28, 0.18);
      }
    }
    // West Wing Roof
    for (let bx = -17; bx <= 17; bx += 0.7) {
      for (let by = -6.5; by <= 6.5; by += 0.7) {
        const pz = 14.4 + (1 - Math.abs(by)/6.5) * 5.4;
        pPositions.push(-23 + bx, 14 + by, pz);
        pColors.push(0.65, 0.28, 0.18);
      }
    }

    // 13C. Secondary Buildings Roof Points
    // Rotunda Dome (Oxidized copper: z 12.5 to 20.0)
    for (let rad = 0; rad <= 8.5; rad += 0.7) {
      const circ = Math.max(6, Math.floor(rad * 8));
      for (let c = 0; c < circ; c++) {
        const ang = (c * Math.PI * 2) / circ;
        const px = -42 + Math.cos(ang) * rad;
        const py = 22 + Math.sin(ang) * rad;
        const pz = 12.5 + Math.sqrt(Math.max(0, 8.5 * 8.5 - rad * rad)) * 0.85;
        pPositions.push(px, py, pz);
        pColors.push(0.26, 0.58, 0.49); // copper verdigris
      }
    }

    // NE Research Center Roof (z 15.9)
    for (let bx = 27; bx <= 61; bx += 0.9) {
      for (let by = 18; by <= 34; by += 0.9) {
        pPositions.push(bx, by, 15.9);
        pColors.push(0.48, 0.50, 0.53);
      }
    }

    // SW Quad Slate Roofs (z 12.1 to 17.3)
    for (let bx = -54; bx <= -22; bx += 0.8) {
      for (let by = -25; by <= -15; by += 0.8) {
        const pz = 12.1 + (1 - Math.abs(by - (-20)) / 5.5) * 5.2;
        pPositions.push(bx, by, pz);
        pColors.push(0.35, 0.38, 0.44); // slate blue-gray
      }
    }

    // SE Engineering Roof (z 11.8)
    for (let bx = 36; bx <= 64; bx += 0.9) {
      for (let by = -25; by <= -11; by += 0.9) {
        pPositions.push(bx, by, 11.8);
        pColors.push(0.42, 0.44, 0.46);
      }
    }

    // 13D. Dense Tree Canopy Foliage Points (~18,000 Points)
    treeLocations.forEach(([tx, ty, tz]) => {
      for (let i = 0; i < 75; i++) {
        const rad = 1.6 + Math.random() * 2.4;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        const px = tx + rad * Math.sin(phi) * Math.cos(theta);
        const py = ty + rad * Math.sin(phi) * Math.sin(theta);
        const pz = tz + 3.4 + rad * Math.cos(phi);
        pPositions.push(px, py, pz);
        pColors.push(
          0.16 + Math.random() * 0.08,
          0.36 + Math.random() * 0.14,
          0.14 + Math.random() * 0.06
        );
      }
    });

    pGeo.setAttribute('position', new THREE.Float32BufferAttribute(pPositions, 3));
    pGeo.setAttribute('color', new THREE.Float32BufferAttribute(pColors, 3));
    originalColorsRef.current = new Float32Array(pColors);

    const pMat = new THREE.PointsMaterial({
      size: pointSize || 0.45,
      vertexColors: true,
      sizeAttenuation: true
    });
    const pts = new THREE.Points(pGeo, pMat);
    pts.visible = (renderMode === 'pointcloud') || (renderMode === 'textured' && layers.points);
    sceneRef.current.add(pts);
    pointsObjRef.current = pts;
    setPointCount(pPositions.length / 3);

    sceneRef.current.add(group);
    meshObjRef.current = group;
    setTriangleCount(120 * 120 * 2 + 8400);
    setBoundingBox({ width: '160.0', length: '160.0', height: '48.5' });
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
    lookAtTargetRef.current.set(0, 4, 6);
    if (cameraRef.current) {
      cameraRef.current.position.set(-35, -75, 58);
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
      <div className="mobile-viewer-title" style={{ position: 'absolute', top: '16px', left: '20px', zIndex: 20, pointerEvents: 'none' }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', margin: 0 }}>
          {title}
        </h2>
        <p style={{ fontSize: '0.74rem', color: '#64748b', marginTop: '3px', fontWeight: 500, margin: 0 }}>
          {subtitle}
        </p>
      </div>

      {/* Top Right Live Coordinates & Telemetry HUD (Feature 12) */}
      <div className="mobile-hide" style={{ position: 'absolute', top: '16px', right: '20px', zIndex: 20 }}>
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
      <div className="mobile-toolbar-container" style={{
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
        <div className="mobile-viewer-panels" style={{
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
        <div className="mobile-viewer-panels" style={{
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
