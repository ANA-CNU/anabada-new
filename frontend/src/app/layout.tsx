import type { Metadata } from "next";
import type { ReactNode } from "react";
import "../index.css";
import "./site.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://bada.anacnu.com"),
  title: { default: "ANABADA — ANA 알고리즘 커뮤니티", template: "%s | ANABADA" },
  description: "충남대학교 ANA 알고리즘 커뮤니티. 백준 풀이와 랭킹을 보고, 게시판에서 서로의 풀이를 나눠요.",
  manifest: "/manifest.json",
  icons: { icon: "/ana_icon.png" },
  openGraph: { title: "ANABADA", description: "충남대학교 ANA 알고리즘 커뮤니티", images: ["/og_image_sq.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="ko"><body className="desktop-site">{children}</body></html>;
}
