"use client";

import { memo, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { LandingSite } from "@/data/mockSites";
import {
  LUNAR_ROVERS,
  getRoverCoordinatesAtEpoch,
  getRoverTraversePath,
} from "@/data/rovers";
import {
  MOON_RADIUS_M,
  SP_MAP_EXTENT_M,
  TerrainLayerMode,
  drawSouthPolarTileToCanvas,
  drawEquatorialTileToCanvas,
  renderLocalLunarPatchDataUrl,
} from "@/utils/lunarTextures";
import { getLunarCelestialAngles } from "@/utils/lunarEphemeris";

export type SpaceMarkerShape = "reticle" | "lander" | "diamond";

const MOON_TREK_EQ_WMTS =
  "https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{y}/{x}.jpg";

const LunarSouthPoleCRS = L.extend({}, L.CRS.Simple, {
  projection: {
    project(latlng: L.LatLng) {
      const clampedLat = Math.max(-90, Math.min(-25, latlng.lat));
      const phi = (clampedLat * Math.PI) / 180;
      const lam = (latlng.lng * Math.PI) / 180;
      const rho = 2 * MOON_RADIUS_M * Math.tan((Math.PI / 2 + phi) / 2);
      return new L.Point(rho * Math.sin(lam), rho * Math.cos(lam));
    },
    unproject(point: L.Point) {
      const rho = Math.hypot(point.x, point.y);
      if (rho < 1e-3) return new L.LatLng(-90, 0);
      const c = 2 * Math.atan(rho / (2 * MOON_RADIUS_M));
      const lat = (Math.asin(-Math.cos(c)) * 180) / Math.PI;
      const lon = (Math.atan2(point.x, point.y) * 180) / Math.PI;
      return new L.LatLng(lat, lon);
    },
    bounds: L.bounds(
      [-SP_MAP_EXTENT_M, -SP_MAP_EXTENT_M],
      [SP_MAP_EXTENT_M, SP_MAP_EXTENT_M]
    ),
  },
  transformation: new L.Transformation(1, SP_MAP_EXTENT_M, -1, SP_MAP_EXTENT_M),
  scale(zoom: number) {
    return (256 * Math.pow(2, zoom)) / (2 * SP_MAP_EXTENT_M);
  },
});

const LUNAR_LANDMARKS = [
  { name: "OCEANUS PROCELLARUM", lat: 18.4, lon: -57.4, type: "mare", minZoom: 3 },
  { name: "MARE TRANQUILLITATIS", lat: 8.5, lon: 31.4, type: "mare", minZoom: 3 },
  { name: "MARE IMBRIUM", lat: 32.8, lon: -15.6, type: "mare", minZoom: 3 },
  { name: "MARE SERENITATIS", lat: 28.0, lon: 17.5, type: "mare", minZoom: 3 },
  { name: "MARE CRISIUM", lat: 17.0, lon: 59.1, type: "mare", minZoom: 3 },
  { name: "MARE FECUNDITATIS", lat: -7.8, lon: 51.3, type: "mare", minZoom: 3 },
  { name: "MARE NUBIUM", lat: -21.3, lon: -16.6, type: "mare", minZoom: 3 },
  { name: "Tycho Crater", lat: -43.3, lon: -11.2, type: "crater", minZoom: 3 },
  { name: "Copernicus Crater", lat: 9.6, lon: -20.1, type: "crater", minZoom: 3 },
  { name: "Aristarchus Plateau", lat: 23.7, lon: -47.4, type: "crater", minZoom: 3 },
  { name: "Clavius Basin", lat: -58.4, lon: -14.4, type: "crater", minZoom: 3 },
  { name: "Kepler Crater", lat: 8.1, lon: -38.0, type: "crater", minZoom: 4 },
  { name: "Plato Crater", lat: 51.6, lon: -9.3, type: "crater", minZoom: 4 },
  { name: "Archimedes Crater", lat: 29.7, lon: -4.0, type: "crater", minZoom: 4 },
  { name: "Ptolemaeus Crater", lat: -9.2, lon: -1.8, type: "crater", minZoom: 4 },
  { name: "Theophilus Crater", lat: -11.4, lon: 26.4, type: "crater", minZoom: 4 },
  { name: "Grimaldi Basin", lat: -5.2, lon: -68.6, type: "crater", minZoom: 4 },
  { name: "Schrödinger Basin", lat: -75.0, lon: 132.4, type: "crater", minZoom: 3 },
  { name: "Shackleton Rim", lat: -89.54, lon: 0.0, type: "crater", minZoom: 4 },
  { name: "Malapert Massif", lat: -86.0, lon: 12.9, type: "crater", minZoom: 4 },
  { name: "Nobile Crater", lat: -85.2, lon: 53.5, type: "crater", minZoom: 4 },
  { name: "Cabeus Crater", lat: -84.9, lon: -35.5, type: "crater", minZoom: 5 },
  { name: "Amundsen Crater", lat: -84.5, lon: 82.8, type: "crater", minZoom: 5 },
  { name: "Shoemaker Crater", lat: -88.0, lon: 45.0, type: "crater", minZoom: 6 },
  { name: "Faustini Crater", lat: -87.2, lon: 82.0, type: "crater", minZoom: 6 },
  { name: "Haworth Crater", lat: -87.5, lon: -5.0, type: "crater", minZoom: 5 },
  { name: "de Gerlache Crater", lat: -88.5, lon: -87.1, type: "crater", minZoom: 5 },
];

export function computeLiveSiteSolarEarth(
  site: LandingSite,
  baseEpochMs: number,
  currentEpochMs: number
) {
  const { synodicPhase } = getLunarCelestialAngles(currentEpochMs);
  const deltaDays = (currentEpochMs - baseEpochMs) / 86400000;
  const deltaSunAngleRad = (deltaDays / 29.530588853) * Math.PI * 2;

  let subsolarLon = (0.5 - synodicPhase) * 360;
  while (subsolarLon > 180) subsolarLon -= 360;
  while (subsolarLon < -180) subsolarLon += 360;
  const subsolarLat = 1.54 * Math.sin(synodicPhase * Math.PI * 2);

  const sunAzimuth =
    (site.sun_azimuth + (deltaSunAngleRad * 180) / Math.PI + 360) % 360;
  const maxElev = Math.max(8, 90 - Math.abs(site.lat));
  const baseElRad = Math.asin(
    Math.max(-1, Math.min(1, site.sun_elevation / maxElev))
  );
  const sunElevation = Number(
    (maxElev * Math.sin(baseElRad + deltaSunAngleRad)).toFixed(1)
  );

  const librationPhase = (deltaDays / 27.55455) * Math.PI * 2;
  const earthAzimuth = Number(
    (site.earth_azimuth + 5.2 * Math.sin(librationPhase) + 360) % 360
  );
  const earthElevation = Number(
    (site.earth_elevation + 4.8 * Math.cos(librationPhase)).toFixed(1)
  );

  return {
    synodicPhase,
    subsolarLon,
    subsolarLat,
    sunAzimuth,
    sunElevation,
    earthAzimuth,
    earthElevation,
  };
}

const createSpaceMarkerIcon = (
  isSelected: boolean,
  isContours: boolean,
  isPinned: boolean,
  shape: SpaceMarkerShape
) => {
  const size = isSelected ? 40 : isPinned ? 34 : 30;
  const haloSize = isSelected ? 64 : isPinned ? 50 : 42;

  const primary = isContours
    ? isSelected
      ? "#4338ca"
      : isPinned
      ? "#be185d"
      : "#312e81"
    : isSelected
    ? "#ddd6fe"
    : isPinned
    ? "#f5d0fe"
    : "#c7d2fe";

  const accent = isContours
    ? "#e0e7ff"
    : isSelected
    ? "#ffffff"
    : isPinned
    ? "#fdf4ff"
    : "#eef2ff";

  const coreFill = isContours ? "#a5b4fc" : "#090b16";

  const dropShadowStack = isSelected
    ? "drop-shadow(0 0 3px #ffffff) drop-shadow(0 0 10px rgba(196, 181, 253, 0.98)) drop-shadow(0 0 22px rgba(167, 139, 250, 0.9))"
    : isPinned
    ? "drop-shadow(0 0 2px #fdf4ff) drop-shadow(0 0 8px rgba(240, 171, 252, 0.95)) drop-shadow(0 0 18px rgba(217, 70, 239, 0.78))"
    : "drop-shadow(0 0 2px rgba(238, 242, 255, 0.9)) drop-shadow(0 0 7px rgba(165, 180, 252, 0.88)) drop-shadow(0 0 15px rgba(129, 140, 248, 0.65))";

  const radialAura = isSelected
    ? "radial-gradient(circle, rgba(233, 213, 255, 0.56) 0%, rgba(167, 139, 250, 0.26) 45%, rgba(167, 139, 250, 0) 74%)"
    : isPinned
    ? "radial-gradient(circle, rgba(245, 208, 254, 0.48) 0%, rgba(217, 70, 239, 0.22) 45%, rgba(217, 70, 239, 0) 74%)"
    : "radial-gradient(circle, rgba(199, 210, 254, 0.4) 0%, rgba(129, 140, 248, 0.16) 45%, rgba(129, 140, 248, 0) 74%)";

  const pulseRings =
    isSelected || isPinned
      ? `<span style="
          position:absolute;
          width:${size - 4}px;
          height:${size - 4}px;
          border-radius:9999px;
          border:1.5px solid ${accent};
          box-shadow:0 0 12px ${primary};
          animation:lunavSpacePulse 2.1s ease-out infinite;
          pointer-events:none;
        "></span>
        <span style="
          position:absolute;
          width:${size - 4}px;
          height:${size - 4}px;
          border-radius:9999px;
          border:1px solid ${primary};
          animation:lunavSpacePulse 2.1s ease-out 1.05s infinite;
          pointer-events:none;
        "></span>`
      : "";

  let svgInner = "";

  if (shape === "lander") {
    svgInner = `
      <line x1="16" y1="3.5" x2="16" y2="7.5" stroke="${accent}" stroke-width="1.7" stroke-linecap="round" />
      <circle cx="16" cy="3.2" r="2.1" fill="#ffffff" />
      <polygon points="10.5,8 21.5,8 23.5,14 21,18.5 11,18.5 8.5,14" fill="${primary}" stroke="${accent}" stroke-width="1.6" stroke-linejoin="round" />
      <rect x="13" y="10.5" width="6" height="4.5" rx="1" fill="${coreFill}" />
      <circle cx="16" cy="12.75" r="1.4" fill="#ffffff" />
      <polygon points="13.5,18.5 18.5,18.5 19.5,21.5 12.5,21.5" fill="${accent}" />
      <line x1="10" y1="17.5" x2="5.5" y2="26.5" stroke="${primary}" stroke-width="1.9" stroke-linecap="round" />
      <line x1="22" y1="17.5" x2="26.5" y2="26.5" stroke="${primary}" stroke-width="1.9" stroke-linecap="round" />
      <line x1="16" y1="21.5" x2="16" y2="26.5" stroke="${primary}" stroke-width="1.7" stroke-linecap="round" />
      <line x1="3.5" y1="26.5" x2="7.5" y2="26.5" stroke="${accent}" stroke-width="1.9" stroke-linecap="round" />
      <line x1="24.5" y1="26.5" x2="28.5" y2="26.5" stroke="${accent}" stroke-width="1.9" stroke-linecap="round" />
      <line x1="14" y1="26.5" x2="18" y2="26.5" stroke="${accent}" stroke-width="1.9" stroke-linecap="round" />
    `;
  } else if (shape === "diamond") {
    svgInner = `
      <line x1="2.5" y1="16" x2="7.5" y2="16" stroke="${accent}" stroke-width="1.7" stroke-linecap="round" />
      <line x1="24.5" y1="16" x2="29.5" y2="16" stroke="${accent}" stroke-width="1.7" stroke-linecap="round" />
      <line x1="16" y1="2.5" x2="16" y2="6.5" stroke="${accent}" stroke-width="1.6" stroke-linecap="round" />
      <line x1="16" y1="25.5" x2="16" y2="29.5" stroke="${accent}" stroke-width="1.6" stroke-linecap="round" />
      <polygon points="16,6.5 25.5,16 16,25.5 6.5,16" fill="${primary}" stroke="${accent}" stroke-width="1.8" stroke-linejoin="round" />
      <polygon points="16,11.5 20.5,16 16,20.5 11.5,16" fill="${coreFill}" />
      <circle cx="16" cy="16" r="2.2" fill="#ffffff" />
    `;
  } else {
    svgInner = `
      <path d="M6 11V6H11M21 6H26V11M26 21V26H21M11 26H6V21" stroke="${accent}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="16" cy="16" r="6.8" fill="${primary}" fill-opacity="0.34" stroke="${accent}" stroke-width="1.5" />
      <circle cx="16" cy="16" r="3.1" fill="#ffffff" />
      <line x1="16" y1="3" x2="16" y2="7.5" stroke="${accent}" stroke-width="1.4" stroke-linecap="round" />
      <line x1="16" y1="24.5" x2="16" y2="29" stroke="${accent}" stroke-width="1.4" stroke-linecap="round" />
      <line x1="3" y1="16" x2="7.5" y2="16" stroke="${accent}" stroke-width="1.4" stroke-linecap="round" />
      <line x1="24.5" y1="16" x2="29" y2="16" stroke="${accent}" stroke-width="1.4" stroke-linecap="round" />
    `;
  }

  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:${haloSize}px;height:${haloSize}px;display:flex;align-items:center;justify-content:center;pointer-events:auto;">
      <span style="
        position:absolute;
        inset:0;
        border-radius:9999px;
        background:${radialAura};
        animation:lunavAmbientBreathe 2.8s ease-in-out infinite;
        pointer-events:none;
      "></span>
      ${pulseRings}
      <svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="position:relative;z-index:2;filter:${dropShadowStack};transition:transform 0.2s ease;">
        ${svgInner}
      </svg>
    </div>`,
    iconSize: [haloSize, haloSize],
    iconAnchor: [haloSize / 2, haloSize / 2],
    tooltipAnchor: [0, -(size / 2 + 4)],
  });
};

const createRoverIcon = (color: string, label: string) =>
  L.divIcon({
    className: "",
    html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;">
      <div style="width:11px;height:11px;background:${color};border:2px solid #0f1328;border-radius:4px;box-shadow:0 0 12px ${color}, 0 0 22px ${color};"></div>
      <span style="position:absolute;top:-19px;white-space:nowrap;background:rgba(15,19,40,0.9);color:${color};border:1px solid ${color};box-shadow:0 0 10px rgba(165,180,252,0.3);font-size:9px;font-family:monospace;padding:1px 6px;border-radius:9999px;">${label}</span>
    </div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

function createSouthPolarGridLayer(renderMode: TerrainLayerMode): L.GridLayer {
  const PolarTileLayer = L.GridLayer.extend({
    createTile(coords: L.Coords, done: L.DoneCallback) {
      const tile = document.createElement("canvas");
      const size = this.getTileSize();
      tile.width = size.x;
      tile.height = size.y;

      const worldSpanM = 2 * SP_MAP_EXTENT_M;
      const tileSpanM = worldSpanM / Math.pow(2, coords.z);

      const minX = -SP_MAP_EXTENT_M + coords.x * tileSpanM;
      const maxX = minX + tileSpanM;
      const maxY = SP_MAP_EXTENT_M - coords.y * tileSpanM;
      const minY = maxY - tileSpanM;

      drawSouthPolarTileToCanvas({
        canvas: tile,
        tileKey: `SP_${renderMode}_${coords.z}_${coords.x}_${coords.y}`,
        minX,
        maxX,
        minY,
        maxY,
        renderMode,
      })
        .then(() => done(undefined, tile))
        .catch((err) => done(err, tile));

      return tile;
    },
  });

  return new (PolarTileLayer as any)({
    tileSize: 256,
    zIndex: 220,
    updateWhenZooming: false,
    updateWhenIdle: true,
    keepBuffer: 1,
  });
}

function createEquatorialTerrainGridLayer(
  renderMode: "contours" | "slope"
): L.GridLayer {
  const EqTerrainLayer = L.GridLayer.extend({
    createTile(coords: L.Coords, done: L.DoneCallback) {
      const tile = document.createElement("canvas");
      const size = this.getTileSize();
      tile.width = size.x;
      tile.height = size.y;

      const bounds: L.LatLngBounds = (this as any)._tileCoordsToBounds(coords);

      drawEquatorialTileToCanvas({
        canvas: tile,
        tileKey: `EQ_${renderMode}_${coords.z}_${coords.x}_${coords.y}`,
        westLon: bounds.getWest(),
        eastLon: bounds.getEast(),
        southLat: bounds.getSouth(),
        northLat: bounds.getNorth(),
        renderMode,
      })
        .then(() => done(undefined, tile))
        .catch((err) => done(err, tile));

      return tile;
    },
  });

  return new (EqTerrainLayer as any)({
    tileSize: 256,
    zIndex: 230,
    opacity: renderMode === "slope" ? 0.78 : 0.96,
    updateWhenZooming: false,
    updateWhenIdle: true,
    keepBuffer: 1,
    bounds: [
      [-90, -180],
      [90, 180],
    ],
  });
}

export interface MoonMap2DProps {
  mode?: "full" | "picker" | "thumbnail";
  sites?: LandingSite[];
  selectedSite?: LandingSite | null;
  pickedCoords?: { lat: number; lon: number } | null;
  center?: [number, number];
  zoom?: number;
  showRovers?: boolean;
  showSolarShadows?: boolean;
  timeScale?: number;
  activeTimestampMs?: number;
  clockResetNonce?: number;
  projectionMode?: "EQ" | "SP";
  layerMode?: TerrainLayerMode;
  markerShape?: SpaceMarkerShape;
  isPinDropMode?: boolean;
  pinnedSiteIds?: string[];
  onSelectSite?: (site: LandingSite) => void;
  onPickCoords?: (coords: { lat: number; lon: number }) => void;
  onMapClickPin?: (coords: { lat: number; lon: number }) => void;
  onCenterChange?: (coords: { lat: number; lon: number }) => void;
  onEpochUpdate?: (epochMs: number) => void;
}

function MoonMap2DComponent({
  mode = "full",
  sites = [],
  selectedSite = null,
  pickedCoords = null,
  center = [0, 0],
  zoom = 3,
  showRovers = true,
  showSolarShadows = true,
  timeScale = 1,
  activeTimestampMs = Date.UTC(2026, 10, 14, 12, 0, 0),
  clockResetNonce = 0,
  projectionMode = "EQ",
  layerMode = "relief",
  markerShape = "reticle",
  isPinDropMode = false,
  pinnedSiteIds = [],
  onSelectSite = () => {},
  onPickCoords = () => {},
  onMapClickPin,
  onCenterChange,
  onEpochUpdate,
}: MoonMap2DProps) {
  const [thumbDataUrl, setThumbDataUrl] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const shadowCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const customGridLayerRef = useRef<L.GridLayer | null>(null);
  const graticuleGroupRef = useRef<L.LayerGroup | null>(null);
  const labelGroupRef = useRef<L.LayerGroup | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const roverGroupRef = useRef<L.LayerGroup | null>(null);

  const timeScaleRef = useRef<number>(timeScale);
  const baseEpochRef = useRef<number>(activeTimestampMs);
  const simEpochRef = useRef<number>(activeTimestampMs);
  const selectedSiteRef = useRef<LandingSite | null>(selectedSite);
  const projectionModeRef = useRef<"EQ" | "SP">(projectionMode);
  const showSolarShadowsRef = useRef<boolean>(showSolarShadows);
  const onEpochUpdateRef = useRef(onEpochUpdate);
  const isPinDropModeRef = useRef<boolean>(isPinDropMode);
  const onMapClickPinRef = useRef(onMapClickPin);
  const onCenterChangeRef = useRef(onCenterChange);

  useEffect(() => {
    timeScaleRef.current = timeScale;
  }, [timeScale]);

  useEffect(() => {
    selectedSiteRef.current = selectedSite;
  }, [selectedSite]);

  useEffect(() => {
    projectionModeRef.current = projectionMode;
  }, [projectionMode]);

  useEffect(() => {
    showSolarShadowsRef.current = showSolarShadows;
  }, [showSolarShadows]);

  useEffect(() => {
    onEpochUpdateRef.current = onEpochUpdate;
  }, [onEpochUpdate]);

  useEffect(() => {
    isPinDropModeRef.current = isPinDropMode;
  }, [isPinDropMode]);

  useEffect(() => {
    onMapClickPinRef.current = onMapClickPin;
  }, [onMapClickPin]);

  useEffect(() => {
    onCenterChangeRef.current = onCenterChange;
  }, [onCenterChange]);

  useEffect(() => {
  const el = containerRef.current;
  if (!el) return;
  el.style.cursor =
    mode === "picker" || isPinDropMode ? "crosshair" : "";
}, [mode, isPinDropMode]);

  useEffect(() => {
    baseEpochRef.current = activeTimestampMs;
    simEpochRef.current = activeTimestampMs;
    onEpochUpdateRef.current?.(activeTimestampMs);
  }, [activeTimestampMs, clockResetNonce]);

  const thumbLat = sites[0]?.lat ?? center[0];
  const thumbLon = sites[0]?.lon ?? center[1];

  useEffect(() => {
    if (mode !== "thumbnail") return;
    let active = true;

    renderLocalLunarPatchDataUrl({
      centerLat: thumbLat,
      centerLon: thumbLon,
      spanDeg: 5.5,
      width: 240,
      height: 120,
      terrainMode: false,
      showReticle: true,
    }).then((url) => {
      if (active) setThumbDataUrl(url);
    });

    return () => {
      active = false;
    };
  }, [mode, thumbLat, thumbLon]);

  // Draw Real-Time Solar Terminator, Shadow Shift & Zoomed Landing Site Vectors
  const drawSolarOverlay = useRef<() => void>(() => {});
  drawSolarOverlay.current = () => {
    const canvas = shadowCanvasRef.current;
    const map = mapRef.current;
    if (!canvas || !map || mode !== "full") return;

    const size = map.getSize();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== size.x * dpr || canvas.height !== size.y * dpr) {
      canvas.width = size.x * dpr;
      canvas.height = size.y * dpr;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size.x, size.y);

    const isSP = projectionModeRef.current === "SP";
    const { synodicPhase } = getLunarCelestialAngles(simEpochRef.current);

    let subsolarLon = (0.5 - synodicPhase) * 360;
    while (subsolarLon > 180) subsolarLon -= 360;
    while (subsolarLon < -180) subsolarLon += 360;
    const subsolarLatRad =
      ((1.54 * Math.sin(synodicPhase * Math.PI * 2)) * Math.PI) / 180;
    const subsolarLonRad = (subsolarLon * Math.PI) / 180;

    if (showSolarShadowsRef.current) {
      if (!isSP) {
        const step = 10;
        for (let py = 0; py < size.y; py += step) {
          for (let px = 0; px < size.x; px += step) {
            const latlng = map.containerPointToLatLng([
              px + step * 0.5,
              py + step * 0.5,
            ]);
            if (latlng.lat > 90 || latlng.lat < -90) continue;

            const latRad = (latlng.lat * Math.PI) / 180;
            const lonRad = (latlng.lng * Math.PI) / 180;
            const cosZ =
              Math.sin(latRad) * Math.sin(subsolarLatRad) +
              Math.cos(latRad) *
                Math.cos(subsolarLatRad) *
                Math.cos(lonRad - subsolarLonRad);

            if (cosZ < 0.16) {
              const shadowFactor = Math.max(
                0,
                Math.min(1, (0.16 - cosZ) / 0.34)
              );
              ctx.fillStyle = `rgba(5, 7, 18, ${(shadowFactor * 0.62).toFixed(
                3
              )})`;
              ctx.fillRect(px, py, step + 0.6, step + 0.6);
            } else if (cosZ > 0.35) {
              const sunGlow = Math.min(1, (cosZ - 0.35) / 0.65);
              ctx.fillStyle = `rgba(254, 243, 199, ${(sunGlow * 0.055).toFixed(
                3
              )})`;
              ctx.fillRect(px, py, step + 0.6, step + 0.6);
            }
          }
        }
      } else {
        const polePt = map.latLngToContainerPoint([-90, 0]);
        const sunBearingRad = (-subsolarLon * Math.PI) / 180;
        const maxR = Math.hypot(size.x, size.y);

        const grad = ctx.createLinearGradient(
          polePt.x + Math.cos(sunBearingRad) * (maxR * 0.48),
          polePt.y + Math.sin(sunBearingRad) * (maxR * 0.48),
          polePt.x - Math.cos(sunBearingRad) * (maxR * 0.48),
          polePt.y - Math.sin(sunBearingRad) * (maxR * 0.48)
        );
        grad.addColorStop(0.0, "rgba(254, 243, 199, 0.09)");
        grad.addColorStop(0.42, "rgba(254, 243, 199, 0.02)");
        grad.addColorStop(0.54, "rgba(6, 8, 20, 0.32)");
        grad.addColorStop(1.0, "rgba(5, 7, 18, 0.66)");

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size.x, size.y);
      }
    }

    const site = selectedSiteRef.current;
    const isSiteVisibleInProjection =
      site &&
      (isSP
        ? site.lat < -55
        : site.lat >= -70 || site.id.startsWith("pinned-"));

    if (site && isSiteVisibleInProjection) {
      const sitePt = map.latLngToContainerPoint([site.lat, site.lon]);
      const live = computeLiveSiteSolarEarth(
        site,
        baseEpochRef.current,
        simEpochRef.current
      );

      // Punch a soft radial aperture in the shadow canvas so the active marker's glow shines at full brightness
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      const clearGrad = ctx.createRadialGradient(
        sitePt.x,
        sitePt.y,
        4,
        sitePt.x,
        sitePt.y,
        30
      );
      clearGrad.addColorStop(0, "rgba(0, 0, 0, 0.95)");
      clearGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = clearGrad;
      ctx.beginPath();
      ctx.arc(sitePt.x, sitePt.y, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      let sunScreenAngleRad: number;
      let earthScreenAngleRad: number;

      if (isSP) {
        const lonRad = (site.lon * Math.PI) / 180;
        const sunAzRad = (live.sunAzimuth * Math.PI) / 180;
        const earthAzRad = (live.earthAzimuth * Math.PI) / 180;
        sunScreenAngleRad = Math.PI / 2 - lonRad - sunAzRad;
        earthScreenAngleRad = Math.PI / 2 - lonRad - earthAzRad;
      } else {
        sunScreenAngleRad = ((live.sunAzimuth - 90) * Math.PI) / 180;
        earthScreenAngleRad = ((live.earthAzimuth - 90) * Math.PI) / 180;
      }

      const shadowAngle = sunScreenAngleRad + Math.PI;
      const isSunUp = live.sunElevation > 0;
      const shadowLen = isSunUp
        ? Math.max(46, Math.min(185, 195 - live.sunElevation * 2.1))
        : 210;

      const shadowGrad = ctx.createLinearGradient(
        sitePt.x,
        sitePt.y,
        sitePt.x + Math.cos(shadowAngle) * shadowLen,
        sitePt.y + Math.sin(shadowAngle) * shadowLen
      );
      shadowGrad.addColorStop(
        0,
        isSunUp ? "rgba(4, 6, 16, 0.72)" : "rgba(4, 6, 16, 0.55)"
      );
      shadowGrad.addColorStop(1, "rgba(4, 6, 16, 0)");

      ctx.beginPath();
      ctx.moveTo(sitePt.x, sitePt.y);
      ctx.arc(
        sitePt.x,
        sitePt.y,
        shadowLen,
        shadowAngle - 0.24,
        shadowAngle + 0.24
      );
      ctx.closePath();
      ctx.fillStyle = shadowGrad;
      ctx.fill();

      const sunRayLen = 115;
      const sunStartX = sitePt.x + Math.cos(sunScreenAngleRad) * sunRayLen;
      const sunStartY = sitePt.y + Math.sin(sunScreenAngleRad) * sunRayLen;
      const sunEndX = sitePt.x + Math.cos(sunScreenAngleRad) * 24;
      const sunEndY = sitePt.y + Math.sin(sunScreenAngleRad) * 24;

      ctx.save();
      ctx.strokeStyle = isSunUp
        ? "rgba(253, 230, 138, 0.9)"
        : "rgba(253, 230, 138, 0.35)";
      ctx.lineWidth = 1.75;
      if (!isSunUp) ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(sunStartX, sunStartY);
      ctx.lineTo(sunEndX, sunEndY);
      ctx.stroke();

      const arrowAngle = sunScreenAngleRad + Math.PI;
      ctx.setLineDash([]);
      ctx.fillStyle = isSunUp ? "#fde68a" : "rgba(253, 230, 138, 0.5)";
      ctx.beginPath();
      ctx.moveTo(sunEndX, sunEndY);
      ctx.lineTo(
        sunEndX - Math.cos(arrowAngle - 0.4) * 8,
        sunEndY - Math.sin(arrowAngle - 0.4) * 8
      );
      ctx.lineTo(
        sunEndX - Math.cos(arrowAngle + 0.4) * 8,
        sunEndY - Math.sin(arrowAngle + 0.4) * 8
      );
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.arc(sunStartX, sunStartY, 6, 0, Math.PI * 2);
      ctx.fillStyle = isSunUp ? "#fef08a" : "#78716c";
      ctx.fill();
      ctx.strokeStyle = "#0f1328";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.font = "bold 9px ui-monospace, SFMono-Regular, Menlo, monospace";
      const sunTag = `SUN ${live.sunElevation > 0 ? `+${live.sunElevation}` : live.sunElevation}°`;
      const sunTagW = ctx.measureText(sunTag).width + 12;
      ctx.fillStyle = "rgba(15, 19, 40, 0.88)";
      ctx.beginPath();
      ctx.roundRect(sunStartX - sunTagW / 2, sunStartY - 22, sunTagW, 14, 7);
      ctx.fill();
      ctx.fillStyle = isSunUp ? "#fef08a" : "#cbd5e1";
      ctx.textAlign = "center";
      ctx.fillText(sunTag, sunStartX, sunStartY - 12);
      ctx.restore();

      const earthRayLen = 105;
      const isEarthUp = live.earthElevation > 0;
      const earthEndX = sitePt.x + Math.cos(earthScreenAngleRad) * earthRayLen;
      const earthEndY = sitePt.y + Math.sin(earthScreenAngleRad) * earthRayLen;
      const earthStartX = sitePt.x + Math.cos(earthScreenAngleRad) * 24;
      const earthStartY = sitePt.y + Math.sin(earthScreenAngleRad) * 24;

      ctx.save();
      ctx.strokeStyle = isEarthUp
        ? "rgba(165, 180, 252, 0.88)"
        : "rgba(244, 114, 182, 0.45)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash(isEarthUp ? [6, 3] : [3, 4]);
      ctx.beginPath();
      ctx.moveTo(earthStartX, earthStartY);
      ctx.lineTo(earthEndX, earthEndY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(earthEndX, earthEndY, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = isEarthUp ? "#93c5fd" : "#64748b";
      ctx.fill();
      ctx.strokeStyle = "#0f1328";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const earthTag = `EARTH ${live.earthElevation > 0 ? `+${live.earthElevation}` : live.earthElevation}°`;
      const earthTagW = ctx.measureText(earthTag).width + 12;
      ctx.fillStyle = "rgba(15, 19, 40, 0.88)";
      ctx.beginPath();
      ctx.roundRect(
        earthEndX - earthTagW / 2,
        earthEndY + 9,
        earthTagW,
        14,
        7
      );
      ctx.fill();
      ctx.fillStyle = isEarthUp ? "#c7d2fe" : "#fda4af";
      ctx.textAlign = "center";
      ctx.fillText(earthTag, earthEndX, earthEndY + 19);
      ctx.restore();
    }

    ctx.restore();
  };

  // Initialize Full-Bleed Leaflet Map
  useEffect(() => {
    if (mode === "thumbnail") return;
    const container = containerRef.current;
    if (!container) return;

    const isSouthPole = mode === "full" && projectionMode === "SP";

    const initialCenter: [number, number] = isSouthPole
      ? selectedSite && selectedSite.lat < -55
        ? [selectedSite.lat, selectedSite.lon]
        : [-86.5, 0]
      : selectedSite && selectedSite.lat >= -70
      ? [selectedSite.lat, selectedSite.lon]
      : center;

    const initialZoom =
      mode === "picker" ? 1 : isSouthPole ? 4 : Math.max(3, zoom);

    const spCornerNW = LunarSouthPoleCRS.projection.unproject(
      L.point(-SP_MAP_EXTENT_M, SP_MAP_EXTENT_M)
    );
    const spCornerSE = LunarSouthPoleCRS.projection.unproject(
      L.point(SP_MAP_EXTENT_M, -SP_MAP_EXTENT_M)
    );

    const map = L.map(container, {
      crs: isSouthPole ? (LunarSouthPoleCRS as any) : L.CRS.EPSG4326,
      center: initialCenter,
      zoom: initialZoom,
      minZoom: mode === "picker" ? 1 : 3,
      maxZoom: isSouthPole ? 7 : 6,
      fadeAnimation: false,
      zoomAnimation: true,
      markerZoomAnimation: false,
      preferCanvas: true,
      maxBounds: isSouthPole
        ? L.latLngBounds(spCornerNW, spCornerSE)
        : [
            [-90, -180],
            [90, 180],
          ],
      maxBoundsViscosity: 1.0,
      zoomControl: false,
      attributionControl: false,
    });

    if (!isSouthPole) {
      L.tileLayer(MOON_TREK_EQ_WMTS, {
        tileSize: 256,
        noWrap: true,
        zIndex: 1,
        updateWhenZooming: false,
        updateWhenIdle: true,
        keepBuffer: 1,
        bounds: [
          [-90, -180],
          [90, 180],
        ],
        maxNativeZoom: 6,
      }).addTo(map);
    }

    graticuleGroupRef.current = L.layerGroup().addTo(map);
    labelGroupRef.current = L.layerGroup().addTo(map);
    roverGroupRef.current = L.layerGroup().addTo(map);
    layerGroupRef.current = L.layerGroup().addTo(map);

    if (isSouthPole && graticuleGroupRef.current) {
      [-85, -80, -70, -60].forEach((latRing) => {
        const ringPoints: [number, number][] = [];
        for (let lon = -180; lon <= 180; lon += 4) {
          ringPoints.push([latRing, lon]);
        }
        L.polyline(ringPoints, {
          color: "#a5b4fc",
          weight: 1,
          dashArray: "2, 6",
          opacity: 0.35,
          interactive: false,
        }).addTo(graticuleGroupRef.current!);
      });
    }

    const syncViewAndOverlay = () => {
      const c = map.getCenter();
      onCenterChangeRef.current?.({
        lat: Number(Math.max(-90, Math.min(90, c.lat)).toFixed(2)),
        lon: Number(Math.max(-180, Math.min(180, c.lng)).toFixed(2)),
      });
      drawSolarOverlay.current();
    };

    syncViewAndOverlay();
    map.on("move", () => drawSolarOverlay.current());
    map.on("zoom", () => drawSolarOverlay.current());
    map.on("moveend", syncViewAndOverlay);
    map.on("resize", () => drawSolarOverlay.current());

    map.on("click", (e: L.LeafletMouseEvent) => {
      const clampedLat = Number(
        Math.max(-90, Math.min(90, e.latlng.lat)).toFixed(2)
      );
      const clampedLon = Number(
        Math.max(-180, Math.min(180, e.latlng.lng)).toFixed(2)
      );

      if (mode === "picker") {
        onPickCoords({ lat: clampedLat, lon: clampedLon });
      } else if (mode === "full" && isPinDropModeRef.current) {
        onMapClickPinRef.current?.({ lat: clampedLat, lon: clampedLon });
      }
    });

    mapRef.current = map;
    const rafId = requestAnimationFrame(() => {
      mapRef.current?.invalidateSize({ animate: false });
      drawSolarOverlay.current();
    });

    return () => {
      cancelAnimationFrame(rafId);
      map.remove();
      mapRef.current = null;
      customGridLayerRef.current = null;
      graticuleGroupRef.current = null;
      labelGroupRef.current = null;
      roverGroupRef.current = null;
      layerGroupRef.current = null;
    };
  }, [mode, projectionMode]);

  // Mount Relief / Contours / Slope Hazard Layers & Project Landmark Labels
  useEffect(() => {
    if (mode === "thumbnail") return;
    const map = mapRef.current;
    if (!map) return;

    if (customGridLayerRef.current) {
      map.removeLayer(customGridLayerRef.current);
      customGridLayerRef.current = null;
    }

    const isSouthPole = mode === "full" && projectionMode === "SP";

    if (isSouthPole) {
      const gridLayer = createSouthPolarGridLayer(layerMode);
      gridLayer.addTo(map);
      customGridLayerRef.current = gridLayer;
    } else if (mode === "full" && layerMode !== "relief") {
      const eqTerrainLayer = createEquatorialTerrainGridLayer(layerMode);
      eqTerrainLayer.addTo(map);
      customGridLayerRef.current = eqTerrainLayer;
    }

    const renderLabels = () => {
      const currentMap = mapRef.current;
      const labelGroup = labelGroupRef.current;
      if (!currentMap || !labelGroup) return;

      labelGroup.clearLayers();
      if (mode !== "full") return;

      const currentZoom = currentMap.getZoom();
      const isDarkLabel = layerMode === "contours";

      LUNAR_LANDMARKS.filter((lm) => {
        const regionMatch = isSouthPole ? lm.lat < -55 : lm.lat >= -65;
        return regionMatch && currentZoom >= lm.minZoom;
      }).forEach((lm) => {
        const isMare = lm.type === "mare";
        const labelIcon = L.divIcon({
          className: "",
          html: `<div style="white-space:nowrap;font-family:monospace;font-size:${
            isMare ? "10px" : "11px"
          };font-weight:${isMare ? "700" : "600"};letter-spacing:${
            isMare ? "0.18em" : "0.06em"
          };color:${
            isDarkLabel
              ? "#0f1328"
              : isMare
              ? "rgba(199, 210, 254, 0.72)"
              : "#e0e7ff"
          };text-shadow:${
            isDarkLabel
              ? "-1px -1px 0 rgba(255,255,255,0.9),1px -1px 0 rgba(255,255,255,0.9),-1px 1px 0 rgba(255,255,255,0.9),1px 1px 0 rgba(255,255,255,0.9)"
              : "0 2px 6px rgba(9,11,22,0.95)"
          };pointer-events:none;transform:translate(-50%, 6px);">${lm.name.toUpperCase()}</div>`,
        });
        L.marker([lm.lat, lm.lon], {
          icon: labelIcon,
          interactive: false,
        }).addTo(labelGroup);
      });
    };

    renderLabels();
    drawSolarOverlay.current();
    map.on("zoomend", renderLabels);

    return () => {
      mapRef.current?.off("zoomend", renderLabels);
    };
  }, [mode, projectionMode, layerMode, showSolarShadows]);

  // Real-Time Moving Rovers & Live Solar Shadow Progression
  useEffect(() => {
    const roverGroup = roverGroupRef.current;
    if (!roverGroup || mode !== "full") return;

    roverGroup.clearLayers();
    const isSouthPole = projectionMode === "SP";

    const visibleRovers = LUNAR_ROVERS.filter((r) => {
      const lat = getRoverCoordinatesAtEpoch(r, simEpochRef.current).lat;
      return isSouthPole ? lat < -55 : lat >= -70;
    });

    const roversState = showRovers
      ? visibleRovers.map((rover) => {
          L.polyline(getRoverTraversePath(rover), {
            color: rover.color,
            weight: 1.5,
            dashArray: "4, 4",
            opacity: 0.85,
            interactive: false,
          }).addTo(roverGroup);

          const initPos = getRoverCoordinatesAtEpoch(
            rover,
            simEpochRef.current
          );
          const marker = L.marker([initPos.lat, initPos.lon], {
            icon: createRoverIcon(rover.color, rover.name.split(" ")[0]),
          })
            .bindTooltip(
              `<div style="font-family:monospace;font-size:10px;"><strong>${rover.name}</strong> (${rover.agency})<br/>Site: ${rover.siteName}</div>`,
              { direction: "top", offset: [0, -10] }
            )
            .addTo(roverGroup);

          return { rover, marker, lastLat: initPos.lat, lastLon: initPos.lon };
        })
      : [];

    let lastTime = performance.now();
    const interval = setInterval(() => {
      const now = performance.now();
      const dtMs = now - lastTime;
      lastTime = now;

      const scale = timeScaleRef.current;
      if (scale > 0) {
        simEpochRef.current += dtMs * scale;
        onEpochUpdateRef.current?.(simEpochRef.current);
        drawSolarOverlay.current();
      }

      if (roversState.length > 0) {
        for (let i = 0; i < roversState.length; i++) {
          const item = roversState[i];
          const pos = getRoverCoordinatesAtEpoch(
            item.rover,
            simEpochRef.current
          );
          if (pos.lat !== item.lastLat || pos.lon !== item.lastLon) {
            item.lastLat = pos.lat;
            item.lastLon = pos.lon;
            item.marker.setLatLng([pos.lat, pos.lon]);
          }
        }
      }
    }, 120);

    return () => {
      clearInterval(interval);
      roverGroup.clearLayers();
    };
  }, [showRovers, mode, projectionMode]);

  // Render Landing Site Space Symbols & Smooth Map FlyTo
  useEffect(() => {
    if (mode === "thumbnail") return;
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();
    const isSouthPole = mode === "full" && projectionMode === "SP";
    const isContours = layerMode === "contours" && mode === "full";

    sites
      .filter((site) =>
        isSouthPole
          ? site.lat < -55
          : site.lat >= -70 || site.id.startsWith("pinned-")
      )
      .forEach((site) => {
        const isSelected = selectedSite?.id === site.id;
        const isPinned =
          pinnedSiteIds.includes(site.id) || site.id.startsWith("pinned-");
        const marker = L.marker([site.lat, site.lon], {
          icon: createSpaceMarkerIcon(
            isSelected,
            isContours,
            isPinned,
            markerShape
          ),
        });
        if (mode === "full") {
          marker.bindTooltip(
            `<span style="font-family:monospace;font-size:10px;letter-spacing:0.04em;">${
              isPinned ? "✦ " : ""
            }${site.name.toUpperCase()}</span>`,
            { direction: "top" }
          );
          marker.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            onSelectSite(site);
          });
        }
        marker.addTo(layerGroup);
      });

    if (mode === "picker" && pickedCoords) {
      L.marker([pickedCoords.lat, pickedCoords.lon], {
        icon: createSpaceMarkerIcon(true, false, true, markerShape),
      }).addTo(layerGroup);
    }

    drawSolarOverlay.current();
  }, [
    sites,
    selectedSite,
    pickedCoords,
    mode,
    projectionMode,
    layerMode,
    markerShape,
    pinnedSiteIds,
  ]);

  useEffect(() => {
    if (!mapRef.current || mode !== "full") return;
    const isSouthPole = projectionMode === "SP";

    if (selectedSite?.id.startsWith("pinned-")) {
      return;
    }

    if (selectedSite) {
      if (isSouthPole && selectedSite.lat < -55) {
        mapRef.current.flyTo([selectedSite.lat, selectedSite.lon], 5, {
          duration: 0.65,
        });
      } else if (!isSouthPole && selectedSite.lat >= -70) {
        mapRef.current.flyTo([selectedSite.lat, selectedSite.lon], 5, {
          duration: 0.65,
        });
      } else if (!isSouthPole) {
        mapRef.current.flyTo([0, 0], 3, { duration: 0.65 });
      }
    } else {
      mapRef.current.flyTo(
        isSouthPole ? [-86.5, 0] : [0, 0],
        isSouthPole ? 4 : 3,
        { duration: 0.65 }
      );
    }
  }, [selectedSite, mode, projectionMode]);

  if (mode === "thumbnail") {
    return (
      <div className="relative h-full w-full overflow-hidden bg-[#090b16]">
        {thumbDataUrl ? (
          <img
            src={thumbDataUrl}
            alt="Lunar terrain preview"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-[10px] tracking-widest text-indigo-300/60">
            MAPPING...
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-[#090b16]">
      <style jsx global>{`
        @keyframes lunavSpacePulse {
          0% {
            transform: scale(0.8);
            opacity: 0.95;
          }
          100% {
            transform: scale(2.2);
            opacity: 0;
          }
        }
        @keyframes lunavAmbientBreathe {
          0%,
          100% {
            transform: scale(0.92);
            opacity: 0.85;
          }
          50% {
            transform: scale(1.12);
            opacity: 1;
          }
        }
        .leaflet-container {
          background: #090b16 !important;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
            monospace;
        }
        .leaflet-tile-pane {
          z-index: 200 !important;
        }
        .leaflet-overlay-pane {
          z-index: 400 !important;
        }
        .leaflet-marker-pane {
          z-index: 600 !important;
          mix-blend-mode: normal;
        }
        .leaflet-tooltip-pane {
          z-index: 650 !important;
        }
        .leaflet-tooltip {
          background: rgba(15, 19, 40, 0.92) !important;
          border: 1px solid rgba(165, 180, 252, 0.35) !important;
          border-radius: 9999px !important;
          padding: 3px 10px !important;
          color: #e0e7ff !important;
          box-shadow: 0 6px 18px rgba(9, 11, 22, 0.75) !important;
          backdrop-filter: blur(8px);
        }
        .leaflet-tooltip-top:before {
          border-top-color: rgba(165, 180, 252, 0.35) !important;
        }
      `}</style>
      <div
          ref={containerRef}
          className="relative h-full w-full bg-[#090b16]"
      />
      {mode === "full" && (
        <canvas
          ref={shadowCanvasRef}
          style={{ zIndex: 450 }}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
      )}
    </div>
  );
}

const MoonMap2D = memo(MoonMap2DComponent);
export default MoonMap2D;