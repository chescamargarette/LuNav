"use client";

import { useState } from "react";
import { MISSION_REFERENCES } from "../../../utils/missionReferences";
import type {
  EphemerisRow,
  HorizonProfile,
  SpacecraftSpecs,
} from "../../../utils/terrainAnalysis";

type TestMode = "ideal" | "synthetic" | "profile" | "auto";

type CompareSite = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  model: "ideal_horizon" | "terrain_aware";
  terrain: {
    siteElevationM: number | null;
    localSlopeDeg: number | null;
    footprintSurfaceAreaM2: number | null;
    footprintRadiusM?: number | null;
  };
  terrainCatalogId?: string | null;
  energySimulation?: {finalStateOfChargePercent:number;minimumStateOfChargePercent:number;firstPowerShortfallUtc:string|null;unservedLoadWh:number;powerSustained:boolean;timeline:{timeUtc:string;stateOfChargePercent:number}[]} | null;
  legsAnalysis?: {budget:{linkMarginDb?:number;powerMarginDb?:number;budgetAboveThreshold:boolean};candidateTimeline:{candidateOnly:boolean}[];actualContactAvailabilityPercent:null} | null;
  legsNetworkAnalysis?: {model:string;groundMinimumElevationDeg:number;modeledStationCount:number;modeledNetworkContactPercent:number|null;actualOperationalAvailability:null;
    stationResults:{stationId:string;status:string;modeledContactPercent:number|null;modeledContactHours?:number;reason:string;
      samples:{timeUtc:string;lunarElevationDeg:number;lunarHorizonDeg:number;groundMoonElevationDeg:number;
        slantRangeKm:number;linkMarginDb:number;geometricLinkAvailable:boolean}[];
      windows:{startUtc:string;endUtc:string;durationHours:number}[]}[];
    networkUnionSampled:{timeUtc:string;availableStations:string[];bestStationId:string|null;bestMarginDb:number|null}[];
    warnings:string[]}|null;
  energy?: { batteryEnduranceHours: number | null; batterySurvivesLongestDarkness: boolean | null; note: string };
  linkBudget?: { effectiveEirpDbm: number | null; sensitivityDbm: number | null; aggregateOtherLossDb: number | null; rangeKm: number | null };
  timeline: EphemerisRow[];
  availability: {
    evaluatedHours: number;
    requestedHours: number;
    unevaluatedHours: number;
    coveragePercent: number;
    sunlightHours: number;
    earthLosHours: number;
    simultaneousSunEarthHours: number;
    sunlightPercent: number;
    earthLosPercent: number;
    simultaneousSunEarthPercent: number;
    longestDarknessHours: number;
    longestEarthBlackoutHours: number;
    linkAvailabilityPercent: number | null;
  };
  assumptions: {
    dataQuality: string;
    earthDistanceSource: string;
  };
  suitability: string;
  warnings: string[];
};

type CompareResponse = {
  application: string;
  source: string;
  stepHours: number;
  missionReference?: {id:string;label:string;published:{roverPublishedPowerW:number|null;landerPublishedPowerW:number|null;communicationArchitecture:string};warnings:string[]} | null;
  ephemerisSamplingMethod?: string;
  requestedStartUtc: string;
  requestedEndUtc: string;
  sites: CompareSite[];
  warnings: string[];
};

function fmt(value: number | null | undefined, digits = 2): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(digits)
    : "N/A";
}

function pct(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(1)}%`
    : "N/A";
}

function buildSyntheticProfile(lat: number, lon: number): HorizonProfile {
  return {
    points: Array.from({ length: 360 }, (_, azimuthDeg) => ({
      azimuthDeg,
      horizonElevationDeg:
        0.25 +
        1.7 * Math.max(0, Math.cos(((azimuthDeg - 100) * Math.PI) / 180)),
    })),
    provenance: {
      source: "SYNTHETIC TEST FIXTURE — NOT NASA LOLA DATA",
      coordinateFrame: "SIMULATED LOCAL AZIMUTH; NOT GEODETICALLY VERIFIED",
      heightDatum: "Not applicable: arbitrary test angles",
      observerHeightM: 1,
      siteLatitudeDeg: lat,
      siteLongitudeDeg: lon,
      method: "Synthetic ridge function for testing interpolation and visibility",
    },
  };
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/80 p-4">
      <p className="text-sm text-slate-300">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      {note && <p className="mt-1 text-xs text-slate-400">{note}</p>}
    </div>
  );
}

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-white outline-none focus:border-blue-500";

export default function HorizonsPlayground() {
  const [latitude, setLatitude] = useState("-89.5");
  const [longitude, setLongitude] = useState("0");
  const [startDate, setStartDate] = useState("2026-12-10");
  const [stopDate, setStopDate] = useState("2026-12-11");
  const [stepHours, setStepHours] = useState("1");
  const [startTime, setStartTime] = useState("00:00");
  const [stopTime, setStopTime] = useState("00:00");
  const [utcOffset, setUtcOffset] = useState("Z");
  const [displayTimezone, setDisplayTimezone] = useState("UTC");
  const [missionRef, setMissionRef] = useState("");
  const [initialSoc, setInitialSoc] = useState("100");
  const [chargeEff, setChargeEff] = useState("85");
  const [reservePct, setReservePct] = useState("0");
  const [legsEnabled, setLegsEnabled] = useState(false);
  const [legsGeometryEnabled, setLegsGeometryEnabled] = useState(false);
  const [legsGroundMinElevation, setLegsGroundMinElevation] = useState("10");
  const [australiaRepresentative, setAustraliaRepresentative] = useState(false);
  const [australiaLat, setAustraliaLat] = useState("-28.77");
  const [australiaLon, setAustraliaLon] = useState("114.61");
  const [legsStation, setLegsStation] = useState("legs1-white-sands");
  const [legsDirection, setLegsDirection] = useState<"return"|"forward">("return");
  const [legsBand, setLegsBand] = useState<"X"|"Ka">("X");
  const [legsTxEirpDbw, setLegsTxEirpDbw] = useState("30");
  const [legsBitRate, setLegsBitRate] = useState("100000");
  const [legsRequiredEbN0, setLegsRequiredEbN0] = useState("4");
  const [mode, setMode] = useState<TestMode>("ideal");
  const [profileJson, setProfileJson] = useState("");
  const [profileFileName, setProfileFileName] = useState("");

  const [panelArea, setPanelArea] = useState("2");
  const [panelEfficiency, setPanelEfficiency] = useState("25");
  const [panelTilt, setPanelTilt] = useState("80");
  const [panelFacing, setPanelFacing] = useState("180");
  const [minPower, setMinPower] = useState("20");

  const [includeRf, setIncludeRf] = useState(true);
  const [rfFrequency, setRfFrequency] = useState("2200");
  const [rfEirp, setRfEirp] = useState("60");
  const [rfGain, setRfGain] = useState("35");
  const [rfSensitivity, setRfSensitivity] = useState("-120");
  const [rfRange, setRfRange] = useState("384400");
  const [rfLoss, setRfLoss] = useState("2");
  const [minMargin, setMinMargin] = useState("0");
  const [batteryWh, setBatteryWh] = useState("250");
  const [averageLoadW, setAverageLoadW] = useState("50");
  const [rfModel, setRfModel] = useState<"direct" | "components">("direct");
  const [txPower, setTxPower] = useState("30");
  const [txGain, setTxGain] = useState("10");
  const [txCableLoss, setTxCableLoss] = useState("1");
  const [rxNoiseFigure, setRxNoiseFigure] = useState("3");
  const [rxBandwidth, setRxBandwidth] = useState("100000");
  const [requiredSnr, setRequiredSnr] = useState("8");
  const [polarizationLoss, setPolarizationLoss] = useState("0");
  const [pointingLoss, setPointingLoss] = useState("0");

  const [result, setResult] = useState<CompareResponse | null>(null);
  const [resultMode, setResultMode] = useState<TestMode>("ideal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);

  function requiredNumber(raw: string, label: string): number {
    if (raw.trim() === "") throw new Error(`${label} is required.`);
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error(`${label} must be a valid number.`);
    return value;
  }

  async function analyze() {
    setLoading(true);
    setError("");
    setResult(null);
    setShowAll(false);

    try {
      const lat = requiredNumber(latitude, "Latitude");
      const lon = requiredNumber(longitude, "Longitude");
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        throw new Error("Latitude must be -90 to 90; longitude must be -180 to 180.");
      }
      const step = requiredNumber(stepHours, "Sampling interval");
      if (step < 0.25 || step > 24) throw new Error("Sampling interval must be 0.25–24 hours.");
      const startInstant = `${startDate}T${startTime}:00${utcOffset}`;
      const endInstant = `${stopDate}T${stopTime}:00${utcOffset}`;
      const durationHours = (Date.parse(endInstant) - Date.parse(startInstant)) / 3_600_000;
      if (!Number.isFinite(durationHours) || durationHours <= 0 || durationHours > 31 * 24)
        throw new Error("Select a positive mission interval of at most 31 days.");
      if (Math.ceil(durationHours / step) + 1 > 800)
        throw new Error("Too many samples. Increase the sampling interval.");

      const spacecraft: SpacecraftSpecs = {
        solarPanelAreaM2: requiredNumber(panelArea, "Panel area"),
        solarPanelEfficiency: requiredNumber(panelEfficiency, "Panel efficiency") / 100,
        panelTiltDeg: requiredNumber(panelTilt, "Panel tilt"),
        panelFacingAzimuthDeg: requiredNumber(panelFacing, "Panel facing azimuth"),
        minSolarPowerW: requiredNumber(minPower, "Minimum solar power"),
        batteryCapacityWh: requiredNumber(batteryWh, "Battery capacity"),
        averageElectricalLoadW: requiredNumber(averageLoadW, "Average electrical load"),
        initialBatterySocPercent: requiredNumber(initialSoc, "Initial battery SOC"),
        batteryChargeEfficiency: requiredNumber(chargeEff, "Battery charge efficiency") / 100,
        batteryReservePercent: requiredNumber(reservePct, "Battery reserve") ,
      };
      if (includeRf) {
        Object.assign(spacecraft, {
          radioFrequencyMHz: requiredNumber(rfFrequency, "RF frequency"),
          ...(rfModel === "direct"
            ? { transmitterEirpDbm: requiredNumber(rfEirp, "Transmitter EIRP"),
                receiverSensitivityDbm: requiredNumber(rfSensitivity, "Receiver sensitivity") }
            : { transmitterPowerDbm: requiredNumber(txPower, "Transmitter power"),
                transmitterAntennaGainDbi: requiredNumber(txGain, "Transmitter antenna gain"),
                transmitterCableLossDb: requiredNumber(txCableLoss, "Transmitter cable loss"),
                receiverNoiseFigureDb: requiredNumber(rxNoiseFigure, "Receiver noise figure"),
                receiverBandwidthHz: requiredNumber(rxBandwidth, "Receiver bandwidth"),
                requiredSnrDb: requiredNumber(requiredSnr, "Required SNR") }),
          receiverGainDbi: requiredNumber(rfGain, "Receiver gain"),
          polarizationLossDb: requiredNumber(polarizationLoss, "Polarization loss"),
          pointingLossDb: requiredNumber(pointingLoss, "Pointing loss"),
          earthDistanceKm: requiredNumber(rfRange, "Assumed Earth range"),
          otherLinkLossDb: requiredNumber(rfLoss, "Other RF losses"),
          minLinkMarginDb: requiredNumber(minMargin, "Minimum link margin"),
        });
      }

      let horizonProfile: HorizonProfile | undefined;
      if (mode === "synthetic") {
        horizonProfile = buildSyntheticProfile(lat, lon);
      }
      if (mode === "profile") {
        try {
          horizonProfile = JSON.parse(profileJson) as HorizonProfile;
        } catch {
          throw new Error("The horizon profile must be valid JSON.");
        }
        if (
          !horizonProfile ||
          !Array.isArray(horizonProfile.points) ||
          !horizonProfile.provenance
        ) {
          throw new Error("Profile JSON needs points[] and provenance.");
        }
      }

      const payload = {
        sites: [
          {
            id: missionRef || "dev-test-site",
            name: MISSION_REFERENCES.find(m=>m.id===missionRef)?.label ?? "Developer test site",
            lat,
            lon,
            ...(horizonProfile ? { horizonProfile } : {}),
          },
        ],
        ...(missionRef ? { missionReferenceId: missionRef } : {}),
        startUtc: startInstant,
        endUtc: endInstant,
        timezone: displayTimezone,
        stepHours: step,
        terrainMode: mode === "ideal" ? "ideal_horizon" : "terrain_aware",
        spacecraft,
        ...(legsEnabled ? {legsScenario: {
          siteId:legsStation,band:legsBand,direction:legsDirection,
          frequencyMHz: legsDirection === "return" ? (legsBand === "X" ? 8450 : 26250) : (legsBand === "X" ? 7180 : 22850),
          assumedRangeKm:requiredNumber(rfRange,"Assumed LEGS range"),
          propagationAndPointingLossDb:requiredNumber(rfLoss,"LEGS loss"),
          ...(legsGeometryEnabled ? {geometry:{enabled:true as const,
            groundMinimumElevationDeg:requiredNumber(legsGroundMinElevation,"Minimum ground elevation"),
            ...(australiaRepresentative ? {australiaRepresentative:{latDeg:requiredNumber(australiaLat,"Hypothetical Australian latitude"),
              lonDegEast:requiredNumber(australiaLon,"Hypothetical Australian longitude")}} : {})}} : {}),
          ...(legsDirection === "return" ? {
            spacecraftEirpDbw:requiredNumber(legsTxEirpDbw,"Spacecraft LEGS EIRP"),
            bitRateBps:requiredNumber(legsBitRate,"Return link bit rate"),
            requiredEbN0Db:requiredNumber(legsRequiredEbN0,"Required Eb/N0")
          } : {roverReceiverGainDbi:requiredNumber(rfGain,"Rover receiver gain"),
            roverReceiverSensitivityDbm:requiredNumber(rfSensitivity,"Rover receiver sensitivity")})
        }} : {}),
      };

      const response = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as CompareResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? `Backend returned HTTP ${response.status}`);
      }
      if (!Array.isArray(data.sites) || !data.sites.length) {
        throw new Error("The backend returned no site analyses.");
      }
      setResultMode(mode);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  const site = result?.sites[0];
  const visibleRows = site?.timeline.slice(0, showAll ? undefined : 100) ?? [];

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">
            LuNav / Developer-only testing
          </p>
          <h1 className="mt-2 text-3xl font-bold">Mission analysis API lab</h1>
          <p className="mt-2 text-sm text-slate-400">
            This page tests <code>POST /api/compare</code> with live NASA JPL
            Horizons angles. It does not modify the main frontend.
          </p>
        </div>

        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
          <strong>Data integrity:</strong> Ideal mode ignores terrain; Synthetic
          mode uses invented ridges strictly for software testing. Only a
          separately sourced, geolocated horizon profile can test real terrain
          obstruction. Solar and RF hardware numbers below are test assumptions.
        </div>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold">Mission configuration</h2>
          <div className="mt-3 max-w-xl">
            <label className="text-sm text-slate-300">Historical mission reference (optional)
              <select className={inputClass} value={missionRef} onChange={(e)=>{
                const id=e.target.value;setMissionRef(id);
                const mission=MISSION_REFERENCES.find(m=>m.id===id);
                if(mission){setLatitude(String(mission.latDeg));setLongitude(String(mission.lonDegEast));}
              }}>
                <option value="">Custom landing coordinates</option>
                {MISSION_REFERENCES.map(m=><option key={m.id} value={m.id}>{m.label} — {m.siteName}</option>)}
              </select>
            </label>
            {missionRef && <p className="mt-2 text-xs text-amber-300">Historical mission location is loaded. Only published hardware values are source-backed; current editable panel, battery, and RF inputs are HYPOTHETICAL assumptions, not the mission's actual hardware. Auto LOLA requires a cached site profile. Chandrayaan-3's rover used a lander relay, not direct LEGS.</p>}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-sm text-slate-300">
              Latitude (°)
              <input className={inputClass} type="number" step="any" value={latitude} onChange={(e) => { setLatitude(e.target.value); setMissionRef(""); }} />
            </label>
            <label className="text-sm text-slate-300">
              Longitude (°)
              <input className={inputClass} type="number" step="any" value={longitude} onChange={(e) => { setLongitude(e.target.value); setMissionRef(""); }} />
            </label>
            <label className="text-sm text-slate-300">
              Start date (selected UTC offset)
              <input className={inputClass} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label className="text-sm text-slate-300">
              End date (selected UTC offset, exclusive)
              <input className={inputClass} type="date" value={stopDate} onChange={(e) => setStopDate(e.target.value)} />
            </label>
            <label className="text-sm text-slate-300">
              Sampling interval
              <select className={inputClass} value={stepHours} onChange={(e) => setStepHours(e.target.value)}>
                {[0.25, 0.5, 1, 2, 3, 6, 12, 24].map((hours) => <option key={hours} value={hours}>{hours} hour{hours === 1 ? "" : "s"}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <label className="text-sm text-slate-300">Start time<input className={inputClass} type="time" value={startTime} onChange={e=>setStartTime(e.target.value)}/></label>
            <label className="text-sm text-slate-300">End time<input className={inputClass} type="time" value={stopTime} onChange={e=>setStopTime(e.target.value)}/></label>
            <label className="text-sm text-slate-300">Explicit UTC offset
              <select className={inputClass} value={utcOffset} onChange={e=>setUtcOffset(e.target.value)}>
                <option value="Z">UTC (+00:00)</option><option value="+08:00">Philippines (+08:00)</option>
                <option value="-05:00">UTC-05:00</option><option value="+01:00">UTC+01:00</option>
              </select>
            </label>
            <label className="text-sm text-slate-300">Display timezone (IANA)
              <input className={inputClass} value={displayTimezone} onChange={e=>setDisplayTimezone(e.target.value)}/>
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-400">The explicit UTC offset determines the actual analysis interval. The display timezone is metadata; it does not override the offset.</p>
          <div className="mt-5 border-t border-slate-800 pt-5">
            <h3 className="font-semibold">Terrain horizon test mode</h3>
            <div className="mt-3 flex flex-wrap gap-3">
              {([
                ["ideal", "0° ideal horizon"],
                ["synthetic", "Synthetic ridge (TEST ONLY)"],
                ["profile", "Paste real horizon profile"],
                ["auto", "Automatic NASA LOLA (catalog)"],
              ] as const).map(([value, label]) => (
                <label key={value} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm">
                  <input type="radio" name="terrain-test-mode" checked={mode === value} onChange={() => setMode(value)} />
                  {label}
                </label>
              ))}
            </div>
            {mode === "synthetic" && (
              <p className="mt-3 text-sm text-amber-300">
                Simulated angular skyline: 0.25°–1.95°. Not NASA measurements.
                This tests the clearance, horizon interpolation and visibility code only.
              </p>
            )}
            {mode === "auto" && (
              <p className="mt-3 text-sm text-blue-300">
                Requests the backend's precomputed LOLA catalog. No file picker needed.
                You must first run export_lola_catalog.py for this exact location;
                the API returns an explicit error if no profile is available.
              </p>
            )}
            {mode === "profile" && (
              <div className="mt-3 space-y-2">
                <label htmlFor="profile-file" className="text-sm text-slate-300">
                  Load a NASA LOLA-derived horizon JSON file (generated by scripts/lola_to_horizon.py)
                </label>
                <input
                  id="profile-file"
                  type="file"
                  accept=".json,application/json"
                  className={`${inputClass} text-sm`}
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    try {
                      const raw = await file.text();
                      const parsed = JSON.parse(raw) as HorizonProfile;
                      if (!Array.isArray(parsed.points) || !parsed.provenance) {
                        throw new Error("Missing points[] or provenance fields");
                      }
                      setProfileJson(raw);
                      setProfileFileName(file.name);
                      setLatitude(String(parsed.provenance.siteLatitudeDeg));
                      setLongitude(String(parsed.provenance.siteLongitudeDeg));
                      setError("");
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Could not read profile JSON");
                      setProfileFileName("");
                    }
                  }}
                />
                {profileFileName && (
                  <p className="text-sm text-emerald-300">Loaded: {profileFileName}. Coordinates synchronized to the profile.</p>
                )}
                <label htmlFor="profile-json" className="text-sm text-slate-300">
                  Or paste / inspect the JSON (<code>points[]</code> and <code>provenance</code>)
                </label>
                <textarea id="profile-json" rows={5} className={`${inputClass} font-mono text-xs`} value={profileJson} onChange={(e) => setProfileJson(e.target.value)} placeholder={'{"points":[{"azimuthDeg":0,"horizonElevationDeg":1.2}, ...], "provenance": {...}}'} />
                <p className="text-xs text-slate-400">A real LOLA GeoTIFF must first be converted to a directional horizon profile. The browser does not directly process GeoTIFFs. Source accuracy and sampling radius need independent validation.</p>
              </div>
            )}
          </div>
        </section>

        <details className="rounded-xl border border-slate-800 bg-slate-900 p-5" open>
          <summary className="cursor-pointer font-semibold">Solar power assumptions</summary>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {([
              ["Panel area (m²)", panelArea, setPanelArea],
              ["Efficiency (%)", panelEfficiency, setPanelEfficiency],
              ["Tilt from horizontal (°)", panelTilt, setPanelTilt],
              ["Facing azimuth (°)", panelFacing, setPanelFacing],
              ["Minimum power (W)", minPower, setMinPower],
            ] as const).map(([label, value, setter]) => (
              <label key={label} className="text-sm text-slate-300">
                {label}
                <input className={inputClass} type="number" step="any" value={value} onChange={(e) => setter(e.target.value)} />
              </label>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <label className="text-sm text-slate-300">Battery capacity (Wh)
              <input className={inputClass} type="number" step="any" value={batteryWh} onChange={(e) => setBatteryWh(e.target.value)} />
            </label>
            <label className="text-sm text-slate-300">Average electrical load (W)
              <input className={inputClass} type="number" step="any" value={averageLoadW} onChange={(e) => setAverageLoadW(e.target.value)} />
            </label>
          </div>
          <p className="mt-3 text-xs text-slate-400">Uses 1361 W/m² at 1 AU; battery endurance is capacity / constant load, without charging or discharge physics.</p>
        </details>

        <div className="grid grid-cols-3 gap-3 rounded-xl border border-slate-700 p-4">
          <label className="text-xs text-slate-300">Initial battery SOC (%)<input type="number" className={inputClass} value={initialSoc} onChange={e=>setInitialSoc(e.target.value)}/></label>
          <label className="text-xs text-slate-300">Charge efficiency (%)<input type="number" className={inputClass} value={chargeEff} onChange={e=>setChargeEff(e.target.value)}/></label>
          <label className="text-xs text-slate-300">Battery reserve (%)<input type="number" className={inputClass} value={reservePct} onChange={e=>setReservePct(e.target.value)}/></label>
        </div>
        <details className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <summary className="cursor-pointer font-semibold">NASA LEGS preliminary link scenario (optional)</summary>
          <label className="mt-3 flex gap-2 text-sm"><input type="checkbox" checked={legsEnabled} onChange={e=>setLegsEnabled(e.target.checked)}/> Enable assumed-range NASA LEGS link preview</label>
          {legsEnabled && <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="text-xs">Ground station<select className={inputClass} value={legsStation} onChange={e=>setLegsStation(e.target.value)}>
              <option value="legs1-white-sands">LEGS #1 White Sands</option><option value="legs2-matjiesfontein">LEGS #2 Matjiesfontein</option><option value="legs3-australia">LEGS #3 Australia (TBC)</option>
            </select></label>
            <label className="text-xs">Direction<select className={inputClass} value={legsDirection} onChange={e=>setLegsDirection(e.target.value as "return"|"forward")}><option value="return">Spacecraft → LEGS</option><option value="forward">LEGS → spacecraft</option></select></label>
            <label className="text-xs">Band<select className={inputClass} value={legsBand} onChange={e=>setLegsBand(e.target.value as "X"|"Ka")}><option value="X">X-band</option><option value="Ka">Ka-band</option></select></label>
            {legsDirection === "return" && <>
              <label className="text-xs">Spacecraft EIRP (dBW)<input className={inputClass} type="number" value={legsTxEirpDbw} onChange={e=>setLegsTxEirpDbw(e.target.value)}/></label>
              <label className="text-xs">Bit rate (bps)<input className={inputClass} type="number" value={legsBitRate} onChange={e=>setLegsBitRate(e.target.value)}/></label>
              <label className="text-xs">Required Eb/N0 (dB)<input className={inputClass} type="number" value={legsRequiredEbN0} onChange={e=>setLegsRequiredEbN0(e.target.value)}/></label>
            </>}
          </div>}
          {legsEnabled && <div className="mt-4 space-y-3 rounded border border-blue-700/50 bg-blue-950/30 p-3">
            <label className="flex items-center gap-2 text-sm text-blue-200">
              <input type="checkbox" checked={legsGeometryEnabled} onChange={e=>setLegsGeometryEnabled(e.target.checked)} />
              Query actual time-dependent LEGS station geometry via NASA Horizons (Phase 3C)
            </label>
            {legsGeometryEnabled && <>
              <p className="text-xs text-amber-200">Two geolocated candidate ground sites are modeled; LEGS #3 remains unknown unless you enable a hypothetical coordinate. This queries NASA twice per ground site. Scheduling is not simulated.</p>
              <label className="block text-xs">Minimum ground-station Moon elevation (°)
                <input type="number" step="any" className={inputClass} value={legsGroundMinElevation} onChange={e=>setLegsGroundMinElevation(e.target.value)}/>
              </label>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={australiaRepresentative} onChange={e=>setAustraliaRepresentative(e.target.checked)}/> Model LEGS #3 using USER-ASSUMED Australian proxy coordinate</label>
              {australiaRepresentative && <div className="grid grid-cols-2 gap-3">
                <label className="text-xs">Hypothetical latitude<input type="number" step="any" className={inputClass} value={australiaLat} onChange={e=>setAustraliaLat(e.target.value)}/></label>
                <label className="text-xs">Hypothetical longitude (east)<input type="number" step="any" className={inputClass} value={australiaLon} onChange={e=>setAustraliaLon(e.target.value)}/></label>
              </div>}
              <p className="text-xs text-slate-300">Use up to 145 sampled timestamps. For your initial test, keep the 24-hour interval and 1-hour steps.</p>
            </>}
          </div>}
          <p className="mt-3 text-xs text-amber-300">The legacy LEGS budget preview uses assumed distance. When station geometry is enabled, the separate station-specific panel uses Horizons-derived slant range. Neither mode confirms operational ground-station availability.</p>
        </details>
        <details className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <summary className="cursor-pointer font-semibold">RF link test assumptions (optional)</summary>
          <label className="mt-4 flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={includeRf} onChange={(e) => setIncludeRf(e.target.checked)} />
            Calculate hypothetical Earth-link margin
          </label>
          {includeRf && (
            <>
              <div className="mt-4 flex gap-4 text-sm text-slate-300">
                <label><input type="radio" checked={rfModel === "direct"} onChange={() => setRfModel("direct")} /> Given EIRP / sensitivity</label>
                <label><input type="radio" checked={rfModel === "components"} onChange={() => setRfModel("components")} /> Derive from hardware components</label>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {([
                  ["Frequency (MHz)", rfFrequency, setRfFrequency],
                  ...(rfModel === "direct"
                    ? [["Tx EIRP (dBm)", rfEirp, setRfEirp], ["Rx sensitivity (dBm)", rfSensitivity, setRfSensitivity]] as const
                    : [["Tx power (dBm)", txPower, setTxPower], ["Tx antenna gain (dBi)", txGain, setTxGain],
                       ["Tx cable loss (dB)", txCableLoss, setTxCableLoss], ["Rx noise figure (dB)", rxNoiseFigure, setRxNoiseFigure],
                       ["Rx bandwidth (Hz)", rxBandwidth, setRxBandwidth], ["Required SNR (dB)", requiredSnr, setRequiredSnr]] as const),
                  ["Rx antenna gain (dBi)", rfGain, setRfGain],
                  ["Assumed Earth range (km)", rfRange, setRfRange],
                  ["Other losses (dB)", rfLoss, setRfLoss],
                  ["Polarization loss (dB)", polarizationLoss, setPolarizationLoss],
                  ["Pointing loss (dB)", pointingLoss, setPointingLoss],
                  ["Minimum margin (dB)", minMargin, setMinMargin],
                ] as [string, string, (value: string) => void][]).map(([label, value, setter]) => (
                  <label key={label} className="text-sm text-slate-300">
                    {label}
                    <input className={inputClass} type="number" step="any" value={value} onChange={(e) => setter(e.target.value)} />
                  </label>
                ))}
              </div>
            </>
          )}
          <p className="mt-3 text-xs text-amber-300">The 384,400 km value is a fixed user assumption, not a Horizons-measured Earth distance. Link budget and threshold are illustrative.</p>
        </details>

        <button type="button" onClick={analyze} disabled={loading} className="rounded-lg bg-blue-600 px-6 py-3 font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? "Querying NASA and calculating..." : "Run backend analysis"}
        </button>
        {error && <div role="alert" className="rounded-lg border border-red-600/40 bg-red-950/50 p-4 text-sm text-red-200">{error}</div>}

        {site && result && (
          <section className="space-y-5">
            <div className={`rounded-lg border p-4 text-sm ${resultMode === "synthetic" ? "border-amber-500/50 bg-amber-500/10 text-amber-100" : "border-slate-700 bg-slate-900 text-slate-200"}`}>
              <p className="font-semibold">Analysis mode: {site.model === "ideal_horizon" ? "Ideal 0° horizon (not terrain-aware)" : resultMode === "synthetic" ? "SYNTHETIC TERRAIN — NOT NASA LOLA" : resultMode === "auto" ? "AUTO CACHED NASA LOLA (DEM-derived, validation pending)" : "User-supplied horizon profile (unverified)"}</p>
              <p className="mt-1">Source: {result.source} · {result.stepHours}-hour cadence · {site.timeline.length} ephemeris rows</p>
              <p className="mt-1 text-xs">Data quality: {site.assumptions.dataQuality}</p>
              {result.ephemerisSamplingMethod && <p className="mt-1 text-xs text-amber-300">Ephemeris sampling: {result.ephemerisSamplingMethod}</p>}
              {result.missionReference && <p className="mt-1 text-xs text-blue-200">Mission reference: {result.missionReference.label}. Published rover power: {result.missionReference.published.roverPublishedPowerW ?? "unknown"} W; lander power: {result.missionReference.published.landerPublishedPowerW ?? "unknown"} W. These published figures are NOT the panel area or assumed electrical load entered above.</p>}
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric label="Sunlight availability" value={pct(site.availability.sunlightPercent)} note="Time-weighted over evaluated interval" />
              <Metric label="Direct Earth LOS" value={pct(site.availability.earthLosPercent)} note="Time-weighted over evaluated interval" />
              <Metric label="Sun + Earth together" value={pct(site.availability.simultaneousSunEarthPercent)} />
              <Metric label="Ephemeris coverage" value={pct(site.availability.coveragePercent)} note={`${fmt(site.availability.evaluatedHours, 1)} of ${fmt(site.availability.requestedHours, 1)} requested hours`} />
              <Metric label="Longest darkness" value={`${fmt(site.availability.longestDarknessHours, 2)} h`} />
              <Metric label="Longest Earth blackout" value={`${fmt(site.availability.longestEarthBlackoutHours, 2)} h`} />
              <Metric label="RF link availability" value={pct(site.availability.linkAvailabilityPercent)} note="Based on hypothetical constant-range budget" />
              <Metric label="Landing-site elevation" value={site.terrain.siteElevationM === null ? "N/A" : `${fmt(site.terrain.siteElevationM)} m`} note="From DEM-derived horizon profile metadata" />
              <Metric label="Local terrain slope" value={site.terrain.localSlopeDeg === null ? "N/A" : `${fmt(site.terrain.localSlopeDeg)}°`} note="Approximate slope from DEM neighboring pixels" />
              <Metric label="Terrain footprint area" value={site.terrain.footprintSurfaceAreaM2 === null ? "N/A" : `${fmt(site.terrain.footprintSurfaceAreaM2)} m²`} note={site.terrain.footprintRadiusM ? `DEM surface area, projected radius ${fmt(site.terrain.footprintRadiusM,0)} m` : "Requires a DEM-derived footprint"} />
              <Metric label="Battery-only endurance" value={site.energy?.batteryEnduranceHours === null || site.energy?.batteryEnduranceHours === undefined ? "N/A" : `${fmt(site.energy.batteryEnduranceHours)} h`} note="Constant load; not a charge/discharge simulation" />
              <Metric label="Longest darkness survivable" value={site.energy?.batterySurvivesLongestDarkness == null ? "N/A" : site.energy.batterySurvivesLongestDarkness ? "YES" : "NO"} note="Illustrative battery capacity/load" />
              <Metric label="Effective transmitter EIRP" value={site.linkBudget?.effectiveEirpDbm == null ? "N/A" : `${fmt(site.linkBudget.effectiveEirpDbm)} dBm`} note="User supplied or derived from transmit hardware" />
              <Metric label="Initial sampled solar output" value={site.timeline.length ? `${fmt(site.timeline[0].estimatedSolarPowerW, 1)} W` : "N/A"} note="At the first sampled timestamp" />
              <Metric label="Initial sampled RF margin" value={site.timeline.length && site.timeline[0].linkMarginDb !== null ? `${fmt(site.timeline[0].linkMarginDb)} dB` : "N/A"} note="Assumed Earth distance and RF hardware" />
              <Metric label="Dynamic final battery SOC" value={site.energySimulation ? pct(site.energySimulation.finalStateOfChargePercent) : "N/A"} note="Approximate charge/discharge model" />
              <Metric label="Simulated battery shortfall" value={site.energySimulation ? site.energySimulation.firstPowerShortfallUtc ?? "None observed" : "N/A"} note="Based on the selected initial SOC and fixed electrical load" />
              <Metric label="LEGS budget margin (NOT contact availability)" value={site.legsAnalysis ? `${fmt(site.legsAnalysis.budget.linkMarginDb ?? site.legsAnalysis.budget.powerMarginDb)} dB` : "N/A"} note="Assumed range. Station visibility and scheduling UNKNOWN." />
            </div>

            {site.legsNetworkAnalysis && <div className="rounded-xl border border-blue-700/50 bg-slate-900 p-4 space-y-3">
              <h2 className="text-xl font-semibold text-blue-200">NASA LEGS — station-specific visibility (Phase 3C)</h2>
              <p className="text-xs text-slate-300">Geometric and preliminary RF feasibility only. Ground station scheduling/commissioning unknown. Earth-side threshold: {site.legsNetworkAnalysis.groundMinimumElevationDeg}°.</p>
              <p className="text-base font-semibold">Modeled network LOS + RF availability: {pct(site.legsNetworkAnalysis.modeledNetworkContactPercent)} (only resolved stations; not guaranteed operational contact)</p>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                {site.legsNetworkAnalysis.stationResults.map(st=><div className="rounded-lg bg-slate-800 p-3" key={st.stationId}>
                  <p className="font-semibold text-blue-200">{st.stationId}</p>
                  <p className="text-sm">{st.status==='modeled'? `${fmt(st.modeledContactPercent,1)}% predicted contact` : 'N/A (unverified / ephemeris error)'}</p>
                  <p className="mt-1 text-xs text-slate-400">{st.reason}</p>
                  {st.samples.length>0&&<p className="mt-2 text-xs text-slate-200">First sample: lunar elev {fmt(st.samples[0].lunarElevationDeg)}°, Earth-side Moon elev {fmt(st.samples[0].groundMoonElevationDeg)}°, range {fmt(st.samples[0].slantRangeKm,0)} km, RF margin {fmt(st.samples[0].linkMarginDb)} dB</p>}
                  {st.windows.length>0&&<p className="mt-2 text-xs">Contact windows: {st.windows.length} (first {st.windows[0].startUtc.slice(11,16)}–{st.windows[0].endUtc.slice(11,16)} UTC)</p>}
                </div>)}
              </div>
              <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-xs text-left">
                <thead><tr className="border-b border-slate-600 text-blue-300"><th className="p-2">Time (UTC)</th><th className="p-2">Geometrically viable stations</th><th className="p-2">Best link station</th><th className="p-2">Best margin</th></tr></thead>
                <tbody>{site.legsNetworkAnalysis.networkUnionSampled.slice(0,30).map(r=><tr className="border-b border-slate-700" key={r.timeUtc}><td className="p-2">{r.timeUtc.slice(0,16)}</td><td className="p-2">{r.availableStations.join(', ')||'None'}</td><td className="p-2">{r.bestStationId??'N/A'}</td><td className="p-2">{fmt(r.bestMarginDb)} dB</td></tr>)}</tbody>
              </table></div>
            </div>}

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Time-resolved results</h2>
                  <p className="mt-1 text-xs text-slate-400">Angles in degrees; clearance = body elevation minus terrain horizon. UTC timestamps.</p>
                </div>
                {site.timeline.length > 100 && (
                  <button type="button" className="rounded-md border border-slate-600 px-3 py-2 text-xs hover:bg-slate-800" onClick={() => setShowAll((old) => !old)}>
                    {showAll ? "Show first 100" : `Show all ${site.timeline.length}`}
                  </button>
                )}
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[1500px] text-left text-xs">
                  <thead className="border-b border-slate-700 text-blue-300">
                    <tr>
                      {[
                        "UTC time", "Sun az (°)", "Sun el (°)", "Sun horizon (°)", "Sun clearance (°)",
                        "Earth az (°)", "Earth el (°)", "Earth horizon (°)", "Earth clearance (°)",
                        "Sun visible", "Earth LOS", "Solar irradiance (W/m²)", "Solar output (W)", "Power ≥ threshold", "RF margin (dB)", "Link feasible", "Condition",
                      ].map((head) => <th key={head} className="whitespace-nowrap p-2">{head}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
                      <tr key={row.timeUtc} className="border-b border-slate-800 hover:bg-slate-800/60">
                        <td className="whitespace-nowrap p-2">{row.timeUtc.slice(0, 16).replace("T", " ")}</td>
                        <td className="p-2">{fmt(row.sunAzimuthDeg, 3)}</td>
                        <td className="p-2">{fmt(row.sunElevationDeg, 3)}</td>
                        <td className="p-2">{fmt(row.sunHorizonDeg, 3)}</td>
                        <td className="p-2">{fmt(row.sunClearanceDeg, 3)}</td>
                        <td className="p-2">{fmt(row.earthAzimuthDeg, 3)}</td>
                        <td className="p-2">{fmt(row.earthElevationDeg, 3)}</td>
                        <td className="p-2">{fmt(row.earthHorizonDeg, 3)}</td>
                        <td className="p-2">{fmt(row.earthClearanceDeg, 3)}</td>
                        <td className="p-2">{row.sunVisible ? "YES" : "NO"}</td>
                        <td className="p-2">{row.earthVisible ? "YES" : "NO"}</td>
                        <td className="p-2">{fmt(row.directNormalIrradianceWm2, 1)}</td>
                        <td className="p-2">{fmt(row.estimatedSolarPowerW, 1)}</td>
                        <td className="p-2">{row.solarPowerMeetsThreshold === null ? "N/A" : row.solarPowerMeetsThreshold ? "YES" : "NO"}</td>
                        <td className="p-2">{fmt(row.linkMarginDb, 2)}</td>
                        <td className="p-2">{row.linkFeasible === null ? "N/A" : row.linkFeasible ? "YES" : "NO"}</td>
                        <td className="p-2">{row.condition.replaceAll("_", " ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="text-lg font-semibold">Backend warnings and known limitations</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-300">
                {[...result.warnings, ...site.warnings].map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}
              </ul>
            </div>

            <details className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <summary className="cursor-pointer font-semibold">Inspect complete backend JSON</summary>
              <pre className="mt-3 max-h-[500px] overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-300">{JSON.stringify(result, null, 2)}</pre>
            </details>
          </section>
        )}
      </div>
    </main>
  );
}
