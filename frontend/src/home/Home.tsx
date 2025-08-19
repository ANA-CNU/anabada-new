import Background from "./stats/Background";
import LeftHeadWrapper from "./layout/LeftHeadWrapper";
import RightHeadWrapper from "./layout/RightHeadWrapper";
import UnifiedRankList from "./components/UnifiedRankList";
import Header from "./layout/Header";
import StatsSection from "./stats/StatsSection";
import EventSection from "./components/EventSection";
import ActivitySection from "./components/ActivitySection";
import Footer from "./components/Footer";

function Home() {
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

        <ActivitySection/>
        <StatsSection/>
        
        <EventSection/>
        
        <Footer />
      </Background>
      
    </div>
  );
}

export default Home; 