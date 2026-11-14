"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  Compass,
  Sun,
  Radio,
  Calendar,
  MapPin,
  Bot,
  ArrowRight,
  ArrowLeft,
  Orbit,
  RotateCcw,
} from "lucide-react";
import {
  evaluateSitesForSchedule,
  evaluateCustomCoordinate,
  WhenPreset,
  getLunarCelestialAngles,
} from "@/utils/lunarEphemeris";

const INITIAL_EPOCH_MS = Date.UTC(2026, 10, 14, 12, 0, 0);

function formatUtcTimestamp(ms: number): string {
  const iso = new Date(ms).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}

const MoonGlobe = dynamic(() => import("@/components/MoonGlobe"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm tracking-widest text-sky-400">
      INITIALIZING LUNAR TELEMETRY...
    </div>
  ),
});

const MoonMap2D = dynamic(() => import("@/components/MoonMap2D"), {
  ssr: false,
});

// Lightweight isolated clock readout so 250ms simulation ticks never re-render the main page
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

export default function MissionControlPage() {
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [is2DMode, setIs2DMode] = useState(false);

  const [showCelestial, setShowCelestial] = useState(true);
  const [showRovers, setShowRovers] = useState(true);
  const [timeScale, setTimeScale] = useState<number>(1);
  const [clockResetNonce, setClockResetNonce] = useState<number>(0);

  const [referenceNowMs, setReferenceNowMs] = useState<number>(INITIAL_EPOCH_MS);
  const [whenPreset, setWhenPreset] = useState<WhenPreset>("suggested");
  const [customDate, setCustomDate] = useState<string>("2026-11-14");
  const [isRoverThinking, setIsRoverThinking] = useState(false);

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

  const [showWherePicker, setShowWherePicker] = useState(false);
  const [targetCoords, setTargetCoords] = useState<{
    lat: number;
    lon: number;
  } | null>(null);
  const [appliedCoords, setAppliedCoords] = useState<{
    lat: number;
    lon: number;
  } | null>(null);

  const [roverInput, setRoverInput] = useState("");
  const [roverReply, setRoverReply] = useState(
    "Ready. Enter power, comms, or terrain slope constraints (e.g., 'flat slope and max power') to rank and focus the optimal landing zone."
  );

  const { sites, activeTimestampMs, windowSummary } = useMemo(() => {
    const result = evaluateSitesForSchedule(
      whenPreset,
      customDate,
      referenceNowMs
    );

    if (appliedCoords) {
      const customSite = evaluateCustomCoordinate(
        appliedCoords.lat,
        appliedCoords.lon,
        whenPreset,
        customDate,
        referenceNowMs
      );

      const sortedNearby = [...result.sites].sort((a, b) => {
        const distA = Math.hypot(
          a.lat - appliedCoords.lat,
          a.lon - appliedCoords.lon
        );
        const distB = Math.hypot(
          b.lat - appliedCoords.lat,
          b.lon - appliedCoords.lon
        );
        return distA - distB;
      });

      return { ...result, sites: [customSite, ...sortedNearby] };
    }

    return result;
  }, [whenPreset, customDate, appliedCoords, referenceNowMs]);

  const selectedSite = useMemo(
    () => sites.find((s) => s.id === selectedSiteId) ?? null,
    [sites, selectedSiteId]
  );

  const handleSelectSite = useCallback((site: { id: string }) => {
    setSelectedSiteId(site.id);
  }, []);

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

  const handleSearch = () => {
    setShowWherePicker(false);
    setAppliedCoords(targetCoords);
    if (targetCoords) {
      setSelectedSiteId(
        `custom-target-${targetCoords.lat.toFixed(2)}-${targetCoords.lon.toFixed(2)}`
      );
    } else {
      setSelectedSiteId(null);
    }
  };

  const handleNextResult = () => {
    if (!selectedSite) return;
    const currentIndex = sites.findIndex((s) => s.id === selectedSite.id);
    const nextSite = sites[(currentIndex + 1) % sites.length];
    setSelectedSiteId(nextSite.id);
  };

  const handleRoverAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = roverInput.trim();
    if (!query || isRoverThinking) return;

    setRoverInput("");
    setIsRoverThinking(true);
    setRoverReply("Analyzing ephemeris, power, and slope telemetry via Gemini...");

    try {
      const res = await fetch("/api/rover-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          sites,
          windowSummary,
          liveEpochUtc: formatUtcTimestamp(activeTimestampMs),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Advisor request failed");

      const matched = sites.find((s) => s.id === data.selectedSiteId);
      if (matched) {
        setSelectedSiteId(matched.id);
      }
      setRoverReply(data.reasoning);
    } catch (err: any) {
      setRoverReply(
        `Advisor error: ${err.message || "Check GEMINI_API_KEY in .env.local and restart the dev server."}`
      );
    } finally {
      setIsRoverThinking(false);
    }
  };

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-black font-sans text-slate-100">
      <div className="absolute inset-0 z-0">
        {is2DMode ? (
          <MoonMap2D
            mode="full"
            sites={sites}
            selectedSite={selectedSite}
            showRovers={showRovers}
            timeScale={timeScale}
            activeTimestampMs={activeTimestampMs}
            clockResetNonce={clockResetNonce}
            onSelectSite={handleSelectSite}
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
            onSelectSite={handleSelectSite}
            onEpochUpdate={handleEpochUpdate}
          />
        )}
      </div>

      <header className="absolute top-4 left-1/2 z-20 flex flex-col items-center -translate-x-1/2">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-700/80 bg-slate-950/92 px-4 py-2.5 shadow-2xl">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-sky-400" />
            <span className="text-xs font-semibold text-slate-400">WHEN:</span>
            <select
              value={whenPreset}
              onChange={(e) => setWhenPreset(e.target.value as WhenPreset)}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-white focus:border-sky-500 focus:outline-none"
            >
              <option value="suggested">Auto-Suggested Optimal</option>
              <option value="3d">Next 3 Days</option>
              <option value="1w">Next 1 Week</option>
              <option value="1m">Next 1 Month</option>
              <option value="custom">Specific Date...</option>
            </select>

            {whenPreset === "custom" && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white focus:border-sky-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => jumpToLunarPhase(0.5)}
                  title="Jump to Next Full Moon (Peak Near-Side Illumination)"
                  className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/20"
                >
                  Full Moon
                </button>
                <button
                  type="button"
                  onClick={() => jumpToLunarPhase(0.0)}
                  title="Jump to Next New Moon (Near-Side Lunar Night)"
                  className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-[10px] font-semibold text-slate-300 hover:bg-slate-700"
                >
                  New Moon
                </button>
              </div>
            )}
          </div>

          <span className="text-slate-700">|</span>

          <button
            type="button"
            onClick={() => setShowWherePicker(!showWherePicker)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs hover:border-sky-500"
          >
            <MapPin className="h-3.5 w-3.5 text-rose-400" />
            <span>
              {targetCoords
                ? `${targetCoords.lat}°, ${targetCoords.lon}°`
                : "WHERE: Suggested Sites"}
            </span>
          </button>

          <button
            type="button"
            onClick={handleSearch}
            className="rounded-xl bg-sky-500 px-4 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-sky-400"
          >
            Enter
          </button>
        </div>

        <div className="mt-1.5 flex items-center gap-2 rounded-full border border-slate-800/90 bg-slate-950/92 px-3.5 py-0.5 text-[11px] shadow-lg">
          <span className="font-mono text-emerald-300">
            <LiveUtcText
              initialMs={activeTimestampMs}
              subscribe={subscribeEpoch}
            />
          </span>
          <span className="text-slate-600">•</span>
          <span className="text-sky-300">
            Window: <span className="font-semibold">{windowSummary}</span>
          </span>
        </div>

        {showWherePicker && (
          <div className="mt-2 w-[440px] rounded-2xl border border-slate-700 bg-slate-950/95 p-3.5 shadow-2xl">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-slate-300">
                Click map or enter coordinates:
              </span>
              {targetCoords && (
                <button
                  type="button"
                  onClick={() => {
                    setTargetCoords(null);
                    setAppliedCoords(null);
                  }}
                  className="text-rose-400 hover:underline"
                >
                  Clear Pin
                </button>
              )}
            </div>

            <div className="mb-2.5 flex gap-2">
              <input
                type="number"
                step="0.01"
                placeholder="Latitude (-90 to 90)"
                value={targetCoords?.lat ?? ""}
                onChange={(e) =>
                  setTargetCoords({
                    lat: Number(e.target.value),
                    lon: targetCoords?.lon ?? 0,
                  })
                }
                className="w-1/2 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Longitude (-180 to 180)"
                value={targetCoords?.lon ?? ""}
                onChange={(e) =>
                  setTargetCoords({
                    lat: targetCoords?.lat ?? 0,
                    lon: Number(e.target.value),
                  })
                }
                className="w-1/2 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs"
              />
            </div>

            <div className="h-52 w-full overflow-hidden rounded-xl border border-slate-800">
              <MoonMap2D
                mode="picker"
                zoom={1}
                pickedCoords={targetCoords}
                onPickCoords={(coords) => setTargetCoords(coords)}
              />
            </div>
          </div>
        )}
      </header>

      <aside className="absolute top-4 bottom-4 left-4 z-10 flex w-72 flex-col justify-between rounded-2xl border border-slate-800 bg-slate-950/92 p-4 shadow-2xl">
        <div className="space-y-3.5">
          <div className="flex items-center gap-2">
            <Compass className="h-6 w-6 text-sky-400" />
            <div>
              <h1 className="text-base font-bold tracking-widest text-white">
                LUNAV
              </h1>
              <p className="text-[10px] tracking-wider text-slate-400 uppercase">
                Lunar Landing Mission Control
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
              Viewport &amp; Map Layers
            </p>
            <button
              type="button"
              onClick={() => setIs2DMode(!is2DMode)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-left text-xs font-medium transition hover:border-sky-500"
            >
              {is2DMode
                ? "🌐 Switch to 3D Globe POV"
                : "🗺️ Switch to 2D Map POV"}
            </button>

            <button
              type="button"
              onClick={() => setShowRovers(!showRovers)}
              className={`w-full rounded-xl border px-3 py-2 text-left text-xs font-medium transition ${
                showRovers
                  ? "border-emerald-500/80 bg-emerald-500/15 text-emerald-200"
                  : "border-slate-700 bg-slate-900 text-slate-300 hover:border-sky-500"
              }`}
            >
              🚜 Live Surface Rovers: {showRovers ? "ON" : "OFF"}
            </button>
          </div>

          <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-sky-400 uppercase">
                <Orbit className="h-3.5 w-3.5" /> Telemetry Clock
              </span>
              {!is2DMode && (
                <button
                  type="button"
                  onClick={() => setShowCelestial(!showCelestial)}
                  className="text-[11px] text-slate-300 hover:text-sky-400"
                >
                  {showCelestial ? "Hide Orbits" : "Show Orbits"}
                </button>
              )}
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/90 px-2.5 py-1.5 font-mono text-[11px] text-emerald-300">
              <LiveUtcText
                initialMs={activeTimestampMs}
                subscribe={subscribeEpoch}
              />
            </div>

            <div className="grid grid-cols-6 gap-1 pt-0.5">
              {[
                { label: "Pause", val: 0 },
                { label: "1x", val: 1 },
                { label: "10x", val: 10 },
                { label: "100x", val: 100 },
                { label: "1Kx", val: 1000 },
                { label: "10Kx", val: 10000 },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setTimeScale(opt.val)}
                  className={`rounded-md py-1 text-[10px] font-bold transition ${
                    timeScale === opt.val
                      ? "bg-sky-500 text-slate-950"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between pt-0.5">
              <p className="text-[10px] text-slate-400">
                {timeScale === 0
                  ? "Simulation paused"
                  : timeScale === 1
                  ? "1x Real-time ephemeris"
                  : `${timeScale.toLocaleString()}x Ephemeris warp`}
              </p>
              <button
                type="button"
                onClick={() => {
                  setTimeScale(1);
                  setClockResetNonce((n) => n + 1);
                }}
                title="Reset simulation clock back to target date"
                className="flex items-center gap-1 text-[10px] font-semibold text-sky-400 hover:text-sky-300"
              >
                <RotateCcw className="h-2.5 w-2.5" /> Reset
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-400">
            <Bot className="h-4 w-4" />
            <span>AI ROVER ADVISOR</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            {roverReply}
          </p>
          <form onSubmit={handleRoverAsk} className="mt-2.5 flex gap-1.5">
            <input
              type="text"
              value={roverInput}
              onChange={(e) => setRoverInput(e.target.value)}
              disabled={isRoverThinking}
              placeholder="e.g. Flat slope and max power..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white focus:border-sky-500 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isRoverThinking}
              className="rounded-lg bg-sky-500 px-2.5 py-1.5 text-xs font-bold text-slate-950 disabled:opacity-50"
            >
              {isRoverThinking ? "..." : "Ask"}
            </button>
          </form>
        </div>
      </aside>

      <aside className="absolute top-4 right-4 bottom-4 z-10 w-80 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/92 p-4 shadow-2xl">
        {selectedSite ? (
          <div className="flex h-full flex-col justify-between">
            <div>
              <button
                type="button"
                onClick={() => setSelectedSiteId(null)}
                className="flex items-center gap-1 text-xs text-sky-400 hover:underline"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to Candidates
              </button>

              <h2 className="mt-3 text-lg font-bold text-white">
                {selectedSite.name}
              </h2>
              <p className="text-xs text-slate-400">
                {selectedSite.region} • {selectedSite.lat}°, {selectedSite.lon}°
              </p>

              <div className="mt-3 h-32 w-full overflow-hidden rounded-xl border border-slate-800">
                <MoonMap2D
                  mode="thumbnail"
                  sites={[selectedSite]}
                  center={[selectedSite.lat, selectedSite.lon]}
                  zoom={6}
                />
              </div>

              <div className="mt-4 space-y-2.5 rounded-xl border border-slate-800 bg-slate-900/90 p-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Evaluated Window</span>
                  <span className="font-medium text-sky-300">
                    {selectedSite.recommended_window}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Sunlight (Power)</span>
                  <span className="font-semibold text-amber-400">
                    {selectedSite.sunlight_percent}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Comms Link Window</span>
                  <span className="font-semibold text-emerald-400">
                    {selectedSite.comms_window_hours} hrs/day
                  </span>
                </div>
                <hr className="border-slate-800" />
                <div className="flex justify-between">
                  <span className="text-slate-400">Sun Azimuth / Elev</span>
                  <span>
                    {selectedSite.sun_azimuth}° / {selectedSite.sun_elevation}°
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Earth Azimuth / Elev</span>
                  <span>
                    {selectedSite.earth_azimuth}° /{" "}
                    {selectedSite.earth_elevation}°
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Mean Terrain Slope</span>
                  <span>{selectedSite.slope_deg}°</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleNextResult}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-sky-500 py-2.5 text-xs font-bold text-slate-950 transition hover:bg-sky-400"
            >
              <span>Next Landing Site</span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Ranked Landing Sites ({sites.length})
            </h2>

            {sites.map((site) => (
              <div
                key={site.id}
                onClick={() => setSelectedSiteId(site.id)}
                className="cursor-pointer overflow-hidden rounded-xl border border-slate-800 bg-slate-900/90 transition hover:border-sky-500"
              >
                <div className="h-24 w-full">
                  <MoonMap2D
                    mode="thumbnail"
                    sites={[site]}
                    center={[site.lat, site.lon]}
                    zoom={5}
                  />
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-white">
                      {site.name}
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {site.lat}°, {site.lon}° • {site.recommended_window}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1 text-amber-400">
                      <Sun className="h-3.5 w-3.5" /> {site.sunlight_percent}%
                      Power
                    </span>
                    <span className="flex items-center gap-1 text-emerald-400">
                      <Radio className="h-3.5 w-3.5" />{" "}
                      {site.comms_window_hours}h Link
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </aside>
    </main>
  );
}