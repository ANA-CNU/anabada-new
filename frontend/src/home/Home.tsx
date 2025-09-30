import React from 'react';
import Header from './layout/Header';
import LeftHeadWrapper from './layout/LeftHeadWrapper';
import RightHeadWrapper from './layout/RightHeadWrapper';
import UnifiedRankList from './components/UnifiedRankList';
import ActivitySection from './components/ActivitySection';
import StatsSection from './stats/StatsSection';
import EventSection from './components/EventSection';
import Background from './stats/Background';
import UserSearch from './components/UserSearch';
import UserSearchGuide from './components/UserSearchGuide';
import Footer from './components/Footer';
import LastMonthRanking from './components/LastMonthRanking';
import ContestEndNotice from './components/ContestEndNotice';

const Home: React.FC = () => {
  return (
    <div className="min-h-screen w-full bg-[#0a1026]">
      <Background>
        <div className="w-full min-h-screen flex flex-col mb-10">
          <Header />
          <div className="flex-1 flex flex-col items-center justify-center lg:flex-row lg:items-center lg:px-3 gap-4 lg:gap-0 py-4 lg:py-0">
            <LeftHeadWrapper />
            <UnifiedRankList />
          </div>
        </div>

        <LastMonthRanking />
        <ContestEndNotice />

        {/* 10.01자 부터 추첨판 고정 시키고 컴포넌트 언락 */}

        <ActivitySection/>
        <StatsSection/>
        
        <EventSection/>
        
        {/* 사용자 검색 섹션: 2-column */}
        <section className="py-16 px-4 lg:px-6">
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <div className="order-2 lg:order-1">
              <UserSearch wide />
            </div>
            <div className="order-1 lg:order-2">
              <UserSearchGuide />
            </div>
          </div>
        </section>

        <Footer />
      </Background>
    </div>
  );
};

export default Home; 