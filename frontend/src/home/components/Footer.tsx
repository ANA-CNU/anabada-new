import { Code, Github, ListChecks, Users } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const repository = "https://github.com/ANA-CNU/anabada-new";

const contributors: readonly { readonly name: string; readonly github?: string }[] = [
  { name: "황현석", github: "https://github.com/hy3ons" },
  { name: "최민우", github: "https://github.com/Sunkist18" },
  { name: "안우진", github: "https://github.com/awj1052" },
  { name: "이준휘" },
];

const features = [
  { label: "실시간 기여도 추적", dot: "bg-blue-400" },
  { label: "문제 해결 히스토리", dot: "bg-green-400" },
  { label: "이벤트 및 활동 현황", dot: "bg-purple-400" },
  { label: "시각적 통계 대시보드", dot: "bg-yellow-400" },
] as const;

const footerLink = "inline-flex min-h-11 items-center text-white/70 hover:text-white hover:underline underline-offset-4";
const footerTitle = "flex min-h-10 items-center gap-2 text-base font-semibold";
const footerList = "mt-2 text-sm leading-5 text-white/70";
const footerListRow = "min-h-7 items-center gap-2";
const copyrightYear = new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "Asia/Seoul" });

export default function Footer({ className }: { readonly className?: string }) {
  return (
    <footer className={cn("site-footer w-full break-keep [overflow-wrap:anywhere] border-t border-white/10 bg-black/20 text-white", className)}>
      <div className="site-footer-inner mx-auto max-w-7xl py-8">
        <div className="site-footer-columns pb-7">
          <div className="site-footer-about">
            <h2 className={footerTitle}>
              <Link href="/" className="inline-flex min-h-10 items-center gap-2">
                <Code className="size-5 text-blue-400" aria-hidden="true" />Anabada
              </Link>
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/70">
              충남대학교 ANA 알고리즘 커뮤니티입니다. 문제 풀이 기록과 기여도를 한눈에 볼 수 있습니다.
            </p>
            <nav aria-label="하단 메뉴" className="mt-2 flex flex-wrap gap-x-4 text-sm">
              <Link href="/enter" className={footerLink}>참여 안내</Link>
              <a href="https://anacnu.kr" className={footerLink}>ANA 동아리</a>
              <a href="https://www.acmicpc.net/group/ranklist/13872" className={footerLink}>백준 그룹</a>
              <a href={repository} className={footerLink}>GitHub</a>
            </nav>
          </div>

          <div>
            <h2 className={footerTitle}>
              <ListChecks className="size-5" aria-hidden="true" />주요 기능
            </h2>
            <ul className={footerList}>
              {features.map(({ label, dot }) => (
                <li key={label} className={cn("flex", footerListRow)}>
                  <span className={cn("size-2 rounded-full", dot)} aria-hidden="true" />
                  {label}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className={footerTitle}>
              <Users className="size-5" aria-hidden="true" />제작자
            </h2>
            <ul aria-label="제작자 목록" className={footerList}>
              {contributors.map(({ name, github }) => {
                const identity = <><Github className="size-4 shrink-0" aria-hidden="true" />{name}</>;
                return (
                  <li key={name}>
                    {github ? (
                      <a href={github} target="_blank" rel="noopener noreferrer" className={cn(footerLink, footerListRow)}>
                        {identity}
                      </a>
                    ) : <span className={cn("inline-flex", footerListRow)}>{identity}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="site-footer-legal gap-4 border-t border-white/10 pt-6 text-sm text-white/70">
          <div>
            <p>&copy; {copyrightYear.format(new Date())} Anabada. All rights reserved.</p>
            <p className="mt-1 text-xs">이 프로젝트는 교육 및 학습 목적으로 제작되었습니다.</p>
          </div>
          <nav aria-label="정책 및 문의" className="flex flex-wrap gap-x-5">
            <Link href="/privacy" className={footerLink}>개인정보처리방침</Link>
            <Link href="/terms" className={footerLink}>이용약관</Link>
            <a href={`${repository}/issues`} target="_blank" rel="noopener noreferrer" className={footerLink}>문의하기</a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
