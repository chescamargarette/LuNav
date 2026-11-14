
export async function GET(request: Request) {

    const searchParams = new URL(request.url).searchParams;

    const target = searchParams.get("target");

    const startDate = searchParams.get("start") ?? "2026-12-01";
    const stopDate = searchParams.get("stop") ?? "2026-12-02";

    const isValidDate = (date: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return false;
    }

    const parsed = new Date(date);

    return (
        !Number.isNaN(parsed.getTime()) &&
        parsed.toISOString().slice(0, 10) === date
    );
    };

    if (
    !isValidDate(startDate) ||
    !isValidDate(stopDate) ||
    startDate >= stopDate
    ) {
    return Response.json(
        {
        error: "Invalid date range. Use YYYY-MM-DD and ensure the end date is after the start date."
        },
        { status: 400 }
    );
    }

    const stepHours = Number(searchParams.get("step") ?? "6");

    if (
    !Number.isInteger(stepHours) ||
    stepHours < 1 ||
    stepHours > 24
    ) {
    return Response.json(
        { error: "Sampling interval must be between 1 and 24 hours" },
        { status: 400 }
    );
    }

    const latitude = Number(searchParams.get("lat") ?? "-89.5");
    const longitude = Number(searchParams.get("lon") ?? "0");

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 ||
        Math.abs(longitude) > 180
        ) {
        return Response.json(
            { error: "Invalid lunar coordinates" },
            { status: 400 }
        );
    }

  const params = new URLSearchParams({
    format: "json",
    COMMAND: target === "earth" ? "'399'" : "'10'",
    CENTER: "'coord@301'",
    COORD_TYPE: "'GEODETIC'",
    SITE_COORD: `'${longitude},${latitude},0'`,
    EPHEM_TYPE: "'OBSERVER'",
    MAKE_EPHEM: "'YES'",
    OBJ_DATA: "'NO'",
    START_TIME: `'${startDate}'`,
    STOP_TIME: `'${stopDate}'`,
    STEP_SIZE: `'${stepHours} h'`,
    QUANTITIES: "'4'",
    CSV_FORMAT: "'YES'",
    TIME_TYPE: "'UT'",
    TIME_ZONE: "'+00:00'",
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
        observer: {
        latitude,
        longitude
        },
        table,
        observations
    });

  } catch (error) {
    return Response.json({
      error: String(error)
    }, { status: 502 });
  }
}
