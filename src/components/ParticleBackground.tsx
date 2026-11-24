import React, { useEffect, useRef } from 'react';

interface ParticleBackgroundProps {
  intensity?: 'subtle' | 'active';
}

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  isCrimson: boolean;
  life: number;
  maxLife: number;
}

export const ParticleBackground: React.FC<ParticleBackgroundProps> = ({
  intensity = 'subtle',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const count = intensity === 'active' ? 56 : 30;
    const particles: Ember[] = [];
    const mouse = { x: -9999, y: -9999, active: false };

    const spawnEmber = (randomY = false): Ember => ({
      x: Math.random() * width,
      y: randomY ? Math.random() * height : height + 10,
      vx: (Math.random() - 0.5) * 0.25,
      vy: -(0.18 + Math.random() * 0.45),
      size: 1 + Math.random() * 2.1,
      alpha: 0.18 + Math.random() * 0.48,
      isCrimson: Math.random() < 0.45,
      life: 0,
      maxLife: 240 + Math.random() * 260,
    });

    for (let i = 0; i < count; i++) {
      particles.push(spawnEmber(true));
    }

    let lastMouseBurst = 0;
    const onPointerMove = (e: PointerEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
      const now = performance.now();
      if (now - lastMouseBurst > 45 && particles.length < count + 24) {
        lastMouseBurst = now;
        particles.push({
          x: e.clientX + (Math.random() - 0.5) * 14,
          y: e.clientY + (Math.random() - 0.5) * 14,
          vx: (Math.random() - 0.5) * 0.65,
          vy: -0.35 - Math.random() * 0.55,
          size: 1.2 + Math.random() * 1.6,
          alpha: 0.5,
          isCrimson: true,
          life: 0,
          maxLife: 75 + Math.random() * 45,
        });
      }
    };

    const onResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });

    let rafId = 0;
    let lastDraw = 0;
    const frameInterval = 1000 / 30; // smooth 30fps ambient background to save CPU

    const draw = (time: number) => {
      rafId = requestAnimationFrame(draw);
      if (document.hidden || time - lastDraw < frameInterval) return;
      lastDraw = time;

      ctx.clearRect(0, 0, width, height);

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += 1;
        p.x += p.vx + Math.sin(p.life * 0.03) * 0.12;
        p.y += p.vy;

        if (mouse.active) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < 18000 && distSq > 40) {
            p.x += dx * 0.004;
            p.y += dy * 0.004;
          }
        }

        const lifeRatio = 1 - p.life / p.maxLife;
        const currentAlpha = Math.max(0, p.alpha * lifeRatio);

        if (p.isCrimson) {
          ctx.fillStyle = `rgba(255, 38, 63, ${currentAlpha})`;
          ctx.shadowColor = 'rgba(164, 0, 25, 0.7)';
          ctx.shadowBlur = 6;
        } else {
          ctx.fillStyle = `rgba(201, 201, 209, ${currentAlpha * 0.45})`;
          ctx.shadowBlur = 0;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        if (p.life >= p.maxLife || p.y < -15) {
          if (particles.length > count) {
            particles.splice(i, 1);
          } else {
            particles[i] = spawnEmber(false);
          }
        }
      }
      ctx.shadowBlur = 0;
    };

    rafId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('resize', onResize);
    };
  }, [intensity]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 opacity-75"
      aria-hidden="true"
    />
  );
};
