import type { Metadata } from "next";
import { UserRound } from "lucide-react";
import { redirect } from "next/navigation";
import { PublicShell } from "@/components/site/public-shell";
import { requireSession } from "@/server/auth/session";
import { getProfile } from "@/server/auth/profile";
import { ProfileForm } from "./ProfileForm";
import styles from "./settings.module.css";

export const metadata: Metadata = { title: "설정 | ANABADA" };

export default async function SettingsPage() {
  const session = await requireSession();
  const profile = await getProfile(session.userId);
  if (!profile) redirect("/login");
  return (
    <PublicShell>
      <main className={`site-frame ${styles.page}`}>
        <header>
          <h1>설정</h1>
          <p className={styles.account}><UserRound size={18} aria-hidden="true" />{session.handle}</p>
        </header>
        <section className={styles.section} aria-labelledby="profile-heading">
          <div>
            <h2 id="profile-heading">프로필</h2>
            <p>이름과 다른 저지에서 사용하는 핸들을 수정할 수 있습니다.</p>
          </div>
          <ProfileForm profile={profile} />
        </section>
      </main>
    </PublicShell>
  );
}
