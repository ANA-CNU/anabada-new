import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { db } from "@/server/db";

type Profile = {
  readonly name: string;
  readonly atcoder: string;
  readonly codeforces: string;
};

interface ProfileRow extends RowDataPacket {
  korean_name: string | null;
  atcoder_handle: string | null;
  codeforces_handle: string | null;
}

export async function getProfile(userId: number): Promise<Profile | null> {
  const [[row]] = await db.execute<ProfileRow[]>(
    "SELECT korean_name, atcoder_handle, codeforces_handle FROM user WHERE id=? AND ignored=0",
    [userId],
  );
  if (!row) return null;
  return {
    name: row.korean_name ?? "",
    atcoder: row.atcoder_handle ?? "",
    codeforces: row.codeforces_handle ?? "",
  };
}

export async function updateProfile(userId: number, profile: Profile): Promise<void> {
  await db.execute(
    "UPDATE user SET korean_name=?, atcoder_handle=?, codeforces_handle=? WHERE id=? AND ignored=0",
    [profile.name, profile.atcoder || null, profile.codeforces || null, userId],
  );
}
