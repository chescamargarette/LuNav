
"use client";

import { useState } from "react";

type Observation = {
  time: string;
  azimuthDeg: number;
  elevationDeg: number;
};

type AnalysisResponse = {
  sun: Observation[];
  earth: Observation[];
  conditions: {
    time: string;
    sunVisible: boolean;
    earthVisible: boolean;
    condition: string;
  }[];
  availability: {
  sunlightPercent: number | null;
  earthVisibilityPercent: number | null;
  evaluatedIntervals: number;
  };
};

export default function HorizonsPlayground() {
  const [latitude, setLatitude] = useState("-89.5");
  const [longitude, setLongitude] = useState("0");
  const [startDate, setStartDate] = useState("2026-12-10");
  const [stopDate, setStopDate] = useState("2026-12-11");
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function analyze() {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const params = new URLSearchParams({
        lat: latitude,
        lon: longitude,
        start: startDate,
        stop: stopDate,
      });

      const response = await fetch(`/api/analyze?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "API request failed");
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-3xl font-bold">
          LuNav — API Testing
        </h1>

        <p className="text-slate-400">
          Test NASA JPL Horizons using custom lunar coordinates.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label>Latitude (°)</label>
            <input
              type="number"
              step="any"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              className="mt-2 w-full rounded bg-slate-800 p-3"
            />
          </div>

          <div>
            <label>Longitude (°)</label>
            <input
              type="number"
              step="any"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              className="mt-2 w-full rounded bg-slate-800 p-3"
            />
          </div>

          <div>
            <label>Mission Start Date</label>
            <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-2 w-full rounded bg-slate-800 p-3"
            />
            </div>

            <div>
            <label>Mission End Date</label>
            <input
                type="date"
                value={stopDate}
                onChange={(e) => setStopDate(e.target.value)}
                className="mt-2 w-full rounded bg-slate-800 p-3"
            />
        </div>
        </div>

        <button
          onClick={analyze}
          disabled={loading}
          className="rounded bg-blue-600 px-6 py-3 font-semibold disabled:opacity-50"
        >
          {loading ? "Fetching NASA Data..." : "Analyze Location"}
        </button>

        {error && <p className="text-red-400">{error}</p>}

        
        {result !== null && (
        <div className="overflow-x-auto rounded bg-slate-900 p-4">
            <h2 className="mb-4 text-xl font-semibold">
            Sun and Earth Observations
            </h2>


<div className="mb-6 grid grid-cols-2 gap-4">

  <div className="rounded-lg bg-slate-800 p-4">
    <h3 className="mb-2 font-semibold text-yellow-400">
      Sunlight Visibility
    </h3>

    <p className="text-2xl font-bold">
    {result.availability.sunlightPercent === null
    ? "N/A"
    : `${result.availability.sunlightPercent.toFixed(1)}%`}
    </p>

    <p className="text-sm text-slate-400">
    Estimated sunlight availability
    </p>
  </div>

  <div className="rounded-lg bg-slate-800 p-4">
    <h3 className="mb-2 font-semibold text-blue-400">
      Direct Earth LOS
    </h3>

    <p className="text-2xl font-bold">
      {result.availability.earthVisibilityPercent === null
        ? "N/A"
        : `${result.availability.earthVisibilityPercent.toFixed(1)}%`}
    </p>

    <p className="text-sm text-slate-400">
    Estimated direct Earth LOS availability
    </p>
  </div>

</div>

<p className="mb-4 text-xs text-slate-400">
  Ideal-horizon model (0° threshold).
  Terrain and RF link performance are not included.
</p>


            <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b border-slate-700 text-blue-300">
                <tr>
                <th className="p-3">Time (UTC)</th>
                <th className="p-3">Sun Azimuth (°)</th>
                <th className="p-3">Sun Elevation (°)</th>
                <th className="p-3">Earth Azimuth (°)</th>
                <th className="p-3">Earth Elevation (°)</th>
                </tr>
            </thead>

            <tbody>
                {result.sun.map((sunSample) => {
                const earthSample = result.earth.find(
                    (sample) => sample.time === sunSample.time
                );

                return (
                    <tr
                    key={sunSample.time}
                    className="border-b border-slate-800 hover:bg-slate-800"
                    >
                    <td className="p-3">{sunSample.time}</td>

                    <td className="p-3">
                        {sunSample.azimuthDeg.toFixed(3)}
                    </td>

                    <td className="p-3">
                        {sunSample.elevationDeg.toFixed(3)}
                    </td>

                    <td className="p-3">
                        {earthSample
                        ? earthSample.azimuthDeg.toFixed(3)
                        : "—"}
                    </td>

                    <td className="p-3">
                        {earthSample
                        ? earthSample.elevationDeg.toFixed(3)
                        : "—"}
                    </td>
                    </tr>
                );
                })}
            </tbody>
            </table>
        </div>
        )}

      </div>
    </main>
  );
}
