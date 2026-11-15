"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
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
  SlidersHorizontal,
  Clock,
  AlertTriangle,
} from "lucide-react";
import {
  evaluateSitesForSchedule,
  evaluateCustomCoordinate,
  WhenPreset,
  getLunarCelestialAngles,
} from "@/utils/lunarEphemeris";
import { TerrainLayerMode } from "@/utils/lunarTextures";
import { LandingSite } from "@/data/mockSites";
import type { SpaceMarkerShape, TrafficMapItem } from "@/components/MoonMap2D";
import type { SpacecraftSpecs } from "@/utils/terrainAnalysis";
import type {
  MissionCompareRequest,
  MissionCompareResponse,
  MissionCompareSite,
} from "@/utils/missionApiContract";

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

interface TimezoneOption {
  id: string;
  label: string;
  short: string;
  timeZone: string;
}

const TIMEZONE_OPTIONS: TimezoneOption[] = [
  { id: "UTC", label: "UTC (GMT+0)", short: "UTC", timeZone: "UTC" },
  {
    id: "PHT",
    label: "PHT • MANILA (UTC+8)",
    short: "PHT",
    timeZone: "Asia/Manila",
  },
  {
    id: "JST",
    label: "JST • TOKYO (UTC+9)",
    short: "JST",
    timeZone: "Asia/Tokyo",
  },
  {
    id: "EST",
    label: "EST • NEW YORK (UTC-5)",
    short: "EST",
    timeZone: "America/New_York",
  },
  {
    id: "PST",
    label: "PST • LOS ANGELES (UTC-8)",
    short: "PST",
    timeZone: "America/Los_Angeles",
  },
  {
    id: "CET",
    label: "CET • PARIS (UTC+1)",
    short: "CET",
    timeZone: "Europe/Paris",
  },
];

export type MissionTrafficStatus = "PLANNED" | "ACTIVE" | "PAST";

export interface SiteMissionTrafficItem extends TrafficMapItem {
  agency: string;
  windowOrDate: string;
  note: string;
  briefDescription: string;
  objective: string;
}

/**
 * PLACEHOLDER LUNAR TRAFFIC & MISSION HISTORY DATA
 * Replace this generator once the site-conflict / traffic algorithm is finalized.
 */
function getSiteMissionTraffic(site: LandingSite): SiteMissionTrafficItem[] {
  const idLower = site.id.toLowerCase();
  const nameLower = site.name.toLowerCase();

  if (idLower.includes("shackleton") || nameLower.includes("shackleton")) {
    return [
      {
        id: "tr-shack-1",
        spacecraft: "ARTEMIS III HLS",
        agency: "NASA / SPACEX",
        status: "PLANNED",
        windowOrDate: "NET Q4 2027",
        separationKm: 8.4,
        bearingDeg: 42,
        note: "Connecting Ridge Touchdown Zone",
        objective: "Crewed Lunar South Pole Surface Sortie",
        briefDescription:
          "Human Landing System targeting the sunlit connecting ridge adjacent to Shackleton Crater to conduct EVA traverses and sample permanently shadowed regolith.",
      },
      {
        id: "tr-shack-2",
        spacecraft: "CHANG'E-7 HOPPER",
        agency: "CNSA",
        status: "PLANNED",
        windowOrDate: "Q4 2026",
        separationKm: 19.2,
        bearingDeg: 145,
        note: "Illuminated Rim Shadow Survey",
        objective: "Water-Ice & Volatile Plume Detection",
        briefDescription:
          "Multi-spacecraft orbiter, lander, rover, and mini-flying probe designed to hop into Shackleton's permanently shadowed crater floor for direct water-ice spectroscopy.",
      },
      {
        id: "tr-shack-3",
        spacecraft: "IM-2 ATHENA",
        agency: "INTUITIVE MACHINES",
        status: "PAST",
        windowOrDate: "MAR 2025",
        separationKm: 42.0,
        bearingDeg: 225,
        note: "Mons Mouton Subsurface Drill",
        objective: "PRIME-1 Drill & Mass Spectrometer",
        briefDescription:
          "Commercial Nova-C lander deployed to Mons Mouton plateau near Shackleton to drill 1 meter into lunar regolith and measure subsurface volatile gases.",
      },
      {
        id: "tr-shack-4",
        spacecraft: "LCROSS IMPACTOR",
        agency: "NASA",
        status: "PAST",
        windowOrDate: "OCT 2009",
        separationKm: 64.5,
        bearingDeg: 310,
        note: "Cabeus Water-Ice Plume Plunge",
        objective: "Kinetic Ejecta Plume Spectroscopy",
        briefDescription:
          "Centaur upper stage and shepherding spacecraft impacted Cabeus crater near the South Pole, confirming water ice and hydroxyl concentrations in the ejecta plume.",
      },
    ];
  }

  if (idLower.includes("malapert") || nameLower.includes("malapert")) {
    return [
      {
        id: "tr-mal-1",
        spacecraft: "LUPEX ROVER",
        agency: "JAXA / ISRO",
        status: "PLANNED",
        windowOrDate: "2027 WINDOW",
        separationKm: 11.6,
        bearingDeg: 68,
        note: "South Pole Polar Water Prospecting",
        objective: "Autonomous Drill & Neutron Spectrometer",
        briefDescription:
          "Joint JAXA-ISRO Lunar Polar Exploration mission surveying water distribution, regolith bearing strength, and high-elevation Earth line-of-sight corridors.",
      },
      {
        id: "tr-mal-2",
        spacecraft: "BLUE GHOST M2",
        agency: "FIREFLY / ESA",
        status: "PLANNED",
        windowOrDate: "2027 WINDOW",
        separationKm: 28.0,
        bearingDeg: 195,
        note: "Far-Side Relay & South Massif",
        objective: "CLPS Surface Delivery & Lunar Pathfinder",
        briefDescription:
          "Dual-stage lander and orbital relay mission delivering scientific payloads to the southern highlands while maintaining continuous Earth communications.",
      },
      {
        id: "tr-mal-3",
        spacecraft: "IM-1 ODYSSEUS",
        agency: "INTUITIVE MACHINES",
        status: "PAST",
        windowOrDate: "FEB 2024",
        separationKm: 34.8,
        bearingDeg: 285,
        note: "Malapert A Crater Landing",
        objective: "First US Soft Landing Since Apollo 17",
        briefDescription:
          "Landed inside Malapert A crater roughly 300 km from the South Pole, testing precision terrain-relative navigation and cryogenic propulsion.",
      },
    ];
  }

  if (idLower.includes("nobile") || nameLower.includes("nobile")) {
    return [
      {
        id: "tr-nob-1",
        spacecraft: "GRIFFIN MISSION ONE",
        agency: "ASTROBOTIC",
        status: "PLANNED",
        windowOrDate: "LATE 2026",
        separationKm: 14.3,
        bearingDeg: 55,
        note: "Nobile Western Rim Traverse",
        objective: "South Polar Terrain & Mobility Demo",
        briefDescription:
          "Heavy-class CLPS lander targeting the Nobile crater western rim to validate hazard-avoidance landing sensors and deploy surface mobility rovers.",
      },
      {
        id: "tr-nob-2",
        spacecraft: "VIPER FLIGHT MODEL",
        agency: "NASA",
        status: "PLANNED",
        windowOrDate: "TBD 2027",
        separationKm: 22.5,
        bearingDeg: 165,
        note: "Volatile Mapping Corridor",
        objective: "100-Day Subsurface Ice Resource Map",
        briefDescription:
          "Mobile prospecting rover equipped with neutron spectrometers and a 1-meter percussive drill to map harvestable ice deposits across Nobile's rim.",
      },
      {
        id: "tr-nob-3",
        spacecraft: "SMART-1 IMPACT",
        agency: "ESA",
        status: "PAST",
        windowOrDate: "SEP 2006",
        separationKm: 88.0,
        bearingDeg: 260,
        note: "Lacus Excellentiae Grazing Impact",
        objective: "Solar-Electric Propulsion & X-Ray Mapping",
        briefDescription:
          "ESA's first lunar orbiter mapped polar illumination cycles and elemental composition before concluding with a controlled grazing impact.",
      },
    ];
  }

  if (
    idLower.includes("tranquillitatis") ||
    nameLower.includes("tranquillitatis")
  ) {
    return [
      {
        id: "tr-tranq-1",
        spacecraft: "LUNAR OUTPOST MAPP",
        agency: "COMMERCIAL",
        status: "PLANNED",
        windowOrDate: "2027 WINDOW",
        separationKm: 16.5,
        bearingDeg: 52,
        note: "Mare Basalt Regolith Sampling",
        objective: "Commercial ISRU Regolith Collection",
        briefDescription:
          "Autonomous four-wheeled prospector rover scheduled to traverse basaltic mare plains, capture high-resolution stereo maps, and collect regolith samples.",
      },
      {
        id: "tr-tranq-2",
        spacecraft: "APOLLO 11 EAGLE",
        agency: "NASA",
        status: "PAST",
        windowOrDate: "JUL 1969",
        separationKm: 0.4,
        bearingDeg: 215,
        note: "First Crewed Lunar Landing",
        objective: "Tranquility Base Sample Return & EASEP",
        briefDescription:
          "Historic first human touchdown on the Moon at 0.674° N, 23.473° E; deployed passive seismometer, laser ranging retroreflector, and returned 21.5 kg of mare basalt.",
      },
      {
        id: "tr-tranq-3",
        spacecraft: "SURVEYOR 5",
        agency: "NASA",
        status: "PAST",
        windowOrDate: "SEP 1967",
        separationKm: 24.8,
        bearingDeg: 325,
        note: "Alpha-Scattering Soil Analysis",
        objective: "Pre-Apollo Mare Bearing Strength Check",
        briefDescription:
          "Robotic lander that confirmed Mare Tranquillitatis consists of basaltic rock with sufficient bearing strength to support crewed Apollo landers.",
      },
    ];
  }

  if (idLower.includes("aristarchus") || nameLower.includes("aristarchus")) {
    return [
      {
        id: "tr-ari-1",
        spacecraft: "IM-4 PROSPECTOR",
        agency: "INTUITIVE MACHINES",
        status: "PLANNED",
        windowOrDate: "2027 WINDOW",
        separationKm: 18.9,
        bearingDeg: 80,
        note: "Vallis Schröteri Pyroclastic Survey",
        objective: "Silica-Rich Volcanic Glass Spectrometry",
        briefDescription:
          "Targets the Aristarchus Plateau to analyze pyroclastic volcanic beads rich in oxygen and titanium for future propellant production.",
      },
      {
        id: "tr-ari-2",
        spacecraft: "LUNA 16 / LUNA 24",
        agency: "USSR",
        status: "PAST",
        windowOrDate: "1970–1976",
        separationKm: 95.0,
        bearingDeg: 130,
        note: "Robotic Core Sample Return",
        objective: "Automated Deep Regolith Core Extraction",
        briefDescription:
          "Series of robotic sample-return landers that drilled up to 2 meters into lunar mare basins and returned sealed regolith cores to Earth.",
      },
    ];
  }

  // Fallback placeholder traffic for any custom dropped beacon or additional candidate site
  const hashSeed = Math.abs(Math.round(site.lat * 13 + site.lon * 7));
  const sep1 = Number((6.5 + (hashSeed % 22)).toFixed(1));
  const sep2 = Number((26.0 + (hashSeed % 45)).toFixed(1));

  return [
    {
      id: `tr-custom-1-${site.id}`,
      spacecraft: `CLPS-TX0${(hashSeed % 8) + 2} LANDER`,
      agency: "COMMERCIAL / NASA",
      status: "PLANNED",
      windowOrDate: "Q2 2027",
      separationKm: sep1,
      bearingDeg: (hashSeed * 47) % 360,
      note: "Placeholder Inbound Trajectory",
      objective: "Surface Payload Delivery & Hazard Nav",
      briefDescription:
        "Placeholder commercial lander manifest projected near this coordinate sector. Will update dynamically once the traffic conflict algorithm is integrated.",
    },
    {
      id: `tr-custom-2-${site.id}`,
      spacecraft: `SELENE-R${(hashSeed % 5) + 1} SCOUT`,
      agency: "JAXA",
      status: "PLANNED",
      windowOrDate: "Q4 2027",
      separationKm: sep2,
      bearingDeg: (hashSeed * 113 + 120) % 360,
      note: "Placeholder Surface Beacon",
      objective: "Pinpoint Landing & Micro-Rover Test",
      briefDescription:
        "Placeholder secondary surface mission queued in the same regional corridor for multi-spacecraft separation and frequency coordination.",
    },
    {
      id: `tr-custom-3-${site.id}`,
      spacecraft: "LRO ORBITAL PASS",
      agency: "NASA",
      status: "ACTIVE",
      windowOrDate: "CURRENT",
      separationKm: 50.0,
      bearingDeg: 0,
      note: "50 km Polar Reconnaissance Track",
      objective: "High-Resolution NAC & LOLA Altimetry",
      briefDescription:
        "Active Lunar Reconnaissance Orbiter mapping pass providing 0.5 m/pixel Narrow Angle Camera imagery and laser altimetry across this landing zone.",
    },
    {
      id: `tr-custom-4-${site.id}`,
      spacecraft: "GRAIL-A / EBB",
      agency: "NASA",
      status: "PAST",
      windowOrDate: "DEC 2012",
      separationKm: 74.2,
      bearingDeg: 240,
      note: "Historical Gravity Mapping Archive",
      objective: "Crustal Thickness & Mascon Profiling",
      briefDescription:
        "Twin spacecraft gravity-field survey that mapped subsurface mass concentrations (mascons) used to compute descent trajectory perturbations.",
    },
  ];
}

function formatEpochInTimezone(ms: number, tzOption: TimezoneOption): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tzOption.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(new Date(ms));

    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? "00";
    const hour = get("hour") === "24" ? "00" : get("hour");
    return `${get("year")}-${get("month")}-${get("day")} ${hour}:${get(
      "minute"
    )}:${get("second")} ${tzOption.short}`;
  } catch {
    const iso = new Date(ms).toISOString();
    return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
  }
}

// Every scientific value in the selected-site panel comes from the Phase 3C response.
// Candidate-site preview metrics elsewhere on the dashboard remain illustrative
// until the multi-site comparison phase.
type CompareState =
  | { key: string; status: "loading" }
  | { key: string; status: "error"; error: string }
  | { key: string; status: "success"; site: MissionCompareSite; response: MissionCompareResponse };

/** Values in the demo profile are explicit user-editable assumptions, not mission facts. */
type DemoFields = {
  solarPanelAreaM2: string;
  efficiencyPercent: string;
  panelTiltDeg: string;
  panelFacingAzimuthDeg: string;
  minSolarPowerW: string;
  batteryCapacityWh: string;
  averageElectricalLoadW: string;
  initialBatterySocPercent: string;
  radioFrequencyMHz: string;
  transmitterEirpDbm: string;
  receiverGainDbi: string;
  receiverSensitivityDbm: string;
  otherLinkLossDb: string;
  earthDistanceKm: string;
  minLinkMarginDb: string;
};

const DEFAULT_DEMO_FIELDS: DemoFields = {
  solarPanelAreaM2: "1.5",
  efficiencyPercent: "28",
  panelTiltDeg: "60",
  panelFacingAzimuthDeg: "0",
  minSolarPowerW: "20",
  batteryCapacityWh: "1500",
  averageElectricalLoadW: "40",
  initialBatterySocPercent: "80",
  radioFrequencyMHz: "2200",
  transmitterEirpDbm: "53",
  receiverGainDbi: "45",
  receiverSensitivityDbm: "-125",
  otherLinkLossDb: "3",
  earthDistanceKm: "384400",
  minLinkMarginDb: "3",
};

const DEMO_FIELD_GROUPS: {title:string; fields:{key:keyof DemoFields; label:string; unit:string}[]}[] = [
  { title: "SOLAR & BATTERY", fields: [
    { key: "solarPanelAreaM2", label: "Panel area", unit: "m²" },
    { key: "efficiencyPercent", label: "Panel efficiency", unit: "%" },
    { key: "panelTiltDeg", label: "Panel tilt", unit: "°" },
    { key: "panelFacingAzimuthDeg", label: "Panel facing azimuth (N=0°)", unit: "°" },
    { key: "minSolarPowerW", label: "Minimum solar output", unit: "W" },
    { key: "batteryCapacityWh", label: "Battery capacity", unit: "Wh" },
    { key: "averageElectricalLoadW", label: "Continuous load", unit: "W" },
    { key: "initialBatterySocPercent", label: "Initial battery charge", unit: "%" },
  ]},
  { title: "EARTH RF LINK • ASSUMED RANGE", fields: [
    { key: "radioFrequencyMHz", label: "Carrier frequency", unit: "MHz" },
    { key: "transmitterEirpDbm", label: "Transmitter EIRP", unit: "dBm" },
    { key: "receiverGainDbi", label: "Ground receive gain", unit: "dBi" },
    { key: "receiverSensitivityDbm", label: "Receiver sensitivity", unit: "dBm" },
    { key: "otherLinkLossDb", label: "Other link losses", unit: "dB" },
    { key: "earthDistanceKm", label: "Assumed Earth distance", unit: "km" },
    { key: "minLinkMarginDb", label: "Required link margin", unit: "dB" },
  ]},
];

function parseDemoSpacecraft(fields: DemoFields): {spacecraft: SpacecraftSpecs | undefined; error: string | null} {
  const vals = {} as Record<keyof DemoFields, number>;
  for (const key of Object.keys(fields) as (keyof DemoFields)[]) {
    const raw = fields[key].trim();
    const num = Number(raw);
    if (raw === "" || !Number.isFinite(num)) return { spacecraft: undefined, error: `Enter a valid number for ${key}.` };
    vals[key] = num;
  }
  if (vals.solarPanelAreaM2 <= 0 || vals.efficiencyPercent < 0 || vals.efficiencyPercent > 100 ||
      vals.panelTiltDeg < 0 || vals.panelTiltDeg > 180 || vals.panelFacingAzimuthDeg < 0 || vals.panelFacingAzimuthDeg > 360 ||
      vals.minSolarPowerW < 0 || vals.batteryCapacityWh <= 0 || vals.averageElectricalLoadW < 0 ||
      vals.initialBatterySocPercent < 0 || vals.initialBatterySocPercent > 100 ||
      vals.radioFrequencyMHz <= 0 || vals.otherLinkLossDb < 0 || vals.earthDistanceKm <= 0) {
    return { spacecraft: undefined, error: "Spacecraft parameters are outside supported ranges. Check positive quantities, efficiency/charge 0–100%, and panel tilt 0–180°." };
  }
  return { error: null, spacecraft: {
    solarPanelAreaM2: vals.solarPanelAreaM2,
    solarPanelEfficiency: vals.efficiencyPercent / 100,
    panelTiltDeg: vals.panelTiltDeg,
    panelFacingAzimuthDeg: vals.panelFacingAzimuthDeg,
    minSolarPowerW: vals.minSolarPowerW,
    batteryCapacityWh: vals.batteryCapacityWh,
    averageElectricalLoadW: vals.averageElectricalLoadW,
    initialBatterySocPercent: vals.initialBatterySocPercent,
    radioFrequencyMHz: vals.radioFrequencyMHz,
    transmitterEirpDbm: vals.transmitterEirpDbm,
    receiverGainDbi: vals.receiverGainDbi,
    receiverSensitivityDbm: vals.receiverSensitivityDbm,
    otherLinkLossDb: vals.otherLinkLossDb,
    earthDistanceKm: vals.earthDistanceKm,
    minLinkMarginDb: vals.minLinkMarginDb,
  }};
}

function metric(value: number | null | undefined, unit = "", decimals = 1): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "—"
    : `${value.toFixed(decimals)}${unit}`;
}

function sampleAtTime(
  timeline: MissionCompareSite["timeline"] | null,
  epochMs: number
): MissionCompareSite["timeline"][number] | null {
  if (!timeline?.length) return null;
  const first = Date.parse(timeline[0].timeUtc);
  const last = Date.parse(timeline[timeline.length - 1].timeUtc);
  if (epochMs < first || epochMs > last) return null;
  let nearest = timeline[0];
  let minDelta = Math.abs(epochMs - first);
  for (const row of timeline) {
    const delta = Math.abs(epochMs - Date.parse(row.timeUtc));
    if (delta < minDelta) {
      minDelta = delta;
      nearest = row;
    }
  }
  return nearest;
}

function compareErrorMessage(value: unknown, fallback: string): string {
  if (value && typeof value === "object" && "error" in value) {
    const error = (value as { error?: unknown }).error;
    if (typeof error === "string" && error) return error;
  }
  return fallback;
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

function LiveClockText({
  initialMs,
  timezoneOption,
  subscribe,
}: {
  initialMs: number;
  timezoneOption: TimezoneOption;
  subscribe: (cb: (ms: number) => void) => () => void;
}) {
  const latestMsRef = useRef<number>(initialMs);
  const [text, setText] = useState(() =>
    formatEpochInTimezone(initialMs, timezoneOption)
  );

  useEffect(() => {
    latestMsRef.current = initialMs;
    setText(formatEpochInTimezone(initialMs, timezoneOption));
  }, [initialMs]);

  useEffect(() => {
    setText(formatEpochInTimezone(latestMsRef.current, timezoneOption));
    return subscribe((ms) => {
      latestMsRef.current = ms;
      setText(formatEpochInTimezone(ms, timezoneOption));
    });
  }, [timezoneOption, subscribe]);

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
  timeline,
  loadStatus,
  terrainSlopeDeg,
}: {
  site: LandingSite;
  baseEpochMs: number;
  subscribe: (cb: (ms: number) => void) => () => void;
  timeline: MissionCompareSite["timeline"] | null;
  loadStatus: "idle" | "loading" | "error" | "success";
  terrainSlopeDeg: number | null;
}) {
  const [liveEpochMs, setLiveEpochMs] = useState<number>(baseEpochMs);

  useEffect(() => {
    setLiveEpochMs(baseEpochMs);
    return subscribe((ms) => setLiveEpochMs(ms));
  }, [baseEpochMs, subscribe]);

  // The animation clock selects a real sample; it never invents intermediate angles.
  const live = sampleAtTime(timeline, liveEpochMs);
  if (!live) {
    return (
      <div className="mt-3.5 rounded-2xl border border-indigo-300/20 bg-[#080a16]/90 p-2.5">
        <div className="mb-1.5 font-mono text-[9px] font-bold tracking-widest text-indigo-200/85">
          HORIZON SIDE VIEW
        </div>
        <div className="flex h-24 items-center justify-center rounded-xl border border-white/5 bg-[#050711] px-3 text-center font-mono text-[9px] leading-relaxed text-slate-400">
          {loadStatus === "loading"
            ? "LOADING NASA JPL HORIZONS GEOMETRY..."
            : loadStatus === "error"
            ? "GEOMETRY UNAVAILABLE. SEE ERROR BELOW."
            : loadStatus === "success"
            ? "SIMULATION CLOCK OUTSIDE THE ANALYZED WINDOW."
            : `SELECT ${site.name.toUpperCase()} FOR NASA GEOMETRY.`}
        </div>
      </div>
    );
  }

  const cx = 128;
  const cy = 86;
  const skyRadius = 66;

  const sunHorizontalSign =
    Math.sin((live.sunAzimuthDeg * Math.PI) / 180) >= 0 ? 1 : -1;
  const clampedSunEl = Math.max(-22, Math.min(88, live.sunElevationDeg));
  const sunDomeAngle =
    Math.PI / 2 - sunHorizontalSign * ((90 - clampedSunEl) * (Math.PI / 180));
  const sunX = cx + Math.cos(sunDomeAngle) * skyRadius;
  const sunY = cy - Math.sin(sunDomeAngle) * skyRadius;

  const earthHorizontalSign =
    Math.sin((live.earthAzimuthDeg * Math.PI) / 180) >= 0 ? 1 : -1;
  const clampedEarthEl = Math.max(-22, Math.min(88, live.earthElevationDeg));
  const earthDomeAngle =
    Math.PI / 2 -
    earthHorizontalSign * ((90 - clampedEarthEl) * (Math.PI / 180));
  const earthX = cx + Math.cos(earthDomeAngle) * (skyRadius - 10);
  const earthY = cy - Math.sin(earthDomeAngle) * (skyRadius - 10);

  const isSunAbove = live.sunVisible;
  const isEarthAbove = live.earthVisible;

  // Flat graphic for ideal-horizon mode; do not draw an invented terrain slope.
  const slopeRise =
    Math.tan((Math.min(25, terrainSlopeDeg ?? 0) * Math.PI) / 180) * 120;

  const shadowDir = sunX <= cx ? 1 : -1;
  const shadowLength = isSunAbove
    ? Math.max(16, Math.min(96, 102 - live.sunElevationDeg * 1.15))
    : 112;
  const shadowTipX = Math.max(8, Math.min(248, cx + shadowDir * shadowLength));
  const shadowTipY = cy + ((shadowTipX - cx) / 120) * slopeRise;

  return (
    <div className="mt-3.5 rounded-2xl border border-indigo-300/20 bg-[#080a16]/90 p-2.5">
      <div className="mb-1.5 flex items-center justify-between font-mono text-[9px] tracking-widest">
        <span className="font-bold text-indigo-200/85">HORIZON SIDE VIEW</span>
        <span className="text-slate-400">
          {terrainSlopeDeg === null ? "IDEAL 0° HORIZON" : `SLOPE ${metric(terrainSlopeDeg, "°")}`}
        </span>
      </div>

      <svg
        viewBox="0 0 256 122"
        className="h-24 w-full overflow-hidden rounded-xl border border-white/5 bg-[#050711]"
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
            {live.earthElevationDeg > 0 ? "+" : ""}{metric(live.earthElevationDeg, "", 1)}
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
            {live.sunElevationDeg > 0 ? "+" : ""}{metric(live.sunElevationDeg, "", 1)}
            °
          </text>
        </g>
      </svg>

      <div className="mt-1.5 flex items-center justify-between font-mono text-[9px]">
        <span className={isSunAbove ? "text-amber-200" : "text-slate-400"}>
          ☀ {isSunAbove ? "ILLUMINATED" : "LUNAR NIGHT"} (
          {Math.round(live.sunAzimuthDeg)}° AZ)
        </span>
        <span className={isEarthAbove ? "text-emerald-300" : "text-rose-300"}>
          ● {isEarthAbove ? "EARTH LOS" : "OCCULTED"}
        </span>
      </div>
      <div className="mt-1 font-mono text-[8px] tracking-wide text-slate-500">
        NASA SAMPLE {live.timeUtc.slice(0, 16).replace("T", " ")} UTC • 1H STEPS
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
  const [isMoreSettingsOpen, setIsMoreSettingsOpen] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isEpochMenuOpen, setIsEpochMenuOpen] = useState(false);
  const [isPinDropMode, setIsPinDropMode] = useState(false);
  const [showRovers, setShowRovers] = useState(true);
  const [showSolarShadows, setShowSolarShadows] = useState(true);
  const [showCelestial, setShowCelestial] = useState(true);

  // "More Settings" State: Landing Site Exclusion / Spacing Interval (km) & Timezone
  const [siteIntervalKm, setSiteIntervalKm] = useState<number>(25);
  const [selectedTimezoneId, setSelectedTimezoneId] = useState<string>("UTC");
  // Mission request controls: custom inputs are explicitly UTC, not browser-local time.
  const [customWindowEnabled, setCustomWindowEnabled] = useState(false);
  const [customMissionStart, setCustomMissionStart] = useState("2026-11-14T12:00");
  const [customMissionEnd, setCustomMissionEnd] = useState("2026-11-17T12:00");
  const [missionDurationDays, setMissionDurationDays] = useState(7);
  const [missionStepHours, setMissionStepHours] = useState(1);
  const [demoSpacecraftEnabled, setDemoSpacecraftEnabled] = useState(true);
  const [demoFields, setDemoFields] = useState<DemoFields>(DEFAULT_DEMO_FIELDS);

  // Lunar Traffic Filter & Expandable Mission Detail State
  const [trafficFilter, setTrafficFilter] = useState<
    "ALL" | MissionTrafficStatus
  >("ALL");
  const [expandedMissionId, setExpandedMissionId] = useState<string | null>(
    null
  );

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

  // Phase 4A: authoritative analysis for the selected landing site only.
  const [compareState, setCompareState] = useState<CompareState | null>(null);
  const [compareRetry, setCompareRetry] = useState(0);

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
  

  // UTC input fields are explicit so timezone changes never shift the actual epoch.
  // The existing timezone selector specifies the analysis/display timezone.
  const followEpochStartMs = Math.floor(activeTimestampMs / 1000) * 1000;
  const missionStartMs = customWindowEnabled
    ? Date.parse(`${customMissionStart}Z`)
    : followEpochStartMs;
  const missionEndMs = customWindowEnabled
    ? Date.parse(`${customMissionEnd}Z`)
    : missionStartMs + missionDurationDays * 86_400_000;
  const {spacecraft: parsedSpacecraft, error: spacecraftError} = useMemo(
    () => demoSpacecraftEnabled ? parseDemoSpacecraft(demoFields) : {spacecraft: undefined, error: null},
    [demoSpacecraftEnabled, demoFields]
  );
  const missionWindowError = !Number.isFinite(missionStartMs) || !Number.isFinite(missionEndMs)
    ? "Enter valid UTC mission start and end dates."
    : missionEndMs <= missionStartMs
    ? "Mission end must be later than mission start."
    : missionEndMs - missionStartMs > 31 * 86_400_000
    ? "Mission analysis is limited to 31 days."
    : Math.ceil((missionEndMs - missionStartMs) / (missionStepHours * 3_600_000)) + 1 > 800
    ? "Too many samples; increase the sampling interval."
    : null;
  const missionConfigError = missionWindowError ?? spacecraftError;
  const missionStartUtc = missionWindowError ? "" : new Date(missionStartMs).toISOString();
  const missionEndUtc = missionWindowError ? "" : new Date(missionEndMs).toISOString();
  const spacecraftFingerprint = JSON.stringify(parsedSpacecraft ?? {});
  const selectedSiteRequestKey = selectedSite && !missionConfigError
    ? `${selectedSite.id}|${selectedSite.lat}|${selectedSite.lon}|${missionStartUtc}|${missionEndUtc}|${selectedTimezoneId}|${missionStepHours}|${demoSpacecraftEnabled}|${spacecraftFingerprint}`
    : null;

  useEffect(() => {
    if (!selectedSite || !selectedSiteRequestKey) return;
    const requestKey = selectedSiteRequestKey;
    const requestSiteId = selectedSite.id;
    const controller = new AbortController();
    const request: MissionCompareRequest = {
      sites: [{
        id: selectedSite.id,
        name: selectedSite.name,
        lat: selectedSite.lat,
        lon: selectedSite.lon,
      }],
      startUtc: missionStartUtc,
      endUtc: missionEndUtc,
      timezone: TIMEZONE_OPTIONS.find((tz) => tz.id === selectedTimezoneId)?.timeZone ?? "UTC",
      stepHours: missionStepHours,
      terrainMode: "ideal_horizon",
      // Editable assumptions are intentionally identified as a demo profile in the UI.
      ...(parsedSpacecraft ? {spacecraft: parsedSpacecraft} : {}),
    };

    setCompareState({ key: requestKey, status: "loading" });
    async function loadSelectedSite() {
      try {
        const response = await fetch("/api/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
        const payload: unknown = await response.json();
        if (!response.ok) {
          throw new Error(compareErrorMessage(payload, `Analysis API returned HTTP ${response.status}`));
        }
        if (!payload || typeof payload !== "object" || !Array.isArray((payload as MissionCompareResponse).sites)) {
          throw new Error("Mission API returned an unexpected response");
        }
        const result = payload as MissionCompareResponse;
        const site = result.sites.find((entry) => entry.id === requestSiteId);
        if (!site || !Array.isArray(site.timeline) || site.timeline.length === 0 || !site.availability) {
          throw new Error("The selected landing site has no valid mission-analysis samples");
        }
        if (!controller.signal.aborted) {
          setCompareState({ key: requestKey, status: "success", site, response: result });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setCompareState({
            key: requestKey,
            status: "error",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    // Debouncing edits avoids launching multiple expensive Horizons requests per keystroke.
    const timeout = window.setTimeout(() => { void loadSelectedSite(); }, 350);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [selectedSite, selectedSiteRequestKey, missionStartUtc, missionEndUtc, selectedTimezoneId,
      missionStepHours, parsedSpacecraft, compareRetry]);

  // A previous site's response is never displayed while the next request loads.
  const activeCompareState = compareState?.key === selectedSiteRequestKey ? compareState : null;
  const analyzedSite = activeCompareState?.status === "success" ? activeCompareState.site : null;
  const initialGeometry = analyzedSite?.timeline[0] ?? null;
  const selectedAnalysisStatus = selectedSite
    ? (missionConfigError ? "error" : activeCompareState?.status ?? "loading")
    : "idle";


  const selectedSiteTraffic = useMemo(
    () => (selectedSite ? getSiteMissionTraffic(selectedSite) : []),
    [selectedSite]
  );

  // Reset expanded mission card when switching sites
  useEffect(() => {
    setExpandedMissionId(null);
  }, [selectedSiteId]);

  const activeTimezoneOption = useMemo(
    () =>
      TIMEZONE_OPTIONS.find((tz) => tz.id === selectedTimezoneId) ??
      TIMEZONE_OPTIONS[0],
    [selectedTimezoneId]
  );

  const handleSelectSite = useCallback(
    (site: { id: string; lat?: number }) => {
      setSelectedSiteId(site.id);
      if (
        is2DMode &&
        !site.id.startsWith("pinned-") &&
        typeof site.lat === "number"
      ) {
        setProjectionMode(site.lat < -65 ? "SP" : "EQ");
      }
    },
    [is2DMode]
  );

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
        body: JSON.stringify({
          query,
          sites,
          windowSummary,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to query AI advisor");

      const matched = sites.find((s) => s.id === data.selectedSiteId);
      if (matched) handleSelectSite(matched);
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
        handleSelectSite(winner);
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

  const filteredTraffic = useMemo(
    () =>
      trafficFilter === "ALL"
        ? selectedSiteTraffic
        : selectedSiteTraffic.filter((item) => item.status === trafficFilter),
    [selectedSiteTraffic, trafficFilter]
  );

  const proximityConflictsCount = useMemo(
    () =>
      selectedSiteTraffic.filter(
        (m) => m.status !== "PAST" && m.separationKm <= siteIntervalKm
      ).length,
    [selectedSiteTraffic, siteIntervalKm]
  );

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
        input[type="range"].lunav-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 4px;
          border-radius: 9999px;
          background: rgba(165, 180, 252, 0.2);
          outline: none;
        }
        input[type="range"].lunav-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 9999px;
          background: #c4b5fd;
          border: 2px solid #0f1328;
          box-shadow: 0 0 10px rgba(196, 181, 253, 0.9);
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
            siteIntervalKm={siteIntervalKm}
            siteTraffic={selectedSiteTraffic}
            highlightedTrafficId={expandedMissionId}
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

      {/* 3. Slide-out Left Sidebar (Search, Pinning, More Settings & Candidate List) */}
      <aside
        className={`fixed top-0 bottom-0 left-14 z-40 flex w-80 flex-col border-r border-indigo-300/15 bg-[#0f1328]/80 p-5 backdrop-blur-xl transition-transform duration-300 ease-out ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-5 flex items-center justify-between">
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
        <div className="mb-4 space-y-2" ref={epochDropdownRef}>
          <div className="flex items-center gap-2 font-mono text-[10px] font-semibold tracking-widest text-indigo-200/70">
            <Calendar className="h-3.5 w-3.5 text-indigo-300 drop-shadow-[0_0_6px_rgba(165,180,252,0.75)]" />{" "}
            MISSION EPOCH
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setIsEpochMenuOpen((o) => !o)}
              className="flex w-full items-center justify-between rounded-2xl border border-indigo-300/20 bg-[#171c38]/80 px-4 py-2 font-mono text-xs text-indigo-100 transition hover:border-indigo-300/45 focus:border-indigo-300 focus:outline-none"
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
        <div className="mb-4 space-y-2">
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

        {/* Collapsible "More Settings" Section (Landing Site Exclusion Interval & Timezone Selector) */}
        <div className="mb-4 rounded-2xl border border-indigo-300/20 bg-[#141830]/75 p-2.5">
          <button
            type="button"
            onClick={() => setIsMoreSettingsOpen((prev) => !prev)}
            className="flex w-full items-center justify-between font-mono text-[10px] font-bold tracking-widest text-indigo-200 transition hover:text-white"
          >
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="h-3.5 w-3.5 text-violet-300 drop-shadow-[0_0_6px_rgba(196,181,253,0.85)]" />
              MORE SETTINGS
            </span>
            <span className="flex items-center gap-1.5 text-[9px] text-indigo-300/80">
              <span>
                {siteIntervalKm}KM • {activeTimezoneOption.short} • {missionStepHours}H
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 ${
                  isMoreSettingsOpen ? "rotate-180" : ""
                }`}
              />
            </span>
          </button>

          {isMoreSettingsOpen && (
            <div className="mt-3 space-y-3 border-t border-indigo-300/15 pt-3">
              {/* Landing Site Exclusion / Interval Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between font-mono text-[9px] tracking-wider">
                  <span className="text-indigo-200/80">
                    SITE EXCLUSION INTERVAL
                  </span>
                  <span className="rounded-full bg-violet-400/20 px-2 py-0.5 font-bold text-violet-200">
                    {siteIntervalKm} KM
                  </span>
                </div>
                <input
                  type="range"
                  min={5}
                  max={150}
                  step={5}
                  value={siteIntervalKm}
                  onChange={(e) => setSiteIntervalKm(Number(e.target.value))}
                  className="lunav-slider w-full"
                />
                <div className="flex justify-between font-mono text-[8px] text-slate-400">
                  <span>5 KM</span>
                  <span>75 KM</span>
                  <span>150 KM</span>
                </div>
                <p className="font-mono text-[8px] leading-relaxed text-indigo-200/60">
                  Sets minimum separation radius on the 2D map & flags nearby
                  spacecraft inside {siteIntervalKm} km.
                </p>
              </div>

              {/* Timezone Selector */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 font-mono text-[9px] tracking-wider text-indigo-200/80">
                  <Clock className="h-3 w-3 text-indigo-300" />
                  <span>MISSION / DISPLAY TIMEZONE</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {TIMEZONE_OPTIONS.map((tz) => {
                    const active = tz.id === selectedTimezoneId;
                    return (
                      <button
                        key={tz.id}
                        type="button"
                        onClick={() => setSelectedTimezoneId(tz.id)}
                        className={`rounded-xl border py-1.5 font-mono text-[9px] font-bold tracking-wider transition ${
                          active
                            ? "border-indigo-300/60 bg-indigo-400/25 text-indigo-100 shadow-[0_0_10px_rgba(165,180,252,0.25)]"
                            : "border-white/5 bg-[#171c38]/80 text-slate-400 hover:border-indigo-300/30 hover:text-indigo-200"
                        }`}
                        title={tz.label}
                      >
                        {tz.short}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mission analysis window controls — all date inputs are UTC. */}
              <div className="space-y-2 border-t border-indigo-300/15 pt-3 font-mono">
                <div className="text-[10px] font-bold tracking-wider text-indigo-100">MISSION ANALYSIS WINDOW</div>
                <p className="text-[8px] leading-relaxed text-slate-400">UTC INPUTS • TIMEZONE ABOVE CONTROLS DISPLAY / API LABEL</p>
                <label className="flex items-center gap-2 text-[9px] text-indigo-200">
                  <input type="checkbox" checked={customWindowEnabled}
                    onChange={(e) => {
                      if (e.target.checked && !customWindowEnabled) {
                        setCustomMissionStart(new Date(followEpochStartMs).toISOString().slice(0, 16));
                        setCustomMissionEnd(new Date(followEpochStartMs + missionDurationDays * 86_400_000).toISOString().slice(0, 16));
                      }
                      setCustomWindowEnabled(e.target.checked);
                    }}
                    className="accent-indigo-400" />
                  USE EXPLICIT UTC START / END
                </label>
                {customWindowEnabled ? (
                  <div className="grid grid-cols-1 gap-2">
                    <label className="text-[9px] text-slate-300">START (UTC)
                      <input type="datetime-local" value={customMissionStart}
                        onChange={(e) => setCustomMissionStart(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-indigo-300/20 bg-[#171c38] px-2 py-1.5 text-[11px] text-indigo-100" />
                    </label>
                    <label className="text-[9px] text-slate-300">END (UTC)
                      <input type="datetime-local" value={customMissionEnd}
                        onChange={(e) => setCustomMissionEnd(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-indigo-300/20 bg-[#171c38] px-2 py-1.5 text-[11px] text-indigo-100" />
                    </label>
                  </div>
                ) : (
                  <label className="block text-[9px] text-slate-300">DURATION FROM MISSION EPOCH
                    <select value={missionDurationDays} onChange={(e) => setMissionDurationDays(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-indigo-300/20 bg-[#171c38] px-2 py-1.5 text-[10px] text-indigo-100">
                      {[1, 3, 7, 14, 30].map((days) => <option key={days} value={days}>{days} DAY{days > 1 ? "S" : ""}</option>)}
                    </select>
                  </label>
                )}
                <label className="block text-[9px] text-slate-300">SAMPLING INTERVAL
                  <select value={missionStepHours} onChange={(e) => setMissionStepHours(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-indigo-300/20 bg-[#171c38] px-2 py-1.5 text-[10px] text-indigo-100">
                    {[0.25, 0.5, 1, 2, 3, 6, 12, 24].map((h) => <option key={h} value={h}>{h < 1 ? `${h * 60} MIN` : `${h} HR`}</option>)}
                  </select>
                </label>
                <p className="text-[8px] leading-relaxed text-slate-400">Horizons observations are hourly; sub-hour samples use interpolation.</p>
              </div>

              {/* Explicit hypothetical spacecraft profile. Never imply verified mission hardware. */}
              <div className="space-y-2 border-t border-indigo-300/15 pt-3 font-mono">
                <div className="text-[10px] font-bold tracking-wider text-indigo-100">SPACECRAFT MODEL</div>
                <label className="flex items-start gap-2 text-[9px] text-indigo-200">
                  <input type="checkbox" checked={demoSpacecraftEnabled} onChange={(e) => setDemoSpacecraftEnabled(e.target.checked)}
                    className="mt-0.5 accent-indigo-400" />
                  ENABLE EDITABLE HYPOTHETICAL SPACECRAFT
                </label>
                <p className="text-[8px] leading-relaxed text-amber-200/75">
                  DEMONSTRATION ASSUMPTIONS ONLY • Not actual or verified mission specifications.
                </p>
                {demoSpacecraftEnabled && DEMO_FIELD_GROUPS.map((group) => (
                  <div key={group.title} className="space-y-1.5 rounded-xl border border-indigo-300/10 bg-[#0c1023]/70 p-2">
                    <div className="text-[9px] font-semibold text-indigo-300">{group.title}</div>
                    <div className="grid grid-cols-2 gap-2">
                      {group.fields.map((field) => (
                        <label key={field.key} className="min-w-0 text-[8px] leading-tight text-slate-400">
                          {field.label} ({field.unit})
                          <input type="number" step="any" value={demoFields[field.key]}
                            onChange={(e) => setDemoFields((prev) => ({...prev, [field.key]: e.target.value}))}
                            className="mt-1 w-full min-w-0 rounded-lg border border-indigo-300/20 bg-[#171c38] px-2 py-1.5 text-[10px] text-indigo-100" />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => setDemoFields(DEFAULT_DEMO_FIELDS)}
                  className="rounded-lg border border-indigo-300/25 px-2 py-1 text-[9px] text-indigo-200 hover:bg-indigo-300/10">
                  RESET DEMO ASSUMPTIONS
                </button>
              </div>
              {missionConfigError && (
                <p role="alert" className="rounded-lg border border-rose-300/25 bg-rose-400/10 p-2 text-[9px] text-rose-200">
                  {missionConfigError}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Ranked Options List: preview figures are not Phase 3C mission results yet. */}
        <div className="lunav-scroll flex-1 space-y-2.5 overflow-y-auto pr-1.5">
          <div className="sticky top-0 z-10 flex items-center justify-between bg-[#0f1328]/95 pt-1 pb-2 font-mono text-[10px] font-semibold tracking-widest text-indigo-200/70 backdrop-blur">
            <span>CANDIDATE SITES ({sites.length})</span>
            {allPinnedIds.length > 0 && (
              <span className="rounded-full bg-fuchsia-400/15 px-2 py-0.5 text-[9px] text-fuchsia-200">
                {allPinnedIds.length} PINNED
              </span>
            )}
          </div>

          <p className="mb-2 font-mono text-[8px] tracking-wide text-amber-200/70">
            PREVIEW SITE METRICS • NOT NASA-VALIDATED
          </p>
          {sites.map((site) => {
            const isCustomPin = site.id.startsWith("pinned-");
            const isPinned =
              isCustomPin || bookmarkedSiteIds.includes(site.id);

            return (
              <div
                key={site.id}
                onClick={() => handleSelectSite(site)}
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

      {/* 4. Right Popup (Selected Site Detail + Horizon Side View + Clickable Lunar Traffic) */}
      {selectedSite && (
        <aside className="lunav-scroll fixed top-6 right-6 z-40 max-h-[calc(100vh-145px)] w-[310px] overflow-y-auto rounded-3xl border border-indigo-300/25 bg-[#0f1328]/88 p-4 shadow-[0_12px_40px_rgba(15,23,42,0.65)] backdrop-blur-xl">
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

          <div className="mt-3.5 h-20 w-full overflow-hidden rounded-2xl border border-indigo-300/20">
            <MoonMap2D
              mode="thumbnail"
              sites={[selectedSite]}
              center={[selectedSite.lat, selectedSite.lon]}
              zoom={6}
            />
          </div>

          <SurfaceHorizonSideView
            site={selectedSite}
            baseEpochMs={customWindowEnabled ? missionStartMs : activeTimestampMs}
            subscribe={customWindowEnabled ? () => () => {} : subscribeEpoch}
            timeline={analyzedSite?.timeline ?? null}
            loadStatus={selectedAnalysisStatus}
            terrainSlopeDeg={analyzedSite?.terrain.localSlopeDeg ?? null}
          />

          <div className="mt-3 rounded-xl border border-indigo-300/15 bg-[#080a16]/60 px-2.5 py-2 font-mono text-[9px] leading-relaxed">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold tracking-wider text-indigo-200">NASA MISSION ANALYSIS</span>
              <span className={selectedAnalysisStatus === "success" ? "text-emerald-300" : selectedAnalysisStatus === "error" ? "text-rose-300" : "text-amber-200"}>
                {selectedAnalysisStatus === "success" ? "READY" : selectedAnalysisStatus === "error" ? "ERROR" : "LOADING"}
              </span>
            </div>
            {missionConfigError && (
              <p role="alert" className="mt-2 text-rose-200">{missionConfigError}</p>
            )}
            {selectedAnalysisStatus === "error" && !missionConfigError && activeCompareState?.status === "error" && (
              <div className="mt-2 space-y-2">
                <p role="alert" className="break-words text-rose-200">{activeCompareState.error}</p>
                <button
                  type="button"
                  onClick={() => setCompareRetry((value) => value + 1)}
                  className="rounded-lg border border-indigo-300/35 px-2 py-1 font-bold text-indigo-200 hover:bg-indigo-300/10"
                >
                  RETRY NASA ANALYSIS
                </button>
              </div>
            )}
            {selectedAnalysisStatus === "loading" && (
              <p role="status" className="mt-1 text-slate-400">Fetching Sun/Earth ephemeris for this landing site...</p>
            )}
            {analyzedSite && (
              <p className="mt-1 text-slate-400">
                JPL HORIZONS • {analyzedSite.model === "ideal_horizon" ? "IDEAL 0° HORIZON (NO LOLA)" : "TERRAIN-AWARE"}
                <span className="block">{missionStepHours} HR SAMPLES • ANGLES RELATIVE TO LOCAL LUNAR NORTH</span>
                <span className="block text-amber-200/80">{demoSpacecraftEnabled ? "POWER / RF: HYPOTHETICAL CONFIGURATION" : "POWER / RF: UNCONFIGURED"}</span>
              </p>
            )}
          </div>

          {/* Only Phase 3C values are shown here; no mock metric fallbacks. */}
          <div className="mt-3.5 space-y-2 font-mono text-[10px]">
            <div className="flex justify-between gap-2 border-b border-white/5 pb-1.5">
              <span className="shrink-0 text-slate-400">MISSION WINDOW</span>
              <span className="text-right text-[9px] text-indigo-200">
                {analyzedSite && activeCompareState?.status === "success"
                  ? `${activeCompareState.response.requestedStartUtc.slice(0, 16).replace("T", " ")} → ${activeCompareState.response.requestedEndUtc.slice(0, 16).replace("T", " ")} UTC`
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1.5">
              <span className="text-slate-400">SUNLIGHT AVAILABILITY</span>
              <span className="text-amber-200">{metric(analyzedSite?.availability.sunlightPercent, "%")}</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1.5">
              <span className="text-slate-400">EARTH VISIBILITY</span>
              <span className="text-emerald-300">{metric(analyzedSite?.availability.earthLosPercent, "%")}</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1.5">
              <span className="text-slate-400">SUN AZ / EL (START)</span>
              <span className="text-amber-200">
                {initialGeometry ? `${metric(initialGeometry.sunAzimuthDeg, "°")} / ${metric(initialGeometry.sunElevationDeg, "°")}` : "—"}
              </span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1.5">
              <span className="text-slate-400">EARTH AZ / EL (START)</span>
              <span className="text-emerald-300">
                {initialGeometry ? `${metric(initialGeometry.earthAzimuthDeg, "°")} / ${metric(initialGeometry.earthElevationDeg, "°")}` : "—"}
              </span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1.5">
              <span className="text-slate-400">SOLAR OUTPUT</span>
              <span className="text-amber-200">{metric(initialGeometry?.estimatedSolarPowerW, " W")}</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1.5">
              <span className="text-slate-400">RF BUDGET MARGIN (ASSUMED)</span>
              <span className="text-emerald-300">{metric(initialGeometry?.linkMarginDb, " dB")}</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1.5">
              <span className="text-slate-400">MINIMUM BATTERY CHARGE</span>
              <span className="text-amber-200">{metric(analyzedSite?.energySimulation?.minimumStateOfChargePercent, "%")}</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1.5">
              <span className="text-slate-400">ENERGY SUSTAINABLE</span>
              <span className={analyzedSite?.energySimulation?.powerSustained ? "text-emerald-300" : "text-rose-300"}>
                {analyzedSite?.energySimulation ? (analyzedSite.energySimulation.powerSustained ? "YES • DEMO" : "NO • DEMO") : "—"}
              </span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1.5">
              <span className="text-slate-400">LINK FEASIBILITY (START)</span>
              <span className={initialGeometry?.linkFeasible ? "text-emerald-300" : "text-rose-300"}>
                {initialGeometry?.linkFeasible == null ? "—" : initialGeometry.linkFeasible ? "PASS" : "NOT MET"}
              </span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1.5">
              <span className="text-slate-400">LINK AVAILABILITY</span>
              <span className="text-emerald-300">{metric(analyzedSite?.availability.linkAvailabilityPercent, "%")}</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1.5">
              <span className="text-slate-400">TERRAIN SLOPE</span>
              <span className="text-rose-300">{metric(analyzedSite?.terrain.localSlopeDeg, "°")}</span>
            </div>
            {analyzedSite && (initialGeometry?.estimatedSolarPowerW == null || initialGeometry.linkMarginDb == null) && (
              <p className="text-[9px] leading-relaxed text-slate-500">
                — = not configured or unavailable. Change spacecraft assumptions in MORE SETTINGS; RF range is assumed, not station-specific.
              </p>
            )}
          </div>

          {/* Clickable Lunar Traffic: Planned, Active & Past Missions */}
          <div className="mt-3.5 rounded-2xl border border-indigo-300/20 bg-[#080a16]/90 p-2.5">
            <div className="flex items-center justify-between font-mono text-[9px] tracking-widest">
              <span className="font-bold text-indigo-200">
                LUNAR TRAFFIC ({selectedSiteTraffic.length}) • DEMO
              </span>
              {proximityConflictsCount > 0 ? (
                <span className="flex items-center gap-1 rounded-full bg-amber-300/15 px-2 py-0.5 text-[8px] font-bold text-amber-200">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {proximityConflictsCount} &lt; {siteIntervalKm}KM
                </span>
              ) : (
                <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[8px] text-emerald-300">
                  CLEAR &gt; {siteIntervalKm}KM
                </span>
              )}
            </div>

            {/* Traffic Status Filter Pills */}
            <div className="mt-2 flex gap-1">
              {(["ALL", "PLANNED", "ACTIVE", "PAST"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setTrafficFilter(tab)}
                  className={`flex-1 rounded-lg py-1 font-mono text-[8px] font-bold tracking-wider transition ${
                    trafficFilter === tab
                      ? "bg-indigo-400/25 text-indigo-100"
                      : "bg-[#141830]/80 text-slate-400 hover:text-indigo-200"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Clickable Mission Traffic List */}
            <div className="mt-2 space-y-1.5">
              {filteredTraffic.map((mission) => {
                const isInsideInterval =
                  mission.status !== "PAST" &&
                  mission.separationKm <= siteIntervalKm;
                const isExpanded = expandedMissionId === mission.id;

                return (
                  <div
                    key={mission.id}
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      setExpandedMissionId((prev) =>
                        prev === mission.id ? null : mission.id
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setExpandedMissionId((prev) =>
                          prev === mission.id ? null : mission.id
                        );
                      }
                    }}
                    className={`cursor-pointer rounded-xl border p-2 font-mono transition-all ${
                      isExpanded
                        ? "border-fuchsia-300/55 bg-[#1a1738] shadow-[0_0_16px_rgba(192,132,252,0.2)]"
                        : isInsideInterval
                        ? "border-amber-200/35 bg-amber-300/10 hover:border-amber-200/60"
                        : "border-white/5 bg-[#12162e]/85 hover:border-indigo-300/35 hover:bg-[#171c3a]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-[10px] font-bold text-indigo-50">
                        {mission.spacecraft}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold ${
                            mission.status === "PLANNED"
                              ? "bg-fuchsia-400/20 text-fuchsia-200"
                              : mission.status === "ACTIVE"
                              ? "bg-emerald-400/20 text-emerald-300"
                              : "bg-slate-500/20 text-slate-300"
                          }`}
                        >
                          {mission.status}
                        </span>
                        <ChevronDown
                          className={`h-3 w-3 text-indigo-300/70 transition-transform duration-200 ${
                            isExpanded ? "rotate-180 text-fuchsia-200" : ""
                          }`}
                        />
                      </div>
                    </div>

                    <div className="mt-0.5 flex items-center justify-between text-[8px] text-slate-400">
                      <span>{mission.agency}</span>
                      <span>
                        {mission.windowOrDate} • {mission.separationKm} KM
                      </span>
                    </div>

                    <div className="mt-1 text-[8px] text-indigo-200/75">
                      {mission.note}
                    </div>

                    {/* Expanded Brief Mission Description Drawer */}
                    {isExpanded && (
                      <div className="mt-2 space-y-1.5 border-t border-indigo-300/20 pt-2 text-[8.5px] leading-relaxed">
                        <div className="flex items-center justify-between text-[8px] font-bold tracking-wider text-fuchsia-200">
                          <span>OBJ: {mission.objective.toUpperCase()}</span>
                        </div>
                        <p className="text-slate-200">
                          {mission.briefDescription}
                        </p>
                        <div className="flex items-center justify-between pt-0.5 text-[8px] text-indigo-300/80">
                          <span>BEARING {mission.bearingDeg}°</span>
                          <span
                            className={
                              isInsideInterval
                                ? "font-bold text-amber-200"
                                : "text-emerald-300"
                            }
                          >
                            {mission.status === "PAST"
                              ? "HISTORICAL ARCHIVE"
                              : isInsideInterval
                              ? `INSIDE ${siteIntervalKm}KM ZONE`
                              : `OUTSIDE ${siteIntervalKm}KM ZONE`}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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
            AI MISSION ADVISOR • PREVIEW
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
            onClick={() => {
              setProjectionMode("EQ");
              if (selectedSite && selectedSite.lat < -65) {
                setSelectedSiteId(null);
              }
            }}
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
            <LiveClockText
              initialMs={activeTimestampMs}
              timezoneOption={activeTimezoneOption}
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
            onClick={() => setTimeScale(10000)}
            className={`rounded-full p-1.5 transition ${
              timeScale === 10000
                ? "bg-indigo-400/25 text-indigo-100 shadow-[0_0_10px_rgba(165,180,252,0.28)]"
                : "text-slate-400 hover:text-indigo-200"
            }`}
            title="Fast Forward 10,000x (~2.8 hrs/sec)"
          >
            <FastForward
              className={`h-3 w-3 ${
                timeScale === 10000
                  ? "drop-shadow-[0_0_5px_rgba(199,210,254,0.9)]"
                  : ""
              }`}
            />
          </button>
          <button
            type="button"
            onClick={() => setTimeScale(250000)}
            className={`flex items-center -space-x-1.5 rounded-full px-2 py-1.5 transition ${
              timeScale === 250000
                ? "bg-violet-400/30 text-violet-100 shadow-[0_0_12px_rgba(196,181,253,0.32)]"
                : "text-slate-400 hover:text-indigo-200"
            }`}
            title="Planetary Warp 250,000x (~2.9 days/sec)"
          >
            <FastForward
              className={`h-3 w-3 ${
                timeScale === 250000
                  ? "drop-shadow-[0_0_5px_rgba(221,214,254,0.95)]"
                  : ""
              }`}
            />
            <FastForward
              className={`h-3 w-3 ${
                timeScale === 250000
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