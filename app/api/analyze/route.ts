
import { GET as getHorizons } from "../horizons/route";

export async function GET(request: Request) {
  // Reading the user's mission parameters
  const url = new URL(request.url);

  // Preparing separate Sun and Earth requests
  const sunUrl = new URL(url);
  const earthUrl = new URL(url);

  sunUrl.searchParams.set("target", "sun");
  earthUrl.searchParams.set("target", "earth");

  try {
    // Retrieving both datasets using our existing API
    const [sunResponse, earthResponse] = await Promise.all([
      getHorizons(new Request(sunUrl.toString())),
      getHorizons(new Request(earthUrl.toString())),
    ]);

    const [sunData, earthData] = await Promise.all([
      sunResponse.json(),
      earthResponse.json(),
    ]);

    // Checking for errors
    if (!sunResponse.ok || !earthResponse.ok) {
      return Response.json(
        {
          error: "Failed to retrieve mission data",
          sunError: sunData.error,
          earthError: earthData.error,
        },
        { status: 502 }
      );
    }

    // Calculating baseline visibility using a 0-degree horizon
    const conditions = sunData.observations.map(
      (sunSample: { time: string; elevationDeg: number }) => {

        // Finding Earth's observation at the same timestamp
        const earthSample = earthData.observations.find(
          (sample: { time: string; elevationDeg: number }) =>
            sample.time === sunSample.time
        );

        if (!earthSample) {
          throw new Error(`Missing Earth observation at ${sunSample.time}`);
        }

        // Applying the ideal-horizon visibility thresholds
        const sunVisible = sunSample.elevationDeg > 0;
        const earthVisible = earthSample.elevationDeg > 0;

        return {
          time: sunSample.time,
          sunVisible,
          earthVisible,
          condition:
            sunVisible && earthVisible
              ? "SUN_AND_EARTH"
              : sunVisible
                ? "SUN_ONLY"
                : earthVisible
                  ? "EARTH_ONLY"
                  : "NEITHER"
        };
      }
    );

    // Returning astronomical data and baseline visibility
    return Response.json({
      application: "LuNav",
      source: "NASA JPL Horizons",
      observer: sunData.observer,
      model: "Ideal Horizon - No Terrain",
      thresholdDeg: 0,
      sun: sunData.observations,
      earth: earthData.observations,
      conditions
    });


  } catch (error) {
    return Response.json(
      { error: String(error) },
      { status: 502 }
    );
  }
}
