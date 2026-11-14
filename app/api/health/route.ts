export async function GET() {
  return Response.json({
    application: "LuNAv",
    status: "operational",
    message: "LuNAv backend is working!"
  });
}