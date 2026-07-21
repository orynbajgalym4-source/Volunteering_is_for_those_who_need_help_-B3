export async function GET() {
  return Response.json({ status: "ok", service: "asar", timestamp: new Date().toISOString() });
}
