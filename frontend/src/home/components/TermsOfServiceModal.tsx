import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';

interface TermsOfServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TermsOfServiceModal: React.FC<TermsOfServiceModalProps> = ({ isOpen, onClose }) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-gray-900 border-gray-700 text-white no-scrollbar">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white">
            이용약관
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 text-sm leading-relaxed">
          <section>
            <h3 className="text-lg font-semibold text-blue-400 mb-3">1. 서비스 이용 목적</h3>
            <p className="text-gray-300 mb-2">
              본 플랫폼은 ANA 백준 그룹 동아리원들의 알고리즘 문제 풀이 활동을 
              시각화하고 분석하여 학습 효과를 높이기 위한 교육 목적의 서비스입니다.
            </p>
            <p className="text-gray-300">
              서버에 접근 권한이 있는 동아리원들은 공정하고 안전한 환경에서 
              서비스를 운영할 수 있도록 운영방침을 준수해야 합니다.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-blue-400 mb-3">2. 서버 접근 권한자의 책임</h3>
            <p className="text-gray-300 mb-2">
              본 서비스는 ANA 백준 그룹 동아리원들이 공동으로 사용하는 
              서버 환경에서 운영되며, 서버 접근 권한이 있는 동아리원들은 다음 사항을 인식해야 합니다:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
              <li>동일한 데이터베이스 서버 및 백엔드 서버에 직접 접근 가능</li>
              <li>동아리원 모두의 데이터가 한 곳에 저장되어 관리</li>
              <li>서버 리소스 및 네트워크 대역폭을 공유하여 운영</li>
              <li>시스템 안정성에 모든 동아리원이 영향을 받음</li>
              <li><strong>서버 접근 권한은 신뢰와 책임을 동반함</strong></li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-red-400 mb-3">3. 금지 행위 (중요)</h3>
            <p className="text-gray-300 mb-2">
              다음 행위들을 엄격히 금지합니다:
            </p>
            <ul className="list-disc list-inside text-red-300 space-y-1 ml-4">
              <li><strong>서버 공격 및 테러 행위</strong> - DDoS, 무차별 공격, 서비스 중단 시도</li>
              <li><strong>데이터베이스 공격</strong> - SQL 인젝션, 무차별 로그인 시도, DB 무결성 훼손</li>
              <li><strong>시스템 해킹</strong> - 하드웨어/소프트웨어 취약점 악용, 권한 상승 시도</li>
              <li><strong>데이터 조작</strong> - 가중치 변경, 점수 조작, 랭킹 시스템 왜곡</li>
              <li><strong>악성 코드 실행</strong> - 바이러스, 트로이 목마, 백도어 설치</li>
              <li><strong>권한 남용</strong> - 다른 동아리원의 데이터 무단 접근 및 수정</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-blue-400 mb-3">4. 서버 안정성 보호 의무</h3>
            <p className="text-gray-300 mb-2">
              서버 접근 권한이 있는 동아리원들은 서비스의 안정성을 보호하기 위해 다음 사항을 준수해야 합니다:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
              <li>정상적인 API 호출 범위 내에서 서비스 이용</li>
              <li>과도한 요청으로 인한 서버 부하 방지</li>
              <li>데이터베이스 쿼리 최적화 및 효율적 사용</li>
              <li>시스템 리소스의 합리적 사용</li>
              <li>서버 로그 모니터링 및 이상 징후 조기 발견</li>
              <li>정기적인 백업 및 복구 절차 준수</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-blue-400 mb-3">5. 데이터 무결성 보호 의무</h3>
            <p className="text-gray-300 mb-2">
              백준 그룹의 공개 정보를 기반으로 한 데이터의 신뢰성을 유지하기 위해:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
              <li>원본 데이터의 변경 없이 시각화 및 분석만 수행</li>
              <li>가중치, 점수, 랭킹 등 핵심 데이터의 조작 금지</li>
              <li>데이터 수집 과정에서의 정확성 유지</li>
              <li>시스템 오류 발생 시 즉시 보고 및 조치</li>
              <li>데이터 백업 및 복구 절차 준수</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-blue-400 mb-3">6. 동아리원 간 협력 및 신뢰</h3>
            <p className="text-gray-300 mb-2">
              공동 서버 환경에서의 원활한 서비스 운영을 위해:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
              <li>서비스 이용 중 문제 발견 시 즉시 개발팀에 보고</li>
              <li>시스템 개선 제안 및 건의사항 공유</li>
              <li>다른 동아리원의 정상적인 서비스 이용 방해 금지</li>
              <li>서버 접근 권한에 대한 신뢰 관계 유지</li>
              <li>권한이 없는 동아리원들에게 서버 접근 방법 노출 금지</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-red-400 mb-3">7. 위반 시 조치</h3>
            <p className="text-gray-300 mb-2">
              본 약관을 위반하는 경우 다음과 같은 조치가 취해질 수 있습니다:
            </p>
            <ul className="list-disc list-inside text-red-300 space-y-1 ml-4">
              <li><strong>1차 경고</strong> - 위반 행위 중단 요청 및 경고</li>
              <li><strong>2차 제한</strong> - 서비스 이용 제한 및 접근 권한 축소</li>
              <li><strong>3차 제재</strong> - 서비스 이용 완전 차단 및 동아리 활동 제한</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-blue-400 mb-3">8. 문의 및 신고</h3>
            <p className="text-gray-300 mb-2">
              서비스 이용 중 문제가 발생하거나 위반 행위를 발견한 경우:
            </p>
            <div className="bg-gray-800 p-4 rounded-lg">
              <p className="text-gray-300 mb-2">
                <strong>GitHub Issues:</strong> 
                <a 
                  href="https://github.com/ANA-CNU/anabada-new/issues" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 ml-2"
                >
                  https://github.com/ANA-CNU/anabada-new/issues
                </a>
              </p>
              <p className="text-gray-300 text-xs">
                * 긴급한 보안 문제는 제목에 "[보안]"을 포함해 주시기 바랍니다.
              </p>
            </div>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-blue-400 mb-3">9. 약관 변경</h3>
            <p className="text-gray-300">
              본 이용약관은 서비스 운영 상황에 따라 변경될 수 있으며, 
              변경 시 플랫폼 내 공지사항을 통해 사전에 고지합니다.
            </p>
          </section>

          <div className="text-center pt-4">
            <p className="text-gray-400 text-xs">
              본 약관은 2025년 09월 01일부터 시행됩니다.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TermsOfServiceModal;
