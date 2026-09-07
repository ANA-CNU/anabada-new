import { createSvgEffects, generateClipPath, observeResize } from "@lisse/core";

export function createKakaoLabel(title: string) {
  const host = document.createElement("div");
  host.style.cssText = "position:relative;display:inline-block;filter:drop-shadow(0 2px 3px rgba(0,0,0,0.08))";
  const surface = document.createElement("div");
  surface.className = "squircle-surface";
  surface.dataset.squircleRadius = "compact";
  surface.style.cssText = "display:inline-block;background:rgba(255,255,255,0.95);color:#111;font-size:12px;line-height:1;border:1px solid rgba(0,0,0,0.06);padding:3px 6px";
  surface.textContent = title;
  host.appendChild(surface);
  const native = CSS.supports("corner-shape", "squircle") && !document.documentElement.hasAttribute("data-squircle-fallback");
  surface.dataset.squircleMode = native ? "native" : "fallback";
  const border = native ? undefined : createSvgEffects(host, surface);
  if (!native) {
    surface.style.borderRadius = "0";
    surface.style.borderColor = "transparent";
  }
  const disconnect = native ? () => {} : observeResize(surface, (measurement) => {
    if (!measurement) return;
    const radius = Number.parseFloat(getComputedStyle(surface).getPropertyValue("--squircle-radius-compact"));
    const options = { radius, curve: "superellipse", exponent: 4 } as const;
    surface.style.clipPath = generateClipPath(measurement.width, measurement.height, options);
    border?.update(options, { innerBorder: { width: 1, color: "#000000", opacity: 0.06 } }, measurement.width, measurement.height);
  });
  return { content: host, destroy: () => { disconnect(); border?.destroy(); } };
}
