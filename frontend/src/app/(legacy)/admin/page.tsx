import Admin from "@/admin/Admin";
import { requireAdmin } from "@/server/auth/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "관리자 | ANABADA" };

export default async function AdminPage() {
  await requireAdmin();
  return <Admin />;
}
