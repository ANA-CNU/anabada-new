import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import Footer from "@/home/components/Footer";
import { getSession } from "@/server/auth/session";
import { AccountMenu, SiteNavigation } from "./site-navigation";

const badaLogo = readFileSync(join(process.cwd(), "public/images/bada-logo.webp"), "base64");
const badaLogoSrc = `data:image/webp;base64,${badaLogo}`;

export async function PublicShell({ children }: Readonly<{ children: ReactNode }>) {
  const session = await getSession();
  return (
    <div className="public-site public-shell">
      <a className="site-skip" href="#site-content">본문 바로가기</a>
      <header className="site-header">
        <div className="site-frame site-header-inner">
          <Link href="/" className="site-mark" aria-label="bada 홈">
            <Image src={badaLogoSrc} width={224} height={61} alt="" unoptimized />
          </Link>
          <SiteNavigation />
          {session ? (
            <AccountMenu handle={session.handle} userId={session.userId} isAdmin={session.isAdmin} />
          ) : (
            <Link href="/login" className="site-login">
              <span className="site-login-label">로그인</span>
              <ArrowUpRight aria-hidden="true" size={16} />
            </Link>
          )}
        </div>
      </header>
      <div id="site-content" className="site-content" role="region" aria-label="페이지 본문" tabIndex={0}>
        <div className="desktop-site">{children}</div>
      </div>
      <Footer />
    </div>
  );
}
