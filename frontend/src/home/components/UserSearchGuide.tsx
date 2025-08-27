import React from 'react';

const UserSearchGuide: React.FC = () => {
  return (
    <div className="w-full p-6 bg-white/5 rounded-lg border border-white/10 text-white">
      <h3 className="text-xl font-semibold mb-2">사용자 검색 가이드</h3>
      <p className="text-gray-300 mb-4">사용자 BOJ 핸들 또는 한국어 이름으로 검색 후 결과를 클릭하면 프로필 페이지로 이동합니다.</p>
      <div className="space-y-2 text-sm text-gray-300">
        <div>
          <span className="text-white font-medium">프로필에서 볼 수 있는 정보</span>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>랭킹 변화 차트(평균 순위·1위 횟수·분포 포함)</li>
            <li>최근 점수 기록(변동 사유·점수·일자)</li>
            <li>최근 해결한 문제(레벨·티어·해결 일자)</li>
            <li>기본 통계(정답 수, 정답률, 평균 점수 등)</li>
            <li>외부 핸들(AtCoder, Codeforces) 링크</li>
          </ul>
        </div>
        <div className="pt-2">
          <span className="text-white font-medium">이용 팁</span>
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>검색 후 Enter로 바로 조회할 수 있어요.</li>
            <li>프로필에서 뒤로 가기를 눌러 검색으로 돌아올 수 있어요.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default UserSearchGuide;
