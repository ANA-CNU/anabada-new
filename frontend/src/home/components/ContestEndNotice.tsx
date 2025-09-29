import React from "react";
import { Link } from "react-router-dom";

const ContestEndNotice: React.FC = () => {
  return (
    <section className="w-full px-10 mb-10 lg:px-20 py-6">
      <div className="max-w-6xl mx-auto">
        <div className="w-full rounded-2xl bg-gradient-to-r from-green-400/20 via-emerald-200/10 to-white/5 outline outline-1 outline-green-300/30 outline-offset-0 text-white p-6 md:p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500/20 rounded-full mb-4">
              <span className="text-3xl">🎉</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-bold mb-3 text-green-300">
              🏆 2025 충남대학교 SW-IT Contest 종료!
            </h2>
            <p className="text-white/80 text-sm md:text-base mb-4">
              대회가 성공적으로 마무리되었습니다. 참여해주신 모든 분들께 감사의 인사를 전합니다.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div className="bg-white/5 p-4 rounded-lg p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-3 text-green-300">
                📝 대회 문제 공개
              </h3>
              <p className="text-white/70 text-sm mb-3">
                대회에서 출제된 모든 문제들이 백준 온라인 저지에 공개되었습니다.
              </p>
              <Link
                to="https://www.acmicpc.net/category/detail/4575"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-4 py-2 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-400/40 rounded-lg text-blue-300 hover:text-blue-200 transition-colors"
              >
                문제 보러 가기 →
              </Link>
            </div>

            <div className="bg-white/5 p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-3 text-green-300">
                📖 에디토리얼 공개
              </h3>
              <p className="text-white/70 text-sm mb-3">
                대회 문제들의 정해 및 해설을 포함한 에디토리얼을 확인하실 수 있습니다.
              </p>
              <button
                disabled
                className="inline-flex items-center px-4 py-2 bg-gray-600/20 border border-gray-400/40 rounded-lg text-gray-300 cursor-not-allowed opacity-50"
              >
                준비중... 📄
              </button>
            </div>
          </div>

          <div className="text-center pt-4 border-t border-white/10">
            <p className="text-green-400 font-medium text-base">
              내년에도 더욱 멋진 대회로 찾아뵙겠습니다!
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContestEndNotice;
