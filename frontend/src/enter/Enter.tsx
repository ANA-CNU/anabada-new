import Background from "../home/stats/Background";
import Header from "../home/layout/Header";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

function Enter() {
  return (
    <div className="min-h-screen w-full bg-[#0a1026]">
      <Background>
        <div className="w-full min-h-screen flex flex-col">
          <Header />

          <main className="flex-1 flex items-center justify-center py-8 px-4">
            <div className="w-full max-w-[820px] rounded-2xl bg-white/5 border border-white/10 shadow-sm p-6 sm:p-8 text-white">
              <h1 className="text-3xl sm:text-4xl font-bold mb-6">ANABADA 참여 안내</h1>

              <ol className="list-decimal list-inside space-y-3 text-white/90">
                <li>ANA 동아리 임원진 중 담당자에게 연락합니다.</li>
                <li>ANABADA 참여 의사를 밝힙니다.</li>
                <li>Baekjoon 그룹에 가입합니다.</li>
                <li>카카오톡 그룹방에 참여하여 푼 문제 스크린샷을 추가로 업로드합니다.</li>
              </ol>

              <div className="mt-8 flex gap-3">
                <Link to="/">
                  <Button className="bg-white/5 hover:bg-white/10 border border-white/10 text-white">
                    메인으로 돌아가기
                  </Button>
                </Link>
              </div>
            </div>
          </main>

        </div>
      </Background>
    </div>
  );
}

export default Enter;

