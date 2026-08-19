"use client";

import { useEffect, useRef } from "react";
import { classNames } from "./class-names";

const ENHANCEMENT_QUERY =
  "(min-width: 1024px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";
const MAX_DEVICE_PIXEL_RATIO = 1.75;
const SAMPLE_STEP = 5;
const PARTICLE_SIZE = 1.25;
const POINTER_RADIUS = 88;

interface Particle {
  homeX: number;
  homeY: number;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
}

function numberFromPixels(value: string, fallback = 0): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function drawTrackedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  baseline: number,
  letterSpacing: number,
) {
  let cursorX = x;
  for (const character of text) {
    context.fillText(character, cursorX, baseline);
    cursorX += context.measureText(character).width + letterSpacing;
  }
}

function mountParticleScene(root: HTMLElement, canvas: HTMLCanvasElement): () => void {
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return () => undefined;

  let disposed = false;
  let isIntersecting = true;
  let animationFrame = 0;
  let resizeFrame = 0;
  let particles: Particle[] = [];
  let particleColor = "#ecece8";
  const pointer = { active: false, x: 0, y: 0 };

  const paintParticles = () => {
    const devicePixelRatio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    context.clearRect(0, 0, canvas.width / devicePixelRatio, canvas.height / devicePixelRatio);
    context.fillStyle = particleColor;
    for (const particle of particles) {
      context.fillRect(particle.x, particle.y, PARTICLE_SIZE, PARTICLE_SIZE);
    }
  };

  const drawFrame = () => {
    animationFrame = 0;
    if (disposed || !isIntersecting || document.hidden) return;

    let isMoving = false;
    for (const particle of particles) {
      if (pointer.active) {
        let deltaX = particle.x - pointer.x;
        let deltaY = particle.y - pointer.y;
        let distance = Math.hypot(deltaX, deltaY);

        if (distance < 0.01) {
          deltaX = 1;
          deltaY = 0;
          distance = 1;
        }

        if (distance < POINTER_RADIUS) {
          const force = (POINTER_RADIUS - distance) / POINTER_RADIUS;
          particle.velocityX += (deltaX / distance) * force * 1.35;
          particle.velocityY += (deltaY / distance) * force * 1.35;
        }
      }

      particle.velocityX += (particle.homeX - particle.x) * 0.038;
      particle.velocityY += (particle.homeY - particle.y) * 0.038;
      particle.velocityX *= 0.82;
      particle.velocityY *= 0.82;
      particle.x += particle.velocityX;
      particle.y += particle.velocityY;

      if (
        Math.abs(particle.velocityX) > 0.025 ||
        Math.abs(particle.velocityY) > 0.025 ||
        Math.abs(particle.homeX - particle.x) > 0.08 ||
        Math.abs(particle.homeY - particle.y) > 0.08
      ) {
        isMoving = true;
      }
    }

    paintParticles();

    if (pointer.active || isMoving) {
      animationFrame = window.requestAnimationFrame(drawFrame);
    }
  };

  const requestDraw = () => {
    if (animationFrame || disposed || !isIntersecting || document.hidden) return;
    animationFrame = window.requestAnimationFrame(drawFrame);
  };

  const rebuild = () => {
    if (disposed) return;
    const rootBounds = root.getBoundingClientRect();
    const width = Math.max(0, Math.round(rootBounds.width));
    const height = Math.max(0, Math.round(rootBounds.height));
    if (!width || !height) {
      root.removeAttribute("data-enhanced");
      return;
    }

    const devicePixelRatio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    canvas.width = Math.round(width * devicePixelRatio);
    canvas.height = Math.round(height * devicePixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = width;
    sampleCanvas.height = height;
    const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
    if (!sampleContext) return;

    sampleContext.clearRect(0, 0, width, height);
    sampleContext.fillStyle = "#ffffff";

    const lineElements = root.querySelectorAll<HTMLElement>("[data-oa-wordmark-line]");
    for (const lineElement of lineElements) {
      const text = lineElement.textContent ?? "";
      const lineBounds = lineElement.getBoundingClientRect();
      const style = window.getComputedStyle(lineElement);
      const letterSpacing = numberFromPixels(style.letterSpacing);
      sampleContext.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      sampleContext.textBaseline = "alphabetic";

      const metrics = sampleContext.measureText(text);
      const glyphHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
      const baseline =
        lineBounds.top - rootBounds.top +
        (lineBounds.height - glyphHeight) / 2 +
        metrics.actualBoundingBoxAscent;

      drawTrackedText(
        sampleContext,
        text,
        lineBounds.left - rootBounds.left,
        baseline,
        letterSpacing,
      );
    }

    const pixels = sampleContext.getImageData(0, 0, width, height).data;
    const nextParticles: Particle[] = [];
    for (let y = 0; y < height; y += SAMPLE_STEP) {
      for (let x = 0; x < width; x += SAMPLE_STEP) {
        if (pixels[(y * width + x) * 4 + 3] < 128) continue;
        nextParticles.push({
          homeX: x,
          homeY: y,
          x,
          y,
          velocityX: 0,
          velocityY: 0,
        });
      }
    }

    particles = nextParticles;
    particleColor = window.getComputedStyle(root).color;
    if (particles.length > 0) {
      root.dataset.enhanced = "true";
      paintParticles();
      requestDraw();
    } else {
      root.removeAttribute("data-enhanced");
    }
  };

  const scheduleRebuild = () => {
    if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = 0;
      rebuild();
    });
  };

  const handlePointerMove = (event: PointerEvent) => {
    const bounds = root.getBoundingClientRect();
    pointer.active = true;
    pointer.x = event.clientX - bounds.left;
    pointer.y = event.clientY - bounds.top;
    requestDraw();
  };

  const handlePointerEnd = () => {
    pointer.active = false;
    requestDraw();
  };

  const handleVisibilityChange = () => {
    if (document.hidden && animationFrame) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      return;
    }
    requestDraw();
  };

  const resizeObserver = typeof ResizeObserver === "undefined"
    ? null
    : new ResizeObserver(scheduleRebuild);
  resizeObserver?.observe(root);

  const intersectionObserver = typeof IntersectionObserver === "undefined"
    ? null
    : new IntersectionObserver(([entry]) => {
        isIntersecting = entry?.isIntersecting ?? true;
        if (!isIntersecting && animationFrame) {
          window.cancelAnimationFrame(animationFrame);
          animationFrame = 0;
        } else {
          requestDraw();
        }
      });
  intersectionObserver?.observe(root);

  root.addEventListener("pointermove", handlePointerMove, { passive: true });
  root.addEventListener("pointerleave", handlePointerEnd);
  root.addEventListener("pointercancel", handlePointerEnd);
  document.addEventListener("visibilitychange", handleVisibilityChange);

  void (document.fonts?.ready ?? Promise.resolve()).then(() => {
    if (!disposed) rebuild();
  });

  return () => {
    disposed = true;
    root.removeAttribute("data-enhanced");
    root.removeEventListener("pointermove", handlePointerMove);
    root.removeEventListener("pointerleave", handlePointerEnd);
    root.removeEventListener("pointercancel", handlePointerEnd);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    if (animationFrame) window.cancelAnimationFrame(animationFrame);
    if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
  };
}

export function OAParticleWordmark({ className }: { className?: string }) {
  const rootRef = useRef<HTMLHeadingElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas || typeof window.matchMedia !== "function") return;

    const mediaQuery = window.matchMedia(ENHANCEMENT_QUERY);
    let disposeScene: () => void = () => undefined;

    const syncEnhancement = () => {
      disposeScene();
      disposeScene = mediaQuery.matches
        ? mountParticleScene(root, canvas)
        : () => {
            root.removeAttribute("data-enhanced");
          };
    };

    syncEnhancement();
    mediaQuery.addEventListener("change", syncEnhancement);
    return () => {
      mediaQuery.removeEventListener("change", syncEnhancement);
      disposeScene();
    };
  }, []);

  return (
    <h1
      aria-label="OMNIVORE ARCHITECT"
      className={classNames("oa-particle-wordmark", className)}
      ref={rootRef}
    >
      <span aria-hidden="true" className="oa-particle-wordmark__text">
        <span className="oa-particle-wordmark__line" data-oa-wordmark-line>OMNIVORE_</span>
        <span className="oa-particle-wordmark__line" data-oa-wordmark-line>ARCHITECT</span>
      </span>
      <canvas aria-hidden="true" className="oa-particle-wordmark__canvas" ref={canvasRef} />
    </h1>
  );
}
