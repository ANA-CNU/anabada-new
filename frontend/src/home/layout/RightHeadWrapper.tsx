import { dummyRanked } from "@/resource/dummy";
import RankedList from "../components/RankedList";

function RightHeadWrapper() {
  return (
    <div className="h-auto lg:h-full w-full lg:w-[60%] flex flex-row justify-center items-start lg:items-center">
      <RankedList list={dummyRanked} />
      <RankedList list={dummyRanked} />
    </div>
  );
}

export default RightHeadWrapper; 