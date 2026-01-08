import { useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

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
    const size = 200;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const centerX = size / 2;
    const centerY = size / 2;
    const baseRadius = 60;

    // Clear canvas
    ctx.clearRect(0, 0, size, size);

    timeRef.current += 0.016; // ~60fps
    const time = timeRef.current;

    // Create gradient
    const gradient = ctx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, baseRadius * 1.5
    );

    // Brand purple colors
    const primaryHue = 270; // Purple
    
    if (state === 'idle') {
      gradient.addColorStop(0, `hsla(${primaryHue}, 60%, 60%, 0.9)`);
      gradient.addColorStop(0.5, `hsla(${primaryHue}, 50%, 50%, 0.7)`);
      gradient.addColorStop(1, `hsla(${primaryHue}, 40%, 40%, 0)`);
    } else if (state === 'listening') {
      const intensity = 0.5 + audioLevel * 0.5;
      gradient.addColorStop(0, `hsla(${primaryHue}, 70%, ${55 + audioLevel * 15}%, ${0.9 + audioLevel * 0.1})`);
      gradient.addColorStop(0.5, `hsla(${primaryHue}, 60%, 50%, ${0.7 * intensity})`);
      gradient.addColorStop(1, `hsla(${primaryHue}, 50%, 40%, 0)`);
    } else if (state === 'processing') {
      gradient.addColorStop(0, `hsla(${primaryHue}, 50%, 55%, 0.8)`);
      gradient.addColorStop(0.5, `hsla(${primaryHue}, 45%, 45%, 0.6)`);
      gradient.addColorStop(1, `hsla(${primaryHue}, 40%, 35%, 0)`);
    } else if (state === 'speaking') {
      const pulse = 0.5 + Math.sin(time * 4) * 0.25 + audioLevel * 0.25;
      gradient.addColorStop(0, `hsla(${primaryHue}, 65%, ${50 + pulse * 20}%, 0.95)`);
      gradient.addColorStop(0.5, `hsla(${primaryHue}, 55%, 45%, ${0.6 + pulse * 0.2})`);
      gradient.addColorStop(1, `hsla(${primaryHue}, 45%, 35%, 0)`);
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

    // Draw outer glow rings
    for (let i = 3; i >= 0; i--) {
      const ringRadius = radius + i * 15;
      const alpha = 0.15 - i * 0.03;
      
      ctx.beginPath();
      ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${primaryHue}, 60%, 50%, ${alpha})`;
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
    highlightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.3)');
    highlightGradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.1)');
    highlightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fillStyle = highlightGradient;
    ctx.fill();

    // Processing spinner
    if (state === 'processing') {
      ctx.strokeStyle = `hsla(${primaryHue}, 70%, 70%, 0.8)`;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      
      const spinnerRadius = radius + 20;
      const startAngle = time * 3;
      const arcLength = Math.PI * 0.75;
      
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

  return (
    <button
      onClick={onClick}
      className={cn(
        'relative focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-full transition-transform hover:scale-105 active:scale-95',
        className
      )}
      aria-label={
        state === 'idle' ? 'Start voice mode' :
        state === 'listening' ? 'Listening... tap to stop' :
        state === 'processing' ? 'Processing...' :
        'Speaking... tap to interrupt'
      }
    >
      <canvas
        ref={canvasRef}
        className="w-[200px] h-[200px]"
        style={{ width: 200, height: 200 }}
      />
      
      {/* State indicator text */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-white/80 text-sm font-medium">
          {state === 'idle' && 'Tap to speak'}
          {state === 'listening' && 'Listening...'}
          {state === 'processing' && 'Thinking...'}
          {state === 'speaking' && 'Speaking...'}
        </span>
      </div>
    </button>
  );
}
