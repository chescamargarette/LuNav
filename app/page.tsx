"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { GoogleGenAI } from "@google/genai";
import {
  Menu,
  Bot,
  MapPin,
  Calendar,
  Layers,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Sun,
  Radio,
  Crosshair,
  Orbit,
  Pause,
  Play,
  FastForward,
  RotateCcw,
  Target,
  Compass,
  Globe,
  Map as MapIcon,
  ArrowLeftRight,
  Check,
  X,
  Rocket,
  Sparkles,
  Eclipse,
} from "lucide-react";
import {
  evaluateSitesForSchedule,
  evaluateCustomCoordinate,
  WhenPreset,
  getLunarCelestialAngles,
} from "@/utils/lunarEphemeris";
import { TerrainLayerMode } from "@/utils/lunarTextures";
import { LandingSite } from "@/data/mockSites";
import type { SpaceMarkerShape } from "@/components/MoonMap2D";

function computeLiveSiteSolarEarth(
  site: LandingSite,
  baseEpochMs: number,
  currentEpochMs: number
) {
  const { synodicPhase } = getLunarCelestialAngles(currentEpochMs);
  const deltaDays = (currentEpochMs - baseEpochMs) / 86400000;
  const deltaSunAngleRad = (deltaDays / 29.530588853) * Math.PI * 2;

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
    sunAzimuth,
    sunElevation,
    earthAzimuth,
    earthElevation,
  };
}

const INITIAL_EPOCH_MS = Date.UTC(2026, 10, 14, 12, 0, 0);

const EPOCH_OPTIONS: { value: WhenPreset; label: string }[] = [
  { value: "suggested", label: "AUTO-OPTIMAL" },
  { value: "3d", label: "T+ 3 DAYS" },
  { value: "1w", label: "T+ 1 WEEK" },
  { value: "1m", label: "T+ 1 MONTH" },
  { value: "custom", label: "MANUAL ENTRY" },
];

const MARKER_SHAPES: { id: SpaceMarkerShape; label: string }[] = [
  { id: "reticle", label: "RETICLE" },
  { id: "lander", label: "LANDER" },
  { id: "diamond", label: "DIAMOND" },
];

function formatUtcTimestamp(ms: number): string {
  const iso = new Date(ms).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}

const MoonGlobe = dynamic(() => import("@/components/MoonGlobe"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center font-mono text-xs tracking-widest text-indigo-300">
      INITIALIZING TELEMETRY...
    </div>
  ),
});

const MoonMap2D = dynamic(() => import("@/components/MoonMap2D"), {
  ssr: false,
});

function LiveUtcText({
  initialMs,
  subscribe,
}: {
  initialMs: number;
  subscribe: (cb: (ms: number) => void) => () => void;
}) {
  const [text, setText] = useState(() => formatUtcTimestamp(initialMs));
  useEffect(() => {
    setText(formatUtcTimestamp(initialMs));
    return subscribe((ms) => setText(formatUtcTimestamp(ms)));
  }, [initialMs, subscribe]);
  return <>{text}</>;
}

/**
 * Interactive Cross-Section Side View of Earth, Sunlight & Cast Surface Shadows
 * for the selected landing site. Updates live as the simulation epoch advances.
 */
function SurfaceHorizonSideView({
  site,
  baseEpochMs,
  subscribe,
}: {
  site: LandingSite;
  baseEpochMs: number;
  subscribe: (cb: (ms: number) => void) => () => void;
}) {
  const [liveEpochMs, setLiveEpochMs] = useState<number>(baseEpochMs);

  useEffect(() => {
    setLiveEpochMs(baseEpochMs);
    return subscribe((ms) => setLiveEpochMs(ms));
  }, [baseEpochMs, subscribe]);

  const live = computeLiveSiteSolarEarth(site, baseEpochMs, liveEpochMs);

  const cx = 128;
  const cy = 86;
  const skyRadius = 66;

  const sunHorizontalSign =
    Math.sin((live.sunAzimuth * Math.PI) / 180) >= 0 ? 1 : -1;
  const clampedSunEl = Math.max(-22, Math.min(88, live.sunElevation));
  const sunDomeAngle =
    Math.PI / 2 - sunHorizontalSign * ((90 - clampedSunEl) * (Math.PI / 180));
  const sunX = cx + Math.cos(sunDomeAngle) * skyRadius;
  const sunY = cy - Math.sin(sunDomeAngle) * skyRadius;

  const earthHorizontalSign =
    Math.sin((live.earthAzimuth * Math.PI) / 180) >= 0 ? 1 : -1;
  const clampedEarthEl = Math.max(-22, Math.min(88, live.earthElevation));
  const earthDomeAngle =
    Math.PI / 2 -
    earthHorizontalSign * ((90 - clampedEarthEl) * (Math.PI / 180));
  const earthX = cx + Math.cos(earthDomeAngle) * (skyRadius - 10);
  const earthY = cy - Math.sin(earthDomeAngle) * (skyRadius - 10);

  const isSunAbove = live.sunElevation > 0;
  const isEarthAbove = live.earthElevation > 0;

  const slopeRise =
    Math.tan((Math.min(25, site.slope_deg) * Math.PI) / 180) * 120;

  const shadowDir = sunX <= cx ? 1 : -1;
  const shadowLength = isSunAbove
    ? Math.max(16, Math.min(96, 102 - live.sunElevation * 1.15))
    : 112;
  const shadowTipX = Math.max(8, Math.min(248, cx + shadowDir * shadowLength));
  const shadowTipY = cy + ((shadowTipX - cx) / 120) * slopeRise;

  return (
    <div className="mt-3.5 rounded-2xl border border-indigo-300/20 bg-[#080a16]/90 p-2.5">
      <div className="mb-1.5 flex items-center justify-between font-mono text-[9px] tracking-widest">
        <span className="font-bold text-indigo-200/85">HORIZON SIDE VIEW</span>
        <span className="text-slate-400">SLOPE {site.slope_deg}°</span>
      </div>

      <svg
        viewBox="0 0 256 122"
        className="h-28 w-full overflow-hidden rounded-xl border border-white/5 bg-[#050711]"
      >
        <defs>
          <radialGradient id="lunavSunHalo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fef08a" stopOpacity="0.95" />
            <stop offset="45%" stopColor="#fde047" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#fde047" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="lunavSunBeam" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#fef08a" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#fef08a" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="lunavRegolith" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#262b47" />
            <stop offset="100%" stopColor="#0f1328" />
          </linearGradient>
        </defs>

        <path
          d={`M ${cx - skyRadius} ${cy} A ${skyRadius} ${skyRadius} 0 0 1 ${
            cx + skyRadius
          } ${cy}`}
          fill="none"
          stroke="rgba(165, 180, 252, 0.16)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />

        <line
          x1={cx}
          y1={cy - skyRadius - 3}
          x2={cx}
          y2={cy - skyRadius + 3}
          stroke="rgba(165, 180, 252, 0.35)"
          strokeWidth="1"
        />

        {isSunAbove && (
          <polygon
            points={`${sunX},${sunY} ${cx - 18},${cy} ${cx + 18},${cy}`}
            fill="url(#lunavSunBeam)"
          />
        )}

        <line
          x1={cx}
          y1={cy - 6}
          x2={earthX}
          y2={earthY}
          stroke={
            isEarthAbove
              ? "rgba(110, 231, 183, 0.65)"
              : "rgba(251, 113, 133, 0.35)"
          }
          strokeWidth="1.2"
          strokeDasharray={isEarthAbove ? "3 2" : "2 4"}
        />

        <polygon
          points={`0,${cy - slopeRise} 256,${cy + slopeRise} 256,122 0,122`}
          fill="url(#lunavRegolith)"
        />
        <line
          x1="0"
          y1={cy - slopeRise}
          x2="256"
          y2={cy + slopeRise}
          stroke="rgba(165, 180, 252, 0.45)"
          strokeWidth="1.2"
        />

        <line
          x1={cx}
          y1={cy}
          x2={shadowTipX}
          y2={shadowTipY}
          stroke="rgba(3, 5, 12, 0.92)"
          strokeWidth="4.5"
          strokeLinecap="round"
        />

        <g transform={`translate(${cx}, ${cy})`}>
          <line
            x1="-5"
            y1="0"
            x2="-3"
            y2="-5"
            stroke="#c7d2fe"
            strokeWidth="1.2"
          />
          <line
            x1="5"
            y1="0"
            x2="3"
            y2="-5"
            stroke="#c7d2fe"
            strokeWidth="1.2"
          />
          <rect
            x="-4"
            y="-9"
            width="8"
            height="4.5"
            rx="1"
            fill="#a5b4fc"
          />
          <circle cx="0" cy="-11" r="1.4" fill="#ffffff" />
        </g>

        <g transform={`translate(${earthX}, ${earthY})`}>
          <circle
            r="6.5"
            fill={isEarthAbove ? "#60a5fa" : "#475569"}
            stroke="#090b16"
            strokeWidth="1.2"
          />
          <path
            d="M -2 -4 A 5 5 0 0 1 3 3 A 4 4 0 0 0 -2 -4 Z"
            fill={isEarthAbove ? "#bbf7d0" : "#64748b"}
          />
          <text
            y="-9"
            textAnchor="middle"
            fill={isEarthAbove ? "#a7f3d0" : "#fda4af"}
            fontSize="7.5"
            fontFamily="monospace"
            fontWeight="bold"
          >
            EARTH{" "}
            {live.earthElevation > 0
              ? `+${live.earthElevation}`
              : live.earthElevation}
            °
          </text>
        </g>

        <g transform={`translate(${sunX}, ${sunY})`}>
          {isSunAbove && <circle r="15" fill="url(#lunavSunHalo)" />}
          <circle
            r="5.5"
            fill={isSunAbove ? "#fef08a" : "#78716c"}
            stroke="#090b16"
            strokeWidth="1"
          />
          <text
            y="-9"
            textAnchor="middle"
            fill={isSunAbove ? "#fef08a" : "#94a3b8"}
            fontSize="7.5"
            fontFamily="monospace"
            fontWeight="bold"
          >
            SUN{" "}
            {live.sunElevation > 0
              ? `+${live.sunElevation}`
              : live.sunElevation}
            °
          </text>
        </g>
      </svg>

      <div className="mt-1.5 flex items-center justify-between font-mono text-[9px]">
        <span className={isSunAbove ? "text-amber-200" : "text-slate-400"}>
          ☀ {isSunAbove ? "ILLUMINATED" : "LUNAR NIGHT"} (
          {Math.round(live.sunAzimuth)}° AZ)
        </span>
        <span className={isEarthAbove ? "text-emerald-300" : "text-rose-300"}>
          ● {isEarthAbove ? "EARTH LOS" : "OCCULTED"}
        </span>
      </div>
    </div>
  );
}

export default function MissionControlPage() {
  // View & UI State
  const [is2DMode, setIs2DMode] = useState(true);
  const [projectionMode, setProjectionMode] = useState<"EQ" | "SP">("EQ");
  const [layerMode, setLayerMode] = useState<TerrainLayerMode>("relief");
  const [markerShape, setMarkerShape] = useState<SpaceMarkerShape>("reticle");

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isEpochMenuOpen, setIsEpochMenuOpen] = useState(false);
  const [isPinDropMode, setIsPinDropMode] = useState(false);
  const [showRovers, setShowRovers] = useState(true);
  const [showSolarShadows, setShowSolarShadows] = useState(true);
  const [showCelestial, setShowCelestial] = useState(true);

  // Time & Selection State
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [timeScale, setTimeScale] = useState<number>(1);
  const [clockResetNonce, setClockResetNonce] = useState<number>(0);

  const [referenceNowMs, setReferenceNowMs] = useState<number>(INITIAL_EPOCH_MS);
  const [whenPreset, setWhenPreset] = useState<WhenPreset>("suggested");
  const [customDate, setCustomDate] = useState<string>("2026-11-14");

  // Coordinate inputs, Map Center & Pinned Locations
  const [latInput, setLatInput] = useState<string>("");
  const [lonInput, setLonInput] = useState<string>("");
  const [mapCenterCoords, setMapCenterCoords] = useState<{
    lat: number;
    lon: number;
  }>({ lat: 0, lon: 0 });
  const [customPinnedCoords, setCustomPinnedCoords] = useState<
    { id: string; label: string; lat: number; lon: number }[]
  >([]);
  const [bookmarkedSiteIds, setBookmarkedSiteIds] = useState<string[]>([]);

  // AI State
  const [isRoverThinking, setIsRoverThinking] = useState(false);
  const [roverInput, setRoverInput] = useState("");
  const [roverReply, setRoverReply] = useState(
    "AWAITING INPUT. Enter power, comms, or slope constraints (e.g. 'flat slope and max power') to isolate optimal landing zone."
  );

  const epochDropdownRef = useRef<HTMLDivElement | null>(null);
  const epochListenersRef = useRef<Set<(ms: number) => void>>(new Set());

  const subscribeEpoch = useCallback((cb: (ms: number) => void) => {
    epochListenersRef.current.add(cb);
    return () => {
      epochListenersRef.current.delete(cb);
    };
  }, []);

  const handleEpochUpdate = useCallback((ms: number) => {
    epochListenersRef.current.forEach((cb) => cb(ms));
  }, []);

  useEffect(() => {
    const now = Date.now();
    setReferenceNowMs(now);
    handleEpochUpdate(now);
    setCustomDate(new Date(now).toISOString().split("T")[0]);
  }, [handleEpochUpdate]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        epochDropdownRef.current &&
        !epochDropdownRef.current.contains(e.target as Node)
      ) {
        setIsEpochMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Telemetry Engine
  const { sites, activeTimestampMs, windowSummary } = useMemo(() => {
    const result = evaluateSitesForSchedule(
      whenPreset,
      customDate,
      referenceNowMs
    );

    const evaluatedCustomPins = customPinnedCoords.map((pin) => {
      const evaluated = evaluateCustomCoordinate(
        pin.lat,
        pin.lon,
        whenPreset,
        customDate,
        referenceNowMs
      );
      return {
        ...evaluated,
        id: pin.id,
        name: pin.label,
      };
    });

    const combined = [...evaluatedCustomPins, ...result.sites];
    const sortedWithPinsFirst = combined.sort((a, b) => {
      const aPinned =
        a.id.startsWith("pinned-") || bookmarkedSiteIds.includes(a.id) ? 1 : 0;
      const bPinned =
        b.id.startsWith("pinned-") || bookmarkedSiteIds.includes(b.id) ? 1 : 0;
      return bPinned - aPinned;
    });

    return { ...result, sites: sortedWithPinsFirst };
  }, [
    whenPreset,
    customDate,
    customPinnedCoords,
    bookmarkedSiteIds,
    referenceNowMs,
  ]);

  const allPinnedIds = useMemo(
    () => [
      ...customPinnedCoords.map((p) => p.id),
      ...bookmarkedSiteIds,
    ],
    [customPinnedCoords, bookmarkedSiteIds]
  );

  const selectedSite = useMemo(
    () => sites.find((s) => s.id === selectedSiteId) ?? null,
    [sites, selectedSiteId]
  );

  useEffect(() => {
    if (selectedSite && is2DMode) {
      setProjectionMode(selectedSite.lat < -65 ? "SP" : "EQ");
    }
  }, [selectedSite, is2DMode]);

  const handleSelectSite = useCallback((site: { id: string }) => {
    setSelectedSiteId(site.id);
  }, []);

  const toggleViewMode = () => {
    setIs2DMode((prev) => {
      const next = !prev;
      setShowCelestial(!next);
      if (!next) setIsPinDropMode(false);
      return next;
    });
  };

  const cycleMarkerShape = () => {
    setMarkerShape((prev) => {
      const idx = MARKER_SHAPES.findIndex((s) => s.id === prev);
      return MARKER_SHAPES[(idx + 1) % MARKER_SHAPES.length].id;
    });
  };

  const addCustomPin = useCallback((lat: number, lon: number) => {
    const clampedLat = Number(Math.max(-90, Math.min(90, lat)).toFixed(2));
    const clampedLon = Number(Math.max(-180, Math.min(180, lon)).toFixed(2));
    const pinId = `pinned-${clampedLat}-${clampedLon}`;

    setLatInput(String(clampedLat));
    setLonInput(String(clampedLon));

    setCustomPinnedCoords((prev) => {
      const exists = prev.find((p) => p.id === pinId);
      if (exists) return prev;
      const index = prev.length + 1;
      return [
        {
          id: pinId,
          label: `BEACON ${String(index).padStart(2, "0")} (${clampedLat}°, ${clampedLon}°)`,
          lat: clampedLat,
          lon: clampedLon,
        },
        ...prev,
      ];
    });
    setSelectedSiteId(pinId);
  }, []);

  const handleMapClickPin = useCallback(
    (coords: { lat: number; lon: number }) => {
      addCustomPin(coords.lat, coords.lon);
      setIsPinDropMode(false);
    },
    [addCustomPin]
  );

  const togglePinSite = (siteId: string) => {
    if (siteId.startsWith("pinned-")) {
      setCustomPinnedCoords((prev) => prev.filter((p) => p.id !== siteId));
      if (selectedSiteId === siteId) setSelectedSiteId(null);
      return;
    }
    setBookmarkedSiteIds((prev) =>
      prev.includes(siteId)
        ? prev.filter((id) => id !== siteId)
        : [...prev, siteId]
    );
  };

  const stepCoordinate = (axis: "lat" | "lon", delta: number) => {
    if (axis === "lat") {
      const current = parseFloat(latInput);
      const base = Number.isFinite(current) ? current : mapCenterCoords.lat;
      const next = Math.max(-90, Math.min(90, Number((base + delta).toFixed(2))));
      setLatInput(String(next));
    } else {
      const current = parseFloat(lonInput);
      const base = Number.isFinite(current) ? current : mapCenterCoords.lon;
      const next = Math.max(-180, Math.min(180, Number((base + delta).toFixed(2))));
      setLonInput(String(next));
    }
  };

  const jumpToLunarPhase = (targetPhase: 0.5 | 0.0) => {
    const nowMs = Date.now();
    const { synodicPhase } = getLunarCelestialAngles(nowMs);
    let deltaPhase = targetPhase - synodicPhase;
    if (deltaPhase <= 0.02) deltaPhase += 1;
    const targetMs = nowMs + deltaPhase * 29.530588853 * 86400000;
    const isoDate = new Date(targetMs).toISOString().split("T")[0];
    setWhenPreset("custom");
    setCustomDate(isoDate);
  };

  const handlePinCoordinates = () => {
    const parsedLat = parseFloat(latInput);
    const parsedLon = parseFloat(lonInput);

    if (Number.isFinite(parsedLat) && Number.isFinite(parsedLon)) {
      addCustomPin(parsedLat, parsedLon);
    } else if (Number.isFinite(parsedLat) && !Number.isFinite(parsedLon)) {
      addCustomPin(parsedLat, mapCenterCoords.lon);
    } else if (!Number.isFinite(parsedLat) && Number.isFinite(parsedLon)) {
      addCustomPin(mapCenterCoords.lat, parsedLon);
    } else {
      addCustomPin(mapCenterCoords.lat, mapCenterCoords.lon);
    }
  };

  const handleRoverAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = roverInput.trim();
    if (!query || isRoverThinking) return;

    setRoverInput("");
    setIsRoverThinking(true);
    setRoverReply("PROCESSING TELEMETRY...");

    try {
      const res = await fetch("/api/rover-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, sites, windowSummary }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Advisor route failed: ${res.status}`);
      }

      const data = await res.json();

      const matched = sites.find((s) => s.id === data.selectedSiteId);
      if (matched) setSelectedSiteId(matched.id);
      setRoverReply(data.reasoning || "TARGET ACQUIRED.");
    } catch (err) {
      console.warn("AI Rover Advisor fallback:", err);
      const qLower = query.toLowerCase();
      const winner = [...sites].sort((a, b) => {
        if (qLower.includes("slope") || qLower.includes("flat")) {
          return a.slope_deg - b.slope_deg;
        }
        if (qLower.includes("comm") || qLower.includes("earth")) {
          return b.comms_window_hours - a.comms_window_hours;
        }
        return (
          b.sunlight_percent +
          b.comms_window_hours * 4 -
          b.slope_deg * 5 -
          (a.sunlight_percent + a.comms_window_hours * 4 - a.slope_deg * 5)
        );
      })[0];

      if (winner) {
        setSelectedSiteId(winner.id);
        setRoverReply(
          `FALLBACK MODE ENGAGED. Selected ${winner.name} (${winner.sunlight_percent}% Sun, ${winner.comms_window_hours}h/day LoS, ${winner.slope_deg}° slope).`
        );
      }
    } finally {
      setIsRoverThinking(false);
    }
  };

  const activeEpochLabel =
    EPOCH_OPTIONS.find((opt) => opt.value === whenPreset)?.label ??
    "AUTO-OPTIMAL";

  const activeShapeLabel =
    MARKER_SHAPES.find((s) => s.id === markerShape)?.label ?? "RETICLE";

  const bottomLeftOffsetClass = isSidebarOpen ? "left-[392px]" : "left-[72px]";

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#090b16] font-sans text-slate-100 selection:bg-indigo-300/30">
      <style jsx global>{`
        .lunav-scroll::-webkit-scrollbar {
          width: 4px;
        }
        .lunav-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .lunav-scroll::-webkit-scrollbar-thumb {
          background: rgba(165, 180, 252, 0.25);
          border-radius: 9999px;
        }
        .lunav-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(165, 180, 252, 0.45);
        }
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="date"]::-webkit-calendar-picker-indicator {
          filter: invert(0.8) sepia(0.3) saturate(2) hue-rotate(200deg);
          cursor: pointer;
        }
      `}</style>

      {/* 1. Base Map Layer */}
      <div className="absolute inset-0 z-0">
        {is2DMode ? (
          <MoonMap2D
            mode="full"
            sites={sites}
            selectedSite={selectedSite}
            showRovers={showRovers}
            showSolarShadows={showSolarShadows}
            timeScale={timeScale}
            activeTimestampMs={activeTimestampMs}
            clockResetNonce={clockResetNonce}
            projectionMode={projectionMode}
            layerMode={layerMode}
            markerShape={markerShape}
            isPinDropMode={isPinDropMode}
            pinnedSiteIds={allPinnedIds}
            onSelectSite={handleSelectSite}
            onMapClickPin={handleMapClickPin}
            onCenterChange={setMapCenterCoords}
            onEpochUpdate={handleEpochUpdate}
          />
        ) : (
          <MoonGlobe
            sites={sites}
            selectedSite={selectedSite}
            showCelestial={showCelestial}
            showRovers={showRovers}
            timeScale={timeScale}
            activeTimestampMs={activeTimestampMs}
            clockResetNonce={clockResetNonce}
            markerShape={markerShape}
            onSelectSite={handleSelectSite}
            onEpochUpdate={handleEpochUpdate}
          />
        )}
      </div>

      {/* Pin Drop Mode Banner */}
      {isPinDropMode && is2DMode && (
        <div className="fixed top-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-fuchsia-300/45 bg-[#130f29]/90 px-4 py-1.5 font-mono text-[10px] font-bold tracking-widest text-fuchsia-200 shadow-[0_8px_28px_rgba(192,132,252,0.32)] backdrop-blur-xl">
          <Crosshair className="h-3.5 w-3.5 text-fuchsia-300 drop-shadow-[0_0_8px_rgba(245,208,254,0.9)]" />
          <span>CLICK ANYWHERE ON MAP TO DEPLOY BEACON</span>
          <button
            type="button"
            onClick={() => setIsPinDropMode(false)}
            className="rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[9px] text-slate-200 hover:bg-white/20"
          >
            CANCEL
          </button>
        </div>
      )}

      {/* 2. Thin Left Navigation Rail */}
      <nav className="fixed top-0 bottom-0 left-0 z-50 flex w-14 flex-col items-center justify-between border-r border-indigo-300/15 bg-[#0c0f1f]/85 py-6 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className={`group flex h-10 w-10 items-center justify-center rounded-full border transition-all ${
            isSidebarOpen
              ? "border-indigo-300/60 bg-indigo-400/25 text-indigo-100 shadow-[0_0_20px_rgba(165,180,252,0.35)]"
              : "border-white/5 text-slate-400 hover:border-indigo-300/35 hover:bg-indigo-400/15 hover:text-indigo-200"
          }`}
          title="Toggle Mission Sidebar"
        >
          <Menu
            className={`h-4 w-4 transition-all ${
              isSidebarOpen
                ? "drop-shadow-[0_0_8px_rgba(199,210,254,0.95)]"
                : "group-hover:drop-shadow-[0_0_6px_rgba(165,180,252,0.75)]"
            }`}
          />
        </button>

        <div className="flex flex-col items-center gap-3.5">
          {is2DMode && (
            <button
              type="button"
              onClick={() => setShowSolarShadows((s) => !s)}
              className={`group flex h-10 w-10 items-center justify-center rounded-full border transition-all ${
                showSolarShadows
                  ? "border-amber-200/60 bg-amber-300/20 text-amber-100 shadow-[0_0_20px_rgba(253,230,138,0.32)]"
                  : "border-white/5 text-slate-400 hover:border-indigo-300/35 hover:bg-indigo-400/15 hover:text-indigo-200"
              }`}
              title="Toggle 2D Sunlight & Shadow Terminator"
            >
              <Eclipse
                className={`h-4 w-4 transition-all ${
                  showSolarShadows
                    ? "drop-shadow-[0_0_8px_rgba(254,240,138,0.95)]"
                    : "group-hover:drop-shadow-[0_0_6px_rgba(165,180,252,0.75)]"
                }`}
              />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (!is2DMode) {
                setIs2DMode(true);
                setShowCelestial(false);
              }
              setIsPinDropMode((p) => !p);
            }}
            className={`group flex h-10 w-10 items-center justify-center rounded-full border transition-all ${
              isPinDropMode
                ? "border-fuchsia-300/65 bg-fuchsia-400/25 text-fuchsia-100 shadow-[0_0_20px_rgba(240,171,252,0.38)]"
                : "border-white/5 text-slate-400 hover:border-indigo-300/35 hover:bg-indigo-400/15 hover:text-indigo-200"
            }`}
            title="Deploy Beacon on Map"
          >
            <Rocket
              className={`h-4 w-4 transition-all ${
                isPinDropMode
                  ? "drop-shadow-[0_0_8px_rgba(245,208,254,0.95)]"
                  : "group-hover:drop-shadow-[0_0_6px_rgba(165,180,252,0.75)]"
              }`}
            />
          </button>

          <button
            type="button"
            onClick={() => setShowRovers(!showRovers)}
            className={`group flex h-10 w-10 items-center justify-center rounded-full border transition-all ${
              showRovers
                ? "border-violet-300/60 bg-violet-400/25 text-violet-100 shadow-[0_0_20px_rgba(196,181,253,0.35)]"
                : "border-white/5 text-slate-400 hover:border-indigo-300/35 hover:bg-indigo-400/15 hover:text-slate-200"
            }`}
            title="Toggle Live Surface Rovers"
          >
            <Target
              className={`h-4 w-4 transition-all ${
                showRovers
                  ? "drop-shadow-[0_0_8px_rgba(221,214,254,0.95)]"
                  : "group-hover:drop-shadow-[0_0_6px_rgba(165,180,252,0.75)]"
              }`}
            />
          </button>

          <button
            type="button"
            onClick={() => setIsAiOpen(!isAiOpen)}
            className={`group flex h-10 w-10 items-center justify-center rounded-full border transition-all ${
              isAiOpen
                ? "border-indigo-300/60 bg-indigo-400/25 text-indigo-100 shadow-[0_0_20px_rgba(165,180,252,0.35)]"
                : "border-white/5 text-slate-400 hover:border-indigo-300/35 hover:bg-indigo-400/15 hover:text-indigo-200"
            }`}
            title="Toggle AI Mission Advisor"
          >
            <Bot
              className={`h-4 w-4 transition-all ${
                isAiOpen
                  ? "drop-shadow-[0_0_8px_rgba(199,210,254,0.95)]"
                  : "group-hover:drop-shadow-[0_0_6px_rgba(165,180,252,0.75)]"
              }`}
            />
          </button>
        </div>
      </nav>

      {/* 3. Slide-out Left Sidebar (Search, Pinning & Candidate List) */}
      <aside
        className={`fixed top-0 bottom-0 left-14 z-40 flex w-80 flex-col border-r border-indigo-300/15 bg-[#0f1328]/80 p-5 backdrop-blur-xl transition-transform duration-300 ease-out ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-indigo-300/45 bg-indigo-400/20 shadow-[0_0_18px_rgba(165,180,252,0.28)]">
              <Compass className="h-4 w-4 text-indigo-200 drop-shadow-[0_0_8px_rgba(199,210,254,0.95)]" />
            </div>
            <div>
              <h1 className="font-mono text-sm font-bold tracking-widest text-indigo-100">
                LUNAV
              </h1>
              <p className="font-mono text-[9px] tracking-widest text-indigo-300/70">
                SYS. OPR. TERMINAL
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={cycleMarkerShape}
            className="flex items-center gap-1 rounded-full border border-indigo-300/30 bg-[#171c38]/85 px-2.5 py-1 font-mono text-[9px] font-bold tracking-wider text-indigo-100 shadow-[0_0_14px_rgba(165,180,252,0.16)] transition hover:border-indigo-300/65 hover:bg-indigo-400/25"
            title="Cycle Space Marker Shape (Reticle / Lander / Diamond)"
          >
            <Sparkles className="h-2.5 w-2.5 text-violet-200 drop-shadow-[0_0_6px_rgba(216,180,254,0.95)]" />
            <span>{activeShapeLabel}</span>
          </button>
        </div>

        {/* Custom Styled Mission Epoch Dropdown */}
        <div className="mb-5 space-y-2" ref={epochDropdownRef}>
          <div className="flex items-center gap-2 font-mono text-[10px] font-semibold tracking-widest text-indigo-200/70">
            <Calendar className="h-3.5 w-3.5 text-indigo-300 drop-shadow-[0_0_6px_rgba(165,180,252,0.75)]" />{" "}
            MISSION EPOCH
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsEpochMenuOpen((o) => !o)}
              className="flex w-full items-center justify-between rounded-2xl border border-indigo-300/20 bg-[#171c38]/80 px-4 py-2.5 font-mono text-xs text-indigo-100 transition hover:border-indigo-300/45 focus:border-indigo-300 focus:outline-none"
            >
              <span>{activeEpochLabel}</span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-indigo-300 transition-transform duration-200 ${
                  isEpochMenuOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {isEpochMenuOpen && (
              <div className="absolute top-full right-0 left-0 z-50 mt-1.5 overflow-hidden rounded-2xl border border-indigo-300/25 bg-[#141830]/95 p-1.5 shadow-[0_14px_34px_rgba(9,11,22,0.85)] backdrop-blur-2xl">
                {EPOCH_OPTIONS.map((opt) => {
                  const active = opt.value === whenPreset;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setWhenPreset(opt.value);
                        setIsEpochMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 font-mono text-xs transition ${
                        active
                          ? "bg-indigo-400/25 font-semibold text-indigo-100"
                          : "text-slate-300 hover:bg-indigo-300/10 hover:text-indigo-200"
                      }`}
                    >
                      <span>{opt.label}</span>
                      {active && (
                        <Check className="h-3.5 w-3.5 text-indigo-300 drop-shadow-[0_0_6px_rgba(165,180,252,0.85)]" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {whenPreset === "custom" && (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="w-full rounded-2xl border border-indigo-300/20 bg-[#171c38]/80 px-3.5 py-1.5 font-mono text-xs text-indigo-100 outline-none focus:border-indigo-300"
              />
              <button
                type="button"
                onClick={() => jumpToLunarPhase(0.5)}
                className="rounded-full border border-amber-200/35 bg-amber-200/15 px-3 py-1.5 font-mono text-[9px] font-bold text-amber-200 transition hover:bg-amber-200/25"
                title="Jump to Full Moon"
              >
                FM
              </button>
            </div>
          )}
        </div>

        {/* Target Coordinates & Pin Controls */}
        <div className="mb-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-mono text-[10px] font-semibold tracking-widest text-indigo-200/70">
              <MapPin className="h-3.5 w-3.5 text-indigo-300 drop-shadow-[0_0_6px_rgba(165,180,252,0.75)]" />{" "}
              TARGET COORDINATES
            </span>
            <button
              type="button"
              onClick={() => {
                if (!is2DMode) {
                  setIs2DMode(true);
                  setShowCelestial(false);
                }
                setIsPinDropMode((p) => !p);
              }}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[9px] font-bold tracking-wider transition ${
                isPinDropMode
                  ? "border-fuchsia-300/65 bg-fuchsia-400/25 text-fuchsia-100 shadow-[0_0_12px_rgba(240,171,252,0.3)]"
                  : "border-indigo-300/25 bg-indigo-400/10 text-indigo-200 hover:border-indigo-300/50"
              }`}
            >
              <Crosshair className="h-2.5 w-2.5 drop-shadow-[0_0_5px_currentColor]" />
              {isPinDropMode ? "CLICK MAP" : "DROP PIN"}
            </button>
          </div>

          <div className="flex gap-2">
            <div className="flex w-1/2 items-center justify-between rounded-2xl border border-indigo-300/20 bg-[#171c38]/80 pr-1.5 pl-3 transition focus-within:border-indigo-300/55">
              <input
                type="number"
                step="0.01"
                placeholder={`LAT (${mapCenterCoords.lat})`}
                value={latInput}
                onChange={(e) => setLatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handlePinCoordinates();
                }}
                className="w-full bg-transparent py-1.5 font-mono text-xs text-indigo-100 outline-none placeholder:text-slate-500"
              />
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => stepCoordinate("lat", 1)}
                  className="rounded p-0.5 text-indigo-300/70 transition hover:bg-indigo-300/15 hover:text-indigo-200"
                  title="Increase Latitude"
                >
                  <ChevronUp className="h-2.5 w-2.5" />
                </button>
                <button
                  type="button"
                  onClick={() => stepCoordinate("lat", -1)}
                  className="rounded p-0.5 text-indigo-300/70 transition hover:bg-indigo-300/15 hover:text-indigo-200"
                  title="Decrease Latitude"
                >
                  <ChevronDown className="h-2.5 w-2.5" />
                </button>
              </div>
            </div>

            <div className="flex w-1/2 items-center justify-between rounded-2xl border border-indigo-300/20 bg-[#171c38]/80 pr-1.5 pl-3 transition focus-within:border-indigo-300/55">
              <input
                type="number"
                step="0.01"
                placeholder={`LON (${mapCenterCoords.lon})`}
                value={lonInput}
                onChange={(e) => setLonInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handlePinCoordinates();
                }}
                className="w-full bg-transparent py-1.5 font-mono text-xs text-indigo-100 outline-none placeholder:text-slate-500"
              />
              <div className="flex flex-col">
                <button
                  type="button"
                  onClick={() => stepCoordinate("lon", 1)}
                  className="rounded p-0.5 text-indigo-300/70 transition hover:bg-indigo-300/15 hover:text-indigo-200"
                  title="Increase Longitude"
                >
                  <ChevronUp className="h-2.5 w-2.5" />
                </button>
                <button
                  type="button"
                  onClick={() => stepCoordinate("lon", -1)}
                  className="rounded p-0.5 text-indigo-300/70 transition hover:bg-indigo-300/15 hover:text-indigo-200"
                  title="Decrease Longitude"
                >
                  <ChevronDown className="h-2.5 w-2.5" />
                </button>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handlePinCoordinates}
            className="flex w-full items-center justify-center gap-1.5 rounded-full border border-indigo-300/40 bg-gradient-to-r from-indigo-400/25 to-violet-400/25 py-2 font-mono text-[10px] font-bold tracking-widest text-indigo-100 shadow-[0_0_18px_rgba(165,180,252,0.2)] transition hover:border-indigo-300/65 hover:from-indigo-400/35 hover:to-violet-400/35 hover:text-white active:scale-[0.99]"
          >
            <Rocket className="h-3 w-3 text-indigo-200 drop-shadow-[0_0_6px_rgba(199,210,254,0.9)]" />
            <span>
              {latInput.trim() || lonInput.trim()
                ? "PIN LOCATION"
                : "PIN VIEW CENTER"}
            </span>
          </button>
        </div>

        {/* Ranked Options List */}
        <div className="lunav-scroll flex-1 space-y-2.5 overflow-y-auto pr-1.5">
          <div className="sticky top-0 z-10 flex items-center justify-between bg-[#0f1328]/95 pt-1 pb-2 font-mono text-[10px] font-semibold tracking-widest text-indigo-200/70 backdrop-blur">
            <span>CANDIDATE SITES ({sites.length})</span>
            {allPinnedIds.length > 0 && (
              <span className="rounded-full bg-fuchsia-400/15 px-2 py-0.5 text-[9px] text-fuchsia-200">
                {allPinnedIds.length} PINNED
              </span>
            )}
          </div>

          {sites.map((site) => {
            const isCustomPin = site.id.startsWith("pinned-");
            const isPinned =
              isCustomPin || bookmarkedSiteIds.includes(site.id);

            return (
              <div
                key={site.id}
                onClick={() => setSelectedSiteId(site.id)}
                className={`cursor-pointer rounded-2xl border p-3.5 transition-all ${
                  selectedSiteId === site.id
                    ? "border-indigo-300/60 bg-indigo-400/20 shadow-[0_0_20px_rgba(165,180,252,0.18)]"
                    : isPinned
                    ? "border-fuchsia-300/25 bg-[#1b1636]/70 hover:border-fuchsia-300/45"
                    : "border-white/5 bg-[#171c38]/60 hover:border-indigo-300/30 hover:bg-[#1e2447]/75"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-indigo-50">
                    {site.name.toUpperCase()}
                  </span>
                  <div className="flex items-center gap-1">
                    {selectedSiteId === site.id && (
                      <Crosshair className="h-3.5 w-3.5 text-indigo-200 drop-shadow-[0_0_7px_rgba(199,210,254,0.95)]" />
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePinSite(site.id);
                      }}
                      className={`rounded-full p-1 transition ${
                        isPinned
                          ? "bg-fuchsia-400/25 text-fuchsia-200 shadow-[0_0_10px_rgba(240,171,252,0.3)] hover:bg-rose-400/25 hover:text-rose-200"
                          : "text-slate-500 hover:bg-indigo-300/15 hover:text-indigo-200"
                      }`}
                      title={
                        isCustomPin
                          ? "Remove Pinned Beacon"
                          : isPinned
                          ? "Unpin Site"
                          : "Pin Site to Top"
                      }
                    >
                      {isCustomPin ? (
                        <X className="h-3 w-3" />
                      ) : (
                        <Rocket
                          className={`h-3 w-3 ${
                            isPinned
                              ? "drop-shadow-[0_0_6px_rgba(245,208,254,0.9)]"
                              : ""
                          }`}
                        />
                      )}
                    </button>
                  </div>
                </div>
                <div className="mt-1 font-mono text-[9px] text-slate-400">
                  LAT {site.lat}° | LON {site.lon}°
                </div>
                <div className="mt-2.5 flex items-center justify-between font-mono text-[10px]">
                  <span className="flex items-center gap-1.5 text-amber-200">
                    <Sun className="h-3 w-3 drop-shadow-[0_0_5px_rgba(253,230,138,0.8)]" />{" "}
                    {site.sunlight_percent}%
                  </span>
                  <span className="flex items-center gap-1.5 text-emerald-300">
                    <Radio className="h-3 w-3 drop-shadow-[0_0_5px_rgba(110,231,183,0.8)]" />{" "}
                    {site.comms_window_hours}H
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      {/* 4. Right Popup (Selected Site Detail + Surface Horizon Side View of Earth & Sunlight) */}
      {selectedSite && (
        <aside className="lunav-scroll fixed top-6 right-6 z-40 max-h-[calc(100vh-145px)] w-[290px] overflow-y-auto rounded-3xl border border-indigo-300/25 bg-[#0f1328]/85 p-4 shadow-[0_12px_40px_rgba(15,23,42,0.65)] backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-indigo-300/15 pb-3">
            <div className="pr-2">
              <div className="font-mono text-[9px] tracking-widest text-indigo-300/80">
                {selectedSite.region.toUpperCase()}
              </div>
              <h2 className="font-mono text-sm font-bold text-indigo-50">
                {selectedSite.name.toUpperCase()}
              </h2>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => togglePinSite(selectedSite.id)}
                className={`flex h-7 w-7 items-center justify-center rounded-full border transition ${
                  allPinnedIds.includes(selectedSite.id)
                    ? "border-fuchsia-300/60 bg-fuchsia-400/25 text-fuchsia-100 shadow-[0_0_12px_rgba(240,171,252,0.35)]"
                    : "border-indigo-300/20 bg-indigo-400/10 text-indigo-200 hover:border-indigo-300/50"
                }`}
                title={
                  selectedSite.id.startsWith("pinned-")
                    ? "Remove Beacon"
                    : allPinnedIds.includes(selectedSite.id)
                    ? "Unpin Site"
                    : "Pin Site"
                }
              >
                <Rocket
                  className={`h-3.5 w-3.5 ${
                    allPinnedIds.includes(selectedSite.id)
                      ? "drop-shadow-[0_0_6px_rgba(245,208,254,0.9)]"
                      : ""
                  }`}
                />
              </button>
              <button
                type="button"
                onClick={() => setSelectedSiteId(null)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-indigo-300/20 bg-indigo-400/10 text-indigo-200 transition hover:border-indigo-300/50 hover:bg-indigo-400/20"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-3.5 h-24 w-full overflow-hidden rounded-2xl border border-indigo-300/20">
            <MoonMap2D
              mode="thumbnail"
              sites={[selectedSite]}
              center={[selectedSite.lat, selectedSite.lon]}
              zoom={6}
            />
          </div>

          <SurfaceHorizonSideView
            site={selectedSite}
            baseEpochMs={activeTimestampMs}
            subscribe={subscribeEpoch}
          />

          <div className="mt-3.5 space-y-2 font-mono text-[10px]">
            <div className="flex justify-between border-b border-white/5 pb-1.5">
              <span className="text-slate-400">WINDOW</span>
              <span className="text-indigo-200">
                {selectedSite.recommended_window}
              </span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1.5">
              <span className="text-slate-400">POWER YIELD</span>
              <span className="text-amber-200">
                {selectedSite.sunlight_percent}%
              </span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1.5">
              <span className="text-slate-400">LOS COMM</span>
              <span className="text-emerald-300">
                {selectedSite.comms_window_hours}H/DAY
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">MEAN SLOPE</span>
              <span className="text-rose-300">{selectedSite.slope_deg}°</span>
            </div>
          </div>
        </aside>
      )}

      {/* 5. AI Chat Overlay */}
      {isAiOpen && (
        <div
          className={`fixed bottom-20 ${bottomLeftOffsetClass} z-50 w-[340px] rounded-3xl border border-indigo-300/30 bg-[#0f1328]/90 p-4 shadow-[0_12px_40px_rgba(15,23,42,0.75)] backdrop-blur-xl transition-all duration-300`}
        >
          <div className="mb-3 flex items-center gap-2 border-b border-indigo-300/15 pb-2 font-mono text-[10px] font-bold tracking-widest text-indigo-200">
            <Bot className="h-3.5 w-3.5 text-violet-200 drop-shadow-[0_0_7px_rgba(196,181,253,0.9)]" />{" "}
            AI MISSION ADVISOR
          </div>
          <p className="min-h-[48px] font-mono text-[10px] leading-relaxed text-slate-200">
            {roverReply}
          </p>
          <form onSubmit={handleRoverAsk} className="mt-3 flex gap-2">
            <input
              type="text"
              value={roverInput}
              onChange={(e) => setRoverInput(e.target.value)}
              disabled={isRoverThinking}
              placeholder="Query parameters..."
              className="w-full rounded-full border border-indigo-300/20 bg-[#171c38]/85 px-3.5 py-1.5 font-mono text-[10px] text-indigo-100 outline-none placeholder:text-slate-500 focus:border-indigo-300 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isRoverThinking}
              className="rounded-full border border-indigo-300/35 bg-gradient-to-r from-indigo-400/25 to-violet-400/25 px-4 py-1.5 font-mono text-[10px] font-bold text-indigo-100 transition hover:border-indigo-300/60 hover:text-white disabled:opacity-50"
            >
              {isRoverThinking ? "..." : "TX"}
            </button>
          </form>
        </div>
      )}

      {/* 6. Top Center Pill Toggle (Projection: Global EQ vs South Pole SP) */}
      {is2DMode && (
        <div className="fixed top-6 left-1/2 z-40 flex -translate-x-1/2 gap-1 rounded-full border border-indigo-300/25 bg-[#0f1328]/80 p-1 shadow-[0_8px_24px_rgba(15,23,42,0.45)] backdrop-blur-xl">
          <button
            type="button"
            onClick={() => setProjectionMode("EQ")}
            className={`rounded-full px-4 py-1.5 font-mono text-[10px] font-bold tracking-widest transition ${
              projectionMode === "EQ"
                ? "bg-indigo-400/25 text-indigo-100 shadow-[0_0_14px_rgba(165,180,252,0.3)]"
                : "text-slate-400 hover:text-indigo-200"
            }`}
          >
            GLOBAL (EQ)
          </button>
          <button
            type="button"
            onClick={() => setProjectionMode("SP")}
            className={`rounded-full px-4 py-1.5 font-mono text-[10px] font-bold tracking-widest transition ${
              projectionMode === "SP"
                ? "bg-indigo-400/25 text-indigo-100 shadow-[0_0_14px_rgba(165,180,252,0.3)]"
                : "text-slate-400 hover:text-indigo-200"
            }`}
          >
            SOUTH POLE (SP)
          </button>
        </div>
      )}

      {/* 7. Bottom Center Pill Toggle (Layers: Relief, Contours, Slope Hazard) */}
      {is2DMode && (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border border-indigo-300/20 bg-[#0f1328]/80 p-1 shadow-[0_8px_24px_rgba(15,23,42,0.45)] backdrop-blur-xl">
          <Layers className="mr-1.5 ml-2.5 h-3.5 w-3.5 text-indigo-200/85 drop-shadow-[0_0_6px_rgba(165,180,252,0.75)]" />
          {[
            { id: "relief", label: "RELIEF" },
            { id: "contours", label: "CONTOURS" },
            { id: "slope", label: "HAZARD" },
          ].map((layerOpt) => (
            <button
              key={layerOpt.id}
              type="button"
              onClick={() => setLayerMode(layerOpt.id as TerrainLayerMode)}
              className={`rounded-full px-4 py-1.5 font-mono text-[10px] font-bold tracking-widest transition ${
                layerMode === layerOpt.id
                  ? layerOpt.id === "relief"
                    ? "bg-indigo-400/25 text-indigo-100 shadow-[0_0_14px_rgba(165,180,252,0.3)]"
                    : layerOpt.id === "contours"
                    ? "bg-amber-200/20 text-amber-200 shadow-[0_0_12px_rgba(253,230,138,0.22)]"
                    : "bg-rose-300/20 text-rose-200 shadow-[0_0_12px_rgba(253,164,175,0.22)]"
                  : "text-slate-400 hover:bg-white/5 hover:text-indigo-100"
              }`}
            >
              {layerOpt.label}
            </button>
          ))}
        </div>
      )}

      {/* 8. Single Bottom-Left View Toggle Pill Button */}
      <button
        type="button"
        onClick={toggleViewMode}
        className={`fixed bottom-6 ${bottomLeftOffsetClass} z-40 flex items-center gap-2 rounded-full border border-indigo-300/40 bg-[#0f1328]/85 px-4 py-2 font-mono text-[10px] font-bold tracking-widest text-indigo-100 shadow-[0_8px_24px_rgba(165,180,252,0.25)] backdrop-blur-xl transition-all duration-300 hover:border-indigo-300/75 hover:bg-indigo-400/20 hover:text-white`}
        title={is2DMode ? "Switch to 3D Globe" : "Switch to 2D Map"}
      >
        {is2DMode ? (
          <>
            <MapIcon className="h-3.5 w-3.5 text-indigo-200 drop-shadow-[0_0_7px_rgba(165,180,252,0.9)]" />
            <span>2D VIEW</span>
          </>
        ) : (
          <>
            <Globe className="h-3.5 w-3.5 text-violet-200 drop-shadow-[0_0_7px_rgba(196,181,253,0.9)]" />
            <span>3D GLOBE</span>
          </>
        )}
        <ArrowLeftRight className="ml-0.5 h-3 w-3 text-indigo-300/75" />
      </button>

      {/* 9. Bottom Right Telemetry Clock / Date & Time */}
      <div className="fixed right-6 bottom-6 z-40 flex flex-col items-end gap-2">
        <div className="flex items-center gap-3 rounded-full border border-indigo-300/30 bg-[#0f1328]/85 px-4 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.45)] backdrop-blur-xl">
          <Orbit className="h-4 w-4 animate-[spin_4s_linear_infinite] text-indigo-200 drop-shadow-[0_0_8px_rgba(165,180,252,0.9)]" />
          <div className="font-mono text-xs font-bold tracking-wider text-indigo-100">
            <LiveUtcText
              initialMs={activeTimestampMs}
              subscribe={subscribeEpoch}
            />
          </div>
        </div>

        <div className="flex items-center gap-1 rounded-full border border-indigo-300/20 bg-[#0f1328]/80 p-1 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setTimeScale(0)}
            className={`rounded-full p-1.5 transition ${
              timeScale === 0
                ? "bg-rose-300/25 text-rose-200 shadow-[0_0_10px_rgba(253,164,175,0.28)]"
                : "text-slate-400 hover:text-indigo-200"
            }`}
            title="Pause"
          >
            <Pause
              className={`h-3 w-3 ${
                timeScale === 0
                  ? "drop-shadow-[0_0_5px_rgba(253,164,175,0.9)]"
                  : ""
              }`}
            />
          </button>
          <button
            type="button"
            onClick={() => setTimeScale(1)}
            className={`rounded-full p-1.5 transition ${
              timeScale === 1
                ? "bg-indigo-400/25 text-indigo-100 shadow-[0_0_10px_rgba(165,180,252,0.28)]"
                : "text-slate-400 hover:text-indigo-200"
            }`}
            title="Real-time 1x"
          >
            <Play
              className={`h-3 w-3 ${
                timeScale === 1
                  ? "drop-shadow-[0_0_5px_rgba(199,210,254,0.9)]"
                  : ""
              }`}
            />
          </button>
          <button
            type="button"
            onClick={() => setTimeScale(100)}
            className={`rounded-full p-1.5 transition ${
              timeScale === 100
                ? "bg-indigo-400/25 text-indigo-100 shadow-[0_0_10px_rgba(165,180,252,0.28)]"
                : "text-slate-400 hover:text-indigo-200"
            }`}
            title="Fast Forward 100x"
          >
            <FastForward
              className={`h-3 w-3 ${
                timeScale === 100
                  ? "drop-shadow-[0_0_5px_rgba(199,210,254,0.9)]"
                  : ""
              }`}
            />
          </button>
          <button
            type="button"
            onClick={() => setTimeScale(1000)}
            className={`flex items-center -space-x-1.5 rounded-full px-2 py-1.5 transition ${
              timeScale === 1000
                ? "bg-violet-400/30 text-violet-100 shadow-[0_0_12px_rgba(196,181,253,0.32)]"
                : "text-slate-400 hover:text-indigo-200"
            }`}
            title="Planetary Warp 1000x"
          >
            <FastForward
              className={`h-3 w-3 ${
                timeScale === 1000
                  ? "drop-shadow-[0_0_5px_rgba(221,214,254,0.95)]"
                  : ""
              }`}
            />
            <FastForward
              className={`h-3 w-3 ${
                timeScale === 1000
                  ? "drop-shadow-[0_0_5px_rgba(221,214,254,0.95)]"
                  : ""
              }`}
            />
          </button>
          <div className="mx-1 h-3 w-px bg-indigo-300/20" />
          <button
            type="button"
            onClick={() => {
              setTimeScale(1);
              setClockResetNonce((n) => n + 1);
            }}
            className="flex items-center gap-1 rounded-full p-1.5 text-slate-400 transition hover:text-indigo-200"
            title="Reset to target"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        </div>
      </div>
    </main>
  );
}