"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { LandingSite } from "@/data/mockSites";
import {
  LUNAR_ROVERS,
  MARS_ROVERS,
  getRoverCoordinatesAtEpoch,
  getRoverTraversePath,
} from "@/data/rovers";
import {
  getLunarCelestialAngles,
  computeKeplerianPosition,
  PLANETARY_EPHEMERIS_J2000,
  KeplerianBody,
} from "@/utils/lunarEphemeris";

interface MoonGlobeProps {
  sites: LandingSite[];
  selectedSite: LandingSite | null;
  showCelestial: boolean;
  showRovers: boolean;
  timeScale: number;
  activeTimestampMs?: number;
  clockResetNonce?: number;
  onSelectSite: (site: LandingSite) => void;
  onEpochUpdate?: (epochMs: number) => void;
}

const DEFAULT_EPOCH_MS = Date.UTC(2026, 10, 14, 12, 0, 0);

const TEXTURES = {
  moonColor: "/textures/moon_color.jpg",
  moonBump: "/textures/moon_bump.jpg",
  skybox: "/textures/skybox.png",
  earthMap: "/textures/earth_map.jpg",
  earthBump: "/textures/earth_bump.png",
  earthClouds: "/textures/earth_clouds.jpg",
  sunMap: "/textures/sun_map.jpg",
  mercuryMap: "/textures/mercury_map.jpg",
  venusMap: "/textures/venus_map.jpg",
  marsMap: "/textures/mars_map.jpg",
  marsBump: "/textures/mars_bump.jpg",
  jupiterMap: "/textures/jupiter_map.jpg",
  saturnMap: "/textures/saturn_map.jpg",
  saturnRing: "/textures/saturn_ring.jpg",
};

const LUNAR_SATELLITES_J2000: (KeplerianBody & {
  color: number;
  hex: string;
})[] = [
  {
    name: "LRO",
    semiMajor: 114,
    ecc: 0.02,
    incDeg: 88,
    raanDeg: 15,
    argPeriDeg: 40,
    meanAnomalyJ2000Deg: 24,
    periodSec: 6780,
    color: 0x38bdf8,
    hex: "#38bdf8",
  },
  {
    name: "GATEWAY",
    semiMajor: 146,
    ecc: 0.28,
    incDeg: 76,
    raanDeg: 110,
    argPeriDeg: 270,
    meanAnomalyJ2000Deg: 120,
    periodSec: 18000,
    color: 0xfacc15,
    hex: "#facc15",
  },
  {
    name: "RELAY-1",
    semiMajor: 130,
    ecc: 0.01,
    incDeg: 22,
    raanDeg: 210,
    argPeriDeg: 0,
    meanAnomalyJ2000Deg: 245,
    periodSec: 10800,
    color: 0x34d399,
    hex: "#34d399",
  },
];

function latLonToVector3(lat: number, lon: number, radius: number) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((90 - lon) * Math.PI) / 180;
  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function createLabelSprite(text: string, color = "#e2e8f0", scale = 28) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  ctx.font = "bold 34px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0, 0, 0, 0.95)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 64);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale, scale * 0.25, 1);
  return sprite;
}

function createGlowSprite(hexColor: string, size: number, opacity = 0.85) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;

  const gradient = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.25, hexColor);
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(size, size, 1);
  return sprite;
}

function createSurfaceRoverMesh(
  hexColor: string,
  labelText: string,
  scale = 1
) {
  const group = new THREE.Group();

  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(0.9 * scale, 0.45 * scale, 1.2 * scale),
    new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.6,
      roughness: 0.3,
    })
  );
  chassis.position.y = 0.3 * scale;
  group.add(chassis);

  const glow = createGlowSprite(hexColor, 4.5 * scale, 0.95);
  glow.position.y = 1.2 * scale;
  group.add(glow);

  const label = createLabelSprite(labelText, hexColor, 14 * scale);
  label.position.y = 3.2 * scale;
  group.add(label);

  return group;
}

function createSatelliteMesh(beaconHex: string, labelText: string) {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.0, 2.0, 2.6),
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.85,
      roughness: 0.22,
    })
  );
  group.add(body);

  const dish = new THREE.Mesh(
    new THREE.ConeGeometry(1.1, 0.7, 16, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.7,
      roughness: 0.3,
      side: THREE.DoubleSide,
    })
  );
  dish.rotation.x = -Math.PI / 2;
  dish.position.set(0, 0, 1.6);
  group.add(dish);

  const wings = new THREE.Mesh(
    new THREE.BoxGeometry(9.2, 0.12, 2.1),
    new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      emissive: 0x0f172a,
      metalness: 0.65,
      roughness: 0.25,
    })
  );
  group.add(wings);

  const glow = createGlowSprite(beaconHex, 8, 0.9);
  glow.position.set(0, 1.8, 0);
  group.add(glow);

  const label = createLabelSprite(labelText, beaconHex, 24);
  label.position.set(0, 5.8, 0);
  group.add(label);

  return group;
}

function createKeplerOrbitRing(
  body: KeplerianBody,
  color: number,
  opacity = 0.32
) {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 144; i++) {
    const t = DEFAULT_EPOCH_MS + (i / 144) * body.periodSec * 1000;
    const p = computeKeplerianPosition(body, t);
    points.push(new THREE.Vector3(p.x, p.y, p.z));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
  });
  return new THREE.LineLoop(geometry, material);
}

export default function MoonGlobe({
  sites,
  selectedSite,
  showCelestial,
  showRovers,
  timeScale,
  activeTimestampMs = DEFAULT_EPOCH_MS,
  clockResetNonce = 0,
  onSelectSite,
  onEpochUpdate,
}: MoonGlobeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const globeRef = useRef<any>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const celestialGroupRef = useRef<THREE.Group | null>(null);
  const lunarRoverGroupRef = useRef<THREE.Group | null>(null);
  const marsRoverGroupRef = useRef<THREE.Group | null>(null);

  const timeScaleRef = useRef<number>(timeScale);
  const simEpochRef = useRef<number>(activeTimestampMs);
  const onEpochUpdateRef = useRef(onEpochUpdate);

  useEffect(() => {
    timeScaleRef.current = timeScale;
  }, [timeScale]);

  useEffect(() => {
    onEpochUpdateRef.current = onEpochUpdate;
  }, [onEpochUpdate]);

  useEffect(() => {
    simEpochRef.current = activeTimestampMs;
    onEpochUpdateRef.current?.(activeTimestampMs);
  }, [activeTimestampMs, clockResetNonce]);

  useEffect(() => {
    if (celestialGroupRef.current) {
      celestialGroupRef.current.visible = showCelestial;
    }
  }, [showCelestial]);

  useEffect(() => {
    if (lunarRoverGroupRef.current) {
      lunarRoverGroupRef.current.visible = showRovers;
    }
    if (marsRoverGroupRef.current) {
      marsRoverGroupRef.current.visible = showRovers;
    }
  }, [showRovers]);

  useEffect(() => {
    let isMounted = true;
    let animFrameId: number;

    async function initGlobe() {
      if (!containerRef.current || globeRef.current) return;

      const GlobeModule = (await import("globe.gl")).default as any;
      if (!isMounted || !containerRef.current) return;

      const loader = new THREE.TextureLoader();
      const loadTex = (url: string) => loader.load(url);

      const globe =
        typeof GlobeModule === "function" && GlobeModule.prototype?.pointOfView
          ? new GlobeModule(containerRef.current)
          : GlobeModule()(containerRef.current);

      globe
        .width(window.innerWidth)
        .height(window.innerHeight)
        .backgroundImageUrl(TEXTURES.skybox)
        .globeImageUrl(TEXTURES.moonColor)
        .bumpImageUrl(TEXTURES.moonBump)
        .showAtmosphere(false)
        .pointsData(sites)
        .pointLat("lat")
        .pointLng("lon")
        .pointLabel((d: any) => `${d.name} (${d.sunlight_percent}% Sun)`)
        .pointColor((d: any) =>
          d.id === selectedSite?.id ? "#38bdf8" : "#facc15"
        )
        .pointAltitude(0.025)
        .pointRadius(0.65)
        .onPointClick((site: any) => onSelectSite(site as LandingSite));

      const renderer = globe.renderer();
      const maxAniso = renderer?.capabilities?.getMaxAnisotropy?.() || 8;

      const globeMat = globe.globeMaterial();
      if (globeMat) {
        if (globeMat.map) globeMat.map.anisotropy = maxAniso;
        if (globeMat.bumpMap) globeMat.bumpMap.anisotropy = maxAniso;
        globeMat.bumpScale = 2.6;
        globeMat.roughness = 0.9;
        globeMat.metalness = 0.05;
      }

      const camera = globe.camera();
      camera.far = 22000;
      camera.updateProjectionMatrix();

      const controls = globe.controls();
      controls.maxDistance = 4200;
      controls.minDistance = 104;

      const scene: THREE.Scene = globe.scene();

      scene.traverse((obj: any) => {
        if (obj.isAmbientLight) obj.intensity = 0.25;
        if (obj.isDirectionalLight) obj.intensity = 0.15;
      });

      const starGeo = new THREE.BufferGeometry();
      const starCount = 1800;
      const positions = new Float32Array(starCount * 3);
      for (let i = 0; i < starCount * 3; i++) {
        positions[i] = (Math.random() - 0.5) * 9500;
      }
      starGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      scene.add(
        new THREE.Points(
          starGeo,
          new THREE.PointsMaterial({
            color: 0xf8fafc,
            size: 2.5,
            transparent: true,
            opacity: 0.75,
          })
        )
      );

      const sunLight = new THREE.DirectionalLight(0xfffbeb, 2.9);
      sunLight.position.set(2400, 140, 450);
      scene.add(sunLight);
      sunLightRef.current = sunLight;

      const lunarRoverGroup = new THREE.Group();
      lunarRoverGroup.visible = showRovers;
      scene.add(lunarRoverGroup);
      lunarRoverGroupRef.current = lunarRoverGroup;

      const activeLunarRovers = LUNAR_ROVERS.map((rover) => {
        const pathCoords = getRoverTraversePath(rover);
        const pathPoints = pathCoords.map(([lat, lon]) =>
          latLonToVector3(lat, lon, 100.35)
        );
        const pathGeo = new THREE.BufferGeometry().setFromPoints(pathPoints);
        const pathLine = new THREE.Line(
          pathGeo,
          new THREE.LineBasicMaterial({
            color: new THREE.Color(rover.color),
            transparent: true,
            opacity: 0.75,
          })
        );
        lunarRoverGroup.add(pathLine);

        const mesh = createSurfaceRoverMesh(
          rover.color,
          rover.name.split(" ")[0],
          0.95
        );
        lunarRoverGroup.add(mesh);
        return { rover, mesh };
      });

      const celestialGroup = new THREE.Group();
      celestialGroup.visible = showCelestial;
      scene.add(celestialGroup);
      celestialGroupRef.current = celestialGroup;

      const inertialSatellitesGroup = new THREE.Group();
      celestialGroup.add(inertialSatellitesGroup);

      const satellites = LUNAR_SATELLITES_J2000.map((sat) => {
        const mesh = createSatelliteMesh(sat.hex, sat.name);
        inertialSatellitesGroup.add(mesh);
        inertialSatellitesGroup.add(
          createKeplerOrbitRing(sat, sat.color, 0.35)
        );
        return { spec: sat, mesh };
      });

      const earthOrbitRadius = 540;
      const earthGroup = new THREE.Group();

      const earthMesh = new THREE.Mesh(
        new THREE.SphereGeometry(34, 36, 36),
        new THREE.MeshPhongMaterial({
          map: loadTex(TEXTURES.earthMap),
          bumpMap: loadTex(TEXTURES.earthBump),
          bumpScale: 0.8,
          specular: new THREE.Color(0x334155),
          shininess: 18,
        })
      );
      earthGroup.add(earthMesh);

      const cloudMesh = new THREE.Mesh(
        new THREE.SphereGeometry(34.6, 36, 36),
        new THREE.MeshLambertMaterial({
          alphaMap: loadTex(TEXTURES.earthClouds),
          color: 0xffffff,
          transparent: true,
          opacity: 0.82,
          depthWrite: false,
        })
      );
      earthGroup.add(cloudMesh);

      const earthAtmo = new THREE.Mesh(
        new THREE.SphereGeometry(36.2, 36, 36),
        new THREE.MeshBasicMaterial({
          color: 0x60a5fa,
          transparent: true,
          opacity: 0.2,
          side: THREE.BackSide,
        })
      );
      earthGroup.add(earthAtmo);

      const earthLabel = createLabelSprite("EARTH", "#93c5fd", 58);
      earthLabel.position.set(0, 46, 0);
      earthGroup.add(earthLabel);

      celestialGroup.add(earthGroup);

      const sunDistance = 2400;
      const sunSystemGroup = new THREE.Group();

      const sunMesh = new THREE.Mesh(
        new THREE.SphereGeometry(68, 36, 36),
        new THREE.MeshBasicMaterial({
          map: loadTex(TEXTURES.sunMap),
          color: 0xfffbeb,
        })
      );
      sunSystemGroup.add(sunMesh);
      sunSystemGroup.add(createGlowSprite("#f59e0b", 340, 0.85));

      const sunLabel = createLabelSprite("SUN", "#fde047", 95);
      sunLabel.position.set(0, 100, 0);
      sunSystemGroup.add(sunLabel);

      celestialGroup.add(sunSystemGroup);

      const helioFrameGroup = new THREE.Group();
      sunSystemGroup.add(helioFrameGroup);

      const marsRadius = 12;
      const marsMesh = new THREE.Mesh(
        new THREE.SphereGeometry(marsRadius, 32, 32),
        new THREE.MeshStandardMaterial({
          map: loadTex(TEXTURES.marsMap),
          bumpMap: loadTex(TEXTURES.marsBump),
          bumpScale: 0.6,
          roughness: 0.85,
        })
      );

      const marsRoverGroup = new THREE.Group();
      marsRoverGroup.visible = showRovers;
      marsMesh.add(marsRoverGroup);
      marsRoverGroupRef.current = marsRoverGroup;

      const activeMarsRovers = MARS_ROVERS.map((rover) => {
        const mesh = createSurfaceRoverMesh(
          rover.color,
          rover.name.split(" ")[0],
          0.7
        );
        marsRoverGroup.add(mesh);
        return { rover, mesh };
      });

      const saturnGroup = new THREE.Group();
      const saturnBody = new THREE.Mesh(
        new THREE.SphereGeometry(21, 32, 32),
        new THREE.MeshStandardMaterial({
          map: loadTex(TEXTURES.saturnMap),
          roughness: 0.75,
        })
      );
      saturnGroup.add(saturnBody);

      const ringGeo = new THREE.RingGeometry(26, 46, 48);
      const posAttr = ringGeo.attributes.position;
      const uvAttr = ringGeo.attributes.uv;
      for (let i = 0; i < posAttr.count; i++) {
        const vx = posAttr.getX(i);
        const vy = posAttr.getY(i);
        const radius = Math.sqrt(vx * vx + vy * vy);
        uvAttr.setXY(i, (radius - 26) / (46 - 26), 0.5);
      }
      const saturnRings = new THREE.Mesh(
        ringGeo,
        new THREE.MeshStandardMaterial({
          map: loadTex(TEXTURES.saturnRing),
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.88,
          roughness: 0.8,
        })
      );
      saturnRings.rotation.x = Math.PI / 2.35;
      saturnGroup.add(saturnRings);

      const planetMeshes: Record<string, { obj: THREE.Object3D; size: number }> = {
        MERCURY: {
          size: 6.5,
          obj: new THREE.Mesh(
            new THREE.SphereGeometry(6.5, 24, 24),
            new THREE.MeshStandardMaterial({
              map: loadTex(TEXTURES.mercuryMap),
              roughness: 0.9,
            })
          ),
        },
        VENUS: {
          size: 11.5,
          obj: new THREE.Mesh(
            new THREE.SphereGeometry(11.5, 28, 28),
            new THREE.MeshStandardMaterial({
              map: loadTex(TEXTURES.venusMap),
              roughness: 0.65,
            })
          ),
        },
        MARS: { size: marsRadius, obj: marsMesh },
        JUPITER: {
          size: 26,
          obj: new THREE.Mesh(
            new THREE.SphereGeometry(26, 32, 32),
            new THREE.MeshStandardMaterial({
              map: loadTex(TEXTURES.jupiterMap),
              roughness: 0.7,
            })
          ),
        },
        SATURN: { size: 24, obj: saturnGroup },
      };

      const planets = PLANETARY_EPHEMERIS_J2000.map((spec) => {
        const entry = planetMeshes[spec.name];
        const label = createLabelSprite(spec.name, "#cbd5e1", 46);
        label.position.set(0, entry.size + 16, 0);
        entry.obj.add(label);

        helioFrameGroup.add(entry.obj);
        helioFrameGroup.add(createKeplerOrbitRing(spec, 0x94a3b8, 0.16));

        return { spec, obj: entry.obj };
      });

      let lastFrameTime = performance.now();
      let lastUiBroadcast = 0;

      const animate = (now: number) => {
        animFrameId = requestAnimationFrame(animate);

        const dtMs = Math.min(250, now - lastFrameTime);
        lastFrameTime = now;

        const scale = timeScaleRef.current;
        if (scale > 0) {
          simEpochRef.current += dtMs * scale;
        }

        const currentEpochMs = simEpochRef.current;

        if (now - lastUiBroadcast > 250) {
          lastUiBroadcast = now;
          onEpochUpdateRef.current?.(currentEpochMs);
        }

        const celestial = getLunarCelestialAngles(currentEpochMs);

        // 1. Lunar Surface Rovers (evaluated at exact currentEpochMs)
        activeLunarRovers.forEach(({ rover, mesh }) => {
          const { lat, lon } = getRoverCoordinatesAtEpoch(
            rover,
            currentEpochMs
          );
          const pos = latLonToVector3(lat, lon, 100.35);
          mesh.position.copy(pos);
          mesh.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            pos.clone().normalize()
          );
        });

        // 2. Mars Rovers (evaluated at exact currentEpochMs)
        activeMarsRovers.forEach(({ rover, mesh }) => {
          const { lat, lon } = getRoverCoordinatesAtEpoch(
            rover,
            currentEpochMs
          );
          const pos = latLonToVector3(lat, lon, marsRadius + 0.15);
          mesh.position.copy(pos);
          mesh.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            pos.clone().normalize()
          );
        });

        // 3. Lunar Satellites
        inertialSatellitesGroup.rotation.y = -celestial.lunarSiderealRad;
        satellites.forEach(({ spec, mesh }) => {
          const pos = computeKeplerianPosition(spec, currentEpochMs);
          mesh.position.set(pos.x, pos.y, pos.z);
          mesh.lookAt(0, 0, 0);
        });

        // 4. Earth Position & Sidereal Spin
        const earthPos = latLonToVector3(
          celestial.subEarthLat,
          celestial.subEarthLon,
          earthOrbitRadius
        );
        earthGroup.position.copy(earthPos);

        const earthRotationRad =
          ((currentEpochMs / 86400000) * Math.PI * 2) % (Math.PI * 2);
        earthMesh.rotation.y = earthRotationRad;
        cloudMesh.rotation.y = earthRotationRad * 1.04;

        // 5. Sun Position & Dynamic Day/Night Terminator Light
        const sunPos = latLonToVector3(
          celestial.subsolarLat,
          celestial.subsolarLon,
          sunDistance
        );
        sunSystemGroup.position.copy(sunPos);
        sunMesh.rotation.y = earthRotationRad / 25.38;

        if (sunLightRef.current) {
          sunLightRef.current.position.copy(sunPos);
        }

        // 6. Heliocentric Planets
        const sceneSunAngle = Math.atan2(-sunPos.z, sunPos.x);
        const sceneEarthFromSunAngle = sceneSunAngle + Math.PI;
        helioFrameGroup.rotation.y =
          sceneEarthFromSunAngle - celestial.earthHelioLonRad;

        planets.forEach(({ spec, obj }) => {
          const pos = computeKeplerianPosition(spec, currentEpochMs);
          obj.position.set(pos.x, pos.y, pos.z);
          if (spec.name !== "SATURN") {
            obj.rotation.y = earthRotationRad * 0.95;
          } else {
            saturnBody.rotation.y = earthRotationRad * 2.2;
          }
        });
      };

      animFrameId = requestAnimationFrame(animate);

      globe.pointOfView({ lat: -20, lng: 15, altitude: 2.3 }, 0);
      globeRef.current = globe;
    }

    initGlobe();

    const handleResize = () => {
      if (globeRef.current) {
        globeRef.current.width(window.innerWidth).height(window.innerHeight);
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      isMounted = false;
      cancelAnimationFrame(animFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;

    globe
      .pointsData(sites)
      .pointColor((d: any) =>
        d.id === selectedSite?.id ? "#38bdf8" : "#facc15"
      );

    if (selectedSite) {
      globe.pointOfView(
        { lat: selectedSite.lat, lng: selectedSite.lon, altitude: 0.9 },
        1000
      );
    } else {
      globe.pointOfView({ lat: -20, lng: 15, altitude: 2.3 }, 1000);
    }
  }, [sites, selectedSite]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full cursor-grab active:cursor-grabbing"
    />
  );
}