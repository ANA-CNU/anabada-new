import React from "react";

interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "w-4 h-4",
  md: "w-5 h-5", 
  lg: "w-8 h-8"
};

function LoadingSpinner({ size = "md", className = "" }: LoadingSpinnerProps) {
  return (
    <div className={`relative ${sizeClasses[size]} ${className}`}>
      <div className={`${sizeClasses[size]} border-2 border-white/30 rounded-full animate-spin`} />
      <div className={`absolute inset-0 ${sizeClasses[size]} border-2 border-transparent border-t-white rounded-full animate-ping`} />
    </div>
  );
}

export default LoadingSpinner; 