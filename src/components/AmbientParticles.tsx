import React, { useEffect, useRef } from 'react';

interface AmbientParticlesProps {
  flickerX: number;
  flickerY: number;
  intensity: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  phase: number;
  phaseSpeed: number;
  warmth: number;
}

export const AmbientParticles: React.FC<AmbientParticlesProps> = ({
  flickerX,
  flickerY,
  intensity,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const flickerRef = useRef({ flickerX, flickerY, intensity });

  useEffect(() => {
    flickerRef.current = { flickerX, flickerY, intensity };
  }, [flickerX, flickerY, intensity]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Subtle, understated ambient dust motes drifting across the tabletop
    const particleCount = 26;
    const particles: Particle[] = Array.from({ length: particleCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: 0.08 + Math.random() * 0.18,
      vy: 0.04 + Math.random() * 0.14,
      radius: 0.8 + Math.random() * 1.35,
      alpha: 0.08 + Math.random() * 0.18,
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 0.008 + Math.random() * 0.016,
      warmth: Math.random(),
    }));

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const { flickerX: fx, flickerY: fy, intensity: lightInt } = flickerRef.current;
      // Top-left corner light source coordinates
      const lightX = width * (0.07 + fx * 0.02);
      const lightY = height * (0.08 + fy * 0.02);

      for (const p of particles) {
        p.phase += p.phaseSpeed;
        p.x += p.vx + Math.sin(p.phase) * 0.12;
        p.y += p.vy + Math.cos(p.phase * 0.8) * 0.08;

        // Wrap smoothly around screen edges
        if (p.x > width + 20) p.x = -20;
        if (p.x < -20) p.x = width + 20;
        if (p.y < -20) p.y = height + 20;
        if (p.y > height + 20) p.y = -20;

        // Distance from top-left light source subtly warms the dust motes
        const dx = p.x - lightX;
        const dy = p.y - lightY;
        const dist = Math.hypot(dx, dy);
        const maxDist = Math.hypot(width, height) * 0.75;
        const proximity = Math.max(0, 1 - dist / maxDist);

        const pulse = 0.75 + 0.25 * Math.sin(p.phase * 1.4);
        const finalAlpha = Math.min(
          0.32,
          p.alpha * pulse * (0.55 + proximity * 0.65 * lightInt)
        );

        const glowRadius = p.radius * (1.8 + proximity * 1.2);
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowRadius);
        if (p.warmth > 0.45 || proximity > 0.5) {
          grad.addColorStop(0, `rgba(255, 245, 200, ${finalAlpha})`);
          grad.addColorStop(0.5, `rgba(251, 191, 36, ${finalAlpha * 0.4})`);
          grad.addColorStop(1, 'rgba(245, 158, 11, 0)');
        } else {
          grad.addColorStop(0, `rgba(253, 224, 138, ${finalAlpha * 0.8})`);
          grad.addColorStop(0.5, `rgba(217, 119, 6, ${finalAlpha * 0.35})`);
          grad.addColorStop(1, 'rgba(180, 83, 9, 0)');
        }

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, glowRadius, 0, Math.PI * 2);
        ctx.fill();

        // Subtle mote center
        ctx.fillStyle = `rgba(255, 250, 230, ${Math.min(0.42, finalAlpha * 1.1)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-30"
    />
  );
};
