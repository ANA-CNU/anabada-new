"use client";

import { useState } from "react";
import { Calendar, Clock, Plus, X, AlertCircle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function EventAdd() {
  const [eventTitle, setEventTitle] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("18:00");
  const [problemIds, setProblemIds] = useState("");
  const [selectedProblems, setSelectedProblems] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const handleAddProblems = () => {
    if (!problemIds.trim()) return;
    
    const newProblems = problemIds
      .split(",")
      .map(id => id.trim().replace(/\s+/g, ""))
      .filter(id => {
        // 숫자만 허용하고 50000 미만만 허용
        const numId = parseInt(id);
        return id && 
               /^\d+$/.test(id) && 
               numId < 50000 && 
               !selectedProblems.includes(id);
      });
    
    setSelectedProblems(prev => [...prev, ...newProblems]);
    setProblemIds("");
  };

  const handleRemoveProblem = (problemId: string) => {
    setSelectedProblems(prev => prev.filter(id => id !== problemId));
  };

  const handleSubmit = () => {
    const newErrors: string[] = [];
    
    if (!eventTitle.trim()) {
      newErrors.push("이벤트 제목을 입력해주세요.");
    }
    
    if (!startDate) {
      newErrors.push("시작 날짜를 선택해주세요.");
    }
    
    if (!endDate) {
      newErrors.push("종료 날짜를 선택해주세요.");
    }
    
    if (selectedProblems.length === 0) {
      newErrors.push("최소 하나 이상의 문제를 추가해주세요.");
    }
    
    if (newErrors.length > 0) {
      setErrors(newErrors);
      return;
    }
    
    // TODO: 서버에 이벤트 추가 API 호출
    const eventData = {
      title: eventTitle,
      startDate: startDate ? new Date(startDate.getTime() + new Date(`2000-01-01T${startTime}`).getTime()).toISOString() : "",
      endDate: endDate ? new Date(endDate.getTime() + new Date(`2000-01-01T${endTime}`).getTime()).toISOString() : "",
      problemIds: selectedProblems
    };
    
    console.log("이벤트 추가:", eventData);
    // 여기에 실제 API 호출 로직 추가
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">이벤트 추가</h2>
        <p className="text-muted-foreground">
          새로운 이벤트를 생성합니다.
        </p>
      </div>

      {errors.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2 text-red-600">
              <AlertCircle className="h-4 w-4" />
              <span className="font-medium">다음 오류를 수정해주세요:</span>
            </div>
            <ul className="mt-2 list-disc list-inside text-sm text-red-600">
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6">
        {/* 이벤트 기본 정보 */}
        <Card>
          <CardHeader>
            <CardTitle>이벤트 정보</CardTitle>
            <CardDescription>
              이벤트의 기본 정보를 입력해주세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="event-title">이벤트 제목 *</Label>
              <Input
                id="event-title"
                placeholder="이벤트 제목을 입력하세요"
                value={eventTitle}
                onChange={(e) => setEventTitle(e.target.value)}
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="start-date-picker" className="px-1">
                  시작 날짜 *
                </Label>
                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        id="start-date-picker"
                        className="w-32 justify-between font-normal"
                      >
                        {startDate ? startDate.toLocaleDateString() : "날짜 선택"}
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={startDate}
                        captionLayout="dropdown"
                        fromYear={2020}
                        toYear={2030}
                        onSelect={(date) => {
                          setStartDate(date)
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                  <Input
                    type="time"
                    step="1"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="bg-background appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="end-date-picker" className="px-1">
                  종료 날짜 *
                </Label>
                <div className="flex gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        id="end-date-picker"
                        className="w-32 justify-between font-normal"
                      >
                        {endDate ? endDate.toLocaleDateString() : "날짜 선택"}
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto overflow-hidden p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={endDate}
                        captionLayout="dropdown"
                        fromYear={2020}
                        toYear={2030}
                        onSelect={(date) => {
                          setEndDate(date)
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                  <Input
                    type="time"
                    step="1"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="bg-background appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 문제 추가 */}
        <Card>
          <CardHeader>
            <CardTitle>문제 추가</CardTitle>
            <CardDescription>
              쉼표로 구분하여 문제 ID를 입력하세요. (1-49999, 예: 1001, 1002, 1003)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex space-x-2">
              <Input
                placeholder="문제 ID를 쉼표로 구분하여 입력하세요 (1-49999)"
                value={problemIds}
                onChange={(e) => {
                  // 숫자와 쉼표만 허용
                  const value = e.target.value.replace(/[^0-9,]/g, '');
                  setProblemIds(value);
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleAddProblems();
                  }
                }}
              />
              <Button onClick={handleAddProblems}>
                <Plus className="h-4 w-4 mr-2" />
                추가
              </Button>
            </div>
            
            {selectedProblems.length > 0 && (
              <div className="space-y-2">
                <Label>선택된 문제 ({selectedProblems.length}개)</Label>
                <div className="flex flex-wrap gap-2">
                  {selectedProblems.map((problemId) => (
                    <Badge
                      key={problemId}
                      variant="secondary"
                      className="flex items-center space-x-1 cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => handleRemoveProblem(problemId)}
                    >
                      <span>{problemId}</span>
                      <X className="h-3 w-3" />
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 이벤트 추가 버튼 */}
        <div className="flex justify-end">
          <Button 
            size="lg" 
            onClick={handleSubmit}
            className="px-8"
          >
            <Plus className="h-4 w-4 mr-2" />
            이벤트 추가하기
          </Button>
        </div>
      </div>
    </div>
  );
} 