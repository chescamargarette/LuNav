let cachedTerrainBlobUrl: string | null = null;

export async function generateGoogleTerrainBlobUrl(): Promise<string> {
  if (cachedTerrainBlobUrl) return cachedTerrainBlobUrl;

  const width = 1024;
  const height = 512;

  const bumpImg = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = "/textures/moon_bump.jpg";
  });

  // 1. Read raw elevation values from moon_bump.jpg
  const bumpCanvas = document.createElement("canvas");
  bumpCanvas.width = width;
  bumpCanvas.height = height;
  const bumpCtx = bumpCanvas.getContext("2d")!;
  bumpCtx.drawImage(bumpImg, 0, 0, width, height);
  const bumpData = bumpCtx.getImageData(0, 0, width, height).data;

  const raw = new Float32Array(width * height);
  for (let i = 0; i < raw.length; i++) {
    raw[i] = bumpData[i * 4];
  }

  // 2. Single fast smoothing pass for clean cartographic contour curves
  const elev = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = row + x;
      elev[idx] =
        (raw[idx - width - 1] +
          raw[idx - width] * 2 +
          raw[idx - width + 1] +
          raw[idx - 1] * 2 +
          raw[idx] * 4 +
          raw[idx + 1] * 2 +
          raw[idx + width - 1] +
          raw[idx + width] * 2 +
          raw[idx + width + 1]) *
        0.0625;
    }
  }

  // 3. Render Google Maps Terrain palette (hillshaded cream/sage/ochre + contours)
  const outCanvas = document.createElement("canvas");
  outCanvas.width = width;
  outCanvas.height = height;
  const outCtx = outCanvas.getContext("2d")!;
  const outImg = outCtx.createImageData(width, height);
  const out = outImg.data;

  const contourInterval = 10;

  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = row + x;
      const z = elev[idx];

      const dzdx = (elev[idx + 1] - elev[idx - 1]) * 0.2;
      const dzdy = (elev[idx + width] - elev[idx - width]) * 0.2;
      const shade = Math.max(
        0.76,
        Math.min(1.16, 1.0 - dzdx * 0.5 - dzdy * 0.5)
      );

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

      let r = baseR * shade;
      let g = baseG * shade;
      let b = baseB * shade;

      const band = Math.floor(z / contourInterval);
      const bandRight = Math.floor(elev[idx + 1] / contourInterval);
      const bandDown = Math.floor(elev[idx + width] / contourInterval);

      if (band !== bandRight || band !== bandDown) {
        if (band % 5 === 0) {
          r = r * 0.35 + 132 * 0.65;
          g = g * 0.35 + 106 * 0.65;
          b = b * 0.35 + 72 * 0.65;
        } else {
          r = r * 0.62 + 156 * 0.38;
          g = g * 0.62 + 133 * 0.38;
          b = b * 0.62 + 98 * 0.38;
        }
      }

      const p = idx * 4;
      out[p] = Math.min(255, Math.max(0, r));
      out[p + 1] = Math.min(255, Math.max(0, g));
      out[p + 2] = Math.min(255, Math.max(0, b));
      out[p + 3] = 255;
    }
  }

  outCtx.putImageData(outImg, 0, 0);

  // 4. Subtle 15-degree graticule grid
  outCtx.strokeStyle = "rgba(120, 113, 108, 0.22)";
  outCtx.lineWidth = 1;
  for (let lon = -180; lon <= 180; lon += 15) {
    const x = ((lon + 180) / 360) * width;
    outCtx.beginPath();
    outCtx.moveTo(x, 0);
    outCtx.lineTo(x, height);
    outCtx.stroke();
  }
  for (let lat = -90; lat <= 90; lat += 15) {
    const y = ((90 - lat) / 180) * height;
    outCtx.beginPath();
    outCtx.moveTo(0, y);
    outCtx.lineTo(width, y);
    outCtx.stroke();
  }

  const blob = await new Promise<Blob>((resolve) =>
    outCanvas.toBlob((b) => resolve(b!), "image/jpeg", 0.9)
  );
  cachedTerrainBlobUrl = URL.createObjectURL(blob);
  return cachedTerrainBlobUrl;
}