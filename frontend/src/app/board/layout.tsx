import type { ReactNode } from 'react';
import { PublicShell } from '@/components/site/public-shell';
export default function BoardLayout({ children }: { readonly children: ReactNode }) {
  return <PublicShell><main>{children}</main></PublicShell>;
}
