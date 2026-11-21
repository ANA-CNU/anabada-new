import type { NextRequest } from "next/server";
import { fetchBackend } from "@/server/backend";

type Context = { params: Promise<{ path: string[] }> };
const maxBodyLength = 256 * 1024;

function bodyError(status: number, error: string) {
  return Response.json({ success: false, error }, { status });
}

async function gateway(request: NextRequest, { params }: Context) {
  const { path } = await params;
  if (path.some((part) => !/^[A-Za-z0-9_.-]+$/.test(part) || part === "." || part === ".."))
    return bodyError(400, "올바르지 않은 API 경로입니다.");

  const isWrite = request.method !== "GET" && request.method !== "HEAD";
  const appOrigin = process.env.APP_ORIGIN ?? "http://localhost:20050";
  if (isWrite && request.headers.get("origin") !== appOrigin)
    return bodyError(403, "요청 출처를 확인할 수 없습니다.");

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  if (isWrite) headers.set("origin", appOrigin);
  const session = request.cookies.get("anabada_session")?.value;
  if (session) headers.set("cookie", `anabada_session=${encodeURIComponent(session)}`);

  if (isWrite && Number(request.headers.get("content-length")) > maxBodyLength)
    return bodyError(413, "요청이 너무 큽니다.");

  try {
    const body = isWrite ? await request.arrayBuffer() : undefined;
    if (body && body.byteLength > maxBodyLength)
      return bodyError(413, "요청이 너무 큽니다.");

    const response = await fetchBackend(`/api/${path.join("/")}${request.nextUrl.search}`, {
      method: request.method,
      headers,
      body,
      signal: AbortSignal.timeout(isWrite ? 60_000 : 10_000),
    });
    const responseHeaders = new Headers({ "cache-control": "no-store" });
    const responseType = response.headers.get("content-type");
    if (responseType) responseHeaders.set("content-type", responseType);
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch {
    return bodyError(502, "서비스에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
  }
}

export { gateway as GET, gateway as HEAD, gateway as POST, gateway as PUT, gateway as PATCH, gateway as DELETE };
