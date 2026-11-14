// Cached 1:1 local tangent-plane thumbnail renderer using real NASA LRO imagery

interface LoadedMoonData {
  width: number;
  height: number;
  colorData: Uint8ClampedArray;
  bumpData: Uint8ClampedArray;
}

let cachedSourcePromise: Promise<LoadedMoonData> | null = null;
const patchCache = new Map<string, string>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function getSourceMoonData(): Promise<LoadedMoonData> {
  if (cachedSourcePromise) return cachedSourcePromise;

  cachedSourcePromise = (async () => {
    const [colorImg, bumpImg] = await Promise.all([
      loadImage("/textures/moon_color.jpg"),
      loadImage("/textures/moon_bump.jpg"),
    ]);

    const width = 2048;
    const height = 1024;

    const cCanvas = document.createElement("canvas");
    cCanvas.width = width;
    cCanvas.height = height;
    const cCtx = cCanvas.getContext("2d")!;
    cCtx.drawImage(colorImg, 0, 0, width, height);

    const bCanvas = document.createElement("canvas");
    bCanvas.width = width;
    bCanvas.height = height;
    const bCtx = bCanvas.getContext("2d")!;
    bCtx.drawImage(bumpImg, 0, 0, width, height);

    return {
      width,
      height,
      colorData: cCtx.getImageData(0, 0, width, height).data,
      bumpData: bCtx.getImageData(0, 0, width, height).data,
    };
  })();

  return cachedSourcePromise;
}

function sampleBilinear(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  u: number,
  v: number,
  channelOffset: number
): number {
  const x = (((u % 1) + 1) % 1) * (width - 1);
  const y = Math.max(0, Math.min(1, v)) * (height - 1);

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = (x0 + 1) % width;
  const y1 = Math.min(height - 1, y0 + 1);

  const fx = x - x0;
  const fy = y - y0;

  const p00 = data[(y0 * width + x0) * 4 + channelOffset];
  const p10 = data[(y0 * width + x1) * 4 + channelOffset];
  const p01 = data[(y1 * width + x0) * 4 + channelOffset];
  const p11 = data[(y1 * width + x1) * 4 + channelOffset];

  return (
    p00 + (p10 - p00) * fx + (p01 - p00 + (p00 - p10 - p01 + p11) * fx) * fy
  );
}

export async function renderLocalLunarPatchDataUrl(options: {
  centerLat: number;
  centerLon: number;
  spanDeg: number;
  width: number;
  height: number;
  terrainMode?: boolean;
  showReticle?: boolean;
}): Promise<string> {
  const {
    centerLat,
    centerLon,
    spanDeg,
    width,
    height,
    terrainMode = false,
    showReticle = true,
  } = options;

  const cacheKey = `${centerLat.toFixed(3)}_${centerLon.toFixed(
    3
  )}_${spanDeg}_${width}x${height}_${terrainMode ? "T" : "S"}_${
    showReticle ? "R" : "N"
  }`;

  const existing = patchCache.get(cacheKey);
  if (existing) return existing;

  const src = await getSourceMoonData();

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const imgData = ctx.createImageData(width, height);
  const out = imgData.data;

  const phi0 = (centerLat * Math.PI) / 180;
  const lam0 = (centerLon * Math.PI) / 180;

  const cx = Math.cos(phi0) * Math.cos(lam0);
  const cy = Math.sin(phi0);
  const cz = Math.cos(phi0) * Math.sin(lam0);

  const ex = -Math.sin(lam0);
  const ez = Math.cos(lam0);

  const nx = -Math.sin(phi0) * Math.cos(lam0);
  const ny = Math.cos(phi0);
  const nz = -Math.sin(phi0) * Math.sin(lam0);

  const spanRad = (spanDeg * Math.PI) / 180;
  const aspect = width / height;

  const pixelCount = width * height;
  const elevGrid = new Float32Array(pixelCount);
  const albedoR = new Float32Array(pixelCount);
  const albedoG = new Float32Array(pixelCount);
  const albedoB = new Float32Array(pixelCount);

  for (let py = 0; py < height; py++) {
    const ndcY = 1 - (2 * py) / (height - 1);
    for (let px = 0; px < width; px++) {
      const ndcX = (2 * px) / (width - 1) - 1;

      const x = ndcX * spanRad * aspect;
      const y = ndcY * spanRad;
      const rho = Math.sqrt(x * x + y * y);

      let px3 = cx;
      let py3 = cy;
      let pz3 = cz;

      if (rho > 1e-7) {
        const cAng = 2 * Math.atan(rho / 2);
        const k = Math.sin(cAng) / rho;
        const cosC = Math.cos(cAng);

        px3 = cosC * cx + k * (x * ex + y * nx);
        py3 = cosC * cy + k * (y * ny);
        pz3 = cosC * cz + k * (x * ez + y * nz);
      }

      const latDeg = Math.asin(Math.max(-1, Math.min(1, py3))) * (180 / Math.PI);
      const lonDeg = Math.atan2(pz3, px3) * (180 / Math.PI);

      const u = (lonDeg + 180) / 360;
      const v = (90 - latDeg) / 180;
      const idx = py * width + px;

      albedoR[idx] = sampleBilinear(src.colorData, src.width, src.height, u, v, 0);
      albedoG[idx] = sampleBilinear(src.colorData, src.width, src.height, u, v, 1);
      albedoB[idx] = sampleBilinear(src.colorData, src.width, src.height, u, v, 2);
      elevGrid[idx] = sampleBilinear(src.bumpData, src.width, src.height, u, v, 0);
    }
  }

  for (let py = 0; py < height; py++) {
    const rowOff = py * width;
    const upOff = Math.max(0, py - 1) * width;
    const downOff = Math.min(height - 1, py + 1) * width;

    for (let px = 0; px < width; px++) {
      const idx = rowOff + px;
      const left = elevGrid[rowOff + Math.max(0, px - 1)];
      const right = elevGrid[rowOff + Math.min(width - 1, px + 1)];
      const up = elevGrid[upOff + px];
      const down = elevGrid[downOff + px];

      const dzdx = (right - left) * 0.18;
      const dzdy = (down - up) * 0.18;
      const shade = Math.max(
        0.72,
        Math.min(1.24, 1.0 - dzdx * 0.5 - dzdy * 0.5)
      );

      let r: number;
      let g: number;
      let b: number;

      if (terrainMode) {
        const z = elevGrid[idx];
        let baseR = 236;
        let baseG = 232;
        let baseB = 221;
        if (z < 110) {
          baseR = 216;
          baseG = 217;
          baseB = 208;
        } else if (z > 165) {
          baseR = 246;
          baseG = 242;
          baseB = 232;
        }

        r = baseR * shade;
        g = baseG * shade;
        b = baseB * shade;

        const interval = 8;
        const band = Math.floor(z / interval);
        const bandR = Math.floor(right / interval);
        const bandD = Math.floor(down / interval);
        if (band !== bandR || band !== bandD) {
          const isMajor = band % 5 === 0;
          r = isMajor ? r * 0.35 + 132 * 0.65 : r * 0.62 + 156 * 0.38;
          g = isMajor ? g * 0.35 + 106 * 0.65 : g * 0.62 + 133 * 0.38;
          b = isMajor ? b * 0.35 + 72 * 0.65 : b * 0.62 + 98 * 0.38;
        }
      } else {
        r = albedoR[idx] * shade;
        g = albedoG[idx] * shade;
        b = albedoB[idx] * shade;
      }

      const p = idx * 4;
      out[p] = Math.max(0, Math.min(255, r));
      out[p + 1] = Math.max(0, Math.min(255, g));
      out[p + 2] = Math.max(0, Math.min(255, b));
      out[p + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  if (showReticle) {
    const cxPx = width / 2;
    const cyPx = height / 2;
    ctx.fillStyle = terrainMode ? "#dc2626" : "#facc15";
    ctx.strokeStyle = terrainMode ? "#ffffff" : "#090d16";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cxPx, cyPx, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  patchCache.set(cacheKey, dataUrl);
  return dataUrl;
}