import React, { useEffect, useRef } from "react";
import { createKakaoLabel } from "./kakao-squircle";

type KakaoMapProps = {
  lat: number;
  lng: number;
  level?: number; // zoom level (1~14)
  markerTitle?: string;
  className?: string;
};

type KakaoLatLng = {
  readonly getLat: () => number;
  readonly getLng: () => number;
};

type KakaoMapInstance = {
  readonly getCenter: () => KakaoLatLng;
};

type KakaoMaps = {
  readonly load: (callback: () => void) => void;
  readonly LatLng: new (lat: number, lng: number) => KakaoLatLng;
  readonly Map: new (container: HTMLElement, options: {
    readonly center: KakaoLatLng;
    readonly level: number;
  }) => KakaoMapInstance;
  readonly Marker: new (options: { readonly position: KakaoLatLng }) => {
    readonly setMap: (map: KakaoMapInstance | null) => void;
  };
  readonly CustomOverlay: new (options: {
    readonly content: HTMLElement;
    readonly position: KakaoLatLng;
    readonly yAnchor: number;
    readonly zIndex: number;
  }) => { readonly setMap: (map: KakaoMapInstance | null) => void };
};

declare global {
  interface Window {
    readonly kakao?: { readonly maps: KakaoMaps };
  }
}

const KakaoMap: React.FC<KakaoMapProps> = ({ lat, lng, level = 3, markerTitle, className }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    let releaseMap: (() => void) | undefined;
    let ownedScript: HTMLScriptElement | undefined;
    const apiKey = import.meta.env.VITE_KAKAO_MAP_API_KEY;
    if (!apiKey) {
      console.warn("Kakao Map API key is missing. Set VITE_KAKAO_MAP_API_KEY.");
      return;
    }

    const loadScript = () =>
      new Promise<void>((resolve, reject) => {
        if (window.kakao && window.kakao.maps) {
          resolve();
          return;
        }
        const script = document.createElement("script");
        ownedScript = script;
        script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(apiKey)}&autoload=false`;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Kakao Map script"));
        document.head.appendChild(script);
      });

    loadScript()
      .then(() => {
        if (!active) return;
        const maps = window.kakao?.maps;
        if (!maps) return;
        maps.load(() => {
          if (!active || !containerRef.current) return;
          const container = containerRef.current;
          const options = {
            center: new maps.LatLng(lat, lng),
            level,
          };
          const map = new maps.Map(container, options);
          // Safari 13.1에서도 정리가 중단되지 않도록 지원되는 DOM API로 자식을 제거한다.
          const clearContainer = () => {
            while (container.firstChild) container.removeChild(container.firstChild);
          };

          const markerPosition = new maps.LatLng(lat, lng);
          const marker = new maps.Marker({ position: markerPosition });
          marker.setMap(map);
          releaseMap = () => {
            marker.setMap(null);
            clearContainer();
          };
          if (markerTitle) {
            const label = createKakaoLabel(markerTitle);
            const overlay = new maps.CustomOverlay({
              content: label.content,
              position: markerPosition,
              yAnchor: 1.4,
              zIndex: 3
            });
            overlay.setMap(map);
            releaseMap = () => {
              label.destroy();
              overlay.setMap(null);
              marker.setMap(null);
              clearContainer();
            };
          }
        });
      })
      .catch((e) => {
        if (!active) return;
        console.error(e);
      });
    return () => {
      active = false;
      releaseMap?.();
      if (ownedScript) {
        ownedScript.onload = null;
        ownedScript.onerror = null;
        ownedScript.remove();
      }
    };
  }, [lat, lng, level, markerTitle]);

  return <div ref={containerRef} className={className} />;
};

export default KakaoMap;
