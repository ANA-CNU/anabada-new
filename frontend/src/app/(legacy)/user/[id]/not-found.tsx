import Link from "next/link";

export default function UserNotFound() {
  return (
    <main className="min-h-screen bg-[#0a1026] text-white flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold" role="alert">사용자를 찾을 수 없습니다.</h1>
      <Link className="underline" href="/">홈으로</Link>
    </main>
  );
}
