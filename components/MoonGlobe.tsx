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
import { SpaceMarkerShape } from "@/components/MoonMap2D";

const MOON_TREK_EQ_WMTS =
  "https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{y}/{x}.jpg";

const MOON_R = 2.0;

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

// Seeded PRNG (Mulberry32) for natural, non-grid organic star distributions
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

  // Deep cosmic void base
  ctx.fillStyle = "#03050c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Soft galactic equator glow (centered horizontally around y = 256)
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

  // Subtle dark dust rifts & star-cloud mottling along the galactic plane
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

  const geo = new THREE.SphereGeometry(210, 48, 32);
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

  // Authentic blackbody stellar spectral classes (O/B, A, F, G, K, M)
  const spectralPalette = [
    { color: new THREE.Color(0xcad8ff), weight: 0.14 }, // O/B blue-white
    { color: new THREE.Color(0xf8f9ff), weight: 0.34 }, // A pure white
    { color: new THREE.Color(0xfff6ea), weight: 0.24 }, // F warm white
    { color: new THREE.Color(0xffe4b8), weight: 0.15 }, // G solar cream
    { color: new THREE.Color(0xffc987), weight: 0.09 }, // K amber-gold
    { color: new THREE.Color(0xffa46e), weight: 0.04 }, // M orange-red
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
    const radius = 145 + rand() * 45;

    if (isGalactic) {
      // Concentrated near galactic equator with Gaussian latitude spread
      const lon = rand() * Math.PI * 2;
      const g1 = rand() + rand() + rand() - 1.5; // approx normal [-1.5, 1.5]
      const lat = g1 * 0.22;
      tempPos.set(
        radius * Math.cos(lat) * Math.cos(lon),
        radius * Math.sin(lat),
        radius * Math.cos(lat) * Math.sin(lon)
      );
      tempPos.applyQuaternion(galQuat);
    } else {
      // Isotropic celestial sphere
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

    // Power-law stellar magnitude curve: many tiny pinpoints, rare bright stars
    const mag = Math.pow(rand(), 5.5);
    const size = isGalactic
      ? 1.4 + mag * 3.8
      : 1.6 + mag * 5.2;
    const alpha = isGalactic
      ? 0.25 + mag * 0.72
      : 0.32 + mag * 0.68;

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

        // Sharp Airy-disk stellar core + soft optical halo
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
  const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  grad.addColorStop(0, "rgba(255, 251, 235, 1)");
  grad.addColorStop(0.22, "rgba(254, 240, 138, 0.85)");
  grad.addColorStop(0.55, "rgba(251, 191, 36, 0.25)");
  grad.addColorStop(1, "rgba(251, 191, 36, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createBandedPlanetTexture(
  bands: { stop: number; color: string }[]
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  bands.forEach((b) => grad.addColorStop(b.stop, b.color));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createSaturnRingTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createLinearGradient(0, 0, 512, 0);
  grad.addColorStop(0.0, "rgba(214, 196, 165, 0.0)");
  grad.addColorStop(0.18, "rgba(214, 196, 165, 0.45)");
  grad.addColorStop(0.42, "rgba(238, 224, 198, 0.85)");
  grad.addColorStop(0.52, "rgba(120, 110, 95, 0.15)");
  grad.addColorStop(0.62, "rgba(228, 212, 184, 0.75)");
  grad.addColorStop(0.88, "rgba(196, 180, 152, 0.35)");
  grad.addColorStop(1.0, "rgba(196, 180, 152, 0.0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
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

export interface MoonGlobeProps {
  sites?: LandingSite[];
  selectedSite?: LandingSite | null;
  showCelestial?: boolean;
  showRovers?: boolean;
  timeScale?: number;
  activeTimestampMs?: number;
  clockResetNonce?: number;
  markerShape?: SpaceMarkerShape;
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
  const siteHitMeshesRef = useRef<THREE.Object3D[]>([]);
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

    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }
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

  // Initialize Three.js Scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio, 2);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x03050c);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 320);
    camera.position.set(6.0, -0.35, 0.2);
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
    controls.maxDistance = 15;
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
    // LAYER 1: REALISTIC HIGH-CONTRAST MOON
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

    const moonEarthShine = new THREE.DirectionalLight(0x7c96d4, 0.08);
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

    hardwareHitMeshesRef.current = hardwareHits;

    // Landing Site Beacons Group
    const siteMarkersGroup = new THREE.Group();
    siteMarkersGroupRef.current = siteMarkersGroup;
    scene.add(siteMarkersGroup);

    // =========================================================================
    // LAYER 2: BACKGROUND SOLAR SYSTEM
    // =========================================================================
    const celestialGroup = new THREE.Group();
    scene.add(celestialGroup);

    const planetAmbient = new THREE.AmbientLight(0xdbeafe, 0.9);
    planetAmbient.layers.set(2);
    scene.add(planetAmbient);

    const planetKeyLight = new THREE.DirectionalLight(0xffffff, 1.8);
    planetKeyLight.position.set(10, 8, 12);
    planetKeyLight.layers.set(2);
    scene.add(planetKeyLight);

    const solarSystemRoot = new THREE.Group();
    solarSystemRoot.position.set(-14, 4.2, -16);
    solarSystemRoot.rotation.x = 0.24;
    solarSystemRoot.rotation.z = -0.06;
    celestialGroup.add(solarSystemRoot);

    const sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.95, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
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
    sunSprite.scale.set(4.6, 4.6, 1);
    sunSprite.layers.set(2);
    solarSystemRoot.add(sunSprite);

    const jupiterTex = createBandedPlanetTexture([
      { stop: 0.0, color: "#9a7b5c" },
      { stop: 0.2, color: "#e5d3b3" },
      { stop: 0.35, color: "#b87a4b" },
      { stop: 0.5, color: "#f3e5cb" },
      { stop: 0.65, color: "#a85d38" },
      { stop: 0.82, color: "#dfd0b8" },
      { stop: 1.0, color: "#8c6d4f" },
    ]);

    const saturnTex = createBandedPlanetTexture([
      { stop: 0.0, color: "#b5a078" },
      { stop: 0.3, color: "#ead8b1" },
      { stop: 0.5, color: "#d6be8a" },
      { stop: 0.72, color: "#efe2c4" },
      { stop: 1.0, color: "#a69067" },
    ]);

    const saturnRingTex = createSaturnRingTexture();

    const planetsConfig = [
      { name: "Mercury", radius: 1.65, size: 0.11, speed: 4.15, phase: 0.4, color: 0xa8a29e },
      { name: "Venus", radius: 2.35, size: 0.17, speed: 1.62, phase: 2.1, color: 0xfde68a },
      { name: "Earth", radius: 3.15, size: 0.19, speed: 1.0, phase: 4.8, color: 0x60a5fa },
      { name: "Mars", radius: 3.95, size: 0.14, speed: 0.53, phase: 1.2, color: 0xf87171 },
      { name: "Jupiter", radius: 5.2, size: 0.42, speed: 0.084, phase: 0.35, tex: jupiterTex },
      { name: "Saturn", radius: 6.7, size: 0.34, speed: 0.034, phase: 0.12, tex: saturnTex, hasRings: true },
    ];

    const orbitingBodies = planetsConfig.map((p) => {
      const ringPts: THREE.Vector3[] = [];
      for (let a = 0; a <= 360; a += 3) {
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
          color: 0xc4b5fd,
          transparent: true,
          opacity: 0.18,
        })
      );
      orbitLine.layers.set(2);
      solarSystemRoot.add(orbitLine);

      const bodyGroup = new THREE.Group();
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(p.size, 28, 28),
        new THREE.MeshStandardMaterial({
          color: p.tex ? 0xffffff : p.color,
          map: p.tex ?? null,
          roughness: 0.65,
        })
      );
      mesh.layers.set(2);
      bodyGroup.add(mesh);

      if (p.hasRings) {
        const ringGeo = new THREE.RingGeometry(p.size * 1.38, p.size * 2.35, 48);
        const posAttr = ringGeo.attributes.position;
        const uvAttr = ringGeo.attributes.uv;
        for (let i = 0; i < posAttr.count; i++) {
          const vx = posAttr.getX(i);
          const vy = posAttr.getY(i);
          const dist = Math.hypot(vx, vy);
          const u =
            (dist - p.size * 1.38) / (p.size * 2.35 - p.size * 1.38);
          uvAttr.setXY(i, u, 0.5);
        }

        const ringMesh = new THREE.Mesh(
          ringGeo,
          new THREE.MeshStandardMaterial({
            map: saturnRingTex,
            side: THREE.DoubleSide,
            transparent: true,
            roughness: 0.7,
          })
        );
        ringMesh.rotation.x = Math.PI / 2.2;
        ringMesh.rotation.y = 0.22;
        ringMesh.layers.set(2);
        bodyGroup.add(ringMesh);
      }

      solarSystemRoot.add(bodyGroup);
      return { ...p, bodyGroup };
    });

    // Click & Hover Raycaster for Beacons, Satellites & Rovers
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

      // 1. Update Moon's realistic solar illumination & Earthshine
      const { synodicPhase } = getLunarCelestialAngles(simEpochRef.current);
      const sunAngle = synodicPhase * Math.PI * 2;
      moonSunLight.position.set(
        Math.cos(sunAngle) * 18,
        2.2,
        -Math.sin(sunAngle) * 18
      );
      moonEarthShine.position.set(
        -Math.cos(sunAngle + 0.4) * 12,
        1.5,
        Math.sin(sunAngle + 0.4) * 12
      );

      // 2. Update Lunar Orbital Constellation
      lunarOrbitersGroup.visible = showCelestialRef.current;
      const elapsedHours =
        (simEpochRef.current - INITIAL_EPOCH_REF) / 3600000;
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

      // 3. Update All Surface Rovers upright on the lunar sphere
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

      // 4. Update Background Solar System Planets
      celestialGroup.visible = showCelestialRef.current;
      const elapsedYears = elapsedHours / (365.25 * 24);
      for (let i = 0; i < orbitingBodies.length; i++) {
        const b = orbitingBodies[i];
        const angle = b.phase + elapsedYears * Math.PI * 2 * b.speed;
        b.bodyGroup.position.set(
          Math.cos(angle) * b.radius,
          0,
          Math.sin(angle) * b.radius
        );
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
      realisticStars.geometry.dispose();
      starShaderMat.dispose();
      milkyWayMesh.geometry.dispose();
      (milkyWayMesh.material as THREE.Material).dispose();
      milkyWayTex.dispose();
      lunarTexture.dispose();
      sunGlowTex.dispose();
      jupiterTex.dispose();
      saturnTex.dispose();
      saturnRingTex.dispose();
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