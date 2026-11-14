export interface RoverUnit {
  id: string;
  name: string;
  agency: string;
  body: "Moon" | "Mars";
  siteName: string;
  centerLat: number;
  centerLon: number;
  radiusDeg: number;
  speedDegPerSec: number; // Angular patrol rate at 1x speed
  phaseOffsetRad: number;
  color: string;
  status: string;
}

const REFERENCE_ROVER_EPOCH_MS = Date.UTC(2026, 10, 14, 12, 0, 0);

export const LUNAR_ROVERS: RoverUnit[] = [
  {
    id: "lunav-scout-1",
    name: "LuNav Scout-1",
    agency: "LUNAV Mission",
    body: "Moon",
    siteName: "Shackleton Crater Rim",
    centerLat: -88.2,
    centerLon: 8.0,
    radiusDeg: 1.4,
    speedDegPerSec: 0.0022,
    phaseOffsetRad: 0.3,
    color: "#38bdf8", // Sky cyan
    status: "LIDAR Slope Mapping",
  },
  {
    id: "yutu-2",
    name: "Yutu-2",
    agency: "CNSA (Chang'e 4)",
    body: "Moon",
    siteName: "Von Kármán Crater",
    centerLat: -45.457,
    centerLon: 177.588,
    radiusDeg: 1.1,
    speedDegPerSec: 0.0016,
    phaseOffsetRad: 2.1,
    color: "#f59e0b", // Amber gold
    status: "Regolith Radar Sounding",
  },
  {
    id: "pragyan",
    name: "Pragyan",
    agency: "ISRO (Chandrayaan-3)",
    body: "Moon",
    siteName: "Statio Shiv Shakti",
    centerLat: -69.373,
    centerLon: 32.319,
    radiusDeg: 1.2,
    speedDegPerSec: 0.0019,
    phaseOffsetRad: 4.4,
    color: "#34d399", // Emerald
    status: "LIBS Elemental Scan",
  },
];

export const MARS_ROVERS: RoverUnit[] = [
  {
    id: "perseverance",
    name: "Perseverance",
    agency: "NASA JPL",
    body: "Mars",
    siteName: "Jezero Crater",
    centerLat: 18.4447,
    centerLon: 77.4508,
    radiusDeg: 4.5,
    speedDegPerSec: 0.0028,
    phaseOffsetRad: 0.8,
    color: "#fb7185", // Rose
    status: "Core Sample Caching",
  },
  {
    id: "curiosity",
    name: "Curiosity",
    agency: "NASA JPL",
    body: "Mars",
    siteName: "Gale Crater",
    centerLat: -4.5895,
    centerLon: 137.4417,
    radiusDeg: 4.2,
    speedDegPerSec: 0.0024,
    phaseOffsetRad: 3.6,
    color: "#a78bfa", // Violet
    status: "Mount Sharp Ascent",
  },
];

// Compute exact rover coordinates at a given UTC epoch timestamp (ms)
export function getRoverCoordinatesAtEpoch(
  rover: RoverUnit,
  epochMs: number
): { lat: number; lon: number; headingDeg: number } {
  const elapsedSeconds = (epochMs - REFERENCE_ROVER_EPOCH_MS) / 1000;
  const angle = rover.phaseOffsetRad + elapsedSeconds * rover.speedDegPerSec;
  const lat = rover.centerLat + rover.radiusDeg * Math.sin(angle);
  const lonScale = Math.max(0.25, Math.cos((rover.centerLat * Math.PI) / 180));
  const lon =
    rover.centerLon + (rover.radiusDeg * Math.cos(angle)) / lonScale;
  const headingDeg = Math.round(((angle * 180) / Math.PI + 90) % 360);

  return {
    lat: Number(lat.toFixed(4)),
    lon: Number(lon.toFixed(4)),
    headingDeg: (headingDeg + 360) % 360,
  };
}

// Generate closed traverse loop coordinates for 2D/3D path visualization
export function getRoverTraversePath(
  rover: RoverUnit,
  segments = 48
): [number, number][] {
  const coords: [number, number][] = [];
  const lonScale = Math.max(0.25, Math.cos((rover.centerLat * Math.PI) / 180));
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const lat = rover.centerLat + rover.radiusDeg * Math.sin(theta);
    const lon =
      rover.centerLon + (rover.radiusDeg * Math.cos(theta)) / lonScale;
    coords.push([lat, lon]);
  }
  return coords;
}