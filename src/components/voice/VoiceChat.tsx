import { useState, useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AudioVisualizer, VoiceState } from './AudioVisualizer';
import { useVoiceService } from '@/hooks/useVoiceService';
import { useMediaRecorder } from '@/hooks/useMediaRecorder';
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

type TranscriptionMode = 'native' | 'fallback' | 'detecting';

export function VoiceChat({ isOpen, onClose, conversationHistory = [], systemPrompt }: VoiceChatProps) {
  const [state, setState] = useState<VoiceState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [lastUserMessage, setLastUserMessage] = useState('');
  const [lastAssistantMessage, setLastAssistantMessage] = useState('');
  const [localHistory, setLocalHistory] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [transcriptionMode, setTranscriptionMode] = useState<TranscriptionMode>('detecting');
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number>(0);
  const stateRef = useRef<VoiceState>('idle');
  const nativeFailCountRef = useRef(0);
  const transcriptionModeRef = useRef<TranscriptionMode>('detecting');

  // Keep refs in sync
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    transcriptionModeRef.current = transcriptionMode;
  }, [transcriptionMode]);

  // Detect transcription mode on mount
  useEffect(() => {
    const detectMode = () => {
      // Check if native SpeechRecognition is available
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      
      // iOS Safari detection
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      
      if (!SpeechRecognition) {
        console.log('[VoiceChat] Native SpeechRecognition not available, using fallback');
        setTranscriptionMode('fallback');
        return;
      }

      // iOS Safari has SpeechRecognition but it often fails silently
      if (isIOS && isSafari) {
        console.log('[VoiceChat] iOS Safari detected, using fallback mode');
        setTranscriptionMode('fallback');
        return;
      }

      // Start with native, will switch to fallback if it fails
      console.log('[VoiceChat] Using native SpeechRecognition');
      setTranscriptionMode('native');
    };

    if (isOpen) {
      detectMode();
    }
  }, [isOpen]);

  // Process transcript callback for native mode
  const handleNativeTranscript = useCallback((transcript: string) => {
    if (stateRef.current === 'listening' && transcript) {
      console.log('[VoiceChat] Native transcript received:', transcript);
      nativeFailCountRef.current = 0; // Reset fail count on success
      processTranscript(transcript);
    }
  }, []);

  // Initialize voice service with silence detection (native mode)
  const voiceService = useVoiceService({
    onSilenceDetected: useCallback(() => {
      console.log('[VoiceChat] Silence detected callback, state:', stateRef.current, 'mode:', transcriptionModeRef.current);
      if (stateRef.current === 'listening' && transcriptionModeRef.current === 'native') {
        voiceService.stopListening();
      }
    }, []),
    silenceTimeout: 1500,
  });

  // Handle native speech recognition errors
  useEffect(() => {
    if (voiceService.error && transcriptionMode === 'native') {
      console.log('[VoiceChat] Native voice error:', voiceService.error);
      nativeFailCountRef.current++;
      
      // Switch to fallback after repeated failures
      if (nativeFailCountRef.current >= 2) {
        console.log('[VoiceChat] Native mode failed repeatedly, switching to fallback');
        setTranscriptionMode('fallback');
        setError(null); // Clear the native error
      }
    }
  }, [voiceService.error, transcriptionMode]);

  // MediaRecorder fallback
  const mediaRecorder = useMediaRecorder({
    onTranscriptionComplete: useCallback((transcript: string) => {
      console.log('[VoiceChat] MediaRecorder transcription complete:', transcript);
      if (stateRef.current === 'listening' || stateRef.current === 'processing') {
        processTranscript(transcript);
      }
    }, []),
    onError: useCallback((err: string) => {
      console.error('[VoiceChat] MediaRecorder error:', err);
      setError(err);
      setState('idle');
    }, []),
  });

  const tts = useTTS({
    onPlayStart: () => {
      console.log('[VoiceChat] TTS playback started');
      setState('speaking');
    },
    onPlayEnd: () => {
      console.log('[VoiceChat] TTS playback ended, resuming listening');
      setState('listening');
      startListening();
    },
  });

  // Unified start listening function
  const startListening = useCallback(async () => {
    console.log('[VoiceChat] Starting listening, mode:', transcriptionModeRef.current);
    
    if (transcriptionModeRef.current === 'fallback') {
      await mediaRecorder.startRecording();
    } else {
      await voiceService.startListening();
    }
  }, [mediaRecorder, voiceService]);

  // Unified stop listening function
  const stopListening = useCallback(() => {
    console.log('[VoiceChat] Stopping listening, mode:', transcriptionModeRef.current);
    
    if (transcriptionModeRef.current === 'fallback') {
      mediaRecorder.stopRecording();
    } else {
      voiceService.stopListening();
    }
  }, [mediaRecorder, voiceService]);

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
      startListening();
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
  }, [conversationHistory, localHistory, systemPrompt, tts, startListening]);

  // Watch for completed transcript (native mode only)
  useEffect(() => {
    if (transcriptionMode === 'native' && !voiceService.isListening && voiceService.transcript && state === 'listening') {
      console.log('[VoiceChat] Native transcript complete, processing:', voiceService.transcript);
      processTranscript(voiceService.transcript);
      voiceService.resetTranscript();
    }
  }, [voiceService.isListening, voiceService.transcript, state, processTranscript, voiceService, transcriptionMode]);

  // Handle orb click
  const handleOrbClick = useCallback(async () => {
    console.log('[VoiceChat] Orb clicked, current state:', state, 'mode:', transcriptionMode);
    setError(null);
    
    if (state === 'idle') {
      // Check if we have any transcription mode available
      if (transcriptionMode === 'detecting') {
        setError('Initializing voice input...');
        return;
      }

      // Native mode support check
      if (transcriptionMode === 'native' && !voiceService.isSupported) {
        console.log('[VoiceChat] Native not supported, switching to fallback');
        setTranscriptionMode('fallback');
      }
      
      // Initialize audio visualization first
      const success = await initAudioContext();
      if (!success) {
        return; // Error already set by initAudioContext
      }
      
      setState('listening');
      await startListening();
      
    } else if (state === 'listening') {
      stopListening();
      
      // For native mode, check if there's a transcript to process
      if (transcriptionMode === 'native' && voiceService.transcript) {
        processTranscript(voiceService.transcript);
        voiceService.resetTranscript();
      } else if (transcriptionMode === 'fallback') {
        // MediaRecorder will handle transcription via callback
        setState('processing');
      } else {
        setState('idle');
        cleanupAudioContext();
      }
      
    } else if (state === 'speaking') {
      tts.stop();
      setState('listening');
      voiceService.resetTranscript();
      await startListening();
    }
  }, [state, transcriptionMode, voiceService, tts, initAudioContext, cleanupAudioContext, processTranscript, startListening, stopListening]);

  // Handle close
  const handleClose = useCallback(() => {
    console.log('[VoiceChat] Closing');
    stopListening();
    tts.stop();
    cleanupAudioContext();
    setState('idle');
    setLastUserMessage('');
    setLastAssistantMessage('');
    setLocalHistory([]);
    setError(null);
    onClose();
  }, [stopListening, tts, cleanupAudioContext, onClose]);

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
      nativeFailCountRef.current = 0;
    }
  }, [isOpen, voiceService]);

  if (!isOpen) return null;

  // Determine current transcript based on mode
  const currentTranscript = transcriptionMode === 'native' 
    ? voiceService.transcript + voiceService.interimTranscript
    : ''; // MediaRecorder doesn't have interim results
    
  const isTranscribing = mediaRecorder.isTranscribing;
  const displayError = error || (transcriptionMode === 'native' ? voiceService.error : mediaRecorder.error);
  const isAnyRecording = transcriptionMode === 'native' ? voiceService.isListening : mediaRecorder.isRecording;

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
          {transcriptionMode === 'fallback' && (
            <span className="text-white/50 text-xs">(Cloud)</span>
          )}
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

        {/* Transcription loading indicator for fallback mode */}
        {isTranscribing && (
          <p className="mt-4 text-white/70 text-sm animate-pulse">Transcribing audio...</p>
        )}

        {/* TTS loading indicator */}
        {tts.isLoading && (
          <p className="mt-4 text-white/60 text-sm">Generating speech...</p>
        )}
      </div>

      {/* Transcript area at bottom */}
      <div className="px-6 pb-12 space-y-3 min-h-[140px]">
        {/* Current listening transcript (native mode) */}
        {state === 'listening' && currentTranscript && transcriptionMode === 'native' && (
          <div className="text-center animate-fade-in">
            <p className="text-white/60 text-xs mb-1">You</p>
            <p className="text-white text-lg font-medium">{currentTranscript}</p>
          </div>
        )}

        {/* Recording indicator for fallback mode */}
        {state === 'listening' && transcriptionMode === 'fallback' && isAnyRecording && (
          <div className="text-center animate-fade-in">
            <p className="text-white/60 text-xs mb-1">Recording...</p>
            <p className="text-white/80 text-sm">Tap orb when done speaking</p>
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
        {state === 'processing' && !isTranscribing && (
          <div className="text-center animate-fade-in">
            <p className="text-white/70">Thinking...</p>
          </div>
        )}
      </div>
    </div>
  );
}
