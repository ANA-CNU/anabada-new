import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, LogIn } from "lucide-react";
import LoadingSpinner from "@/components/ui/loading-spinner";
import LoadingOverlay from "@/components/ui/loading-overlay";

interface LoginResponse {
  success: boolean;
  message?: string;
  error?: string;
  token?: string;
}

function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim() || !password.trim()) {
      setError("아이디와 비밀번호를 모두 입력해주세요.");
      return;
    }

    setIsLoading(true);
    setError("");

          try {
        // 미들웨어 서버로 직접 요청
        const response = await fetch("/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username: username.trim(),
            password: password,
          }),
          credentials: "include", // httpOnly 쿠키를 받기 위해 필요
        });

        const data: LoginResponse = await response.json();


        
        if (response.ok && data.success) {
          // 로그인 성공 - httpOnly 쿠키는 자동으로 브라우저에 저장됨

          // 로그인 성공 시 admin 페이지로 즉시 리다이렉트
          window.location.href = "/admin";
        } else {
          // 로그인 실패

          setError(data.error || data.message || "로그인에 실패했습니다. 아이디와 비밀번호를 확인해주세요.");
        }
      } catch (err) {
        setError("서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.");
        console.error("Login error:", err);
      } finally {
        setIsLoading(false);
      }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a1026] p-4">
      <LoadingOverlay 
        isVisible={isLoading}
        title="로그인 처리 중..."
        subtitle="잠시만 기다려주세요"
      />
      
      <Card className="w-full max-w-md bg-white/10 backdrop-blur-md border-white/20">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-white flex items-center justify-center gap-2">
            <LogIn className="w-6 h-6" />
            로그인
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-white">
                아이디
              </Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
                placeholder="아이디를 입력하세요"
                className="bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-white/50 transition-all duration-200"
                disabled={isLoading}
                style={{
                  opacity: isLoading ? 0.5 : 1,
                  pointerEvents: isLoading ? "none" : "auto"
                }}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password" className="text-white">
                비밀번호
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-white/50 pr-10 transition-all duration-200"
                  disabled={isLoading}
                  style={{
                    opacity: isLoading ? 0.5 : 1,
                    pointerEvents: isLoading ? "none" : "auto"
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 text-white/70 hover:text-white transition-all duration-200"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isLoading}
                  style={{
                    opacity: isLoading ? 0.5 : 1,
                    pointerEvents: isLoading ? "none" : "auto"
                  }}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            {error && (
              <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-md p-3">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white h-10 transition-colors duration-200 relative overflow-hidden"
              disabled={isLoading}
              style={{
                willChange: "background-color",
                transform: "translateZ(0)",
                backfaceVisibility: "hidden",
                WebkitBackfaceVisibility: "hidden"
              }}
            >
              <div className="flex items-center justify-center gap-2 min-h-[20px] w-full relative z-10">
                {isLoading ? (
                  <>
                    <div className="flex items-center gap-2">
                      <LoadingSpinner size="md" />
                      <span className="flex-shrink-0">로그인 중...</span>
                    </div>
                  </>
                ) : (
                  <span className="flex-shrink-0">로그인</span>
                )}
              </div>
              
              {/* 로딩 중일 때 배경 애니메이션 */}
              {isLoading && (
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-700 opacity-0 animate-pulse" />
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default Login;