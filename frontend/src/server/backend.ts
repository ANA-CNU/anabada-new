import "server-only";

function backendUrl(path: string): URL {
  if (!(path.startsWith("/api/") || path === "/health") || path.includes("\\"))
    throw new TypeError("Invalid backend path");
  return new URL(path, process.env.BACKEND_URL ?? "http://127.0.0.1:3000");
}

export function fetchBackend(path: string, options: RequestInit = {}) {
  return fetch(backendUrl(path), {
    ...options,
    cache: "no-store",
    redirect: "error",
    signal: options.signal ?? AbortSignal.timeout(5_000),
  });
}

export class BackendHttpError extends Error {
  constructor(readonly status: number) {
    super(`Backend request failed: ${status}`);
    this.name = "BackendHttpError";
  }
}

export async function backendJson<T>(path: string): Promise<T> {
  const response = await fetchBackend(path);
  if (!response.ok) throw new BackendHttpError(response.status);
  return response.json() as Promise<T>;
}
