import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X, Plus, Users, Award, Settings, Copy } from "lucide-react";
import { URL } from "@/resource/constant";

interface ScoreEntry {
  id: string;
  username: string;
  weight: number;
  reason: string;
}

interface ScoreManagementProps {
  nameList: string[];
}

function ScoreManagement({ nameList }: ScoreManagementProps) {
  const [entries, setEntries] = useState<ScoreEntry[]>([]);
  const [currentInput, setCurrentInput] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [bulkWeight, setBulkWeight] = useState("");
  const [bulkReason, setBulkReason] = useState("");
  const [isAddingEntry, setIsAddingEntry] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // 자동완성 필터링
  useEffect(() => {
    if (currentInput.trim() === "") {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const filtered = nameList.filter(name =>
      name.toLowerCase().includes(currentInput.toLowerCase())
    );
    setSuggestions(filtered.slice(0, 5)); // 최대 5개 제안
    setShowSuggestions(filtered.length > 0);
    setSelectedSuggestionIndex(-1);
  }, [currentInput, nameList]);

  // 키보드 네비게이션
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (selectedSuggestionIndex >= 0) {
        selectSuggestion(suggestions[selectedSuggestionIndex]);
      } else if (currentInput.trim()) {
        addEntry();
      }
      return;
    }

    if (!showSuggestions) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedSuggestionIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case "Escape":
        setShowSuggestions(false);
        setCurrentInput("");
        break;
    }
  };

  const selectSuggestion = (username: string) => {
    setCurrentInput(username);
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
  };

  const addEntry = () => {
    if (!currentInput.trim()) return;
    
    const newEntry: ScoreEntry = {
      id: Date.now().toString(),
      username: currentInput.trim(),
      weight: 0,
      reason: ""
    };
    
    setEntries(prev => [...prev, newEntry]);
    setCurrentInput("");
    setIsAddingEntry(false);
  };

  const removeEntry = (id: string) => {
    setEntries(prev => prev.filter(entry => entry.id !== id));
  };

  const updateEntry = (id: string, field: keyof ScoreEntry, value: string | number) => {
    setEntries(prev => prev.map(entry => 
      entry.id === id ? { ...entry, [field]: value } : entry
    ));
  };

  const applyBulkWeight = () => {
    if (!bulkWeight || isNaN(Number(bulkWeight))) return;
    
    setEntries(prev => prev.map(entry => ({
      ...entry,
      weight: Number(bulkWeight)
    })));
  };

  const applyBulkReason = () => {
    if (!bulkReason.trim()) return;
    
    setEntries(prev => prev.map(entry => ({
      ...entry,
      reason: bulkReason.trim()
    })));
  };

  const handleSubmit = () => {
    console.log("점수 관리 데이터:", entries);
    const records = entries.map(e => ({
      username: e.username,
      bias: Number(e.weight) || 0,
      desc: e.reason ?? ""
    }));

    fetch(`${URL}/api/score-history/bulk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({ records })
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.success === false) {
          throw new Error(data?.message || `요청 실패 (status ${res.status})`);
        }
        return data;
      })
      .then((data) => {
        console.log("등록 성공:", data);
        alert(`등록 완료: ${data.insertedCount}건, 실패: ${data.failed?.length || 0}건`);
      })
      .catch((err) => {
        console.error("등록 실패:", err);
        alert(`등록 실패: ${err.message}`);
      });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">점수 관리</h2>
        <p className="text-muted-foreground">
          사용자별 점수 가중치와 이유를 설정합니다.
        </p>
      </div>

      {/* 일괄 설정 카드 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            일괄 설정
          </CardTitle>
          <CardDescription>
            모든 항목에 동일한 가중치나 이유를 한 번에 적용할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bulkWeight">일괄 가중치</Label>
              <div className="flex gap-2">
                <Input
                  id="bulkWeight"
                  type="number"
                  value={bulkWeight}
                  onChange={(e) => setBulkWeight(e.target.value)}
                  placeholder="모든 항목에 적용할 가중치"
                />
                <Button onClick={applyBulkWeight} variant="outline">
                  적용
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="bulkReason">일괄 이유</Label>
              <div className="flex gap-2">
                <Input
                  id="bulkReason"
                  value={bulkReason}
                  onChange={(e) => setBulkReason(e.target.value)}
                  placeholder="모든 항목에 적용할 이유"
                />
                <Button onClick={applyBulkReason} variant="outline">
                  적용
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 사용자 추가 카드 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            사용자 추가
          </CardTitle>
          <CardDescription>
            점수 관리를 적용할 사용자를 추가하세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="relative">
              <Label htmlFor="username">사용자 이름</Label>
              <div className="flex gap-2 mt-2">
                <div className="flex-1 relative">
                  <Input
                    ref={inputRef}
                    id="username"
                    value={currentInput}
                    onChange={(e) => setCurrentInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setShowSuggestions(true)}
                    placeholder="사용자 이름을 입력하세요"
                  />
                  
                  {/* 자동완성 드롭다운 */}
                  {showSuggestions && suggestions.length > 0 && (
                    <div
                      ref={suggestionsRef}
                      className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto"
                    >
                      {suggestions.map((suggestion, index) => (
                        <div
                          key={suggestion}
                          className={`px-3 py-2 cursor-pointer hover:bg-gray-100 ${
                            index === selectedSuggestionIndex ? 'bg-gray-100' : ''
                          }`}
                          onClick={() => selectSuggestion(suggestion)}
                        >
                          {suggestion}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Button onClick={addEntry} disabled={!currentInput.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 점수 관리 목록 */}
      {entries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              점수 관리 목록 ({entries.length}명)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {entries.map((entry) => (
                <div key={entry.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-sm">
                      {entry.username}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeEntry(entry.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`weight-${entry.id}`}>가중치</Label>
                      <Input
                        id={`weight-${entry.id}`}
                        type="number"
                        value={entry.weight}
                        onChange={(e) => updateEntry(entry.id, 'weight', Number(e.target.value))}
                        placeholder="가중치 입력"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor={`reason-${entry.id}`}>이유</Label>
                      <Input
                        id={`reason-${entry.id}`}
                        value={entry.reason}
                        onChange={(e) => updateEntry(entry.id, 'reason', e.target.value)}
                        placeholder="가중치 적용 이유"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 제출 버튼 */}
      {entries.length > 0 && (
        <div className="flex gap-4">
          <Button onClick={handleSubmit} className="flex-1">
            점수 관리 적용
          </Button>
          <Button variant="outline" onClick={() => setEntries([])}>
            목록 초기화
          </Button>
        </div>
      )}
    </div>
  );
}

export default ScoreManagement; 