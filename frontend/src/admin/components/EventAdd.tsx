"use client";

import { useState } from "react";
import { Calendar, Clock, Plus, X, AlertCircle, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { URL } from "@/resource/constant";

export function EventAdd() {
  const [eventTitle, setEventTitle] = useState("");
  const [eventDesc, setEventDesc] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("18:00");
  const [problemIds, setProblemIds] = useState("");
  const [selectedProblems, setSelectedProblems] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [dateError, setDateError] = useState<string>("");


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

  // 날짜 유효성 검사 함수
  const validateDates = () => {
    if (startDate && endDate) {
      const startDateTime = new Date(startDate.getTime() + new Date(`2000-01-01T${startTime}`).getTime());
      const endDateTime = new Date(endDate.getTime() + new Date(`2000-01-01T${endTime}`).getTime());
      
      if (endDateTime <= startDateTime) {
        setDateError("종료일시는 시작일시보다 늦어야 합니다.");
        return false;
      } else {
        setDateError("");
        return true;
      }
    }
    setDateError("");
    return true;
  };

  const handleSubmit = async () => {
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
    
    // 날짜 유효성 검사
    if (!validateDates()) {
      newErrors.push("날짜를 올바르게 설정해주세요.");
    }
    
    if (selectedProblems.length === 0) {
      newErrors.push("최소 하나 이상의 문제를 추가해주세요.");
    }
    
    if (newErrors.length > 0) {
      setErrors(newErrors);
      return;
    }
    
    setIsSubmitting(true);
    setErrors([]);
    setSuccessMessage("");
    
    try {
      // 날짜와 시간을 올바르게 결합하여 YYYY-MM-DD HH:MM:SS 형식으로 생성
      const createDateTime = (date: Date, time: string) => {
        const [hours, minutes] = time.split(':').map(Number);
        const newDate = new Date(date);
        newDate.setHours(hours, minutes, 0, 0);
        return newDate;
      };
      
      const startDateTime = createDateTime(startDate!, startTime);
      const endDateTime = createDateTime(endDate!, endTime);
      
      // YYYY-MM-DD HH:MM:SS 형식으로 변환하는 함수
      const formatToMySQLDateTime = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      };
      
      const eventData = {
        title: eventTitle.trim(),
        desc: eventDesc.trim() || null,
        begin: formatToMySQLDateTime(startDateTime), // YYYY-MM-DD HH:MM:SS 형식
        end: formatToMySQLDateTime(endDateTime),     // YYYY-MM-DD HH:MM:SS 형식
        problems: selectedProblems.map(id => parseInt(id))
      };
      
      console.log("이벤트 생성 요청:", eventData);
      
      const response = await fetch(`${URL}/api/event/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // 쿠키 포함
        body: JSON.stringify(eventData)
      });
      
      const result = await response.json();
      
      if (result.success) {
        setSuccessMessage('이벤트가 성공적으로 생성되었습니다!');
        // 폼 초기화
        setEventTitle("");
        setEventDesc("");
        setStartDate(undefined);
        setEndDate(undefined);
        setStartTime("10:00");
        setEndTime("18:00");
        setSelectedProblems([]);
        setProblemIds("");
      } else {
        setErrors([result.message || '이벤트 생성에 실패했습니다.']);
      }
    } catch (error) {
      console.error('이벤트 생성 오류:', error);
      setErrors(['서버 연결에 실패했습니다. 다시 시도해주세요.']);
    } finally {
      setIsSubmitting(false);
    }
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

      {successMessage && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2 text-green-600">
              <AlertCircle className="h-4 w-4" />
              <span className="font-medium">{successMessage}</span>
            </div>
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
            
            <div className="space-y-2">
              <Label htmlFor="event-desc">이벤트 설명</Label>
              <Textarea
                id="event-desc"
                placeholder="이벤트에 대한 설명을 입력하세요 (선택사항)"
                value={eventDesc}
                onChange={(e) => setEventDesc(e.target.value)}
                rows={3}
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
                          setStartDate(date);
                          // 날짜 변경 시 유효성 검사
                          setTimeout(() => validateDates(), 100);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                  <Input
                    type="time"
                    step="1"
                    value={startTime}
                    onChange={(e) => {
                      setStartTime(e.target.value);
                      // 시간 변경 시 유효성 검사
                      setTimeout(() => validateDates(), 100);
                    }}
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
                          setEndDate(date);
                          // 시간 변경 시 유효성 검사
                          setTimeout(() => validateDates(), 100);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                  <Input
                    type="time"
                    step="1"
                    value={endTime}
                    onChange={(e) => {
                      setEndTime(e.target.value);
                      // 시간 변경 시 유효성 검사
                      setTimeout(() => validateDates(), 100);
                    }}
                    className="bg-background appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                  />
                </div>
              </div>
            </div>
            
            {/* 날짜 오류 메시지 */}
            {dateError && (
              <div className="text-red-600 text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {dateError}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 문제 추가 */}
        <Card>
          <CardHeader>
            <CardTitle>문제 추가</CardTitle>
            <CardDescription>
              쉼표로 구분하여 문제 ID를 입력하세요. (1-49999, 예: 1001, 1002, 1003)
              {`   string.split(',').map(id => IntParse(id.trim()))`}
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
            disabled={isSubmitting}
            className="px-8"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                생성 중...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                이벤트 추가하기
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
} 