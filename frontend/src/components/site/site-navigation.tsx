"use client";

import { ChevronDown, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SquircleSurface } from "@/components/ui/squircle";
import { contestSeries } from "@/contest/contest-archive";

type MenuLink = { href: string; label: string };

function SiteMenu({ trigger, className, active, align, links, children }: {
  trigger: ReactNode;
  className: string;
  active?: boolean;
  align?: "center" | "end";
  links: readonly MenuLink[];
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={className} data-active={active}>{trigger}</button>
      </PopoverTrigger>
      <PopoverContent align={align} sideOffset={8} collisionPadding={12} className="site-menu-panel">
        {links.map(({ href, label }) => (
          <SquircleSurface key={href} asChild radius="control">
            <Link href={href} onClick={() => setOpen(false)}>{label}</Link>
          </SquircleSurface>
        ))}
        {children}
      </PopoverContent>
    </Popover>
  );
}

const contestLinks = [
  { href: "/contest", label: "대회 아카이브" },
  ...contestSeries.map(({ id, name }) => ({ href: `/contest#contest-series-${id}`, label: name })),
];

export function SiteNavigation() {
  const pathname = usePathname();
  const onBlog = pathname === "/board" || pathname.startsWith("/board/");
  return (
    <nav aria-label="주요 메뉴" className="site-nav">
      <Link href="/board" aria-current={onBlog ? "page" : undefined}>블로그</Link>
      <SiteMenu
        trigger={<>대회 <ChevronDown aria-hidden="true" size={14} /></>}
        active={pathname === "/contest" || pathname.startsWith("/contest/")}
        className="site-nav-trigger"
        links={contestLinks}
      />
    </nav>
  );
}

export function AccountMenu({ handle, userId, isAdmin }: { handle: string; userId: number; isAdmin: boolean }) {
  const links = [
    { href: `/user/${userId}`, label: "내 프로필" },
    { href: "/board/mine", label: "내 글" },
    { href: "/settings", label: "설정" },
    ...(isAdmin ? [{ href: "/admin", label: "관리자 대시보드" }] : []),
  ];
  return (
    <SiteMenu
      trigger={<><UserRound aria-hidden="true" size={18} /><span>{handle}</span></>}
      className="site-login site-account-trigger"
      align="end"
      links={links}
    >
      <form action="/auth/logout" method="post">
        <SquircleSurface asChild radius="control">
          <button type="submit">로그아웃</button>
        </SquircleSurface>
      </form>
    </SiteMenu>
  );
}
