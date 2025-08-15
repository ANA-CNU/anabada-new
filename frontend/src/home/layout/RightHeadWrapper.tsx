import { useState, useEffect } from "react";
import { dummyRanked, Ranked } from "@/resource/dummy";
import RankedList from "../components/RankedList";
import { URL } from "@/resource/constant";

function RightHeadWrapper() {
  const [rankingData, setRankingData] = useState<Ranked[]>([]);

  useEffect(() => {
    const fetchRankingData = async () => {
      try {
        const response = await fetch(`${URL}/api/ranking/solved`);
        const result = await response.json();
        
        if (result.success) {
          setRankingData(result.data);
        }
      } catch (error) {
        console.error('랭킹 데이터 가져오기 실패:', error);
      }
    };

    fetchRankingData();
  }, []);

  const [boardData, setBoardData] = useState(dummyRanked);

  useEffect(() => {
    const fetchBoardData = async () => {
      try {
        const response = await fetch(`${URL}/api/board/latest`);
        const result = await response.json();
        
        if (result.success) {
          setBoardData(result.data);
        }
      } catch (error) {
        console.error('보드 데이터 가져오기 실패:', error);
      }
    };

    fetchBoardData();
  }, []);

  return (
    <div className="h-auto lg:h-full w-full lg:w-[60%] flex flex-row justify-center items-start lg:items-center">
      <RankedList list={boardData} showBias={true} />
      <RankedList list={rankingData} showBias={false} />
    </div>
  );
}

export default RightHeadWrapper; 