import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ isOpen, onClose }) => {
  const currentYear = new Date().getFullYear();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto bg-gray-900 border-gray-700 text-white no-scrollbar">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-white">
            개인정보처리방침
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 text-sm leading-relaxed">
          <section>
            <h3 className="text-lg font-semibold text-blue-400 mb-3">1. 개인정보 수집 및 이용 목적</h3>
            <p className="text-gray-300 mb-2">
              본 플랫폼은 ANA 백준 그룹에 가입된 사용자들의 공개된 정보를 수집하여 
              알고리즘 문제 풀이 활동을 시각화하고 분석하는 서비스를 제공합니다.
            </p>
            <p className="text-gray-300">
              수집되는 정보는 백준 그룹에서 공개적으로 제공되는 문제 해결 기록, 
              제출 현황, 랭킹 정보 등으로 제한됩니다.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-blue-400 mb-3">2. 개인정보 수집 방법</h3>
            <p className="text-gray-300 mb-2">
              사용자가 ANA 백준 그룹에 가입하는 행위는 본 플랫폼에서 
              개인정보를 수집하고 처리하는 것에 대한 동의로 간주됩니다.
            </p>
            <p className="text-gray-300">
              백준 그룹 가입 시점부터 자동으로 정보 수집이 시작되며, 
              별도의 추가 동의 절차는 없습니다.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-blue-400 mb-3">3. 개인정보 이용 범위</h3>
            <p className="text-gray-300 mb-2">
              수집된 개인정보는 다음과 같은 목적으로만 이용됩니다:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
              <li>사용자별 문제 해결 현황 시각화</li>
              <li>기여도 및 활동 통계 제공</li>
              <li>랭킹 시스템 및 성과 분석</li>
              <li>플랫폼 서비스 개선 및 최적화</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-blue-400 mb-3">4. 공개 정보 활용 및 서비스 제공</h3>
            <p className="text-gray-300 mb-2">
              본 플랫폼은 백준 그룹에서 공개적으로 제공되는 정보를 활용하여 
              다음과 같은 서비스를 제공합니다:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
              <li>백준 그룹 공개 정보의 자동 수집 및 분석</li>
              <li>사용자 활동 데이터의 시각화 및 통계 제공</li>
              <li>그룹 내 기여도 및 성과 비교 분석</li>
              <li>교육 및 학습 목적의 데이터 재가공</li>
            </ul>
            <p className="text-gray-300 mt-2">
              모든 수집 정보는 백준 그룹에서 공개적으로 제공되는 범위 내에서만 
              활용되며, 비공개 정보는 수집하지 않습니다.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-blue-400 mb-3">5. 개인정보 처리 중단 및 철회</h3>
            <p className="text-gray-300 mb-2">
              사용자는 언제든지 개인정보 처리 중단을 요청할 수 있습니다:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
              <li>ANA 백준 그룹에서 탈퇴</li>
              <li>GitHub Issues를 통한 문의 요청</li>
              <li>개발팀에 직접 연락</li>
            </ul>
            <p className="text-gray-300 mt-2">
              처리 중단 요청 시 30일 이내에 관련 데이터를 삭제하고 
              서비스 제공을 중단합니다.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-blue-400 mb-3">6. 비영리 목적 및 상업적 이용 금지</h3>
            <p className="text-gray-300 mb-2">
              본 플랫폼은 순수하게 교육 및 학습 목적으로 운영되며, 
              다음과 같은 사항을 엄격히 준수합니다:
            </p>
            <ul className="list-disc list-inside text-gray-300 space-y-1 ml-4">
              <li>수집된 개인정보의 상업적 이용 금지</li>
              <li>제3자에게 개인정보 제공 금지</li>
              <li>광고 수익 창출 목적의 데이터 활용 금지</li>
              <li>사용자 동의 없는 마케팅 활동 금지</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-blue-400 mb-3">7. 문의 및 연락처</h3>
            <p className="text-gray-300 mb-2">
              개인정보 처리와 관련된 문의사항이 있으시면 
              다음 경로를 통해 연락해 주시기 바랍니다:
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
                * 개인정보 관련 문의 시 제목에 "[개인정보]"를 포함해 주시기 바랍니다.
              </p>
            </div>
          </section>

          <section>
            <h3 className="text-lg font-semibold text-blue-400 mb-3">8. 개인정보처리방침 변경</h3>
            <p className="text-gray-300">
              본 개인정보처리방침은 법령 및 방침에 따라 변경될 수 있으며, 
              변경 시 플랫폼 내 공지사항을 통해 사전에 고지합니다.
            </p>
          </section>

          <div className="text-center pt-4">
            <p className="text-gray-400 text-xs">
              본 방침은 {currentYear}년 {new Date().getMonth() + 1}월 {new Date().getDate()}일부터 시행됩니다.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PrivacyPolicyModal;
