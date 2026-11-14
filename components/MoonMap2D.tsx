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
  { name: "OCEANUS PROCELLARUM", lat: 18.4, lon: -57.4, type: "mare", minZoom: 2 },
  { name: "MARE TRANQUILLITATIS", lat: 8.5, lon: 31.4, type: "mare", minZoom: 2 },
  { name: "MARE IMBRIUM", lat: 32.8, lon: -15.6, type: "mare", minZoom: 2 },
  { name: "MARE SERENITATIS", lat: 28.0, lon: 17.5, type: "mare", minZoom: 2 },
  { name: "Tycho Crater", lat: -43.3, lon: -11.2, type: "crater", minZoom: 3 },
  { name: "Copernicus Crater", lat: 9.6, lon: -20.1, type: "crater", minZoom: 3 },
  { name: "Aristarchus Plateau", lat: 23.7, lon: -47.4, type: "crater", minZoom: 3 },
  { name: "Clavius Basin", lat: -58.4, lon: -14.4, type: "crater", minZoom: 3 },
  { name: "Schrödinger Basin", lat: -75.0, lon: 132.4, type: "crater", minZoom: 3 },
  { name: "Shackleton Rim", lat: -89.54, lon: 0.0, type: "crater", minZoom: 4 },
  { name: "Malapert Massif", lat: -86.0, lon: 12.9, type: "crater", minZoom: 4 },
  { name: "Nobile Crater", lat: -85.2, lon: 53.5, type: "crater", minZoom: 4 },
  { name: "Cabeus Crater", lat: -84.9, lon: -35.5, type: "crater", minZoom: 5 },
  { name: "Amundsen Crater", lat: -84.5, lon: 82.8, type: "crater", minZoom: 5 },
  { name: "Shoemaker Crater", lat: -88.0, lon: 45.0, type: "crater", minZoom: 6 },
  { name: "Faustini Crater", lat: -87.2, lon: 82.0, type: "crater", minZoom: 6 },
];

const createPinIcon = (isSelected: boolean, isContours: boolean) => {
  const fill = isSelected ? "#0284c7" : isContours ? "#dc2626" : "#facc15";
  const border = isContours ? "#ffffff" : "#0f172a";
  const size = isSelected ? 18 : 14;
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;background:${fill};border:2.5px solid ${border};border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.55);"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

const createRoverIcon = (color: string, label: string) =>
  L.divIcon({
    className: "",
    html: `<div style="position:relative;display:flex;align-items:center;justify-content:center;">
      <div style="width:11px;height:11px;background:${color};border:2px solid #090d16;border-radius:3px;box-shadow:0 0 8px ${color};"></div>
      <span style="position:absolute;top:-17px;white-space:nowrap;background:rgba(2,6,23,0.9);color:${color};border:1px solid ${color};font-size:9px;font-weight:700;padding:1px 4px;border-radius:4px;">${label}</span>
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
  timeScale?: number;
  activeTimestampMs?: number;
  clockResetNonce?: number;
  onSelectSite?: (site: LandingSite) => void;
  onPickCoords?: (coords: { lat: number; lon: number }) => void;
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
  timeScale = 1,
  activeTimestampMs = Date.UTC(2026, 10, 14, 12, 0, 0),
  clockResetNonce = 0,
  onSelectSite = () => {},
  onPickCoords = () => {},
  onEpochUpdate,
}: MoonMap2DProps) {
  const [thumbDataUrl, setThumbDataUrl] = useState<string | null>(null);
  const [projectionMode, setProjectionMode] = useState<"EQ" | "SP">("EQ");
  const [layerMode, setLayerMode] = useState<TerrainLayerMode>("relief");

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const customGridLayerRef = useRef<L.GridLayer | null>(null);
  const graticuleGroupRef = useRef<L.LayerGroup | null>(null);
  const labelGroupRef = useRef<L.LayerGroup | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const roverGroupRef = useRef<L.LayerGroup | null>(null);

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
    if (mode !== "full") return;
    if (selectedSite && selectedSite.lat < -65) {
      setProjectionMode("SP");
    } else if (selectedSite && selectedSite.lat >= -65) {
      setProjectionMode("EQ");
    }
  }, [selectedSite, mode]);

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

  useEffect(() => {
    if (mode === "thumbnail") return;
    const container = containerRef.current;
    if (!container) return;

    const isSouthPole = mode === "full" && projectionMode === "SP";

    const initialCenter: [number, number] = isSouthPole
      ? selectedSite && selectedSite.lat < -55
        ? [selectedSite.lat, selectedSite.lon]
        : [-86.5, 0]
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
      zoomControl: true,
      attributionControl: false,
    });

    if (!isSouthPole) {
      L.tileLayer(MOON_TREK_EQ_WMTS, {
        tileSize: 256,
        noWrap: true,
        zIndex: 200,
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
          color: "#38bdf8",
          weight: 1,
          dashArray: "3, 5",
          opacity: 0.25,
          interactive: false,
        }).addTo(graticuleGroupRef.current!);
      });
    }

    if (mode === "picker") {
      map.on("click", (e: L.LeafletMouseEvent) => {
        onPickCoords({
          lat: Number(e.latlng.lat.toFixed(4)),
          lon: Number(e.latlng.lng.toFixed(4)),
        });
      });
    }

    mapRef.current = map;
    const rafId = requestAnimationFrame(() => {
      mapRef.current?.invalidateSize({ animate: false });
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
      if (mode !== "full" || (layerMode === "relief" && !isSouthPole)) return;

      const currentZoom = currentMap.getZoom();
      const isDarkLabel = layerMode === "contours";

      LUNAR_LANDMARKS.filter((lm) => {
        const regionMatch = isSouthPole ? lm.lat < -55 : lm.lat >= -65;
        return regionMatch && currentZoom >= lm.minZoom;
      }).forEach((lm) => {
        const isMare = lm.type === "mare";
        const labelIcon = L.divIcon({
          className: "",
          html: `<div style="white-space:nowrap;font-family:ui-sans-serif,system-ui,sans-serif;font-size:${
            isMare ? "10px" : "10.5px"
          };font-weight:${isMare ? "700" : "600"};letter-spacing:${
            isMare ? "0.14em" : "0.03em"
          };color:${
            isDarkLabel ? "#292524" : "#e0f2fe"
          };text-shadow:${
            isDarkLabel
              ? "-1px -1px 0 rgba(255,255,255,0.85),1px -1px 0 rgba(255,255,255,0.85),-1px 1px 0 rgba(255,255,255,0.85),1px 1px 0 rgba(255,255,255,0.85)"
              : "0 1px 4px rgba(0,0,0,0.95)"
          };pointer-events:none;transform:translate(-50%, 10px);">${lm.name}</div>`,
        });
        L.marker([lm.lat, lm.lon], {
          icon: labelIcon,
          interactive: false,
        }).addTo(labelGroup);
      });
    };

    renderLabels();
    map.on("zoomend", renderLabels);

    return () => {
      mapRef.current?.off("zoomend", renderLabels);
    };
  }, [mode, projectionMode, layerMode]);

  useEffect(() => {
    const roverGroup = roverGroupRef.current;
    if (!roverGroup || mode !== "full") return;

    roverGroup.clearLayers();
    const isSouthPole = projectionMode === "SP";

    const visibleRovers = LUNAR_ROVERS.filter((r) =>
      isSouthPole
        ? getRoverCoordinatesAtEpoch(r, simEpochRef.current).lat < -55
        : true
    );

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
              `<strong>${rover.name}</strong> (${rover.agency})<br/>Site: ${rover.siteName}`,
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
    }, 300);

    return () => {
      clearInterval(interval);
      roverGroup.clearLayers();
    };
  }, [showRovers, mode, projectionMode]);

  useEffect(() => {
    if (mode === "thumbnail") return;
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();
    const isSouthPole = mode === "full" && projectionMode === "SP";
    const isContours = layerMode === "contours" && mode === "full";

    sites
      .filter((site) => (isSouthPole ? site.lat < -55 : true))
      .forEach((site) => {
        const isSelected = selectedSite?.id === site.id;
        const marker = L.marker([site.lat, site.lon], {
          icon: createPinIcon(isSelected, isContours),
        });
        if (mode === "full") {
          marker.bindTooltip(site.name, { direction: "top" });
          marker.on("click", () => onSelectSite(site));
        }
        marker.addTo(layerGroup);
      });

    if (mode === "picker" && pickedCoords) {
      L.marker([pickedCoords.lat, pickedCoords.lon], {
        icon: createPinIcon(false, false),
      }).addTo(layerGroup);
    }
  }, [sites, selectedSite, pickedCoords, mode, projectionMode, layerMode]);

  useEffect(() => {
    if (!mapRef.current || mode !== "full") return;
    const isSouthPole = projectionMode === "SP";

    if (selectedSite) {
      if (isSouthPole && selectedSite.lat < -55) {
        mapRef.current.flyTo([selectedSite.lat, selectedSite.lon], 5, {
          duration: 0.65,
        });
      } else if (!isSouthPole) {
        mapRef.current.flyTo([selectedSite.lat, selectedSite.lon], 4, {
          duration: 0.65,
        });
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
      <div className="relative h-full w-full overflow-hidden bg-slate-900">
        {thumbDataUrl ? (
          <img
            src={thumbDataUrl}
            alt="Lunar terrain preview"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] tracking-wider text-slate-500">
            MAPPING...
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-slate-950">
      <style jsx global>{`
        .leaflet-container {
          background: #020617 !important;
          font-family: ui-sans-serif, system-ui, sans-serif;
        }
      `}</style>

      <div
        ref={containerRef}
        className={`h-full w-full bg-slate-950 ${
          mode === "picker" ? "cursor-crosshair" : ""
        }`}
      />

      {mode === "full" && (
        <div className="absolute bottom-5 left-1/2 z-[500] flex -translate-x-1/2 items-center gap-1 rounded-xl border border-slate-700/90 bg-slate-950/92 p-1 text-[11px] shadow-2xl">
          <button
            type="button"
            onClick={() => setProjectionMode("EQ")}
            className={`rounded-lg px-3 py-1 font-semibold transition ${
              projectionMode === "EQ"
                ? "bg-sky-500 text-slate-950"
                : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            Global Equatorial (EQ)
          </button>
          <button
            type="button"
            onClick={() => setProjectionMode("SP")}
            className={`rounded-lg px-3 py-1 font-semibold transition ${
              projectionMode === "SP"
                ? "bg-sky-500 text-slate-950"
                : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            South Polar Stereographic (SP)
          </button>

          <span className="mx-1 text-slate-700">|</span>

          {[
            { id: "relief", label: "LROC Relief" },
            { id: "contours", label: "Contours" },
            { id: "slope", label: "Slope Hazard" },
          ].map((layerOpt) => (
            <button
              key={layerOpt.id}
              type="button"
              onClick={() =>
                setLayerMode(layerOpt.id as TerrainLayerMode)
              }
              className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                layerMode === layerOpt.id
                  ? "bg-amber-400 text-slate-950"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              {layerOpt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const MoonMap2D = memo(MoonMap2DComponent);
export default MoonMap2D;