import { fetchBackend } from "@/server/backend";

export async function GET() {
  try {
    const responses = [fetchBackend("/health")];
    const endpoint = process.env.MINIO_ENDPOINT;
    if (endpoint) {
      const scheme = process.env.MINIO_USE_SSL === "true" ? "https" : "http";
      const port = process.env.MINIO_PORT ?? "9000";
      responses.push(fetch(`${scheme}://${endpoint}:${port}/minio/health/ready`, {
        cache: "no-store",
        signal: AbortSignal.timeout(3_000),
      }));
    }
    const readiness = await Promise.allSettled(responses.map(async (request) => {
      const response = await request;
      await response.body?.cancel();
      return response.ok;
    }));
    if (readiness.every((result) => result.status === "fulfilled" && result.value))
      return Response.json({ status: "ok" });
  } catch {
    // Invalid service configuration leaves readiness false.
  }
  return Response.json({ status: "unavailable" }, { status: 503 });
}
