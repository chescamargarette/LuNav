
export async function GET(request: Request) {
    const target = new URL(request.url).searchParams.get("target");
  const params = new URLSearchParams({
    format: "json",
    COMMAND: target === "earth" ? "'399'" : "'10'",
    CENTER: "'coord@301'",
    COORD_TYPE: "'GEODETIC'",
    SITE_COORD: "'0,-89.5,0'",
    EPHEM_TYPE: "'OBSERVER'",
    MAKE_EPHEM: "'YES'",
    OBJ_DATA: "'NO'",
    START_TIME: "'2026-12-01'",
    STOP_TIME: "'2026-12-02'",
    STEP_SIZE: "'6 h'",
    QUANTITIES: "'4'",
    CSV_FORMAT: "'YES'"
  });

  try {
    const url =
      `https://ssd.jpl.nasa.gov/api/horizons.api?${params}`;

    const response = await fetch(url, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`NASA API HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.error || !data.result?.includes("$$SOE")) {
      throw new Error(data.error || "No ephemeris returned");
    }

    const table = data.result
      .split("$$SOE")[1]
      .split("$$EOE")[0]
      .trim();

    const observations = table.split("\n").map((line: string) => {
    const fields = line.split(",").map((value) => value.trim());

    return {
        time: fields[0],
        azimuthDeg: Number(fields[3]),
        elevationDeg: Number(fields[4])
    };
    });

    return Response.json({
        source: "NASA JPL Horizons",
        target: target === "earth" ? "Earth" : "Sun",
        observer: "Lunar south pole",
        table,
        observations
    });

  } catch (error) {
    return Response.json({
      error: String(error)
    }, { status: 502 });
  }
}
