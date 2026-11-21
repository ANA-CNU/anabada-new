import type { ReactNode } from "react";

export default function LegacyLayout({ children }: { readonly children: ReactNode }) {
  return <div className="legacy-app">{children}</div>;
}
