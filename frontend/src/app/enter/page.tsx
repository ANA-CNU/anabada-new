import { ArrowUpRight } from "lucide-react";
import { PublicShell } from "@/components/site/public-shell";

export const metadata = { title: "참여 안내" };

const steps = [
  { title: "ANA 담당자에게 문의", description: "동아리실이나 ANA 공식 채널에서 참여 의사를 알려 주세요. 담당자가 운영 규칙과 참여 방법을 안내해드리고 있습니다." },
  { title: "백준 ANA 그룹 가입", description: "백준 계정으로 ANA 그룹에 가입해 주세요. solved.ac에 무조건 연결해야 연동이 진행됩니다." },
  { title: "풀이 기록이 반영되면 로그인", description: "수집기가 회원 정보를 반영하면 bada 사이트에 로그인하여 게시판에 글을 작성할 수 있어요!" },
];

export default function EnterPage() {
  return (
    <PublicShell>
      <main className="site-frame site-guide">
        <header className="site-guide-heading">
          <h1>참여 안내</h1>
          <p>백준에서 풀고,<br />ANA에서 같이 공부해요.</p>
          <a className="site-button site-button-primary" href="https://www.acmicpc.net/group/ranklist/13872">백준 ANA 그룹 <ArrowUpRight aria-hidden="true" size={18} /></a>
        </header>
        <section className="site-guide-section">
          <h2>가입 순서</h2>
          <ol>{steps.map(({ title, description }) => <li key={title}><h3>{title}</h3><p>{description}</p></li>)}</ol>
        </section>
        <section className="site-guide-section">
          <h2>월간 랭킹 상품</h2>
          <dl><div><dt>1~3위</dt><dd>배달의민족 10,000원 상품권</dd></div><div><dt>4~7위</dt><dd>스타벅스 아이스 아메리카노 기프티콘</dd></div></dl>
        </section>
        <section className="site-guide-section">
          <h2>같이 공부하는 규칙</h2>
          <p>문제는 AI로 작성하지 않고 직접 해결해야 합니다. 그룹방에서는 서로를 존중해 주세요! 운영 규칙을 위반하면 참여가 제한될 수 있습니다.</p>
        </section>
        <section className="site-guide-section">
          <h2>문의</h2>
          <div><p>ANA 동아리실 · 공과대학 5호관 315호</p><p>카카오톡 그룹방 담당자 · <a href="mailto:hhs2003@o.cnu.ac.kr">hhs2003@o.cnu.ac.kr</a></p></div>
        </section>
      </main>
    </PublicShell>
  );
}
