import type { ReactNode } from "react";
import { PublicShell } from "@/components/site/public-shell";
import styles from "./policies.module.css";

export default function PoliciesLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <PublicShell>
      <main className={`site-frame ${styles.page}`}>
        <article className={styles.document}>{children}</article>
      </main>
    </PublicShell>
  );
}
