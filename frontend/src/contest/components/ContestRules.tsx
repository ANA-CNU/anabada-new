import React from "react";

const ContestRules: React.FC = () => {
  return (
    <section className="mt-8 rounded-2xl bg-gradient-to-b from-white/6 to-white/3 border border-white/10 p-6 text-white">
      <h2 className="text-lg font-bold mb-3">대회 규칙</h2>
      <ol className="list-decimal list-inside space-y-1 text-white/80">
        <li>대회 입장 수속간에 운영진이 각 참가자에게 대회 참가 전용 백준 온라인 저지 계정을 발부, 대회 전용 계정으로 참가 진행</li>
        <li>본인이 지참한 노트북으로 백준에 접속하여 문제 풀이진행</li>
        <li>ICPC(대학생 프로그래밍 경시대회)의 평가 기준에 의거해서, 더 많은 문제를 더 빨리 푼 사람이 평가에 우위를 가짐</li>
        <li>프로그래밍 언어 선택 자유, 인터넷 검색 가능, IDE 사용 가능, 미리 작성한 코드 허용, ChatGPT, Copilot, Bing AI 등 자동으로 소스 코드를 작성해주는 서비스 사용 금지</li>
      </ol>
    </section>
  );
};

export default ContestRules;


