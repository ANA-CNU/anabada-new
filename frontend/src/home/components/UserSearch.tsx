import { SquircleSurface } from "@/components/ui/squircle";
import React, { useState } from 'react';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Search, User } from 'lucide-react';
import { URL } from '@/resource/constant';
import { getTierName } from '../../lib/utils';
import type { User as JungolUser } from '@/types';

interface UserSearchProps {
  onUserSelect?: (user: JungolUser) => void;
  wide?: boolean;
}

const UserSearch: React.FC<UserSearchProps> = ({ onUserSelect, wide = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<JungolUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async () => {
    if (!searchTerm.trim()) return;
    
    setIsSearching(true);
    try {
      const response = await fetch(`${URL}/api/user/search?q=${encodeURIComponent(searchTerm)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || '검색에 실패했습니다.');
      setSearchResults(data as JungolUser[]);
    } catch (error) {
      console.error('사용자 검색 중 오류 발생:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const getTierColor = (tier: number) => {
    if (tier >= 26) return 'text-red-500';
    if (tier >= 21) return 'text-blue-400';
    if (tier >= 16) return 'text-cyan-300';
    if (tier >= 11) return 'text-yellow-400';
    if (tier >= 6) return 'text-gray-300';
    if (tier >= 1) return 'text-amber-600';
    return 'text-gray-500';
  };

  const containerClass = wide
    ? 'w-full p-6 bg-white/5 backdrop-blur-sm border border-white/10'
    : 'w-full max-w-2xl mx-auto p-6 bg-white/5 backdrop-blur-sm border border-white/10';

  const goProfile = (user: JungolUser) => {
    if (onUserSelect) onUserSelect(user);
  };

  return (
    <SquircleSurface radius="panel" className={containerClass}>
      <h2 className="text-2xl font-bold text-white mb-6">사용자 검색</h2>
      
      <div className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <Input
            type="text"
            placeholder="사용자 이름을 입력하세요..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyPress={handleKeyPress}
            className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-gray-400"
          />
        </div>
        <Button 
          onClick={handleSearch}
          disabled={isSearching}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {isSearching ? '검색 중...' : '검색'}
        </Button>
      </div>

      {searchResults.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-white mb-3">검색 결과</h3>
          <div className="space-y-3 max-h-96 overflow-y-auto no-scrollbar pr-1">
            {searchResults.map((user) => (
              <SquircleSurface radius="surface"
                key={user.id}
                onClick={() => goProfile(user)}
                className="p-4 bg-white/10 border border-white/20 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">{user.jungol_name}</span>
                        {user.korean_name && (
                          <span className="text-sm text-gray-300">({user.korean_name})</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-300">
                        <span>정답: {user.corrects}</span>
                        <span>제출: {user.submissions}</span>
                        <span>솔루션: {user.solution}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${getTierColor(user.tier)}`}>
                      {getTierName(user.tier)}
                    </div>
                    <div className="text-sm text-gray-400">Tier {user.tier}</div>
                  </div>
                </div>
              </SquircleSurface>
            ))}
          </div>
        </div>
      )}

      {searchResults.length === 0 && searchTerm && !isSearching && (
        <div className="text-center text-gray-400 py-8">
          검색 결과가 없습니다.
        </div>
      )}
    </SquircleSurface>
  );
};

export default UserSearch;
