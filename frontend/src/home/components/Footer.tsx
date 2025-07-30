import React from "react";
import { Github, Heart, Code, Users } from "lucide-react";

interface Contributor {
  name: string;
  github: string;
  role?: string;
}

function Footer() {
  const contributors: Contributor[] = [
    {
      name: "황현석",
      github: "https://github.com/hy3ons",
      role: "Contributor"
    },
    {
      name: "최민우", 
      github: "https://github.com/Sunkist18",
      role: "Contributor"
    },
    {
      name: "안우진",
      github: "https://github.com/awj1052", 
      role: "Contributor"
    },
    {
      name: "이준희",
      github: "https://github.com/example3", 
      role: "Contributor"
    },
  ];

  const currentYear = new Date().getFullYear();

  return (
    <footer className="w-full bg-black/20 backdrop-blur-md border-t border-white/10 mt-20">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* 메인 Footer 콘텐츠 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* 프로젝트 정보 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Code className="w-6 h-6 text-blue-400" />
              <h3 className="text-white font-bold text-lg">Anabada</h3>
            </div>
            <p className="text-white/70 text-sm leading-relaxed">
              알고리즘 문제 풀이와 기여도를 시각화하는 플랫폼입니다. 
              사용자들의 문제 해결 과정을 추적하고 성과를 한눈에 볼 수 있습니다.
            </p>
            <div className="flex items-center gap-2 text-white/60 text-xs">
              <Heart className="w-4 h-4 text-red-400" />
              <span>Made with passion for coding</span>
            </div>
          </div>

          {/* 주요 기능 */}
          <div className="space-y-4">
            <h4 className="text-white font-semibold text-base">주요 기능</h4>
            <ul className="space-y-2 text-white/70 text-sm">
              <li className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                실시간 기여도 추적
              </li>
              <li className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                문제 해결 히스토리
              </li>
              <li className="flex items-center gap-2">
                <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                이벤트 및 활동 현황
              </li>
              <li className="flex items-center gap-2">
                <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                시각적 통계 대시보드
              </li>
            </ul>
          </div>

          {/* 제작자 정보 */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-white/80" />
              <h4 className="text-white font-semibold text-base">제작자</h4>
            </div>
            <div className="space-y-3">
              {contributors.map((contributor, index) => (
                <div key={index} className="group">
                  <a
                    href={contributor.github}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-white/70 hover:text-white transition-colors duration-200 group-hover:scale-105"
                  >
                    <Github className="w-4 h-4" />
                    <span className="text-sm font-medium">{contributor.name}</span>
                    {contributor.role && (
                      <span className="text-xs text-white/50">({contributor.role})</span>
                    )}
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 구분선 */}
        <div className="border-t border-white/10 mb-6"></div>

        {/* 하단 정보 */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          {/* 저작권 정보 */}
          <div className="text-white/60 text-sm">
            <p>&copy; {currentYear} Anabada. All rights reserved.</p>
            <p className="text-xs mt-1">
              이 프로젝트는 교육 및 학습 목적으로 제작되었습니다.
            </p>
          </div>

          {/* 추가 링크들 */}
          <div className="flex items-center gap-6 text-white/60 text-sm">
            <a 
              href="#" 
              className="hover:text-white transition-colors duration-200"
            >
              개인정보처리방침
            </a>
            <a 
              href="#" 
              className="hover:text-white transition-colors duration-200"
            >
              이용약관
            </a>
            <a 
              href="#" 
              className="hover:text-white transition-colors duration-200"
            >
              문의하기
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer; 