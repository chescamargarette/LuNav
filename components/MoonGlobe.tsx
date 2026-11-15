"use client";

import { memo, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LandingSite } from "@/data/mockSites";
import {
  LUNAR_ROVERS,
  getRoverCoordinatesAtEpoch,
  getRoverTraversePath,
} from "@/data/rovers";
import { getLunarCelestialAngles } from "@/utils/lunarEphemeris";
import { SpaceMarkerShape, TrafficMapItem } from "@/components/MoonMap2D";

const MOON_TREK_EQ_WMTS =
  "https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{y}/{x}.jpg";

// Exact 1:1 Planetary Radius Scale referenced to Moon = 2.0 units (1 unit = 868.7 km)
const MOON_R = 2.0;
const LUNAR_KM_PER_DEG = 30.3233;

// Cislunar & Heliocentric Ecliptic Constants
const EARTH_MOON_DIST = 62.0;
const LUNAR_INCLINATION_RAD = (5.145 * Math.PI) / 180;
const AU_1_DIST = 2850.0;

function offsetLunarLatLon(
  lat: number,
  lon: number,
  distanceKm: number,
  bearingDeg: number
): [number, number] {
  const rad = (bearingDeg * Math.PI) / 180;
  const dLat = (distanceKm / LUNAR_KM_PER_DEG) * Math.cos(rad);
  const cosLat = Math.max(0.14, Math.cos((lat * Math.PI) / 180));
  const dLon = (distanceKm / (LUNAR_KM_PER_DEG * cosLat)) * Math.sin(rad);
  const nextLat = Math.max(-89.9, Math.min(89.9, lat + dLat));
  let nextLon = lon + dLon;
  while (nextLon > 180) nextLon -= 360;
  while (nextLon < -180) nextLon += 360;
  return [nextLat, nextLon];
}

interface LunarOrbiterSpec {
  id: string;
  name: string;
  agency: string;
  orbitType: string;
  semiMajor: number;
  semiMinor: number;
  inclinationRad: number;
  raanRad: number;
  periodHours: number;
  initialPhase: number;
  orbitColor: number;
}

const LUNAR_ORBITERS: LunarOrbiterSpec[] = [
  {
    id: "orbiter-lro",
    name: "LRO (LUNAR RECONNAISSANCE ORBITER)",
    agency: "NASA",
    orbitType: "50 KM POLAR MAPPING ORBIT",
    semiMajor: 2.26,
    semiMinor: 2.24,
    inclinationRad: 1.52,
    raanRad: 0.25,
    periodHours: 1.88,
    initialPhase: 0.3,
    orbitColor: 0x7dd3fc,
  },
  {
    id: "orbiter-chandrayaan2",
    name: "CHANDRAYAAN-2 ORBITER",
    agency: "ISRO",
    orbitType: "100 KM POLAR CIRCULAR ORBIT",
    semiMajor: 2.34,
    semiMinor: 2.33,
    inclinationRad: 1.54,
    raanRad: 1.45,
    periodHours: 1.97,
    initialPhase: 2.1,
    orbitColor: 0xfdba74,
  },
  {
    id: "orbiter-danuri",
    name: "DANURI (KPLO)",
    agency: "KARI",
    orbitType: "100 KM POLAR ORBIT",
    semiMajor: 2.38,
    semiMinor: 2.36,
    inclinationRad: -1.51,
    raanRad: -0.95,
    periodHours: 1.97,
    initialPhase: 4.0,
    orbitColor: 0x67e8f9,
  },
  {
    id: "orbiter-queqiao2",
    name: "QUEQIAO-2 RELAY",
    agency: "CNSA",
    orbitType: "FROZEN ELLIPTICAL SOUTH POLE RELAY",
    semiMajor: 2.86,
    semiMinor: 2.42,
    inclinationRad: 0.96,
    raanRad: -0.65,
    periodHours: 24.0,
    initialPhase: 1.7,
    orbitColor: 0xfcd34d,
  },
  {
    id: "orbiter-tiandu1",
    name: "TIANDU-1 NAV/COMMS",
    agency: "CNSA",
    orbitType: "FROZEN ELLIPTICAL TESTBED",
    semiMajor: 2.74,
    semiMinor: 2.38,
    inclinationRad: 1.02,
    raanRad: 0.85,
    periodHours: 21.5,
    initialPhase: 3.4,
    orbitColor: 0xf9a8d4,
  },
  {
    id: "orbiter-tiandu2",
    name: "TIANDU-2 NAV/COMMS",
    agency: "CNSA",
    orbitType: "FROZEN ELLIPTICAL TESTBED",
    semiMajor: 2.74,
    semiMinor: 2.38,
    inclinationRad: 1.02,
    raanRad: 0.85,
    periodHours: 21.5,
    initialPhase: 3.65,
    orbitColor: 0xf9a8d4,
  },
  {
    id: "orbiter-capstone",
    name: "CAPSTONE",
    agency: "NASA",
    orbitType: "NRHO CISLUNAR PATHFINDER",
    semiMajor: 3.18,
    semiMinor: 2.35,
    inclinationRad: -1.28,
    raanRad: 1.25,
    periodHours: 156.0,
    initialPhase: 4.9,
    orbitColor: 0xc4b5fd,
  },
  {
    id: "orbiter-artemis-p1",
    name: "THEMIS-ARTEMIS P1",
    agency: "NASA",
    orbitType: "EQUATORIAL ECCENTRIC ORBIT",
    semiMajor: 3.45,
    semiMinor: 2.75,
    inclinationRad: 0.18,
    raanRad: -0.35,
    periodHours: 26.5,
    initialPhase: 0.9,
    orbitColor: 0x86efac,
  },
  {
    id: "orbiter-artemis-p2",
    name: "THEMIS-ARTEMIS P2",
    agency: "NASA",
    orbitType: "RETROGRADE EQUATORIAL ORBIT",
    semiMajor: 3.55,
    semiMinor: 2.82,
    inclinationRad: -0.22,
    raanRad: 2.1,
    periodHours: 27.2,
    initialPhase: 3.9,
    orbitColor: 0x86efac,
  },
];

interface SupplementalSurfaceRover {
  id: string;
  name: string;
  agency: string;
  siteName: string;
  color: string;
  baseLat: number;
  baseLon: number;
  waypoints: [number, number][];
}

const SUPPLEMENTAL_LUNAR_ROVERS: SupplementalSurfaceRover[] = [
  {
    id: "rover-yutu2",
    name: "Yutu-2 (Chang'e-4)",
    agency: "CNSA",
    siteName: "Von Kármán Crater (SPA Basin)",
    color: "#fbbf24",
    baseLat: -45.46,
    baseLon: 177.59,
    waypoints: [
      [-45.46, 177.59],
      [-45.42, 177.52],
      [-45.38, 177.46],
      [-45.44, 177.55],
    ],
  },
  {
    id: "rover-pragyan",
    name: "Pragyan (Chandrayaan-3)",
    agency: "ISRO",
    siteName: "Statio Shiv Shakti (South Pole)",
    color: "#38bdf8",
    baseLat: -69.37,
    baseLon: 32.35,
    waypoints: [
      [-69.37, 32.35],
      [-69.34, 32.39],
      [-69.32, 32.33],
      [-69.36, 32.31],
    ],
  },
  {
    id: "rover-jinchan",
    name: "Jinchan (Chang'e-6)",
    agency: "CNSA",
    siteName: "Apollo Basin (Far Side)",
    color: "#f472b6",
    baseLat: -41.64,
    baseLon: -153.99,
    waypoints: [
      [-41.64, -153.99],
      [-41.61, -153.94],
      [-41.66, -153.92],
    ],
  },
  {
    id: "rover-soraq",
    name: "LEV-2 / SORA-Q (SLIM)",
    agency: "JAXA",
    siteName: "Shioli Crater Rim",
    color: "#a78bfa",
    baseLat: -13.32,
    baseLon: 25.25,
    waypoints: [
      [-13.32, 25.25],
      [-13.30, 25.28],
      [-13.34, 25.27],
    ],
  },
  {
    id: "rover-lunokhod2",
    name: "Lunokhod 2",
    agency: "USSR",
    siteName: "Le Monnier Crater",
    color: "#34d399",
    baseLat: 25.83,
    baseLon: 30.92,
    waypoints: [
      [25.83, 30.92],
      [25.75, 30.98],
      [25.68, 30.90],
    ],
  },
  {
    id: "rover-lunokhod1",
    name: "Lunokhod 1",
    agency: "USSR",
    siteName: "Mare Imbrium",
    color: "#60a5fa",
    baseLat: 38.24,
    baseLon: -35.0,
    waypoints: [
      [38.24, -35.0],
      [38.28, -34.94],
      [38.22, -34.91],
    ],
  },
];

function latLonToVec3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const theta = ((90 - lat) * Math.PI) / 180;
  const phi = ((lon + 180) * Math.PI) / 180;
  const x = -radius * Math.cos(phi) * Math.sin(theta);
  const y = radius * Math.cos(theta);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  return new THREE.Vector3(x, y, z);
}

function buildLunarAlbedoTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#525661";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;

  const cols = 8;
  const rows = 4;
  const tileW = canvas.width / cols;
  const tileH = canvas.height / rows;

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = MOON_TREK_EQ_WMTS.replace("{z}", "2")
        .replace("{y}", String(y))
        .replace("{x}", String(x));
      img.onload = () => {
        ctx.drawImage(img, x * tileW, y * tileH, tileW, tileH);
        texture.needsUpdate = true;
      };
    }
  }

  return texture;
}

function createPrng(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createMilkyWayBackdrop(galacticEuler: THREE.Euler): {
  mesh: THREE.Mesh;
  texture: THREE.CanvasTexture;
} {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#03050c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const bandGrad = ctx.createLinearGradient(0, 120, 0, 392);
  bandGrad.addColorStop(0.0, "rgba(15, 23, 42, 0)");
  bandGrad.addColorStop(0.28, "rgba(30, 41, 75, 0.14)");
  bandGrad.addColorStop(0.45, "rgba(67, 83, 138, 0.22)");
  bandGrad.addColorStop(0.5, "rgba(99, 115, 175, 0.25)");
  bandGrad.addColorStop(0.55, "rgba(67, 83, 138, 0.22)");
  bandGrad.addColorStop(0.72, "rgba(30, 41, 75, 0.14)");
  bandGrad.addColorStop(1.0, "rgba(15, 23, 42, 0)");
  ctx.fillStyle = bandGrad;
  ctx.fillRect(0, 120, canvas.width, 272);

  const rand = createPrng(4099);
  for (let i = 0; i < 140; i++) {
    const cx = rand() * canvas.width;
    const cy = 256 + (rand() - 0.5) * 95;
    const rx = 25 + rand() * 75;
    const isDarkRift = rand() < 0.38;
    const radGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, rx);
    if (isDarkRift) {
      radGrad.addColorStop(0, "rgba(3, 5, 12, 0.34)");
      radGrad.addColorStop(1, "rgba(3, 5, 12, 0)");
    } else {
      radGrad.addColorStop(0, "rgba(148, 163, 224, 0.09)");
      radGrad.addColorStop(1, "rgba(148, 163, 224, 0)");
    }
    ctx.fillStyle = radGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, rx, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;

  const geo = new THREE.SphereGeometry(23000, 48, 32);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.copy(galacticEuler);
  return { mesh, texture };
}

function createRealisticStarfield(
  pixelRatio: number,
  galacticEuler: THREE.Euler
): {
  points: THREE.Points;
  material: THREE.ShaderMaterial;
} {
  const fieldCount = 4600;
  const galacticCount = 2400;
  const totalCount = fieldCount + galacticCount;

  const positions = new Float32Array(totalCount * 3);
  const colors = new Float32Array(totalCount * 3);
  const sizes = new Float32Array(totalCount);
  const alphas = new Float32Array(totalCount);

  const spectralPalette = [
    { color: new THREE.Color(0xcad8ff), weight: 0.14 },
    { color: new THREE.Color(0xf8f9ff), weight: 0.34 },
    { color: new THREE.Color(0xfff6ea), weight: 0.24 },
    { color: new THREE.Color(0xffe4b8), weight: 0.15 },
    { color: new THREE.Color(0xffc987), weight: 0.09 },
    { color: new THREE.Color(0xffa46e), weight: 0.04 },
  ];

  const rand = createPrng(13379);
  const galQuat = new THREE.Quaternion().setFromEuler(galacticEuler);
  const tempPos = new THREE.Vector3();

  const pickSpectralColor = () => {
    const r = rand();
    let acc = 0;
    for (let i = 0; i < spectralPalette.length; i++) {
      acc += spectralPalette[i].weight;
      if (r <= acc) return spectralPalette[i].color;
    }
    return spectralPalette[1].color;
  };

  for (let i = 0; i < totalCount; i++) {
    const isGalactic = i >= fieldCount;
    const radius = 16500 + rand() * 4500;

    if (isGalactic) {
      const lon = rand() * Math.PI * 2;
      const g1 = rand() + rand() + rand() - 1.5;
      const lat = g1 * 0.22;
      tempPos.set(
        radius * Math.cos(lat) * Math.cos(lon),
        radius * Math.sin(lat),
        radius * Math.cos(lat) * Math.sin(lon)
      );
      tempPos.applyQuaternion(galQuat);
    } else {
      const u = rand();
      const v = rand();
      const theta = Math.acos(2 * u - 1);
      const phi = 2 * Math.PI * v;
      tempPos.set(
        radius * Math.sin(theta) * Math.cos(phi),
        radius * Math.cos(theta),
        radius * Math.sin(theta) * Math.sin(phi)
      );
    }

    positions[i * 3] = tempPos.x;
    positions[i * 3 + 1] = tempPos.y;
    positions[i * 3 + 2] = tempPos.z;

    const mag = Math.pow(rand(), 5.5);
    const size = isGalactic ? 1.4 + mag * 3.8 : 1.6 + mag * 5.2;
    const alpha = isGalactic ? 0.25 + mag * 0.72 : 0.32 + mag * 0.68;

    const spec = pickSpectralColor();
    colors[i * 3] = spec.r;
    colors[i * 3 + 1] = spec.g;
    colors[i * 3 + 2] = spec.b;
    sizes[i] = size;
    alphas[i] = Math.min(1.0, alpha);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: pixelRatio },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aAlpha;
      varying vec3 vColor;
      varying float vAlpha;
      uniform float uPixelRatio;

      void main() {
        vColor = color;
        vAlpha = aAlpha;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = aSize * uPixelRatio;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;

      void main() {
        vec2 cxy = 2.0 * gl_PointCoord - 1.0;
        float r2 = dot(cxy, cxy);
        if (r2 > 1.0) discard;

        float core = exp(-r2 * 16.0);
        float halo = 0.24 * exp(-r2 * 4.2);
        float intensity = (core + halo) * vAlpha;

        gl_FragColor = vec4(vColor * (1.0 + core * 0.45), intensity);
      }
    `,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, material };
}

function createSunGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(128, 128, 14, 128, 128, 128);
  grad.addColorStop(0, "rgba(255, 253, 240, 1)");
  grad.addColorStop(0.22, "rgba(254, 240, 138, 0.72)");
  grad.addColorStop(0.5, "rgba(251, 191, 36, 0.2)");
  grad.addColorStop(1, "rgba(251, 191, 36, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// =============================================================================
// REALISTIC EQUIRECTANGULAR PLANETARY SURFACE & ATMOSPHERE TEXTURE GENERATORS
// =============================================================================

function createMercuryTextures(): {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
} {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = w;
  bumpCanvas.height = h;
  const bCtx = bumpCanvas.getContext("2d")!;

  ctx.fillStyle = "#7c7771";
  ctx.fillRect(0, 0, w, h);
  bCtx.fillStyle = "#808080";
  bCtx.fillRect(0, 0, w, h);

  const rand = createPrng(10101);

  // Albedo mottling (intercrater plains & dark low-reflectance material)
  for (let i = 0; i < 320; i++) {
    const cx = rand() * w;
    const cy = rand() * h;
    const r = 18 + rand() * 65;
    const dark = rand() < 0.48;
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
    g.addColorStop(
      0,
      dark ? "rgba(68, 64, 60, 0.24)" : "rgba(168, 162, 158, 0.22)"
    );
    g.addColorStop(1, "rgba(124, 119, 113, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Multi-scale impact craters with bright ejecta rays & raised rims
  for (let i = 0; i < 650; i++) {
    const cx = rand() * w;
    const cy = 16 + rand() * (h - 32);
    const latScale = 1 / Math.max(0.32, Math.sin((cy / h) * Math.PI));
    const r = (1.8 + Math.pow(rand(), 3.2) * 24) * Math.min(2.2, latScale);

    // Bright ray system on large young craters
    if (r > 13 && rand() < 0.45) {
      ctx.save();
      ctx.strokeStyle = "rgba(214, 211, 209, 0.22)";
      ctx.lineWidth = 1.1;
      for (let k = 0; k < 10; k++) {
        const ang = rand() * Math.PI * 2;
        const len = r * (2.2 + rand() * 3.0);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
        ctx.lineTo(cx + Math.cos(ang) * len, cy + Math.sin(ang) * len);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Crater floor
    ctx.fillStyle = "rgba(82, 78, 74, 0.55)";
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.86, 0, Math.PI * 2);
    ctx.fill();

    // Raised bright rim
    ctx.strokeStyle = "rgba(190, 185, 178, 0.52)";
    ctx.lineWidth = Math.max(0.8, r * 0.12);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Bump height
    bCtx.fillStyle = "rgba(45, 45, 45, 0.65)";
    bCtx.beginPath();
    bCtx.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
    bCtx.fill();
    bCtx.strokeStyle = "rgba(225, 225, 225, 0.65)";
    bCtx.lineWidth = Math.max(1, r * 0.14);
    bCtx.beginPath();
    bCtx.arc(cx, cy, r, 0, Math.PI * 2);
    bCtx.stroke();
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const bump = new THREE.CanvasTexture(bumpCanvas);
  return { map, bump };
}

function createVenusTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const baseGrad = ctx.createLinearGradient(0, 0, 0, h);
  baseGrad.addColorStop(0.0, "#b89558");
  baseGrad.addColorStop(0.22, "#dfc184");
  baseGrad.addColorStop(0.5, "#f3deb0");
  baseGrad.addColorStop(0.78, "#dfc184");
  baseGrad.addColorStop(1.0, "#b89558");
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, w, h);

  const rand = createPrng(20202);
  // Characteristic V-shaped super-rotating sulfuric acid cloud bands
  for (let i = 0; i < 85; i++) {
    const y0 = rand() * h;
    const x0 = rand() * w;
    const amp = 14 + rand() * 26;
    const isDark = rand() < 0.52;
    ctx.strokeStyle = isDark
      ? "rgba(161, 120, 62, 0.22)"
      : "rgba(254, 249, 228, 0.26)";
    ctx.lineWidth = 6 + rand() * 18;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let x = -80; x <= w + 80; x += 24) {
      const phase = ((x - x0) / w) * Math.PI * 2;
      const chevron = Math.abs(((x - x0 + w) % w) / w - 0.5) * 2;
      const y = y0 + Math.sin(phase) * amp * 0.4 + (chevron - 0.5) * amp;
      if (x === -80) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function createEarthRealisticTextures(): {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
  clouds: THREE.CanvasTexture;
} {
  const w = 2048;
  const h = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = w;
  bumpCanvas.height = h;
  const bCtx = bumpCanvas.getContext("2d")!;

  // Deep ocean bathymetry gradient
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, h);
  oceanGrad.addColorStop(0.0, "#1e3a8a");
  oceanGrad.addColorStop(0.25, "#0f2966");
  oceanGrad.addColorStop(0.5, "#0b2259");
  oceanGrad.addColorStop(0.75, "#0f2966");
  oceanGrad.addColorStop(1.0, "#1e3a8a");
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, w, h);

  bCtx.fillStyle = "#101010";
  bCtx.fillRect(0, 0, w, h);

  // Equirectangular helper: lon [-180..180] -> x [0..w], lat [90..-90] -> y [0..h]
  const toXY = (lon: number, lat: number): [number, number] => [
    ((lon + 180) / 360) * w,
    ((90 - lat) / 180) * h,
  ];

  // Realistic world continental polygons (lon, lat)
  const continents: {
    pts: [number, number][];
    biome: "temperate" | "tropical" | "desert" | "ice";
  }[] = [
    // North America
    {
      biome: "temperate",
      pts: [
        [-168, 66], [-140, 70], [-95, 72], [-78, 64], [-62, 52],
        [-75, 38], [-81, 25], [-96, 26], [-104, 19], [-84, 9],
        [-92, 16], [-112, 26], [-122, 37], [-126, 49], [-148, 61],
      ],
    },
    // Greenland
    {
      biome: "ice",
      pts: [
        [-54, 60], [-42, 61], [-22, 70], [-20, 81], [-58, 82], [-66, 74],
      ],
    },
    // South America
    {
      biome: "tropical",
      pts: [
        [-78, 10], [-62, 10], [-50, 1], [-35, -7], [-40, -22],
        [-54, -34], [-66, -46], [-69, -55], [-75, -52], [-72, -32],
        [-81, -5],
      ],
    },
    // Europe
    {
      biome: "temperate",
      pts: [
        [-9, 37], [-9, 44], [-4, 48], [4, 52], [10, 58],
        [6, 62], [24, 70], [42, 67], [56, 56], [42, 43],
        [28, 41], [16, 39], [6, 43],
      ],
    },
    // Africa
    {
      biome: "desert",
      pts: [
        [-17, 15], [-6, 35], [10, 37], [32, 31], [43, 12],
        [51, 11], [41, -3], [39, -16], [33, -27], [20, -35],
        [15, -28], [12, -6], [8, 4], [-8, 5],
      ],
    },
    // Madagascar
    {
      biome: "tropical",
      pts: [
        [44, -25], [47, -25], [50, -13], [48, -13],
      ],
    },
    // Asia
    {
      biome: "temperate",
      pts: [
        [28, 41], [42, 43], [56, 56], [42, 67], [75, 73],
        [115, 74], [165, 67], [175, 62], [142, 53], [135, 36],
        [121, 31], [116, 22], [108, 12], [102, 2], [96, 16],
        [88, 22], [80, 8], [72, 21], [62, 25], [56, 26],
        [48, 30], [36, 33],
      ],
    },
    // Maritime Southeast Asia (Philippines, Borneo, Sumatra, Java, New Guinea)
    {
      biome: "tropical",
      pts: [
        [120, 18], [126, 12], [125, 6], [121, 7],
      ],
    },
    {
      biome: "tropical",
      pts: [
        [109, 2], [117, 6], [118, -3], [111, -3],
      ],
    },
    {
      biome: "tropical",
      pts: [
        [96, 5], [105, -5], [114, -8], [104, -7], [95, 2],
      ],
    },
    {
      biome: "tropical",
      pts: [
        [132, -2], [148, -6], [149, -10], [136, -7],
      ],
    },
    // Australia
    {
      biome: "desert",
      pts: [
        [114, -22], [128, -14], [136, -12], [144, -15], [153, -27],
        [149, -37], [138, -35], [129, -32], [115, -34],
      ],
    },
    // New Zealand
    {
      biome: "temperate",
      pts: [
        [167, -46], [174, -41], [177, -37], [172, -43],
      ],
    },
    // Antarctica
    {
      biome: "ice",
      pts: [
        [-180, -72], [-120, -74], [-60, -65], [-30, -74], [30, -70],
        [90, -68], [150, -71], [180, -73], [180, -90], [-180, -90],
      ],
    },
  ];

  const rand = createPrng(314159);

  // Subdivide polygon edges with fractal coastline jitter
  const subdivideCoast = (pts: [number, number][]) => {
    const out: [number, number][] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const steps = 6;
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const j = s === 0 ? 0 : (rand() - 0.5) * 3.2;
        out.push([
          a[0] + (b[0] - a[0]) * t + j,
          a[1] + (b[1] - a[1]) * t + j * 0.7,
        ]);
      }
    }
    return out;
  };

  continents.forEach((cont) => {
    const detailed = subdivideCoast(cont.pts);

    // Turquoise continental shelf coastal glow
    ctx.save();
    ctx.strokeStyle = "rgba(56, 189, 248, 0.42)";
    ctx.lineWidth = 10;
    ctx.lineJoin = "round";
    ctx.beginPath();
    detailed.forEach(([lon, lat], idx) => {
      const [x, y] = toXY(lon, lat);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();

    // Base landmass fill
    ctx.fillStyle =
      cont.biome === "ice"
        ? "#f1f5f9"
        : cont.biome === "tropical"
        ? "#166534"
        : cont.biome === "desert"
        ? "#a17c48"
        : "#235c36";
    ctx.fill();
    ctx.clip();

    // Biome texture mottling (forests, steppes, deserts, mountain ridges)
    for (let i = 0; i < 120; i++) {
      const p = detailed[Math.floor(rand() * detailed.length)];
      const [bx, by] = toXY(
        p[0] + (rand() - 0.5) * 28,
        p[1] + (rand() - 0.5) * 22
      );
      const r = 14 + rand() * 48;
      const latAbs = Math.abs(p[1]);
      let color = "rgba(34, 110, 56, 0.35)";
      if (cont.biome === "ice" || latAbs > 66) {
        color = "rgba(248, 250, 252, 0.55)";
      } else if (latAbs > 15 && latAbs < 34 && rand() < 0.62) {
        color = "rgba(194, 152, 88, 0.44)"; // Subtropical desert belt (Sahara, Arabia, Outback, SW US)
      } else if (latAbs <= 15) {
        color = "rgba(20, 95, 46, 0.46)"; // Equatorial rainforest
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Topography bump fill
    bCtx.fillStyle = cont.biome === "ice" ? "#b8b8b8" : "#969696";
    bCtx.beginPath();
    detailed.forEach(([lon, lat], idx) => {
      const [x, y] = toXY(lon, lat);
      if (idx === 0) bCtx.moveTo(x, y);
      else bCtx.lineTo(x, y);
    });
    bCtx.closePath();
    bCtx.fill();
  });

  // Northern Arctic sea ice cap
  ctx.fillStyle = "rgba(241, 245, 249, 0.88)";
  ctx.fillRect(0, 0, w, 28);

  // Separate transparent 3D Cloud Layer with cyclonic weather fronts
  const cloudCanvas = document.createElement("canvas");
  cloudCanvas.width = w;
  cloudCanvas.height = h;
  const cCtx = cloudCanvas.getContext("2d")!;
  cCtx.clearRect(0, 0, w, h);

  for (let i = 0; i < 240; i++) {
    const cx = rand() * w;
    const cy = 40 + rand() * (h - 80);
    const rx = 24 + rand() * 95;
    const ry = 5 + rand() * 14;
    const tilt = (rand() - 0.5) * 0.45;
    const grad = cCtx.createRadialGradient(cx, cy, 2, cx, cy, rx);
    grad.addColorStop(0, "rgba(255, 255, 255, 0.68)");
    grad.addColorStop(0.55, "rgba(248, 250, 252, 0.34)");
    grad.addColorStop(1, "rgba(255, 255, 255, 0)");
    cCtx.save();
    cCtx.translate(cx, cy);
    cCtx.rotate(tilt);
    cCtx.scale(1, ry / rx);
    cCtx.fillStyle = grad;
    cCtx.beginPath();
    cCtx.arc(0, 0, rx, 0, Math.PI * 2);
    cCtx.fill();
    cCtx.restore();
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 16;

  const bump = new THREE.CanvasTexture(bumpCanvas);
  const clouds = new THREE.CanvasTexture(cloudCanvas);
  clouds.colorSpace = THREE.SRGBColorSpace;
  clouds.anisotropy = 8;

  return { map, bump, clouds };
}

function createMarsTextures(): {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
} {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = w;
  bumpCanvas.height = h;
  const bCtx = bumpCanvas.getContext("2d")!;

  // Rusty iron-oxide base
  const baseGrad = ctx.createLinearGradient(0, 0, 0, h);
  baseGrad.addColorStop(0.0, "#b85d3b");
  baseGrad.addColorStop(0.5, "#c96a42");
  baseGrad.addColorStop(1.0, "#9e4b2d");
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, w, h);

  bCtx.fillStyle = "#808080";
  bCtx.fillRect(0, 0, w, h);

  const rand = createPrng(40404);

  // Dark basaltic albedo regions (Syrtis Major, Mare Erythraeum, Acidalia)
  for (let i = 0; i < 160; i++) {
    const cx = rand() * w;
    const cy = 60 + rand() * (h - 120);
    const r = 24 + rand() * 85;
    const isDarkBasalt = rand() < 0.58;
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, r);
    g.addColorStop(
      0,
      isDarkBasalt
        ? "rgba(78, 42, 32, 0.34)"
        : "rgba(224, 134, 86, 0.28)"
    );
    g.addColorStop(1, "rgba(180, 90, 55, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Valles Marineris equatorial canyon scar
  ctx.strokeStyle = "rgba(62, 32, 24, 0.65)";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(w * 0.24, h * 0.54);
  ctx.quadraticCurveTo(w * 0.33, h * 0.57, w * 0.42, h * 0.53);
  ctx.stroke();

  bCtx.strokeStyle = "rgba(25, 25, 25, 0.85)";
  bCtx.lineWidth = 8;
  bCtx.beginPath();
  bCtx.moveTo(w * 0.24, h * 0.54);
  bCtx.quadraticCurveTo(w * 0.33, h * 0.57, w * 0.42, h * 0.53);
  bCtx.stroke();

  // Southern highlands impact craters
  for (let i = 0; i < 240; i++) {
    const cx = rand() * w;
    const cy = h * 0.48 + rand() * (h * 0.44);
    const r = 2 + Math.pow(rand(), 2.8) * 18;
    ctx.strokeStyle = "rgba(218, 138, 94, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    bCtx.fillStyle = "rgba(50, 50, 50, 0.5)";
    bCtx.beginPath();
    bCtx.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
    bCtx.fill();
  }

  // North & South Polar CO2 / Water Ice Caps
  ctx.fillStyle = "rgba(248, 250, 252, 0.94)";
  ctx.beginPath();
  ctx.ellipse(w * 0.5, 8, w * 0.55, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h - 6, w * 0.55, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const bump = new THREE.CanvasTexture(bumpCanvas);
  return { map, bump };
}

function createJupiterTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // Multi-layered Jovian zonal belts and zones
  const bands = [
    { stop: 0.0, color: "#6e6259" },
    { stop: 0.12, color: "#9c8772" },
    { stop: 0.22, color: "#dfd2be" },
    { stop: 0.3, color: "#a85d38" }, // North Temperate Belt
    { stop: 0.36, color: "#efe4d0" },
    { stop: 0.42, color: "#8c4628" }, // North Equatorial Belt (NEB)
    { stop: 0.5, color: "#f6ede0" }, // Equatorial Zone (EZ)
    { stop: 0.58, color: "#9a4d2c" }, // South Equatorial Belt (SEB)
    { stop: 0.65, color: "#ebe0cc" },
    { stop: 0.72, color: "#b57a50" }, // South Temperate Belt
    { stop: 0.82, color: "#d6c8b4" },
    { stop: 0.92, color: "#8c7a6b" },
    { stop: 1.0, color: "#63584f" },
  ];
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  bands.forEach((b) => grad.addColorStop(b.stop, b.color));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Turbulent festoons & swirling eddies along belt boundaries
  const rand = createPrng(50505);
  for (let i = 0; i < 180; i++) {
    const x = rand() * w;
    const y = 45 + rand() * (h - 90);
    const rw = 18 + rand() * 55;
    const rh = 2.5 + rand() * 5.5;
    ctx.fillStyle =
      rand() < 0.5
        ? "rgba(255, 248, 236, 0.22)"
        : "rgba(110, 48, 24, 0.2)";
    ctx.beginPath();
    ctx.ellipse(x, y, rw, rh, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Great Red Spot (GRS) anticyclonic storm oval in Southern Equatorial Belt
  const grsX = w * 0.36;
  const grsY = h * 0.61;
  const grsGrad = ctx.createRadialGradient(grsX, grsY, 4, grsX, grsY, 46);
  grsGrad.addColorStop(0.0, "#c84b28");
  grsGrad.addColorStop(0.55, "#d9633c");
  grsGrad.addColorStop(0.82, "#e89c74");
  grsGrad.addColorStop(1.0, "rgba(235, 224, 204, 0)");
  ctx.save();
  ctx.translate(grsX, grsY);
  ctx.scale(1.55, 0.92);
  ctx.fillStyle = grsGrad;
  ctx.beginPath();
  ctx.arc(0, 0, 44, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  return tex;
}

function createSaturnTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.0, "#7c7462");
  grad.addColorStop(0.14, "#b8a682");
  grad.addColorStop(0.28, "#dec79b");
  grad.addColorStop(0.42, "#f0dfba");
  grad.addColorStop(0.5, "#f7ebd0");
  grad.addColorStop(0.58, "#ebd7ae");
  grad.addColorStop(0.72, "#d4bc8e");
  grad.addColorStop(0.86, "#b39f7b");
  grad.addColorStop(1.0, "#756d5c");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  return tex;
}

function createSaturnRingTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 1024, 0);
  // C Ring (faint inner), B Ring (bright dense), Cassini Division (dark gap), A Ring, Encke Gap
  grad.addColorStop(0.0, "rgba(180, 165, 140, 0.0)");
  grad.addColorStop(0.08, "rgba(180, 165, 140, 0.22)");
  grad.addColorStop(0.22, "rgba(218, 202, 174, 0.72)");
  grad.addColorStop(0.48, "rgba(246, 234, 210, 0.96)");
  grad.addColorStop(0.58, "rgba(232, 218, 192, 0.88)");
  grad.addColorStop(0.61, "rgba(35, 32, 28, 0.12)"); // Cassini Division
  grad.addColorStop(0.65, "rgba(35, 32, 28, 0.12)");
  grad.addColorStop(0.68, "rgba(226, 210, 184, 0.82)");
  grad.addColorStop(0.86, "rgba(210, 194, 168, 0.68)");
  grad.addColorStop(0.88, "rgba(60, 55, 48, 0.24)"); // Encke Gap
  grad.addColorStop(0.9, "rgba(205, 190, 164, 0.62)");
  grad.addColorStop(0.96, "rgba(195, 180, 154, 0.35)");
  grad.addColorStop(1.0, "rgba(195, 180, 154, 0.0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1024, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  return tex;
}

function createUranusTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, "#a5f3fc");
  grad.addColorStop(0.25, "#67e8f9");
  grad.addColorStop(0.5, "#7dd3fc");
  grad.addColorStop(0.75, "#67e8f9");
  grad.addColorStop(1.0, "#a5f3fc");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createNeptuneTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.0, "#1e3a8a");
  grad.addColorStop(0.25, "#2563eb");
  grad.addColorStop(0.45, "#3b82f6");
  grad.addColorStop(0.55, "#1d4ed8");
  grad.addColorStop(0.78, "#2563eb");
  grad.addColorStop(1.0, "#1e3a8a");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Great Dark Spot & high-altitude white methane cirrus streaks
  ctx.fillStyle = "rgba(15, 23, 66, 0.55)";
  ctx.beginPath();
  ctx.ellipse(w * 0.42, h * 0.58, 42, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(224, 242, 254, 0.55)";
  ctx.beginPath();
  ctx.ellipse(w * 0.44, h * 0.63, 48, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(w * 0.68, h * 0.36, 65, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function buildSatelliteMesh(spec: LunarOrbiterSpec): {
  root: THREE.Group;
  hitMesh: THREE.Mesh;
} {
  const root = new THREE.Group();

  const busMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.044, 0.044, 0.052),
    new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      metalness: 0.75,
      roughness: 0.28,
    })
  );
  root.add(busMesh);

  const wingMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0c4a6e,
    emissiveIntensity: 0.55,
    metalness: 0.4,
    roughness: 0.35,
  });
  const leftWing = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.006, 0.032),
    wingMat
  );
  leftWing.position.set(-0.088, 0, 0);
  root.add(leftWing);

  const rightWing = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.006, 0.032),
    wingMat
  );
  rightWing.position.set(0.088, 0, 0);
  root.add(rightWing);

  const dish = new THREE.Mesh(
    new THREE.ConeGeometry(0.024, 0.02, 16),
    new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.3,
      roughness: 0.4,
    })
  );
  dish.position.set(0, 0, 0.035);
  dish.rotation.x = Math.PI;
  root.add(dish);

  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.015, 12, 12),
    new THREE.MeshBasicMaterial({ color: spec.orbitColor })
  );
  beacon.position.set(0, -0.029, 0);
  root.add(beacon);

  const hitMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.11, 10, 10),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitMesh.userData = {
    tooltipTitle: `${spec.name} (${spec.agency})`,
    tooltipSub: spec.orbitType,
  };
  root.add(hitMesh);

  return { root, hitMesh };
}

function buildRoverMesh(
  name: string,
  agency: string,
  siteName: string,
  colorHex: string
): { root: THREE.Group; hitMesh: THREE.Mesh } {
  const root = new THREE.Group();
  const color = new THREE.Color(colorHex);

  const haloRing = new THREE.Mesh(
    new THREE.RingGeometry(0.034, 0.049, 24),
    new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    })
  );
  haloRing.position.z = 0.004;
  root.add(haloRing);

  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(0.042, 0.03, 0.017),
    new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.45,
      roughness: 0.35,
    })
  );
  chassis.position.z = 0.017;
  root.add(chassis);

  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(0.038, 0.026, 0.005),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.4,
      roughness: 0.4,
    })
  );
  deck.position.z = 0.027;
  root.add(deck);

  const wheelGeo = new THREE.CylinderGeometry(0.0065, 0.0065, 0.006, 10);
  const wheelMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.8,
  });
  [-0.015, 0, 0.015].forEach((wx) => {
    [-0.018, 0.018].forEach((wy) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(wx, wy, 0.008);
      root.add(wheel);
    });
  });

  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.003, 0.003, 0.022, 8),
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0 })
  );
  mast.rotation.x = Math.PI / 2;
  mast.position.set(0.011, 0, 0.039);
  root.add(mast);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.01, 0.015, 0.008),
    new THREE.MeshBasicMaterial({ color })
  );
  head.position.set(0.011, 0, 0.05);
  root.add(head);

  const hitMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.085, 10, 10),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitMesh.position.z = 0.024;
  hitMesh.userData = {
    tooltipTitle: `${name.toUpperCase()} (${agency})`,
    tooltipSub: `SURFACE ROVER • ${siteName.toUpperCase()}`,
  };
  root.add(hitMesh);

  return { root, hitMesh };
}

function build3DGeodesicRing(
  lat: number,
  lon: number,
  radiusKm: number,
  colorHex: number,
  opacity: number
): THREE.LineLoop {
  const pts: THREE.Vector3[] = [];
  const steps = 64;
  for (let i = 0; i < steps; i++) {
    const bearing = (i / steps) * 360;
    const [rLat, rLon] = offsetLunarLatLon(lat, lon, radiusKm, bearing);
    pts.push(latLonToVec3(rLat, rLon, MOON_R + 0.013));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const mat = new THREE.LineBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity,
  });
  return new THREE.LineLoop(geo, mat);
}

function disposeGroupChildren(group: THREE.Group) {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    child.traverse((node) => {
      if ((node as THREE.Mesh).geometry) {
        (node as THREE.Mesh).geometry.dispose();
      }
      const mat = (node as THREE.Mesh).material;
      if (Array.isArray(mat)) {
        mat.forEach((m) => m.dispose());
      } else if (mat) {
        mat.dispose();
      }
    });
  }
}

export interface MoonGlobeProps {
  sites?: LandingSite[];
  selectedSite?: LandingSite | null;
  showCelestial?: boolean;
  showRovers?: boolean;
  timeScale?: number;
  activeTimestampMs?: number;
  clockResetNonce?: number;
  markerShape?: SpaceMarkerShape;
  siteIntervalKm?: number;
  siteTraffic?: TrafficMapItem[];
  highlightedTrafficId?: string | null;
  onSelectSite?: (site: LandingSite) => void;
  onEpochUpdate?: (epochMs: number) => void;
}

function MoonGlobeComponent({
  sites = [],
  selectedSite = null,
  showCelestial = true,
  showRovers = true,
  timeScale = 1,
  activeTimestampMs = Date.UTC(2026, 10, 14, 12, 0, 0),
  clockResetNonce = 0,
  markerShape = "reticle",
  siteIntervalKm = 25,
  siteTraffic = [],
  highlightedTrafficId = null,
  onSelectSite = () => {},
  onEpochUpdate,
}: MoonGlobeProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [hoveredItem, setHoveredItem] = useState<{
    title: string;
    sub?: string;
    x: number;
    y: number;
  } | null>(null);

  const showCelestialRef = useRef<boolean>(showCelestial);
  const showRoversRef = useRef<boolean>(showRovers);
  const timeScaleRef = useRef<number>(timeScale);
  const simEpochRef = useRef<number>(activeTimestampMs);
  const onSelectSiteRef = useRef(onSelectSite);
  const onEpochUpdateRef = useRef(onEpochUpdate);

  const cameraTargetGoalRef = useRef<THREE.Vector3 | null>(null);
  const siteMarkersGroupRef = useRef<THREE.Group | null>(null);
  const intervalAndTrafficGroupRef = useRef<THREE.Group | null>(null);
  const siteHitMeshesRef = useRef<THREE.Object3D[]>([]);
  const trafficHitMeshesRef = useRef<THREE.Object3D[]>([]);
  const hardwareHitMeshesRef = useRef<THREE.Object3D[]>([]);

  useEffect(() => {
    if (selectedSite) {
      const surfacePos = latLonToVec3(
        selectedSite.lat,
        selectedSite.lon,
        MOON_R
      );
      cameraTargetGoalRef.current = surfacePos
        .clone()
        .normalize()
        .multiplyScalar(5.4);
    } else {
      cameraTargetGoalRef.current = null;
    }
  }, [selectedSite]);

  useEffect(() => {
    showCelestialRef.current = showCelestial;
  }, [showCelestial]);

  useEffect(() => {
    showRoversRef.current = showRovers;
  }, [showRovers]);

  useEffect(() => {
    timeScaleRef.current = timeScale;
  }, [timeScale]);

  useEffect(() => {
    onSelectSiteRef.current = onSelectSite;
  }, [onSelectSite]);

  useEffect(() => {
    onEpochUpdateRef.current = onEpochUpdate;
  }, [onEpochUpdate]);

  useEffect(() => {
    simEpochRef.current = activeTimestampMs;
    onEpochUpdateRef.current?.(activeTimestampMs);
  }, [activeTimestampMs, clockResetNonce]);

  // Rebuild 3D Surface Beacons whenever sites, selectedSite, or markerShape changes
  useEffect(() => {
    const group = siteMarkersGroupRef.current;
    if (!group) return;

    disposeGroupChildren(group);
    siteHitMeshesRef.current = [];

    sites.forEach((site) => {
      const isSelected = selectedSite?.id === site.id;
      const isPinned = site.id.startsWith("pinned-");
      const pos = latLonToVec3(site.lat, site.lon, MOON_R + 0.022);

      const beaconGroup = new THREE.Group();
      beaconGroup.position.copy(pos);
      beaconGroup.lookAt(pos.clone().multiplyScalar(2));

      const color = isSelected
        ? 0xc4b5fd
        : isPinned
        ? 0xf5d0fe
        : 0xa5b4fc;

      const coreGeo =
        markerShape === "lander"
          ? new THREE.ConeGeometry(isSelected ? 0.042 : 0.03, 0.065, 4)
          : markerShape === "diamond"
          ? new THREE.OctahedronGeometry(isSelected ? 0.046 : 0.033, 0)
          : new THREE.SphereGeometry(isSelected ? 0.034 : 0.024, 16, 16);

      const coreMat = new THREE.MeshBasicMaterial({ color });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      if (markerShape === "lander") {
        coreMesh.rotation.x = Math.PI / 2;
      }
      coreMesh.userData = {
        site,
        tooltipTitle: site.name.toUpperCase(),
        tooltipSub: `${site.lat}°, ${site.lon}°`,
      };
      beaconGroup.add(coreMesh);
      siteHitMeshesRef.current.push(coreMesh);

      const ringGeo = new THREE.RingGeometry(
        isSelected ? 0.055 : 0.04,
        isSelected ? 0.072 : 0.052,
        24
      );
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xe0e7ff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: isSelected ? 0.95 : 0.65,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      beaconGroup.add(ringMesh);

      group.add(beaconGroup);
    });
  }, [sites, selectedSite, markerShape]);

  // Rebuild 3D Site Exclusion Interval Rings & Nearby Lunar Traffic Markers
  useEffect(() => {
    const group = intervalAndTrafficGroupRef.current;
    if (!group) return;

    disposeGroupChildren(group);
    trafficHitMeshesRef.current = [];

    if (!selectedSite) {
      sites.forEach((s) => {
        group.add(
          build3DGeodesicRing(s.lat, s.lon, siteIntervalKm, 0xa5b4fc, 0.34)
        );
      });
      return;
    }

    group.add(
      build3DGeodesicRing(
        selectedSite.lat,
        selectedSite.lon,
        siteIntervalKm,
        0xc4b5fd,
        0.88
      )
    );

    siteTraffic.forEach((tr) => {
      const [tLat, tLon] = offsetLunarLatLon(
        selectedSite.lat,
        selectedSite.lon,
        tr.separationKm,
        tr.bearingDeg
      );
      const isConflict =
        tr.status !== "PAST" && tr.separationKm <= siteIntervalKm;
      const isHighlighted = tr.id === highlightedTrafficId;

      const colorHex = isHighlighted
        ? 0xf5d0fe
        : isConflict
        ? 0xfde047
        : tr.status === "ACTIVE"
        ? 0x6ee7b7
        : 0x94a3b8;

      const tetherPts: THREE.Vector3[] = [];
      const arcSteps = 16;
      for (let i = 0; i <= arcSteps; i++) {
        const frac = i / arcSteps;
        const [stepLat, stepLon] = offsetLunarLatLon(
          selectedSite.lat,
          selectedSite.lon,
          tr.separationKm * frac,
          tr.bearingDeg
        );
        tetherPts.push(latLonToVec3(stepLat, stepLon, MOON_R + 0.015));
      }
      const tetherLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(tetherPts),
        new THREE.LineBasicMaterial({
          color: colorHex,
          transparent: true,
          opacity: isHighlighted ? 0.9 : isConflict ? 0.65 : 0.38,
        })
      );
      group.add(tetherLine);

      const tPos = latLonToVec3(tLat, tLon, MOON_R + 0.022);
      const markerGroup = new THREE.Group();
      markerGroup.position.copy(tPos);
      markerGroup.lookAt(tPos.clone().multiplyScalar(2));

      const dotMesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(isHighlighted ? 0.032 : 0.021, 0),
        new THREE.MeshBasicMaterial({ color: colorHex })
      );
      markerGroup.add(dotMesh);

      const haloMesh = new THREE.Mesh(
        new THREE.RingGeometry(
          isHighlighted ? 0.044 : 0.028,
          isHighlighted ? 0.056 : 0.036,
          20
        ),
        new THREE.MeshBasicMaterial({
          color: colorHex,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: isHighlighted ? 0.95 : 0.65,
        })
      );
      markerGroup.add(haloMesh);

      const hitMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.068, 10, 10),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      hitMesh.userData = {
        tooltipTitle: `${tr.spacecraft} (${tr.status})`,
        tooltipSub: `${tr.separationKm} KM FROM SITE • ${tr.bearingDeg}° BRG`,
      };
      markerGroup.add(hitMesh);
      trafficHitMeshesRef.current.push(hitMesh);

      group.add(markerGroup);
    });
  }, [sites, selectedSite, siteIntervalKm, siteTraffic, highlightedTrafficId]);

  // Initialize Three.js Scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio, 2);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x03050c);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 28000);
    camera.position.set(6.4, 0.35, 0.2);
    camera.layers.enable(0);
    camera.layers.enable(1);
    camera.layers.enable(2);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(pixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2.75;
    controls.maxDistance = 120;
    controls.enablePan = false;

    const onControlStart = () => {
      cameraTargetGoalRef.current = null;
    };
    controls.addEventListener("start", onControlStart);

    // =========================================================================
    // REALISTIC DEEP-SPACE STARFIELD & MILKY WAY GALACTIC BAND
    // =========================================================================
    const galacticEuler = new THREE.Euler(0.62, 0.38, -0.48);
    const { mesh: milkyWayMesh, texture: milkyWayTex } =
      createMilkyWayBackdrop(galacticEuler);
    scene.add(milkyWayMesh);

    const { points: realisticStars, material: starShaderMat } =
      createRealisticStarfield(pixelRatio, galacticEuler);
    scene.add(realisticStars);

    // =========================================================================
    // LAYER 0 LIGHTING: Dedicated lighting for Satellites, Rovers & Beacons
    // =========================================================================
    const hardwareAmbient = new THREE.AmbientLight(0xe0e7ff, 1.35);
    hardwareAmbient.layers.set(0);
    scene.add(hardwareAmbient);

    const hardwareKey = new THREE.DirectionalLight(0xffffff, 1.8);
    hardwareKey.position.set(8, 6, 10);
    hardwareKey.layers.set(0);
    scene.add(hardwareKey);

    // =========================================================================
    // LAYER 1: REALISTIC HIGH-CONTRAST MOON (AT CO-MOVING ORIGIN)
    // =========================================================================
    const lunarTexture = buildLunarAlbedoTexture();
    const moonGeo = new THREE.SphereGeometry(MOON_R, 128, 96);
    const moonMat = new THREE.MeshStandardMaterial({
      map: lunarTexture,
      bumpMap: lunarTexture,
      bumpScale: 0.065,
      roughness: 1.0,
      metalness: 0.0,
      color: new THREE.Color(0xd8dce6),
    });
    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    moonMesh.layers.set(1);
    scene.add(moonMesh);

    const moonSunLight = new THREE.DirectionalLight(0xfffcf5, 3.6);
    moonSunLight.layers.set(1);
    scene.add(moonSunLight);

    const moonEarthShine = new THREE.DirectionalLight(0x7c96d4, 0.14);
    moonEarthShine.layers.set(1);
    scene.add(moonEarthShine);

    const moonVacuumAmbient = new THREE.AmbientLight(0x0b1021, 0.025);
    moonVacuumAmbient.layers.set(1);
    scene.add(moonVacuumAmbient);

    // Subtle Pastel Graticule Rings around Moon
    const graticuleGroup = new THREE.Group();
    const gratMat = new THREE.LineBasicMaterial({
      color: 0xa5b4fc,
      transparent: true,
      opacity: 0.14,
    });
    [-60, -30, 0, 30, 60].forEach((lat) => {
      const pts: THREE.Vector3[] = [];
      for (let lon = -180; lon <= 180; lon += 5) {
        pts.push(latLonToVec3(lat, lon, MOON_R + 0.004));
      }
      graticuleGroup.add(
        new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), gratMat)
      );
    });
    scene.add(graticuleGroup);

    // =========================================================================
    // FULL LUNAR ORBITAL CONSTELLATION
    // =========================================================================
    const lunarOrbitersGroup = new THREE.Group();
    scene.add(lunarOrbitersGroup);

    const hardwareHits: THREE.Object3D[] = [];

    const activeOrbiters = LUNAR_ORBITERS.map((spec) => {
      const planeGroup = new THREE.Group();
      planeGroup.rotation.y = spec.raanRad;
      planeGroup.rotation.z = spec.inclinationRad;

      const orbitPts: THREE.Vector3[] = [];
      for (let a = 0; a <= 360; a += 3) {
        const rad = (a * Math.PI) / 180;
        orbitPts.push(
          new THREE.Vector3(
            Math.cos(rad) * spec.semiMajor,
            0,
            Math.sin(rad) * spec.semiMinor
          )
        );
      }
      const orbitLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(orbitPts),
        new THREE.LineBasicMaterial({
          color: spec.orbitColor,
          transparent: true,
          opacity: 0.36,
        })
      );
      planeGroup.add(orbitLine);

      const { root: satMesh, hitMesh } = buildSatelliteMesh(spec);
      planeGroup.add(satMesh);
      hardwareHits.push(hitMesh);

      lunarOrbitersGroup.add(planeGroup);
      return { spec, satMesh };
    });

    // =========================================================================
    // ALL LUNAR SURFACE ROVERS
    // =========================================================================
    const roversGroup = new THREE.Group();
    scene.add(roversGroup);

    const existingNamesLower = LUNAR_ROVERS.map((r) => r.name.toLowerCase());

    const projectRoverItems = LUNAR_ROVERS.map((rover) => {
      const pathCoords = getRoverTraversePath(rover);
      const pathPts = pathCoords.map(([lat, lon]) =>
        latLonToVec3(lat, lon, MOON_R + 0.018)
      );
      const pathLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pathPts),
        new THREE.LineBasicMaterial({
          color: new THREE.Color(rover.color),
          transparent: true,
          opacity: 0.85,
        })
      );
      roversGroup.add(pathLine);

      const { root: roverRoot, hitMesh } = buildRoverMesh(
        rover.name,
        rover.agency,
        rover.siteName,
        rover.color
      );
      roversGroup.add(roverRoot);
      hardwareHits.push(hitMesh);

      return { kind: "project" as const, rover, roverRoot };
    });

    const extraRoverItems = SUPPLEMENTAL_LUNAR_ROVERS.filter((extra) => {
      const key = extra.name.split(" ")[0].toLowerCase();
      return !existingNamesLower.some((n) => n.includes(key));
    }).map((extra) => {
      const pathPts = extra.waypoints.map(([lat, lon]) =>
        latLonToVec3(lat, lon, MOON_R + 0.018)
      );
      const pathLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pathPts),
        new THREE.LineBasicMaterial({
          color: new THREE.Color(extra.color),
          transparent: true,
          opacity: 0.85,
        })
      );
      roversGroup.add(pathLine);

      const { root: roverRoot, hitMesh } = buildRoverMesh(
        extra.name,
        extra.agency,
        extra.siteName,
        extra.color
      );
      roversGroup.add(roverRoot);
      hardwareHits.push(hitMesh);

      return { kind: "supplemental" as const, extra, roverRoot };
    });

    // Landing Site Beacons Group
    const siteMarkersGroup = new THREE.Group();
    siteMarkersGroupRef.current = siteMarkersGroup;
    scene.add(siteMarkersGroup);

    // Exclusion Interval Rings & Nearby Lunar Traffic Group
    const intervalAndTrafficGroup = new THREE.Group();
    intervalAndTrafficGroupRef.current = intervalAndTrafficGroup;
    scene.add(intervalAndTrafficGroup);

    // =========================================================================
    // LAYER 2: REALISTIC SOLAR SYSTEM (EXACT 1:1 PLANETARY SIZE RATIOS)
    // =========================================================================
    const celestialGroup = new THREE.Group();
    scene.add(celestialGroup);

    const planetAmbient = new THREE.AmbientLight(0x94a3b8, 0.24);
    planetAmbient.layers.set(2);
    scene.add(planetAmbient);

    // decay = 0 ensures true solar directional phase across all 8 planets regardless of distance
    const solarPointLight = new THREE.PointLight(0xfffbeb, 3.4, 0, 0);
    solarPointLight.layers.set(2);
    celestialGroup.add(solarPointLight);

    const eclipticQuat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0.11, 0, -0.04)
    );
    const solarSystemRoot = new THREE.Group();
    solarSystemRoot.quaternion.copy(eclipticQuat);
    celestialGroup.add(solarSystemRoot);

    // True Solar Radius = 400.8 * MOON_R = 801.6 units
    const sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(801.6, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0xfef3c7 })
    );
    sunMesh.layers.set(2);
    solarSystemRoot.add(sunMesh);

    const sunGlowTex = createSunGlowTexture();
    const sunSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: sunGlowTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    sunSprite.scale.set(2650, 2650, 1);
    sunSprite.layers.set(2);
    solarSystemRoot.add(sunSprite);

    const sunHit = new THREE.Mesh(
      new THREE.SphereGeometry(850, 16, 16),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    sunHit.layers.set(2);
    sunHit.userData = {
      tooltipTitle: "SOL (THE SUN)",
      tooltipSub: "109× EARTH RADIUS • 400.8× MOON RADIUS",
    };
    solarSystemRoot.add(sunHit);
    hardwareHits.push(sunHit);

    const mercuryTextures = createMercuryTextures();
    const venusTex = createVenusTexture();
    const earthTextures = createEarthRealisticTextures();
    const marsTextures = createMarsTextures();
    const jupiterTex = createJupiterTexture();
    const saturnTex = createSaturnTexture();
    const saturnRingTex = createSaturnRingTexture();
    const uranusTex = createUranusTexture();
    const neptuneTex = createNeptuneTexture();

    // True 1:1 Planetary Radii relative to Moon = 2.0 units (1 unit = 868.7 km):
    // Mercury: 2.81 | Venus: 6.97 | Earth: 7.33 | Mars: 3.90
    // Jupiter: 80.48 | Saturn: 67.03 | Uranus: 29.20 | Neptune: 28.34
    const planetsConfig = [
      {
        name: "MERCURY",
        subtitle: "1.40× MOON RADIUS • 0.39 AU",
        radius: 1350.0,
        size: 2.81,
        speed: 4.15,
        phase: 0.72,
        map: mercuryTextures.map,
        bumpMap: mercuryTextures.bump,
        bumpScale: 0.04,
      },
      {
        name: "VENUS",
        subtitle: "3.48× MOON RADIUS • 0.72 AU",
        radius: 2100.0,
        size: 6.97,
        speed: 1.62,
        phase: 5.12,
        map: venusTex,
      },
      {
        name: "EARTH (HOMEWORLD)",
        subtitle: "3.67× MOON RADIUS • 1.00 AU • CISLUNAR PRIMARY",
        radius: AU_1_DIST,
        size: 7.33,
        speed: 1.0,
        phase: 0.26,
        map: earthTextures.map,
        bumpMap: earthTextures.bump,
        bumpScale: 0.045,
        isEarth: true,
      },
      {
        name: "MARS",
        subtitle: "1.95× MOON RADIUS • 1.52 AU",
        radius: 4330.0,
        size: 3.9,
        speed: 0.53,
        phase: 5.58,
        map: marsTextures.map,
        bumpMap: marsTextures.bump,
        bumpScale: 0.04,
      },
      {
        name: "JUPITER",
        subtitle: "40.24× MOON RADIUS (11.0× EARTH) • 5.20 AU",
        radius: 7600.0,
        size: 80.48,
        speed: 0.084,
        phase: 0.62,
        map: jupiterTex,
      },
      {
        name: "SATURN",
        subtitle: "33.52× MOON RADIUS (9.1× EARTH) • 9.58 AU",
        radius: 9600.0,
        size: 67.03,
        speed: 0.034,
        phase: 5.42,
        map: saturnTex,
        hasRings: true,
      },
      {
        name: "URANUS",
        subtitle: "14.60× MOON RADIUS (4.0× EARTH) • 19.2 AU",
        radius: 11400.0,
        size: 29.2,
        speed: 0.012,
        phase: 0.88,
        map: uranusTex,
        hasIceRing: true,
      },
      {
        name: "NEPTUNE",
        subtitle: "14.17× MOON RADIUS (3.9× EARTH) • 30.1 AU",
        radius: 13200.0,
        size: 28.34,
        speed: 0.006,
        phase: 5.28,
        map: neptuneTex,
      },
    ];

    let earthBodyGroupRef: THREE.Group | null = null;
    let earthCloudsMeshRef: THREE.Mesh | null = null;

    const orbitingBodies = planetsConfig.map((p) => {
      const ringPts: THREE.Vector3[] = [];
      for (let a = 0; a <= 360; a += 1.5) {
        const rad = (a * Math.PI) / 180;
        ringPts.push(
          new THREE.Vector3(
            Math.cos(rad) * p.radius,
            0,
            Math.sin(rad) * p.radius
          )
        );
      }
      const orbitLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(ringPts),
        new THREE.LineBasicMaterial({
          color: p.isEarth ? 0x38bdf8 : 0xc4b5fd,
          transparent: true,
          opacity: p.isEarth ? 0.52 : 0.2,
        })
      );
      orbitLine.layers.set(2);
      solarSystemRoot.add(orbitLine);

      const bodyGroup = new THREE.Group();
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(p.size, 64, 48),
        new THREE.MeshStandardMaterial({
          map: p.map,
          bumpMap: p.bumpMap ?? null,
          bumpScale: p.bumpScale ?? 0,
          roughness: p.isEarth ? 0.62 : 0.78,
          metalness: 0.02,
        })
      );
      mesh.layers.set(2);
      bodyGroup.add(mesh);

      if (p.isEarth) {
        earthBodyGroupRef = bodyGroup;
        // Axial obliquity of Earth (23.44°)
        mesh.rotation.z = (23.44 * Math.PI) / 180;

        // Rotating 3D Cloud Sphere
        const cloudsMesh = new THREE.Mesh(
          new THREE.SphereGeometry(p.size * 1.016, 48, 36),
          new THREE.MeshStandardMaterial({
            map: earthTextures.clouds,
            transparent: true,
            opacity: 0.88,
            depthWrite: false,
            roughness: 0.9,
          })
        );
        cloudsMesh.rotation.z = (23.44 * Math.PI) / 180;
        cloudsMesh.layers.set(2);
        bodyGroup.add(cloudsMesh);
        earthCloudsMeshRef = cloudsMesh;

        // Subtle Rayleigh atmospheric rim glow
        const atmoMesh = new THREE.Mesh(
          new THREE.SphereGeometry(p.size * 1.045, 48, 36),
          new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.16,
            depthWrite: false,
          })
        );
        atmoMesh.layers.set(2);
        bodyGroup.add(atmoMesh);

        // True Cislunar Orbit Ring around Earth that passes directly through the Moon!
        const lunarOrbitPts: THREE.Vector3[] = [];
        for (let a = 0; a <= 360; a += 2) {
          const rad = (a * Math.PI) / 180;
          const x = Math.cos(rad) * EARTH_MOON_DIST;
          const z = Math.sin(rad) * EARTH_MOON_DIST;
          const y =
            Math.sin(rad) * EARTH_MOON_DIST * Math.sin(LUNAR_INCLINATION_RAD);
          lunarOrbitPts.push(new THREE.Vector3(x, y, z));
        }
        const lunarOrbitRing = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(lunarOrbitPts),
          new THREE.LineBasicMaterial({
            color: 0x7dd3fc,
            transparent: true,
            opacity: 0.55,
          })
        );
        lunarOrbitRing.layers.set(2);
        bodyGroup.add(lunarOrbitRing);
      }

      if (p.hasRings) {
        // Saturn's main ring system (C, B, Cassini Division, A) scaled accurately to Saturn's 67.03 radius
        const ringInner = p.size * 1.24;
        const ringOuter = p.size * 2.32;
        const ringGeo = new THREE.RingGeometry(ringInner, ringOuter, 96);
        const posAttr = ringGeo.attributes.position;
        const uvAttr = ringGeo.attributes.uv;
        for (let i = 0; i < posAttr.count; i++) {
          const vx = posAttr.getX(i);
          const vy = posAttr.getY(i);
          const dist = Math.hypot(vx, vy);
          const u = (dist - ringInner) / (ringOuter - ringInner);
          uvAttr.setXY(i, u, 0.5);
        }

        const ringMesh = new THREE.Mesh(
          ringGeo,
          new THREE.MeshStandardMaterial({
            map: saturnRingTex,
            side: THREE.DoubleSide,
            transparent: true,
            roughness: 0.65,
          })
        );
        ringMesh.rotation.x = Math.PI / 2.35;
        ringMesh.rotation.y = 0.26;
        ringMesh.layers.set(2);
        bodyGroup.add(ringMesh);
      }

      if (p.hasIceRing) {
        const iceRing = new THREE.Mesh(
          new THREE.RingGeometry(p.size * 1.45, p.size * 1.75, 64),
          new THREE.MeshBasicMaterial({
            color: 0xa5f3fc,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.32,
          })
        );
        iceRing.rotation.x = 0.25;
        iceRing.layers.set(2);
        bodyGroup.add(iceRing);
      }

      const planetHit = new THREE.Mesh(
        new THREE.SphereGeometry(Math.max(4.5, p.size * 1.35), 14, 14),
        new THREE.MeshBasicMaterial({ visible: false })
      );
      planetHit.layers.set(2);
      planetHit.userData = {
        tooltipTitle: p.name,
        tooltipSub: p.subtitle,
      };
      bodyGroup.add(planetHit);
      hardwareHits.push(planetHit);

      solarSystemRoot.add(bodyGroup);
      return { ...p, bodyGroup, mesh };
    });

    // =========================================================================
    // MAIN ASTEROID BELT (BETWEEN MARS @ 4330 AND JUPITER @ 7600)
    // =========================================================================
    const asteroidBeltGroup = new THREE.Group();
    asteroidBeltGroup.layers.set(2);
    solarSystemRoot.add(asteroidBeltGroup);

    const asteroidCount = 900;
    const asteroidGeo = new THREE.DodecahedronGeometry(3.4, 0);
    const asteroidMat = new THREE.MeshStandardMaterial({
      color: 0xd6d3d1,
      roughness: 0.88,
      metalness: 0.15,
    });
    const asteroidInstanced = new THREE.InstancedMesh(
      asteroidGeo,
      asteroidMat,
      asteroidCount
    );
    asteroidInstanced.layers.set(2);

    const astRand = createPrng(778899);
    const dummy = new THREE.Object3D();
    const rockColors = [
      new THREE.Color(0xa8a29e),
      new THREE.Color(0x78716c),
      new THREE.Color(0xd6d3d1),
      new THREE.Color(0x9ca3af),
      new THREE.Color(0xb45309).lerp(new THREE.Color(0x78716c), 0.72),
    ];

    for (let i = 0; i < asteroidCount; i++) {
      // Concentrated between Mars (4330) and Jupiter (7600) -> 5200 to 6500
      const bandT = (astRand() + astRand()) * 0.5;
      const r = 5200.0 + bandT * 1300.0;
      const theta = astRand() * Math.PI * 2;
      const yOffset = (astRand() - 0.5) * 140.0;

      dummy.position.set(
        Math.cos(theta) * r,
        yOffset,
        Math.sin(theta) * r
      );
      dummy.rotation.set(
        astRand() * Math.PI,
        astRand() * Math.PI,
        astRand() * Math.PI
      );

      const scaleBase = 0.5 + Math.pow(astRand(), 2.4) * 1.8;
      dummy.scale.set(
        scaleBase * (0.75 + astRand() * 0.5),
        scaleBase * (0.65 + astRand() * 0.5),
        scaleBase * (0.75 + astRand() * 0.5)
      );
      dummy.updateMatrix();
      asteroidInstanced.setMatrixAt(i, dummy.matrix);
      asteroidInstanced.setColorAt(
        i,
        rockColors[Math.floor(astRand() * rockColors.length)]
      );
    }
    asteroidInstanced.instanceMatrix.needsUpdate = true;
    if (asteroidInstanced.instanceColor) {
      asteroidInstanced.instanceColor.needsUpdate = true;
    }
    asteroidBeltGroup.add(asteroidInstanced);

    const beltDustCount = 1500;
    const beltDustPos = new Float32Array(beltDustCount * 3);
    for (let i = 0; i < beltDustCount; i++) {
      const r = 5100.0 + astRand() * 1450.0;
      const theta = astRand() * Math.PI * 2;
      beltDustPos[i * 3] = Math.cos(theta) * r;
      beltDustPos[i * 3 + 1] = (astRand() - 0.5) * 120.0;
      beltDustPos[i * 3 + 2] = Math.sin(theta) * r;
    }
    const beltDustGeo = new THREE.BufferGeometry();
    beltDustGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(beltDustPos, 3)
    );
    const beltDustMat = new THREE.PointsMaterial({
      color: 0xcbd5e1,
      size: 14.0,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const beltDustPoints = new THREE.Points(beltDustGeo, beltDustMat);
    beltDustPoints.layers.set(2);
    asteroidBeltGroup.add(beltDustPoints);

    const beltHitTorus = new THREE.Mesh(
      new THREE.TorusGeometry(5850, 620, 8, 64),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    beltHitTorus.rotation.x = Math.PI / 2;
    beltHitTorus.layers.set(2);
    beltHitTorus.userData = {
      tooltipTitle: "MAIN ASTEROID BELT",
      tooltipSub: "2.2 – 3.2 AU • BETWEEN MARS & JUPITER",
    };
    asteroidBeltGroup.add(beltHitTorus);
    hardwareHits.push(beltHitTorus);

    hardwareHitMeshesRef.current = hardwareHits;

    // Click & Hover Raycaster for Beacons, Traffic, Satellites, Rovers & Planets
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const targets = [
        ...siteHitMeshesRef.current,
        ...trafficHitMeshesRef.current,
        ...hardwareHitMeshesRef.current,
      ];
      const hits = raycaster.intersectObjects(targets, false);

      if (hits.length > 0 && hits[0].object.userData?.tooltipTitle) {
        const hitObj = hits[0].object;
        renderer.domElement.style.cursor = hitObj.userData.site
          ? "pointer"
          : "help";
        setHoveredItem({
          title: hitObj.userData.tooltipTitle,
          sub: hitObj.userData.tooltipSub,
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
      } else {
        renderer.domElement.style.cursor = "grab";
        setHoveredItem(null);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(siteHitMeshesRef.current, false);
      if (hits.length > 0 && hits[0].object.userData?.site) {
        onSelectSiteRef.current(hits[0].object.userData.site);
      }
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      const pr = Math.min(window.devicePixelRatio, 2);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.setPixelRatio(pr);
      starShaderMat.uniforms.uPixelRatio.value = pr;
    };
    window.addEventListener("resize", onResize);

    const INITIAL_EPOCH_REF = Date.UTC(2026, 10, 14, 12, 0, 0);
    const { synodicPhase: baseSynodicPhase } =
      getLunarCelestialAngles(INITIAL_EPOCH_REF);
    const moonLocalVec = new THREE.Vector3();
    const sunWorldVec = new THREE.Vector3();
    const earthWorldVec = new THREE.Vector3();

    let lastFrameTime = performance.now();
    let lastEpochEmit = 0;
    let rafId = 0;

    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const now = performance.now();
      const dtMs = now - lastFrameTime;
      lastFrameTime = now;

      const scale = timeScaleRef.current;
      if (scale > 0) {
        simEpochRef.current += dtMs * scale;
        if (now - lastEpochEmit > 250) {
          lastEpochEmit = now;
          onEpochUpdateRef.current?.(simEpochRef.current);
        }
      }

      if (cameraTargetGoalRef.current) {
        camera.position.lerp(cameraTargetGoalRef.current, 0.08);
        if (camera.position.distanceTo(cameraTargetGoalRef.current) < 0.03) {
          cameraTargetGoalRef.current = null;
        }
      }

      controls.update();

      const elapsedHours =
        (simEpochRef.current - INITIAL_EPOCH_REF) / 3600000;
      const elapsedYears = elapsedHours / (365.25 * 24);
      const { synodicPhase } = getLunarCelestialAngles(simEpochRef.current);

      // 1. Update All 8 Planets around the Sun on the Ecliptic Plane
      celestialGroup.visible = showCelestialRef.current;
      let earthLocalPos = new THREE.Vector3(AU_1_DIST, 0, 0);
      let earthOrbitalAngle = 0.26;

      for (let i = 0; i < orbitingBodies.length; i++) {
        const b = orbitingBodies[i];
        const angle = b.phase + elapsedYears * Math.PI * 2 * b.speed;
        b.bodyGroup.position.set(
          Math.cos(angle) * b.radius,
          0,
          Math.sin(angle) * b.radius
        );
        b.mesh.rotation.y += b.isEarth ? 0.005 : 0.003;

        if (b.isEarth) {
          earthLocalPos.copy(b.bodyGroup.position);
          earthOrbitalAngle = angle;
        }
      }
      if (earthCloudsMeshRef) {
        earthCloudsMeshRef.rotation.y += 0.0068;
      }
      asteroidBeltGroup.rotation.y = elapsedYears * Math.PI * 2 * 0.22;

      // 2. Anchor the Moon (0,0,0) onto Earth's 5.145°-inclined Cislunar Orbit Ring
      const deltaSynodicRad = (synodicPhase - baseSynodicPhase) * Math.PI * 2;
      const moonAroundEarthAngle =
        earthOrbitalAngle + Math.PI * 0.62 + deltaSynodicRad;

      moonLocalVec.set(
        Math.cos(moonAroundEarthAngle) * EARTH_MOON_DIST,
        Math.sin(moonAroundEarthAngle) *
          EARTH_MOON_DIST *
          Math.sin(LUNAR_INCLINATION_RAD),
        Math.sin(moonAroundEarthAngle) * EARTH_MOON_DIST
      );

      sunWorldVec
        .copy(earthLocalPos)
        .add(moonLocalVec)
        .applyQuaternion(eclipticQuat)
        .negate();
      solarSystemRoot.position.copy(sunWorldVec);
      solarPointLight.position.copy(sunWorldVec);

      // 3. Synchronize Moon's Sunlight & Earthshine directly with the Sun & Earth's true 3D positions
      moonSunLight.position
        .copy(sunWorldVec)
        .normalize()
        .multiplyScalar(24);

      if (earthBodyGroupRef) {
        earthWorldVec
          .copy(earthLocalPos)
          .applyQuaternion(eclipticQuat)
          .add(sunWorldVec);
        moonEarthShine.position
          .copy(earthWorldVec)
          .normalize()
          .multiplyScalar(14);
      }

      // 4. Update Lunar Orbital Constellation
      lunarOrbitersGroup.visible = showCelestialRef.current;
      for (let i = 0; i < activeOrbiters.length; i++) {
        const { spec, satMesh } = activeOrbiters[i];
        const orbAngle =
          spec.initialPhase +
          (elapsedHours / spec.periodHours) * Math.PI * 2;
        satMesh.position.set(
          Math.cos(orbAngle) * spec.semiMajor,
          0,
          Math.sin(orbAngle) * spec.semiMinor
        );
        satMesh.lookAt(0, 0, 0);
      }

      // 5. Update All Surface Rovers upright on the lunar sphere
      roversGroup.visible = showRoversRef.current;
      if (showRoversRef.current) {
        for (let i = 0; i < projectRoverItems.length; i++) {
          const { rover, roverRoot } = projectRoverItems[i];
          const pos = getRoverCoordinatesAtEpoch(rover, simEpochRef.current);
          const worldPos = latLonToVec3(pos.lat, pos.lon, MOON_R + 0.02);
          roverRoot.position.copy(worldPos);
          roverRoot.lookAt(worldPos.clone().multiplyScalar(2));
        }

        for (let i = 0; i < extraRoverItems.length; i++) {
          const { extra, roverRoot } = extraRoverItems[i];
          const wps = extra.waypoints;
          const t = (elapsedHours * 0.12 + i * 0.37) % wps.length;
          const idx0 = Math.floor(t);
          const idx1 = (idx0 + 1) % wps.length;
          const frac = t - idx0;
          const lat = wps[idx0][0] + (wps[idx1][0] - wps[idx0][0]) * frac;
          const lon = wps[idx0][1] + (wps[idx1][1] - wps[idx0][1]) * frac;
          const worldPos = latLonToVec3(lat, lon, MOON_R + 0.02);
          roverRoot.position.copy(worldPos);
          roverRoot.lookAt(worldPos.clone().multiplyScalar(2));
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onResize);
      controls.removeEventListener("start", onControlStart);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      controls.dispose();
      disposeGroupChildren(siteMarkersGroup);
      disposeGroupChildren(intervalAndTrafficGroup);
      asteroidGeo.dispose();
      asteroidMat.dispose();
      beltDustGeo.dispose();
      beltDustMat.dispose();
      beltHitTorus.geometry.dispose();
      (beltHitTorus.material as THREE.Material).dispose();
      realisticStars.geometry.dispose();
      starShaderMat.dispose();
      milkyWayMesh.geometry.dispose();
      (milkyWayMesh.material as THREE.Material).dispose();
      milkyWayTex.dispose();
      lunarTexture.dispose();
      sunGlowTex.dispose();
      mercuryTextures.map.dispose();
      mercuryTextures.bump.dispose();
      venusTex.dispose();
      earthTextures.map.dispose();
      earthTextures.bump.dispose();
      earthTextures.clouds.dispose();
      marsTextures.map.dispose();
      marsTextures.bump.dispose();
      jupiterTex.dispose();
      saturnTex.dispose();
      saturnRingTex.dispose();
      uranusTex.dispose();
      neptuneTex.dispose();
      moonGeo.dispose();
      moonMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#03050c]">
      <div
        ref={mountRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
      />

      {hoveredItem && (
        <div
          style={{
            left: hoveredItem.x,
            top: hoveredItem.y - 16,
          }}
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-2xl border border-indigo-300/40 bg-[#0f1328]/92 px-3 py-1.5 font-mono whitespace-nowrap shadow-[0_8px_22px_rgba(9,11,22,0.85)] backdrop-blur-md"
        >
          <div className="text-[10px] font-bold tracking-wider text-indigo-100">
            {hoveredItem.title}
          </div>
          {hoveredItem.sub && (
            <div className="text-[8px] tracking-widest text-indigo-300/80">
              {hoveredItem.sub}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const MoonGlobe = memo(MoonGlobeComponent);
export default MoonGlobe;