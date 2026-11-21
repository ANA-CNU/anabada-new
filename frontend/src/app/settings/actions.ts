"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { updateProfile } from "@/server/auth/profile";

const profileSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력해 주세요.").max(25, "이름은 25자까지 입력할 수 있습니다."),
  atcoder: z.string().trim().regex(/^[A-Za-z0-9_]{0,50}$/, "AtCoder 핸들은 영문, 숫자, 밑줄을 사용할 수 있습니다."),
  codeforces: z.string().trim().regex(/^[A-Za-z0-9_.-]{0,50}$/, "Codeforces 핸들은 영문, 숫자, 마침표, 밑줄, 하이픈을 사용할 수 있습니다."),
});

export type ProfileValues = z.infer<typeof profileSchema>;
export type SettingsState = {
  values: ProfileValues;
  fields?: Partial<Record<keyof ProfileValues, string[]>>;
  error?: string;
  saved?: boolean;
};

export async function saveProfile(_previous: SettingsState, form: FormData): Promise<SettingsState> {
  const { userId } = await requireSession();
  const values = {
    name: String(form.get("name") ?? ""),
    atcoder: String(form.get("atcoder") ?? ""),
    codeforces: String(form.get("codeforces") ?? ""),
  };
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) return { values, fields: z.flattenError(parsed.error).fieldErrors };

  try {
    await updateProfile(userId, parsed.data);
  } catch (error) {
    console.error("Profile save failed", error);
    return { values, error: "설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
  revalidatePath("/settings");
  revalidatePath(`/user/${userId}`);
  return { values: parsed.data, saved: true };
}
