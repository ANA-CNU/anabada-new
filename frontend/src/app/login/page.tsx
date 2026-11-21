import { ArrowRight, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { PublicShell } from "@/components/site/public-shell";
import { getSession } from "@/server/auth/session";

export const metadata = { title: "로그인" };

const messages = new Map([
  ["not_member", "아직 수집기가 회원 정보를 확인하지 못했어요. 백준 ANA 그룹에 가입한 뒤 회원 정보가 반영되면 다시 로그인해 주세요."],
  ["boj_required", "solved.ac에서 인증된 백준 계정을 연결해 주세요. 백준 ANA 그룹에 가입한 계정으로 로그인할 수 있습니다."],
  ["cancelled", "로그인을 취소했습니다."],
  ["invalid_state", "로그인 요청이 만료되었거나 확인되지 않았습니다. 다시 시작해 주세요."],
  ["unavailable", "지금은 로그인에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요."],
  ["admin_required", "관리자 권한이 필요한 페이지입니다."],
]);

export default async function LoginPage({ searchParams }: { readonly searchParams: Promise<{ error?: string }> }) {
  const [params, session] = await Promise.all([searchParams, getSession()]);
  const message = params.error && messages.get(params.error);
  return (
    <PublicShell>
      <main className="site-frame site-signin">
        <section className="site-signin-copy">
          <h1>로그인</h1>
          {message && <p role="alert" className="site-notice">{message}</p>}
          {session ? (
            <>
              <p><strong>{session.displayName}</strong> 님으로 로그인되어 있어요.</p>
              <div className="site-actions">
                <Link className="site-button site-button-primary" href="/board">게시판으로 이동 <ArrowRight aria-hidden="true" size={18} /></Link>
                {session.isAdmin && <Link className="site-text-link" href="/admin">관리자 화면 <ArrowUpRight aria-hidden="true" size={17} /></Link>}
              </div>
            </>
          ) : (
            <>
              <p>백준 ANA 그룹에 가입한 계정이 필요해요.<br />solved.ac에서 인증된 백준 계정으로 로그인하세요.</p>
              <a href="/auth/solved-ac" className="site-button site-button-solved">
                <span>solved.ac로 로그인</span>
                <ArrowRight aria-hidden="true" size={18} />
              </a>
            </>
          )}
          <div className="site-signin-help">
            <Link className="site-text-link" href="/enter">
              <span>처음 방문하셨나요?</span>
              <ArrowUpRight aria-hidden="true" size={16} />
            </Link>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
