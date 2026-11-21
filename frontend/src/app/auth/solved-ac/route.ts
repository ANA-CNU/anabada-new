import { startLogin } from "@/server/auth/handlers";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = startLogin;
