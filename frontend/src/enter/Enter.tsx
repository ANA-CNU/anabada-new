import Background from "../home/stats/Background";
import Header from "../home/layout/Header";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Trophy, Users, MessageCircle, BookOpen, Star, CheckCircle } from "lucide-react";

function Enter() {
  return (
    <div className="min-h-screen w-full bg-[#0a1026]">
      <Background>
        <div className="w-full min-h-screen flex flex-col">
          <Header />

          <main className="flex-1 flex items-center justify-center py-8 px-4">
            <div className="w-full max-w-[900px] rounded-3xl bg-gradient-to-br from-white/10 to-white/5 border border-white/20 shadow-2xl backdrop-blur-sm p-8 sm:p-12 text-white">
              {/* 헤더 섹션 */}
              <div className="text-center mb-10">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full mb-6 shadow-lg">
                  <Trophy className="w-10 h-10 text-white" />
                </div>
                <h1 className="text-4xl sm:text-5xl font-bold mb-4 bg-gradient-to-r from-yellow-400 via-orange-400 to-red-500 bg-clip-text text-transparent">
                  ANABADA 참여 안내
                </h1>
                <p className="text-xl text-white/80 max-w-2xl mx-auto">
                  알고리즘 문제 해결 능력을 향상시키고, 동료들과 함께 성장하는 ANABADA에 참여해보세요!
                </p>
              </div>

              {/* 참여 혜택 섹션 */}
              <div className="mb-10 p-6 rounded-2xl bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-400/30">
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                  <Star className="w-6 h-6 text-yellow-400" />
                  참여 혜택
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-400 mt-1 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-white">실력 향상</h3>
                      <p className="text-white/70 text-sm">체계적인 문제 풀이로 알고리즘 실력 증진</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-400 mt-1 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-white">동료 학습</h3>
                      <p className="text-white/70 text-sm">함께 문제를 풀며 서로 도움</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-400 mt-1 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-white">경쟁 의식</h3>
                      <p className="text-white/70 text-sm">랭킹 시스템으로 동기부여</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-400 mt-1 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-white">성취감</h3>
                      <p className="text-white/70 text-sm">문제 해결의 즐거움과 성취감</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 상품 혜택 섹션 */}
              <div className="mb-10 p-6 rounded-2xl bg-gradient-to-r from-yellow-500/20 to-red-500/20 border border-yellow-400/30">
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                  <Trophy className="w-6 h-6 text-yellow-400" />
                  상품 혜택
                </h2>
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-white/10 border border-white/20">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">🥇🥈🥉</span>
                      <div>
                        <h3 className="font-bold text-lg text-white">1~3등</h3>
                        <p className="text-white/80">배민 10,000원 상품권</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-white/10 border border-white/20">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">🏅</span>
                      <div>
                        <h3 className="font-bold text-lg text-white">4~7등</h3>
                        <p className="text-white/80">스타벅스 아이스 아메리카노 기프티콘</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-yellow-500/20 rounded-lg border border-yellow-400/30">
                    <p className="text-yellow-200 text-sm text-center">
                      💡 매월 말 랭킹에 따라 상품이 지급됩니다!
                    </p>
                  </div>
                </div>
              </div>

              {/* 참여 절차 섹션 */}
              <div className="mb-10">
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                  <BookOpen className="w-6 h-6 text-blue-400" />
                  참여 절차
                </h2>
                <div className="space-y-6">
                  <div className="flex items-start gap-4 p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all duration-300">
                    <div className="flex items-center justify-center w-10 h-10 bg-blue-500 rounded-full text-white font-bold text-lg flex-shrink-0">
                      1
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-2">ANA 동아리 담당자 연락</h3>
                      <p className="text-white/80 mb-2">ANA 동아리 임원진 중 담당자에게 연락하여 ANABADA 참여 의사를 밝힙니다.</p>
                      <div className="text-sm text-blue-300 bg-blue-500/20 px-3 py-1 rounded-full inline-block">
                        💡 연락처: 동아리실 또는 ANA 공식 채널을 통해 문의
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all duration-300">
                    <div className="flex items-center justify-center w-10 h-10 bg-green-500 rounded-full text-white font-bold text-lg flex-shrink-0">
                      2
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-2">참여 의사 확인</h3>
                      <p className="text-white/80 mb-2">담당자와 상담하여 ANABADA 참여에 대한 상세한 안내를 받습니다.</p>
                      <div className="text-sm text-green-300 bg-green-500/20 px-3 py-1 rounded-full inline-block">
                        📋 참여 규칙과 운영 방침을 꼼꼼히 확인하세요
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all duration-300">
                    <div className="flex items-center justify-center w-10 h-10 bg-purple-500 rounded-full text-white font-bold text-lg flex-shrink-0">
                      3
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-2">Baekjoon 그룹 가입</h3>
                      <p className="text-white/80 mb-2">Baekjoon Online Judge의 ANABADA 그룹에 가입하여 문제 풀이 기록을 관리합니다.</p>
                      <div className="text-sm text-purple-300 bg-purple-500/20 px-3 py-1 rounded-full inline-block">
                        🔗 그룹 링크는 담당자로부터 받을 수 있습니다
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all duration-300">
                    <div className="flex items-center justify-center w-10 h-10 bg-orange-500 rounded-full text-white font-bold text-lg flex-shrink-0">
                      4
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-2">카카오톡 그룹방 참여</h3>
                      <p className="text-white/80 mb-2">카카오톡 그룹방에 참여하여 푼 문제의 스크린샷을 업로드하고 동료들과 소통합니다.</p>
                      <div className="text-sm text-orange-300 bg-orange-500/20 px-3 py-1 rounded-full inline-block">
                        📱 실시간 소통과 문제 풀이 인증을 위한 필수 단계
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 주의사항 섹션 */}
              <div className="mb-10 p-6 rounded-2xl bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-400/30">
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                  <MessageCircle className="w-6 h-6 text-yellow-400" />
                  주의사항
                </h2>
                <ul className="space-y-3 text-white/90">
                  <li className="flex items-start gap-2">
                    <span className="text-yellow-400">⚠️</span>
                    <span>문제 풀이 시 본인의 힘으로 해결하는 것을 원칙으로 합니다.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-yellow-400">⚠️</span>
                    <span>스크린샷 업로드는 필수가 아닌 권고사항 입니다. 되도록이면 업로드 해주세요.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-yellow-400">⚠️</span>
                    <span>그룹방 내에서는 서로를 배려하고 격려하는 분위기를 유지해주세요.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-yellow-400">⚠️</span>
                    <span>규칙을 위반할 경우 참여 자격이 제한될 수 있습니다.</span>
                  </li>
                </ul>
              </div>

              {/* 문의 섹션 */}
              <div className="mb-10 p-6 rounded-2xl bg-gradient-to-r from-green-500/20 to-blue-500/20 border border-green-400/30">
                <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                  <Users className="w-6 h-6 text-green-400" />
                  문의 및 연락처
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="font-semibold mb-2">ANA 동아리실</h3>
                    <p className="text-white/80 text-sm">위치: 공과대학5호관 315호</p>
                    {/* <p className="text-white/80 text-sm">운영시간: 평일 09:00 - 18:00</p> */}
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">온라인 문의</h3>
                    <p className="text-white/80 text-sm">카카오톡: 카카오톡 그룹방 내의 문의 담당자</p>
                    <p className="text-white/80 text-sm">이메일: hhs2003@o.cnu.ac.kr</p>
                  </div>
                </div>
              </div>

              {/* 액션 버튼 */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <Link to="/">
                  <Button className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-8 py-3 text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300">
                    메인으로 돌아가기
                  </Button>
                </Link>
                {/* <Button className="bg-gradient-to-r from-green-500 to-blue-600 hover:from-green-600 hover:to-blue-700 text-white px-8 py-3 text-lg font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-300">
                  참여 신청하기
                </Button> */}
              </div>

              {/* 하단 안내 */}
              <div className="mt-8 text-center">
                <p className="text-white/60 text-sm">
                  ANABADA는 여러분의 알고리즘 실력 향상을 위해 노력합니다. 
                  <br />
                  함께 성장하는 여정에 동참해주세요! 🚀
                </p>
              </div>
            </div>
          </main>
        </div>
      </Background>
    </div>
  );
}

export default Enter;

