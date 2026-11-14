"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { LandingSite } from "@/data/mockSites";
import {
  LUNAR_ROVERS,
  getRoverCoordinatesAtEpoch,
  getRoverTraversePath,
} from "@/data/rovers";
import { generateGoogleTerrainBlobUrl } from "@/utils/lunarContours";
import { renderLocalLunarPatchDataUrl } from "@/utils/lunarTextures";

const MOON_TREK_VISUAL =
  "https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{y}/{x}.jpg";

const LUNAR_LANDMARKS = [
  { name: "OCEANUS PROCELLARUM", lat: 18.4, lon: -57.4, type: "mare" },
  { name: "MARE TRANQUILLITATIS", lat: 8.5, lon: 31.4, type: "mare" },
  { name: "MARE IMBRIUM", lat: 32.8, lon: -15.6, type: "mare" },
  { name: "MARE SERENITATIS", lat: 28.0, lon: 17.5, type: "mare" },
  { name: "Tycho Crater", lat: -43.3, lon: -11.2, type: "crater" },
  { name: "Copernicus Crater", lat: 9.6, lon: -20.1, type: "crater" },
  { name: "Aristarchus Plateau", lat: 23.7, lon: -47.4, type: "crater" },
  { name: "Shackleton Rim", lat: -88.5, lon: 0.0, type: "crater" },
];

const createPinIcon = (isSelected: boolean, isTerrain: boolean) => {
  const fill = isSelected ? "#0284c7" : isTerrain ? "#dc2626" : "#facc15";
  const border = isTerrain ? "#ffffff" : "#0f172a";
  const size = isSelected ? 18 : 14;
  return L.divIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;background:${fill};border:2.5px solid ${border};border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.45);"></div>`,
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

export interface MoonMap2DProps {
  mode?: "full" | "picker" | "thumbnail";
  sites?: LandingSite[];
  selectedSite?: LandingSite | null;
  pickedCoords?: { lat: number; lon: number } | null;
  center?: [number, number];
  zoom?: number;
  showContours?: boolean;
  showRovers?: boolean;
  timeScale?: number;
  activeTimestampMs?: number;
  clockResetNonce?: number;
  onSelectSite?: (site: LandingSite) => void;
  onPickCoords?: (coords: { lat: number; lon: number }) => void;
  onEpochUpdate?: (epochMs: number) => void;
}

export default function MoonMap2D({
  mode = "full",
  sites = [],
  selectedSite = null,
  pickedCoords = null,
  center = [0, 0],
  zoom = 2,
  showContours = false,
  showRovers = true,
  timeScale = 1,
  activeTimestampMs = Date.UTC(2026, 10, 14, 12, 0, 0),
  clockResetNonce = 0,
  onSelectSite = () => {},
  onPickCoords = () => {},
  onEpochUpdate,
}: MoonMap2DProps) {
  const [thumbDataUrl, setThumbDataUrl] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const terrainOverlayRef = useRef<L.ImageOverlay | null>(null);
  const labelGroupRef = useRef<L.LayerGroup | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const roverGroupRef = useRef<L.LayerGroup | null>(null);

  const timeScaleRef = useRef<number>(timeScale);
  const baseEpochRef = useRef<number>(activeTimestampMs);
  const simEpochRef = useRef<number>(activeTimestampMs);
  const onEpochUpdateRef = useRef(onEpochUpdate);

  useEffect(() => {
    timeScaleRef.current = timeScale;
  }, [timeScale]);

  useEffect(() => {
    onEpochUpdateRef.current = onEpochUpdate;
  }, [onEpochUpdate]);

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
      terrainMode: showContours,
      showReticle: true,
    }).then((url) => {
      if (active) setThumbDataUrl(url);
    });

    return () => {
      active = false;
    };
  }, [mode, thumbLat, thumbLon, showContours]);

  useEffect(() => {
    if (mode === "thumbnail") return;
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = L.map(container, {
      crs: L.CRS.EPSG4326,
      center,
      zoom,
      minZoom: 1,
      maxZoom: 6,
      fadeAnimation: false,
      zoomAnimation: true,
      markerZoomAnimation: false,
      preferCanvas: true,
      maxBounds: [
        [-90, -180],
        [90, 180],
      ],
      maxBoundsViscosity: 1.0,
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer(MOON_TREK_VISUAL, {
      tileSize: 256,
      noWrap: true,
      zIndex: 200,
      updateWhenIdle: true,
      keepBuffer: 2,
      bounds: [
        [-90, -180],
        [90, 180],
      ],
      maxNativeZoom: 6,
    }).addTo(map);

    labelGroupRef.current = L.layerGroup().addTo(map);
    roverGroupRef.current = L.layerGroup().addTo(map);
    layerGroupRef.current = L.layerGroup().addTo(map);

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
      terrainOverlayRef.current = null;
    };
  }, [mode]);

  useEffect(() => {
    if (mode === "thumbnail") return;
    let active = true;

    async function updateTerrainOverlay() {
      const map = mapRef.current;
      const labelGroup = labelGroupRef.current;
      if (!map || !labelGroup) return;

      if (terrainOverlayRef.current) {
        map.removeLayer(terrainOverlayRef.current);
        terrainOverlayRef.current = null;
      }
      labelGroup.clearLayers();

      if (showContours && mode === "full") {
        const blobUrl = await generateGoogleTerrainBlobUrl();
        if (!active || !mapRef.current || !labelGroupRef.current) return;

        terrainOverlayRef.current = L.imageOverlay(
          blobUrl,
          [
            [-90, -180],
            [90, 180],
          ],
          { opacity: 1, zIndex: 250, interactive: false }
        ).addTo(mapRef.current);

        LUNAR_LANDMARKS.forEach((lm) => {
          const isMare = lm.type === "mare";
          const labelIcon = L.divIcon({
            className: "",
            html: `<div style="white-space:nowrap;font-family:ui-sans-serif,system-ui,sans-serif;font-size:${
              isMare ? "10px" : "11px"
            };font-weight:${isMare ? "700" : "600"};letter-spacing:${
              isMare ? "0.14em" : "0.02em"
            };color:${
              isMare ? "#57534e" : "#292524"
            };text-shadow:-1px -1px 0 rgba(255,255,255,0.85),1px -1px 0 rgba(255,255,255,0.85),-1px 1px 0 rgba(255,255,255,0.85),1px 1px 0 rgba(255,255,255,0.85);pointer-events:none;transform:translate(-50%,-50%);">${lm.name}</div>`,
          });
          L.marker([lm.lat, lm.lon], {
            icon: labelIcon,
            interactive: false,
          }).addTo(labelGroupRef.current!);
        });
      }
    }

    updateTerrainOverlay();
    return () => {
      active = false;
    };
  }, [showContours, mode]);

  useEffect(() => {
    const roverGroup = roverGroupRef.current;
    if (!roverGroup || mode !== "full") return;

    roverGroup.clearLayers();

    const roversState = showRovers
      ? LUNAR_ROVERS.map((rover) => {
          L.polyline(getRoverTraversePath(rover), {
            color: rover.color,
            weight: 1.5,
            dashArray: "4, 4",
            opacity: 0.65,
            interactive: false,
          }).addTo(roverGroup);

          const elapsed = (simEpochRef.current - baseEpochRef.current) / 1000;
          const initPos = getRoverCoordinatesAtEpoch(rover, elapsed);
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
        const elapsedSec = (simEpochRef.current - baseEpochRef.current) / 1000;
        for (let i = 0; i < roversState.length; i++) {
          const item = roversState[i];
          const pos = getRoverCoordinatesAtEpoch(item.rover, elapsedSec);
          if (pos.lat !== item.lastLat || pos.lon !== item.lastLon) {
            item.lastLat = pos.lat;
            item.lastLon = pos.lon;
            item.marker.setLatLng([pos.lat, pos.lon]);
          }
        }
      }
    }, 250);

    return () => {
      clearInterval(interval);
      roverGroup.clearLayers();
    };
  }, [showRovers, mode]);

  useEffect(() => {
    if (mode === "thumbnail") return;
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();
    const isTerrain = showContours && mode === "full";

    sites.forEach((site) => {
      const isSelected = selectedSite?.id === site.id;
      const marker = L.marker([site.lat, site.lon], {
        icon: createPinIcon(isSelected, isTerrain),
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
  }, [sites, selectedSite, pickedCoords, mode, showContours]);

  useEffect(() => {
    if (!mapRef.current || mode !== "full") return;
    if (selectedSite) {
      const targetZoom = Math.abs(selectedSite.lat) > 70 ? 3 : 4;
      mapRef.current.flyTo([selectedSite.lat, selectedSite.lon], targetZoom, {
        duration: 0.75,
      });
    } else {
      mapRef.current.flyTo([0, 0], 2, { duration: 0.75 });
    }
  }, [selectedSite, mode]);

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
    <div
      ref={containerRef}
      className={`h-full w-full bg-slate-950 ${
        mode === "picker" ? "cursor-crosshair" : ""
      }`}
    />
  );
}