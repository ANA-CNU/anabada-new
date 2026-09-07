import React from "react";
import LoadingSpinner from "./loading-spinner";
import { SquircleSurface } from "./squircle";

interface LoadingOverlayProps {
  isVisible: boolean;
  title?: string;
  subtitle?: string;
  className?: string;
}

function LoadingOverlay({
  isVisible,
  title = "처리 중...",
  subtitle = "잠시만 기다려주세요",
  className = ""
}: LoadingOverlayProps) {
  if (!isVisible) return null;

  return (
    <div className={`fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center ${className}`}>
      <SquircleSurface radius="surface" className="bg-white/10 backdrop-blur-md p-6 border border-white/20">
        <div className="flex items-center gap-3">
          <LoadingSpinner size="lg" />
          <div className="text-white">
            <div className="font-medium">{title}</div>
            <div className="text-sm text-white/70">{subtitle}</div>
          </div>
        </div>
      </SquircleSurface>
    </div>
  );
}

export default LoadingOverlay;
