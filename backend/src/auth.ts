import jwt from "jsonwebtoken";
import { z } from "zod";

export interface AdminAuthorizer {
  isAdmin(request: Request): boolean | Promise<boolean>;
}

type AdminLookup = (userId: number, solvedAcId: string) => Promise<boolean>;
const claims = z.object({
  sub: z.string().regex(/^[1-9]\d*$/),
  solvedAcId: z.string().regex(/^[1-9]\d*$/),
  exp: z.number(),
  iat: z.number(),
});

export class AdminAuthenticator implements AdminAuthorizer {
  constructor(
    private readonly secret: string,
    private readonly lookup: AdminLookup = async () => false,
    private readonly allowedOrigin?: string,
  ) {}

  async isAdmin(request: Request): Promise<boolean> {
    const token = request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("anabada_session="))
      ?.slice("anabada_session=".length);
    if (!token) return false;
    if (
      !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
      (!this.allowedOrigin ||
        request.headers.get("origin") !== this.allowedOrigin)
    )
      return false;
    try {
      const payload = claims.safeParse(
        jwt.verify(decodeURIComponent(token), this.secret, {
          algorithms: ["HS256"],
          issuer: "anabada",
          audience: "anabada-web",
        }),
      );
      if (!payload.success) return false;
      const userId = Number(payload.data.sub);
      if (!Number.isSafeInteger(userId) || userId > 4_294_967_295) return false;
      return await this.lookup(userId, payload.data.solvedAcId);
    } catch (error) {
      if (error instanceof Error) return false;
      throw error;
    }
  }
}
