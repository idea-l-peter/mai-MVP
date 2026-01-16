import { useState, useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AudioVisualizer, VoiceState } from './AudioVisualizer';
import { useVoiceService } from '@/hooks/useVoiceService';
import { useTTS } from '@/hooks/useTTS';
import { supabase } from '@/integrations/supabase/client';
import maiLogo from '@/assets/mai-logo-white.png';

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
  const stateRef = useRef<VoiceState>('idle');

  // Keep stateRef in sync
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Initialize voice service with silence detection
  const voiceService = useVoiceService({
    onSilenceDetected: useCallback(() => {
      console.log('[VoiceChat] Silence detected callback, state:', stateRef.current);
      if (stateRef.current === 'listening') {
        voiceService.stopListening();
      }
    }, []),
    silenceTimeout: 1500,
  });

  const tts = useTTS({
    onPlayStart: () => {
      console.log('[VoiceChat] TTS playback started');
      setState('speaking');
    },
    onPlayEnd: () => {
      console.log('[VoiceChat] TTS playback ended, resuming listening');
      setState('listening');
      voiceService.startListening();
    },
  });

  // Initialize audio context for mic level visualization
  const initAudioContext = useCallback(async () => {
    try {
      console.log('[VoiceChat] Initializing audio context for visualization...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('[VoiceChat] Microphone stream obtained for visualization');
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
      return true;
    } catch (err) {
      console.error('[VoiceChat] Failed to init audio context:', err);
      setError('Microphone access denied. Please allow microphone permissions in your browser settings.');
      return false;
    }
  }, []);

  // Cleanup audio context
  const cleanupAudioContext = useCallback(() => {
    console.log('[VoiceChat] Cleaning up audio context');
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  // Process speech and send to AI
  const processTranscript = useCallback(async (transcript: string) => {
    if (!transcript.trim()) {
      console.log('[VoiceChat] Empty transcript, resuming listening');
      setState('listening');
      voiceService.startListening();
      return;
    }

    console.log('[VoiceChat] Processing transcript:', transcript);
    setState('processing');
    setLastUserMessage(transcript);
    setError(null);
    
    const userMessage: Message = { role: 'user', content: transcript };
    const updatedHistory = [...localHistory, userMessage];
    setLocalHistory(updatedHistory);

    try {
      console.log('[VoiceChat] Calling AI assistant...');
      const { data, error: aiError } = await supabase.functions.invoke('ai-assistant', {
        body: {
          message: transcript,
          systemPrompt: systemPrompt || 'You are mai, an executive assistant. Keep responses brief and conversational since this is a voice interface. Limit responses to 2-3 sentences.',
          conversationHistory: [...conversationHistory, ...updatedHistory].slice(-10),
        },
      });

      if (aiError) {
        console.error('[VoiceChat] AI error:', aiError);
        throw aiError;
      }

      const assistantContent = data.content || 'I didn\'t catch that. Could you try again?';
      console.log('[VoiceChat] AI response:', assistantContent);
      setLastAssistantMessage(assistantContent);
      setLocalHistory(prev => [...prev, { role: 'assistant', content: assistantContent }]);

      // Speak the response
      console.log('[VoiceChat] Calling TTS...');
      await tts.speak(assistantContent);
    } catch (err) {
      console.error('[VoiceChat] Error in processTranscript:', err);
      setError('Failed to get response. Please try again.');
      setState('idle');
    }
  }, [conversationHistory, localHistory, systemPrompt, tts, voiceService]);

  // Watch for completed transcript
  useEffect(() => {
    if (!voiceService.isListening && voiceService.transcript && state === 'listening') {
      console.log('[VoiceChat] Transcript complete, processing:', voiceService.transcript);
      processTranscript(voiceService.transcript);
      voiceService.resetTranscript();
    }
  }, [voiceService.isListening, voiceService.transcript, state, processTranscript, voiceService]);

  // Handle orb click
  const handleOrbClick = useCallback(async () => {
    console.log('[VoiceChat] Orb clicked, current state:', state);
    setError(null);
    
    if (state === 'idle') {
      // Check browser support first
      if (!voiceService.isSupported) {
        setError('Voice input is not supported in this browser. Please use Chrome, Safari, or Edge.');
        return;
      }
      
      // Initialize audio visualization first
      const success = await initAudioContext();
      if (!success) {
        return; // Error already set by initAudioContext
      }
      
      setState('listening');
      await voiceService.startListening();
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
      await voiceService.startListening();
    }
  }, [state, voiceService, tts, initAudioContext, cleanupAudioContext, processTranscript]);

  // Handle close
  const handleClose = useCallback(() => {
    console.log('[VoiceChat] Closing');
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
      console.log('[VoiceChat] Opening voice chat');
      setState('idle');
      setLocalHistory([]);
      setError(null);
      voiceService.resetTranscript();
    }
  }, [isOpen, voiceService]);

  if (!isOpen) return null;

  const currentTranscript = voiceService.transcript + voiceService.interimTranscript;
  const displayError = error || voiceService.error;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col animate-fade-in bg-gradient-to-b from-primary via-primary to-primary/90">
      {/* Close button - top right */}
      <div className="absolute top-4 right-4 z-10">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClose}
          className="rounded-full text-white/80 hover:text-white hover:bg-white/10"
          aria-label="Close voice chat"
        >
          <X className="h-6 w-6" />
        </Button>
      </div>

      {/* Header with logo */}
      <header className="flex items-center justify-center pt-12 pb-4">
        <div className="flex items-center gap-2">
          <img src={maiLogo} alt="mai" className="h-8 w-auto" />
          <span className="font-semibold text-white text-lg">Voice Mode</span>
        </div>
      </header>

      {/* Main content - centered orb */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <AudioVisualizer
          state={state}
          audioLevel={audioLevel}
          onClick={handleOrbClick}
        />

        {/* Error display */}
        {displayError && (
          <div className="mt-8 text-white/90 text-sm text-center max-w-xs bg-red-500/20 border border-red-400/30 rounded-lg px-4 py-3">
            <p>{displayError}</p>
            <button 
              onClick={() => {
                setError(null);
                setState('idle');
              }}
              className="mt-2 text-white/70 hover:text-white underline text-xs"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Browser support warning */}
        {!voiceService.isSupported && !displayError && (
          <p className="mt-8 text-white/70 text-sm text-center max-w-xs">
            Voice input is not supported in this browser. Please try Chrome, Safari, or Edge.
          </p>
        )}

        {/* TTS loading indicator */}
        {tts.isLoading && (
          <p className="mt-4 text-white/60 text-sm">Generating speech...</p>
        )}
      </div>

      {/* Transcript area at bottom */}
      <div className="px-6 pb-12 space-y-3 min-h-[140px]">
        {/* Current listening transcript */}
        {state === 'listening' && currentTranscript && (
          <div className="text-center animate-fade-in">
            <p className="text-white/60 text-xs mb-1">You</p>
            <p className="text-white text-lg font-medium">{currentTranscript}</p>
          </div>
        )}

        {/* Last user message (when not listening) */}
        {state !== 'listening' && lastUserMessage && (
          <div className="text-center animate-fade-in">
            <p className="text-white/60 text-xs mb-1">You said</p>
            <p className="text-white/80 text-sm line-clamp-2">{lastUserMessage}</p>
          </div>
        )}

        {/* Assistant response */}
        {lastAssistantMessage && (state === 'speaking' || state === 'listening') && (
          <div className="text-center animate-fade-in">
            <p className="text-white/60 text-xs mb-1">mai</p>
            <p className="text-white text-lg line-clamp-3">{lastAssistantMessage}</p>
          </div>
        )}

        {/* Processing indicator */}
        {state === 'processing' && (
          <div className="text-center animate-fade-in">
            <p className="text-white/70">Thinking...</p>
          </div>
        )}
      </div>
    </div>
  );
}
