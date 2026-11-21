"use client";

import { useEffect, useRef } from "react";
import styles from "./home.module.css";

const REACH = 150;
const MAX_RADIUS = 5.25;
const NEAR_RESPONSE_MS = 52;
const FAR_RESPONSE_MS = 200;
const SETTLED_DISTANCE = 0.025;

type Point = { readonly x: number; readonly y: number };
type Dot = Point & { radius: number };

export default function CoverDotGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const cover = canvas?.parentElement;
    const drawingContext = canvas?.getContext("2d");
    if (!canvas || !cover || !drawingContext) return;
    const context = drawingContext;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const style = getComputedStyle(canvas);
    const spacing = Number.parseFloat(style.getPropertyValue("--cover-dot-spacing"));
    const baseRadius = Number.parseFloat(style.getPropertyValue("--cover-dot-radius"));
    const ink = style.getPropertyValue("--cover-dot-ink").trim();
    let dots: Dot[] = [];
    let pointer: Point | null = null;
    let width = 0;
    let height = 0;
    let frame = 0;
    let previousTime: number | undefined;

    function draw(timestamp: number) {
      frame = 0;
      const elapsed = Math.min(timestamp - (previousTime ?? timestamp - 16), 50);
      context.clearRect(0, 0, width, height);
      context.beginPath();

      let moving = false;
      for (const dot of dots) {
        const distance = pointer ? Math.hypot(dot.x - pointer.x, dot.y - pointer.y) : REACH;
        const proximity = Math.max(0, 1 - distance / REACH);
        const influence = proximity * proximity * (3 - 2 * proximity);
        const target = baseRadius + (MAX_RADIUS - baseRadius) * influence;
        const response = FAR_RESPONSE_MS + (NEAR_RESPONSE_MS - FAR_RESPONSE_MS) * proximity;
        const remaining = (target - dot.radius) * Math.exp(-elapsed / response);
        const settled = Math.abs(remaining) < SETTLED_DISTANCE;
        dot.radius = settled ? target : target - remaining;
        moving ||= !settled;
        context.moveTo(dot.x + dot.radius, dot.y);
        context.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
      }

      context.fill();
      if (canvas && width > 0 && height > 0 && canvas.dataset.ready === undefined) canvas.dataset.ready = "";
      previousTime = moving ? timestamp : undefined;
      if (moving) scheduleDraw();
    }

    function scheduleDraw() {
      if (!frame) frame = requestAnimationFrame(draw);
    }

    const resize = () => {
      ({ width, height } = canvas.getBoundingClientRect());
      if (width === 0 || height === 0) return;
      const resolution = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * resolution);
      canvas.height = Math.round(height * resolution);
      context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
      context.fillStyle = ink;

      dots = [];
      for (let y = (height / 2) % spacing; y < height; y += spacing) {
        for (let x = (width / 2) % spacing; x < width; x += spacing) {
          dots.push({ x, y, radius: baseRadius });
        }
      }
      scheduleDraw();
    };

    const movePointer = (event: PointerEvent) => {
      if (motion.matches || event.pointerType === "touch") return;
      const bounds = canvas.getBoundingClientRect();
      pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      scheduleDraw();
    };
    const clearPointer = () => {
      if (!pointer) return;
      pointer = null;
      scheduleDraw();
    };
    const updateMotion = () => {
      if (!motion.matches) return;
      pointer = null;
      for (const dot of dots) dot.radius = baseRadius;
      scheduleDraw();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    cover.addEventListener("pointermove", movePointer);
    cover.addEventListener("pointerleave", clearPointer);
    cover.addEventListener("pointercancel", clearPointer);
    motion.addEventListener("change", updateMotion);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      cover.removeEventListener("pointermove", movePointer);
      cover.removeEventListener("pointerleave", clearPointer);
      cover.removeEventListener("pointercancel", clearPointer);
      motion.removeEventListener("change", updateMotion);
      delete canvas.dataset.ready;
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.coverGrid} aria-hidden="true" />;
}
