import React, { useEffect, useRef } from "react";

type KakaoMapProps = {
  lat: number;
  lng: number;
  level?: number; // zoom level (1~14)
  markerTitle?: string;
  className?: string;
};

declare global {
  interface Window {
    kakao?: any;
  }
}

const KakaoMap: React.FC<KakaoMapProps> = ({ lat, lng, level = 3, markerTitle, className }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const apiKey = (import.meta as any).env?.VITE_KAKAO_MAP_API || (process as any)?.env?.KAKAO_MAP_API;
    if (!apiKey) {
      // eslint-disable-next-line no-console
      console.warn("Kakao Map API key is missing. Set VITE_KAKAO_MAP_API or KAKAO_MAP_API.");
      return;
    }

    const loadScript = () =>
      new Promise<void>((resolve, reject) => {
        if (window.kakao && window.kakao.maps) {
          resolve();
          return;
        }
        const script = document.createElement("script");
        script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&autoload=false`;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Kakao Map script"));
        document.head.appendChild(script);
      });

    loadScript()
      .then(() => {
        window.kakao.maps.load(() => {
          if (!containerRef.current) return;
          const container = containerRef.current;
          const options = {
            center: new window.kakao.maps.LatLng(lat, lng),
            level,
          };
          const map = new window.kakao.maps.Map(container, options);

          const markerPosition = new window.kakao.maps.LatLng(lat, lng);
          const marker = new window.kakao.maps.Marker({ position: markerPosition });
          marker.setMap(map);
          if (markerTitle) {
            // 공백을 최소화한 커스텀 오버레이로 대체
            const content = document.createElement('div');
            content.style.cssText = [
              'display:inline-block',
              'background:rgba(255,255,255,0.95)',
              'color:#111',
              'font-size:12px',
              'line-height:1',
              'border:1px solid rgba(0,0,0,0.06)',
              'border-radius:6px',
              'padding:3px 6px',
              'box-shadow:0 2px 6px rgba(0,0,0,0.08)'
            ].join(';');
            content.textContent = markerTitle;

            const overlay = new window.kakao.maps.CustomOverlay({
              content,
              position: markerPosition,
              yAnchor: 1.4,
              zIndex: 3
            });
            overlay.setMap(map);
          }
        });
      })
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.error(e);
      });
  }, [lat, lng, level, markerTitle]);

  return <div ref={containerRef} className={className} />;
};

export default KakaoMap;


