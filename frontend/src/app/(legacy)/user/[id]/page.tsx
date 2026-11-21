import { notFound } from "next/navigation";
import { BackendHttpError } from "@/server/backend";
import UserProfile from "@/home/components/UserProfile";
import { loadProfile } from "@/home/server-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "사용자 프로필 | ANABADA" };

export default async function UserPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d*$/.test(id)) notFound();
  try {
    const data = await loadProfile(id);
    return <UserProfile key={id} {...data} />;
  } catch (error) {
    if (error instanceof BackendHttpError && (error.status === 400 || error.status === 404)) notFound();
    throw error;
  }
}
