import { useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import maiAvatar from '@/assets/mai-avatar.png';

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

interface AudioVisualizerProps {
  state: VoiceState;
  audioLevel?: number; // 0-1
  className?: string;
  onClick?: () => void;
}

export function AudioVisualizer({ state, audioLevel = 0, className, onClick }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const timeRef = useRef(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = 280;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const centerX = size / 2;
    const centerY = size / 2;
    const baseRadius = 85;

    // Clear canvas
    ctx.clearRect(0, 0, size, size);

    timeRef.current += 0.016; // ~60fps
    const time = timeRef.current;

    // Brand primary blue: HSL(240, 100%, 62.5%) = #4040FF
    const primaryHue = 240;
    const primarySat = 100;
    const primaryLight = 62.5;

    // Create gradient
    const gradient = ctx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, baseRadius * 1.5
    );

    if (state === 'idle') {
      // Subtle breathing with brand blue
      gradient.addColorStop(0, `hsla(${primaryHue}, ${primarySat}%, ${primaryLight + 15}%, 0.95)`);
      gradient.addColorStop(0.5, `hsla(${primaryHue}, ${primarySat}%, ${primaryLight}%, 0.8)`);
      gradient.addColorStop(1, `hsla(${primaryHue}, ${primarySat}%, ${primaryLight - 10}%, 0)`);
    } else if (state === 'listening') {
      // Reactive to audio - more vibrant
      const intensity = 0.5 + audioLevel * 0.5;
      gradient.addColorStop(0, `hsla(${primaryHue}, ${primarySat}%, ${primaryLight + 15 + audioLevel * 10}%, ${0.95 + audioLevel * 0.05})`);
      gradient.addColorStop(0.5, `hsla(${primaryHue}, ${primarySat}%, ${primaryLight}%, ${0.7 * intensity})`);
      gradient.addColorStop(1, `hsla(${primaryHue}, ${primarySat}%, ${primaryLight - 15}%, 0)`);
    } else if (state === 'processing') {
      gradient.addColorStop(0, `hsla(${primaryHue}, ${primarySat}%, ${primaryLight + 10}%, 0.85)`);
      gradient.addColorStop(0.5, `hsla(${primaryHue}, ${primarySat}%, ${primaryLight}%, 0.7)`);
      gradient.addColorStop(1, `hsla(${primaryHue}, ${primarySat}%, ${primaryLight - 10}%, 0)`);
    } else if (state === 'speaking') {
      const pulse = 0.5 + Math.sin(time * 4) * 0.25 + audioLevel * 0.25;
      gradient.addColorStop(0, `hsla(${primaryHue}, ${primarySat}%, ${primaryLight + pulse * 15}%, 0.95)`);
      gradient.addColorStop(0.5, `hsla(${primaryHue}, ${primarySat}%, ${primaryLight}%, ${0.7 + pulse * 0.2})`);
      gradient.addColorStop(1, `hsla(${primaryHue}, ${primarySat}%, ${primaryLight - 15}%, 0)`);
    }

    // Calculate dynamic radius
    let radius = baseRadius;
    
    if (state === 'idle') {
      // Subtle breathing
      radius += Math.sin(time * 1.5) * 3;
    } else if (state === 'listening') {
      // Reactive to audio
      radius += audioLevel * 25 + Math.sin(time * 3) * 5;
    } else if (state === 'processing') {
      // Pulsing
      radius += Math.sin(time * 4) * 8;
    } else if (state === 'speaking') {
      // Audio-reactive pulse
      radius += audioLevel * 20 + Math.sin(time * 5) * 6;
    }

    // Draw outer glow rings with brand color
    for (let i = 3; i >= 0; i--) {
      const ringRadius = radius + i * 15;
      const alpha = (0.2 - i * 0.04) * (state === 'listening' ? 1 + audioLevel * 0.5 : 1);
      
      ctx.beginPath();
      ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${primaryHue}, ${primarySat}%, ${primaryLight}%, ${alpha})`;
      ctx.fill();
    }

    // Draw main orb
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Add inner highlight
    const highlightGradient = ctx.createRadialGradient(
      centerX - radius * 0.3, centerY - radius * 0.3, 0,
      centerX, centerY, radius
    );
    highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
    highlightGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
    highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = highlightGradient;
    ctx.fill();

    // Processing spinner with white ring
    if (state === 'processing') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      
      const spinnerRadius = radius + 15;
      const startAngle = time * 3;
      const arcLength = Math.PI * 0.6;
      
      ctx.beginPath();
      ctx.arc(centerX, centerY, spinnerRadius, startAngle, startAngle + arcLength);
      ctx.stroke();

      // Second spinner arc
      ctx.beginPath();
      ctx.arc(centerX, centerY, spinnerRadius, startAngle + Math.PI, startAngle + Math.PI + arcLength);
      ctx.stroke();
    }

    animationRef.current = requestAnimationFrame(draw);
  }, [state, audioLevel]);

  useEffect(() => {
    animationRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [draw]);

  const stateLabels = {
    idle: 'Tap to speak',
    listening: 'Listening...',
    processing: 'Thinking...',
    speaking: 'Speaking...',
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        'relative focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-primary rounded-full transition-transform hover:scale-105 active:scale-95',
        className
      )}
      aria-label={stateLabels[state]}
    >
      <canvas
        ref={canvasRef}
        className="w-[280px] h-[280px]"
        style={{ width: 280, height: 280 }}
      />
      
      {/* Avatar and state indicator */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <img 
          src={maiAvatar} 
          alt="mai" 
          className="w-36 h-36 rounded-full"
        />
        <span className="text-white/90 text-sm font-medium mt-2">
          {stateLabels[state]}
        </span>
      </div>
    </button>
  );
}
