import { useState, useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AudioVisualizer, VoiceState } from './AudioVisualizer';
import { useVoiceService } from '@/hooks/useVoiceService';
import { useTTS } from '@/hooks/useTTS';
import { supabase } from '@/integrations/supabase/client';
import maiLogo from '@/assets/mai-logo.png';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface VoiceChatProps {
  isOpen: boolean;
  onClose: () => void;
  conversationHistory?: Message[];
  systemPrompt?: string;
}

export function VoiceChat({ isOpen, onClose, conversationHistory = [], systemPrompt }: VoiceChatProps) {
  const [state, setState] = useState<VoiceState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [lastUserMessage, setLastUserMessage] = useState('');
  const [lastAssistantMessage, setLastAssistantMessage] = useState('');
  const [localHistory, setLocalHistory] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number>(0);

  const handleSilenceDetected = useCallback(() => {
    if (state === 'listening') {
      voiceService.stopListening();
    }
  }, [state]);

  const voiceService = useVoiceService({
    onSilenceDetected: handleSilenceDetected,
    silenceTimeout: 1500,
  });

  const tts = useTTS({
    onPlayStart: () => setState('speaking'),
    onPlayEnd: () => {
      setState('listening');
      voiceService.startListening();
    },
  });

  // Initialize audio context for mic level visualization
  const initAudioContext = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      
      const updateAudioLevel = () => {
        if (!analyserRef.current) return;
        
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(dataArray);
        
        const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setAudioLevel(Math.min(average / 128, 1));
        
        animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
      };
      
      updateAudioLevel();
    } catch (err) {
      console.error('Failed to init audio context:', err);
    }
  }, []);

  // Cleanup audio context
  const cleanupAudioContext = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  // Process speech and send to AI
  const processTranscript = useCallback(async (transcript: string) => {
    if (!transcript.trim()) {
      setState('listening');
      voiceService.startListening();
      return;
    }

    setState('processing');
    setLastUserMessage(transcript);
    setError(null);
    
    const userMessage: Message = { role: 'user', content: transcript };
    const updatedHistory = [...localHistory, userMessage];
    setLocalHistory(updatedHistory);

    try {
      const { data, error: aiError } = await supabase.functions.invoke('ai-assistant', {
        body: {
          message: transcript,
          systemPrompt: systemPrompt || 'You are mai, an executive assistant. Keep responses brief and conversational since this is a voice interface.',
          conversationHistory: [...conversationHistory, ...updatedHistory].slice(-10),
        },
      });

      if (aiError) throw aiError;

      const assistantContent = data.content || 'I didn\'t catch that. Could you try again?';
      setLastAssistantMessage(assistantContent);
      setLocalHistory(prev => [...prev, { role: 'assistant', content: assistantContent }]);

      // Speak the response
      await tts.speak(assistantContent);
    } catch (err) {
      console.error('AI error:', err);
      setError('Failed to get response. Please try again.');
      setState('idle');
    }
  }, [conversationHistory, localHistory, systemPrompt, tts, voiceService]);

  // Watch for completed transcript
  useEffect(() => {
    if (!voiceService.isListening && voiceService.transcript && state === 'listening') {
      processTranscript(voiceService.transcript);
      voiceService.resetTranscript();
    }
  }, [voiceService.isListening, voiceService.transcript, state, processTranscript, voiceService]);

  // Handle orb click
  const handleOrbClick = useCallback(() => {
    if (state === 'idle') {
      setState('listening');
      initAudioContext();
      voiceService.startListening();
    } else if (state === 'listening') {
      voiceService.stopListening();
      if (voiceService.transcript) {
        processTranscript(voiceService.transcript);
        voiceService.resetTranscript();
      } else {
        setState('idle');
        cleanupAudioContext();
      }
    } else if (state === 'speaking') {
      tts.stop();
      setState('listening');
      voiceService.resetTranscript();
      voiceService.startListening();
    }
  }, [state, voiceService, tts, initAudioContext, cleanupAudioContext, processTranscript]);

  // Handle close
  const handleClose = useCallback(() => {
    voiceService.stopListening();
    tts.stop();
    cleanupAudioContext();
    setState('idle');
    setLastUserMessage('');
    setLastAssistantMessage('');
    setLocalHistory([]);
    setError(null);
    onClose();
  }, [voiceService, tts, cleanupAudioContext, onClose]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAudioContext();
    };
  }, [cleanupAudioContext]);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setState('idle');
      setLocalHistory([]);
      voiceService.resetTranscript();
    }
  }, [isOpen, voiceService]);

  if (!isOpen) return null;

  const currentTranscript = voiceService.transcript + voiceService.interimTranscript;

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-xl flex flex-col animate-fade-in">
      {/* Header */}
      <header className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2">
          <img src={maiLogo} alt="mai" className="h-8 w-auto" />
          <span className="font-semibold text-foreground">Voice Mode</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClose}
          className="rounded-full"
        >
          <X className="h-5 w-5" />
        </Button>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <AudioVisualizer
          state={state}
          audioLevel={audioLevel}
          onClick={handleOrbClick}
        />

        {/* Error display */}
        {(error || voiceService.error) && (
          <p className="mt-6 text-destructive text-sm text-center max-w-xs">
            {error || voiceService.error}
          </p>
        )}

        {/* Browser support warning */}
        {!voiceService.isSupported && (
          <p className="mt-6 text-muted-foreground text-sm text-center max-w-xs">
            Voice input is not supported in this browser. Please try Chrome, Safari, or Edge.
          </p>
        )}
      </div>

      {/* Transcript area */}
      <div className="px-6 pb-8 space-y-4 min-h-[160px]">
        {/* Current listening transcript */}
        {state === 'listening' && currentTranscript && (
          <div className="text-center animate-fade-in">
            <p className="text-sm text-muted-foreground mb-1">You</p>
            <p className="text-foreground text-lg">{currentTranscript}</p>
          </div>
        )}

        {/* Last user message */}
        {state !== 'listening' && lastUserMessage && (
          <div className="text-center animate-fade-in">
            <p className="text-sm text-muted-foreground mb-1">You said</p>
            <p className="text-foreground/70 text-sm line-clamp-2">{lastUserMessage}</p>
          </div>
        )}

        {/* Assistant response */}
        {lastAssistantMessage && (state === 'speaking' || state === 'listening') && (
          <div className="text-center animate-fade-in">
            <p className="text-sm text-muted-foreground mb-1">mai</p>
            <p className="text-foreground text-lg line-clamp-3">{lastAssistantMessage}</p>
          </div>
        )}

        {/* Processing indicator */}
        {state === 'processing' && (
          <div className="text-center animate-fade-in">
            <p className="text-muted-foreground">Thinking...</p>
          </div>
        )}
      </div>
    </div>
  );
}
