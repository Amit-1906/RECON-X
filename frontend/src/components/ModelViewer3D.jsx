import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Eye, Layers, Compass, ZoomIn, ZoomOut, RotateCcw, Camera, Box } from 'lucide-react';

export default function ModelViewer3D({ 
  plyUrl, 
  objUrl, 
  posesUrl, 
  title = "3D Digital Twin",
  subtitle = "Interactive Photogrammetric Reconstruction"
}) {
  const mountRef = useRef(null);
  const [pointCount, setPointCount] = useState(0);
  const [triangleCount, setTriangleCount] = useState(0);
  const [renderMode, setRenderMode] = useState('pointcloud'); // 'pointcloud' | 'mesh' | 'both'
  const [colorMode, setColorMode] = useState('rgb'); // 'rgb' | 'elevation'
  const [pointSize, setPointSize] = useState(0.06);
  const [showFrustums, setShowFrustums] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // References to Three.js objects
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const pointsObjRef = useRef(null);
  const meshObjRef = useRef(null);
  const frustumsGroupRef = useRef(null);
  const gridRef = useRef(null);
  const originalColorsRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070b14);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      2000
    );
    camera.position.set(0, -35, 45);
    camera.up.set(0, 0, 1); // Z is up in GIS photogrammetry
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(50, 50, 100);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.5);
    dirLight2.position.set(-50, -50, -20);
    scene.add(dirLight2);

    // Spatial Grid Helper
    const grid = new THREE.GridHelper(100, 50, 0x06b6d4, 0x1e293b);
    grid.rotation.x = Math.PI / 2; // Orient grid onto XY ground plane
    scene.add(grid);
    gridRef.current = grid;

    // Camera Frustums Group
    const frustumsGroup = new THREE.Group();
    scene.add(frustumsGroup);
    frustumsGroupRef.current = frustumsGroup;

    // Simple Orbit Controls (Drag & Zoom)
    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };
    let spherical = { radius: 60, theta: Math.PI / 4, phi: Math.PI / 3 };

    const updateCameraPos = () => {
      camera.position.x = spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
      camera.position.y = -spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
      camera.position.z = spherical.radius * Math.cos(spherical.phi);
      camera.lookAt(0, 0, 0);
    };
    updateCameraPos();

    const onMouseDown = (e) => {
      isDragging = true;
      prevMouse = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - prevMouse.x;
      const dy = e.clientY - prevMouse.y;
      prevMouse = { x: e.clientX, y: e.clientY };

      spherical.theta -= dx * 0.008;
      spherical.phi = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, spherical.phi + dy * 0.008));
      updateCameraPos();
    };

    const onMouseUp = () => { isDragging = false; };

    const onWheel = (e) => {
      e.preventDefault();
      spherical.radius = Math.max(5, Math.min(300, spherical.radius + e.deltaY * 0.08));
      updateCameraPos();
    };

    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('wheel', onWheel, { passive: false });

    // Animation loop
    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
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
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    };
  }, []);

  // Fetch and parse PLY point cloud
  useEffect(() => {
    if (!plyUrl || !sceneRef.current) return;
    setLoading(true);
    setError(null);

    fetch(plyUrl)
      .then(res => {
        if (!res.ok) throw new Error("Could not load PLY artifact");
        return res.text();
      })
      .then(text => {
        const lines = text.split('\n');
        let inHeader = true;
        const positions = [];
        const colors = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (inHeader) {
            if (line === 'end_header') inHeader = false;
            continue;
          }
          if (!line) continue;
          const parts = line.split(/\s+/);
          if (parts.length >= 3) {
            positions.push(parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2]));
            if (parts.length >= 6) {
              colors.push(
                parseFloat(parts[3]) / 255,
                parseFloat(parts[4]) / 255,
                parseFloat(parts[5]) / 255
              );
            } else {
              colors.push(0.7, 0.8, 0.9);
            }
          }
        }

        if (positions.length === 0) return;

        // Remove old point cloud
        if (pointsObjRef.current) {
          sceneRef.current.remove(pointsObjRef.current);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        originalColorsRef.current = new Float32Array(colors);

        geometry.computeBoundingSphere();
        const center = geometry.boundingSphere.center;
        geometry.center(); // Center cloud around origin (0, 0, 0)

        const material = new THREE.PointsMaterial({
          size: pointSize,
          vertexColors: true,
          sizeAttenuation: true
        });

        const pointsObj = new THREE.Points(geometry, material);
        sceneRef.current.add(pointsObj);
        pointsObjRef.current = pointsObj;
        setPointCount(positions.length / 3);
        setLoading(false);
      })
      .catch(err => {
        console.warn("PLY Load info:", err.message);
        setLoading(false);
      });
  }, [plyUrl]);

  // Fetch and parse OBJ mesh
  useEffect(() => {
    if (!objUrl || !sceneRef.current) return;

    fetch(objUrl)
      .then(res => {
        if (!res.ok) throw new Error("Could not load OBJ artifact");
        return res.text();
      })
      .then(text => {
        const lines = text.split('\n');
        const verts = [];
        const faces = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line.startsWith('v ')) {
            const p = line.split(/\s+/).slice(1).map(Number);
            verts.push(p[0], p[1], p[2]);
          } else if (line.startsWith('f ')) {
            const f = line.split(/\s+/).slice(1).map(token => {
              return parseInt(token.split('/')[0]) - 1;
            });
            if (f.length >= 3) {
              faces.push(f[0], f[1], f[2]);
            }
          }
        }

        if (verts.length === 0) return;

        if (meshObjRef.current) {
          sceneRef.current.remove(meshObjRef.current);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        if (faces.length > 0) {
          geometry.setIndex(faces);
        }
        geometry.computeVertexNormals();
        geometry.center();

        const material = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          roughness: 0.6,
          metalness: 0.2,
          wireframe: false,
          side: THREE.DoubleSide
        });

        const meshObj = new THREE.Mesh(geometry, material);
        sceneRef.current.add(meshObj);
        meshObjRef.current = meshObj;
        setTriangleCount(faces.length / 3);
      })
      .catch(err => console.warn("OBJ load info:", err.message));
  }, [objUrl]);

  // Fetch and render Camera Frustums along UAV trajectory
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

          // Small pyramid for camera frustum
          const pyrGeom = new THREE.ConeGeometry(0.8, 1.4, 4);
          pyrGeom.rotateX(Math.PI); // Point downwards towards terrain
          const pyrMat = new THREE.MeshBasicMaterial({
            color: idx === 0 ? 0x10b981 : 0x06b6d4,
            wireframe: true
          });
          const pyr = new THREE.Mesh(pyrGeom, pyrMat);
          pyr.position.copy(camVec);
          group.add(pyr);
        });

        // Flight trajectory line
        if (pathPoints.length > 1) {
          const lineGeom = new THREE.BufferGeometry().setFromPoints(pathPoints);
          const lineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 });
          const line = new THREE.Line(lineGeom, lineMat);
          group.add(line);
        }
      })
      .catch(err => console.debug("Camera poses info:", err.message));
  }, [posesUrl]);

  // Update Point Size
  useEffect(() => {
    if (pointsObjRef.current) {
      pointsObjRef.current.material.size = pointSize;
      pointsObjRef.current.material.needsUpdate = true;
    }
  }, [pointSize]);

  // Update Color Mode (RGB vs Elevation)
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
        // Blue (low) -> Cyan -> Green -> Yellow -> Red (high)
        const color = new THREE.Color().setHSL((1.0 - normZ) * 0.7, 1.0, 0.5);
        clrAttr.setXYZ(i, color.r, color.g, color.b);
      }
    }
    clrAttr.needsUpdate = true;
  }, [colorMode]);

  // Visibility Toggles
  useEffect(() => {
    if (pointsObjRef.current) {
      pointsObjRef.current.visible = (renderMode === 'pointcloud' || renderMode === 'both');
    }
    if (meshObjRef.current) {
      meshObjRef.current.visible = (renderMode === 'mesh' || renderMode === 'both');
    }
  }, [renderMode]);

  useEffect(() => {
    if (frustumsGroupRef.current) {
      frustumsGroupRef.current.visible = showFrustums;
    }
  }, [showFrustums]);

  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.visible = showGrid;
    }
  }, [showGrid]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '560px', borderRadius: '12px', overflow: 'hidden' }} className="glass-panel">
      {/* 3D WebGL Canvas container */}
      <div ref={mountRef} style={{ width: '100%', height: '100%', minHeight: '560px', cursor: 'grab' }} />

      {/* Top HUD Header */}
      <div style={{
        position: 'absolute',
        top: '16px',
        left: '16px',
        right: '16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        pointerEvents: 'none'
      }}>
        <div style={{ background: 'rgba(6, 9, 15, 0.85)', backdropFilter: 'blur(8px)', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border-subtle)', pointerEvents: 'auto' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>{title}</h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{subtitle}</p>
        </div>

        {/* Real-time stats */}
        <div style={{ display: 'flex', gap: '8px', pointerEvents: 'auto' }}>
          <div style={{ background: 'rgba(6, 9, 15, 0.85)', backdropFilter: 'blur(8px)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', textAlign: 'right' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>Points</span>
            <span className="font-mono" style={{ fontSize: '0.9rem', fontWeight: 700, color: '#38bdf8' }}>
              {pointCount > 0 ? pointCount.toLocaleString() : 'N/A'}
            </span>
          </div>

          <div style={{ background: 'rgba(6, 9, 15, 0.85)', backdropFilter: 'blur(8px)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', textAlign: 'right' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)', textTransform: 'uppercase', display: 'block' }}>Triangles</span>
            <span className="font-mono" style={{ fontSize: '0.9rem', fontWeight: 700, color: '#34d399' }}>
              {triangleCount > 0 ? triangleCount.toLocaleString() : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      {/* Floating Control Toolbar */}
      <div style={{
        position: 'absolute',
        bottom: '16px',
        left: '16px',
        right: '16px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'rgba(10, 16, 29, 0.9)',
        backdropFilter: 'blur(12px)',
        padding: '10px 16px',
        borderRadius: '10px',
        border: '1px solid var(--border-subtle)'
      }}>
        {/* Render & Color Mode Toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', padding: '2px' }}>
            <button
              onClick={() => setRenderMode('pointcloud')}
              style={{
                padding: '4px 10px',
                borderRadius: '4px',
                background: renderMode === 'pointcloud' ? 'rgba(6,182,212,0.2)' : 'transparent',
                color: renderMode === 'pointcloud' ? '#38bdf8' : 'var(--text-muted)',
                border: 'none',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Dense Cloud
            </button>
            <button
              onClick={() => setRenderMode('mesh')}
              style={{
                padding: '4px 10px',
                borderRadius: '4px',
                background: renderMode === 'mesh' ? 'rgba(6,182,212,0.2)' : 'transparent',
                color: renderMode === 'mesh' ? '#38bdf8' : 'var(--text-muted)',
                border: 'none',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Surface Mesh
            </button>
            <button
              onClick={() => setRenderMode('both')}
              style={{
                padding: '4px 10px',
                borderRadius: '4px',
                background: renderMode === 'both' ? 'rgba(6,182,212,0.2)' : 'transparent',
                color: renderMode === 'both' ? '#38bdf8' : 'var(--text-muted)',
                border: 'none',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Combined
            </button>
          </div>

          {/* Color Palette Toggle */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', padding: '2px' }}>
            <button
              onClick={() => setColorMode('rgb')}
              style={{
                padding: '4px 10px',
                borderRadius: '4px',
                background: colorMode === 'rgb' ? 'rgba(6,182,212,0.2)' : 'transparent',
                color: colorMode === 'rgb' ? '#38bdf8' : 'var(--text-muted)',
                border: 'none',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Natural RGB
            </button>
            <button
              onClick={() => setColorMode('elevation')}
              style={{
                padding: '4px 10px',
                borderRadius: '4px',
                background: colorMode === 'elevation' ? 'rgba(6,182,212,0.2)' : 'transparent',
                color: colorMode === 'elevation' ? '#38bdf8' : 'var(--text-muted)',
                border: 'none',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Elevation Heatmap
            </button>
          </div>
        </div>

        {/* Layers & Helpers Toggles */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={showFrustums} 
              onChange={e => setShowFrustums(e.target.checked)} 
            />
            <Camera size={13} /> UAV Trajectory
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={showGrid} 
              onChange={e => setShowGrid(e.target.checked)} 
            />
            <Compass size={13} /> Metric Grid
          </label>

          {/* Point Size slider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Size:</span>
            <input
              type="range"
              min="0.01"
              max="0.25"
              step="0.01"
              value={pointSize}
              onChange={e => setPointSize(parseFloat(e.target.value))}
              style={{ width: '70px' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
