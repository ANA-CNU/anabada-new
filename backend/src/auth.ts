import jwt from "jsonwebtoken";

export interface AdminAuthorizer {
  isAdmin(request: Request): boolean;
}

function tokenFromCookie(cookie: string | null): string | undefined {
  if (!cookie) return undefined;
  const value = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("accessToken="))
    ?.slice("accessToken=".length);
  if (!value) return undefined;
  const decoded = decodeURIComponent(value);
  return decoded.startsWith("Bearer ")
    ? decoded.slice("Bearer ".length)
    : undefined;
}

export class AdminAuthenticator implements AdminAuthorizer {
  constructor(private readonly secret: string) {}

  isAdmin(request: Request): boolean {
    const token = tokenFromCookie(request.headers.get("cookie"));
    if (!token) return false;
    try {
      const payload = jwt.verify(token, this.secret);
      return typeof payload !== "string" && payload.role === "admin";
    } catch {
      return false;
    }
  }
}
