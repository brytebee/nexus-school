import React, { useState, useEffect, useRef } from 'react';

interface Ad {
  youtube_id: string;
  title: string;
  skip_after_seconds: number;
  cta_link: string;
}

interface AdModalProps {
  ad: Ad;
  onClose: () => void;
}

// YouTube Player States
const YT_UNSTARTED = -1;
const YT_ENDED = 0;
const YT_PLAYING = 1;
const YT_PAUSED = 2;
const YT_BUFFERING = 3;
const YT_CUED = 5;

const SAFETY_FALLBACK_MS = 10000; // 10s fallback to unlock if loading takes too long

export function AdModal({ ad, onClose }: AdModalProps) {
  const [countdown, setCountdown] = useState(ad.skip_after_seconds);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isFallbackActive, setIsFallbackActive] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Enable JS API so the player posts messages back to us
  const embedUrl = `https://www.youtube.com/embed/${ad.youtube_id}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3&showinfo=0&enablejsapi=1`;

  useEffect(() => {
    // 1. Reset state for new ad
    setCountdown(ad.skip_after_seconds);
    setIsPlaying(false);
    setIsBuffering(true);
    setIsFallbackActive(false);

    // 2. Start safety fallback timer (if video fails to load or play, let them skip after 10s)
    fallbackRef.current = setTimeout(() => {
      setIsFallbackActive(true);
      setIsPlaying(true);
      setIsBuffering(false);
    }, SAFETY_FALLBACK_MS);

    // 3. Listen for postMessage events from the YouTube player
    const handleMessage = (event: MessageEvent) => {
      // Allow messages from youtube domains
      if (!event.origin.includes('youtube.com') && !event.origin.includes('youtube-nocookie.com')) {
        return;
      }

      let data: any;
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch (e) {
        return;
      }

      if (data && data.event === 'onStateChange') {
        const state = data.info;
        if (state === YT_PLAYING) {
          setIsPlaying(true);
          setIsBuffering(false);
          clearTimeout(fallbackRef.current!);
        } else if (state === YT_BUFFERING) {
          setIsPlaying(false);
          setIsBuffering(true);
        } else if (state === YT_PAUSED || state === YT_ENDED) {
          setIsPlaying(false);
        }
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
      if (timerRef.current) clearInterval(timerRef.current);
      if (fallbackRef.current) clearTimeout(fallbackRef.current);
    };
  }, [ad]);

  // 4. Timer effect: countdown only runs when isPlaying is true
  useEffect(() => {
    if (isPlaying && countdown > 0) {
      timerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current!);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, countdown]);

  const handleCta = () => {
    if ((window as any).electronAPI?.openExternal) {
      (window as any).electronAPI.openExternal(ad.cta_link);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5, 7, 18, 0.9)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        animation: 'adFadeIn 0.3s ease-out forwards',
        padding: '24px',
      }}
    >
      <style>{`
        @keyframes adFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes adPulse  { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>

      {/* Video frame */}
      <div
        style={{
          width: '100%',
          maxWidth: '800px',
          aspectRatio: '16/9',
          background: '#000',
          borderRadius: '16px',
          border: '1px solid rgba(255, 215, 0, 0.3)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.8), 0 0 40px rgba(0,229,255,0.08)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Buffering/Loading overlay */}
        {isBuffering && !isFallbackActive && (
          <div
            style={{
              position: 'absolute', inset: 0, zIndex: 2,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              background: 'rgba(5,7,18,0.85)', gap: '12px',
            }}
          >
            <div style={{ fontSize: '32px', animation: 'adPulse 1.4s ease-in-out infinite' }}>⏳</div>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', margin: 0, fontWeight: 500 }}>
              Buffering ad stream…
            </p>
          </div>
        )}

        {/* Fallback connection alert */}
        {isFallbackActive && (
          <div
            style={{
              position: 'absolute', top: '12px', left: '12px', right: '12px', zIndex: 3,
              background: 'rgba(239,68,68,0.9)', color: '#fff', padding: '8px 12px',
              borderRadius: '8px', fontSize: '11px', textAlign: 'center', fontWeight: 600,
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
            }}
          >
            Slow connection detected. Skipping enabled.
          </div>
        )}

        <iframe
          ref={iframeRef}
          src={embedUrl}
          title={ad.title}
          style={{ width: '100%', height: '100%', border: 'none' }}
          allow="autoplay; encrypted-media"
        />
      </div>

      {/* Bottom controls & info */}
      <div
        style={{
          width: '100%',
          maxWidth: '800px',
          marginTop: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        <div style={{ flex: 1 }}>
          <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#fff' }}>
            Sponsored Ad
          </h4>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'rgba(255,255,255,0.65)' }}>
            {ad.title}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* CTA Link */}
          <button
            onClick={handleCta}
            style={{
              background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
              border: 'none', borderRadius: '8px',
              padding: '10px 20px', color: '#0b0f19',
              fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(255,215,0,0.2)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.03)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(255,215,0,0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(255,215,0,0.2)';
            }}
          >
            Learn More
          </button>

          {/* Action indicator or countdown */}
          {isBuffering && !isFallbackActive ? (
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px', padding: '10px 20px',
              color: 'rgba(255,255,255,0.4)', fontSize: '13px',
              minWidth: '120px', textAlign: 'center',
            }}>
              Waiting for stream…
            </div>
          ) : countdown > 0 ? (
            <div style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '8px', padding: '10px 20px',
              color: 'rgba(255,255,255,0.6)',
              fontSize: '13px', fontWeight: 600,
              minWidth: '120px', textAlign: 'center',
            }}>
              Skip in {countdown}s
            </div>
          ) : (
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: '8px', padding: '10px 20px',
                color: '#fff', fontSize: '13px', fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                e.currentTarget.style.transform = 'scale(1.03)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              Skip Ad →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
