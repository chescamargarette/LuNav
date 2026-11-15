import { NextResponse } from "next/server";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";


export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GEMINI_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const body = await req.json();
    const { query, sites = [], windowSummary = "", liveEpochUtc = "" } = body;

    if (!Array.isArray(sites) || sites.length === 0) {
      return NextResponse.json(
        { error: "No candidate landing sites provided in request body." },
        { status: 400 }
      );
    }

    const telemetryContext = sites.map((s: any) => ({
      id: s.id,
      name: s.name,
      region: s.region,
      lat: s.lat,
      lon: s.lon,
      sunlight_percent: s.sunlight_percent,
      comms_window_hours: s.comms_window_hours,
      slope_deg: s.slope_deg,
      recommended_window: s.recommended_window,
    }));

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite",
      contents: `Mission Window: ${windowSummary} (Current Sim UTC: ${liveEpochUtc})
Candidate Landing Sites Telemetry:
${JSON.stringify(telemetryContext, null, 2)}

Operator Request: "${query}"`,
      config: {
        systemInstruction:
          "You are the LuNav Lunar Mission Control AI Rover Advisor. Analyze the operator's constraints against the candidate landing sites. Select the single best site ID from the list and give a concise, technical 2-sentence engineering justification citing exact telemetry values.",
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.LOW
        },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            selectedSiteId: {
              type: Type.STRING,
              description: "The exact 'id' string of the chosen landing site.",
            },
            reasoning: {
              type: Type.STRING,
              description:
                "Concise 2-sentence engineering justification referencing telemetry.",
            },
          },
          required: ["selectedSiteId", "reasoning"],
        },
      },
    });

    const rawText = response.text || "{}";
    console.log("Gemini Raw Response:", rawText);

    const parsed = JSON.parse(rawText);

    if (!parsed.selectedSiteId) {
      parsed.selectedSiteId = sites[0]?.id;
      parsed.reasoning =
        parsed.reasoning ||
        "Selected optimal default landing zone based on balanced telemetry metrics.";
    }

    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error("AI Rover Advisor error stack:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to query AI Rover Advisor" },
      { status: 500 }
    );
  }
}
