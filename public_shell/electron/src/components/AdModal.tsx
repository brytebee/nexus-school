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

// How long after iframe loads before we consider the video "playing"
// and start the countdown. YouTube needs ~1–2s to handshake and begin playback.
const PLAY_BUFFER_MS = 2000;

// Hard fallback: if iframe never fires onLoad within this time, unlock anyway.
const HARD_TIMEOUT_MS = 9000;

export function AdModal({ ad, onClose }: AdModalProps) {
  const [countdown, setCountdown]   = useState(ad.skip_after_seconds);
  const [videoReady, setVideoReady] = useState(false);
  const [isMuted, setIsMuted]       = useState(true);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const playBufRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hardTimRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeRef   = useRef<HTMLIFrameElement>(null);

  // Build the embed URL.
  // enablejsapi=0 — we don't rely on postMessage (broken in file:// Electron context).
  const embedUrl = `https://www.youtube.com/embed/${ad.youtube_id}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3&showinfo=0`;

  // When the ad changes reset everything
  useEffect(() => {
    setVideoReady(false);
    setCountdown(ad.skip_after_seconds);
    setIsMuted(true);

    // Hard safety net in case iframe never loads
    hardTimRef.current = setTimeout(() => {
      setVideoReady(true);
    }, HARD_TIMEOUT_MS);

    return () => {
      clearTimeout(hardTimRef.current!);
      clearTimeout(playBufRef.current!);
      clearInterval(timerRef.current!);
    };
  }, [ad]);

  // Called when iframe finishes loading — wait a short buffer then start countdown
  const handleIframeLoad = () => {
    clearTimeout(hardTimRef.current!); // hard timer no longer needed
    playBufRef.current = setTimeout(() => {
      setVideoReady(true);
    }, PLAY_BUFFER_MS);
  };

  // Countdown starts only once videoReady flips true
  useEffect(() => {
    if (!videoReady) return;

    setCountdown(ad.skip_after_seconds);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerRef.current!);
  }, [videoReady, ad]);

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
        background: 'rgba(5, 7, 18, 0.85)',
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
        @keyframes adPulse  { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

      {/* Video wrapper */}
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
        {/* Buffering overlay — hidden once videoReady */}
        {!videoReady && (
          <div
            style={{
              position: 'absolute', inset: 0, zIndex: 2,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.82)', gap: '12px',
            }}
          >
            <div style={{ fontSize: '30px', animation: 'adPulse 1.4s ease-in-out infinite' }}>▶</div>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', margin: 0 }}>
              Loading ad…
            </p>
          </div>
        )}

        <iframe
          ref={iframeRef}
          src={embedUrl}
          title={ad.title}
          onLoad={handleIframeLoad}
          style={{ width: '100%', height: '100%', border: 'none' }}
          allow="autoplay; encrypted-media"
        />
      </div>

      {/* Bottom bar */}
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
          {/* CTA */}
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

          {/* Skip chip — buffering → counting → skip */}
          {!videoReady ? (
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px', padding: '10px 20px',
              color: 'rgba(255,255,255,0.3)', fontSize: '13px',
              minWidth: '120px', textAlign: 'center',
              animation: 'adPulse 1.4s ease-in-out infinite',
            }}>
              Buffering…
            </div>
          ) : countdown > 0 ? (
            <div style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '8px', padding: '10px 20px',
              color: 'rgba(255,255,255,0.5)',
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
                border: '1px solid rgba(255,255,255,0.2)',
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
