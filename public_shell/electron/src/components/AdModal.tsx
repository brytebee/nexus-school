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

// YouTube IFrame API player states
const YT_PLAYING = 1;
const YT_ERRORED = -1; // synthetic — we map all error events here

export function AdModal({ ad, onClose }: AdModalProps) {
  const [countdown, setCountdown] = useState(ad.skip_after_seconds);
  const [videoReady, setVideoReady] = useState(false);   // true once video starts playing
  const [videoError, setVideoError] = useState(false);   // true on any player error (e.g. Error 153)
  const [isMuted, setIsMuted] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Build embed URL — enable JS API so we can receive postMessage events
  const embedUrl = `https://www.youtube.com/embed/${ad.youtube_id}?autoplay=1&mute=${isMuted ? 1 : 0}&controls=0&modestbranding=1&rel=0&iv_load_policy=3&showinfo=0&enablejsapi=1&origin=${encodeURIComponent(window.location.origin || 'file://')}`;

  // Listen for YouTube IFrame API postMessage events
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data) return;
      let data: any = {};
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }

      // YouTube sends { event: 'onStateChange', info: <state> }
      if (data.event === 'onStateChange') {
        if (data.info === YT_PLAYING && !videoReady) {
          setVideoReady(true);
        }
      }

      // YouTube sends { event: 'onError', info: <errorCode> }
      // Error 100: removed/private. Error 101/150: embedding disabled. Error 5: HTML5 issue.
      if (data.event === 'onError') {
        setVideoError(true);
        setVideoReady(true); // allow skip immediately on error
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [videoReady]);

  // Start countdown only after video is confirmed playing (or errored)
  useEffect(() => {
    if (!videoReady) return;

    setCountdown(ad.skip_after_seconds);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [videoReady, ad]);

  // Safety net: if the player never fires a postMessage within 8 seconds
  // (e.g. iframe is sandboxed or network blocked), unlock skip anyway.
  useEffect(() => {
    const fallback = setTimeout(() => {
      if (!videoReady) setVideoReady(true);
    }, 8000);
    return () => clearTimeout(fallback);
  }, [ad]);

  const handleCta = () => {
    if ((window as any).electronAPI?.openExternal) {
      (window as any).electronAPI.openExternal(ad.cta_link);
    }
  };

  const toggleMute = () => {
    setIsMuted((m) => !m);
    // Post mute command to iframe player
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func: isMuted ? 'unMute' : 'mute', args: [] }),
      '*'
    );
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
        animation: 'fadeIn 0.3s ease-out forwards',
        padding: '24px',
      }}
    >
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* Video container */}
      <div
        style={{
          width: '100%',
          maxWidth: '800px',
          aspectRatio: '16/9',
          background: '#000',
          borderRadius: '16px',
          border: '1px solid rgba(255, 215, 0, 0.3)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.8), 0 0 40px rgba(0, 229, 255, 0.1)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Buffering overlay — visible until video starts */}
        {!videoReady && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.7)',
              zIndex: 2,
              gap: '12px',
            }}
          >
            <div style={{ fontSize: '28px', animation: 'pulse 1.5s ease-in-out infinite' }}>⏳</div>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '13px', margin: 0 }}>
              Loading video…
            </p>
          </div>
        )}

        {/* Error overlay — shown when YouTube rejects embedding */}
        {videoError && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.88)',
              zIndex: 3,
              gap: '10px',
            }}
          >
            <div style={{ fontSize: '36px' }}>🎬</div>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', margin: 0 }}>
              This video cannot be played inline.
            </p>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: 0 }}>
              Skip or click Learn More to continue.
            </p>
          </div>
        )}

        <iframe
          ref={iframeRef}
          src={embedUrl}
          title={ad.title}
          style={{ width: '100%', height: '100%', border: 'none' }}
          allow="autoplay; encrypted-media"
        />

        {/* Mute toggle */}
        <button
          onClick={toggleMute}
          style={{
            position: 'absolute',
            bottom: '16px',
            left: '16px',
            background: 'rgba(0,0,0,0.6)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            cursor: 'pointer',
            fontSize: '18px',
            transition: 'all 0.2s ease',
            zIndex: 4,
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>
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
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)' }}>
            {ad.title}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={handleCta}
            style={{
              background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 20px',
              color: '#0b0f19',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(255, 215, 0, 0.2)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.03)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(255, 215, 0, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(255, 215, 0, 0.2)';
            }}
          >
            Learn More
          </button>

          {/* Waiting for video / countdown / skip button */}
          {!videoReady ? (
            <div
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                padding: '10px 20px',
                color: 'rgba(255,255,255,0.3)',
                fontSize: '13px',
                minWidth: '120px',
                textAlign: 'center',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            >
              Buffering…
            </div>
          ) : countdown > 0 ? (
            <div
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '8px',
                padding: '10px 20px',
                color: 'rgba(255,255,255,0.5)',
                fontSize: '13px',
                fontWeight: 600,
                minWidth: '120px',
                textAlign: 'center',
              }}
            >
              Skip in {countdown}s
            </div>
          ) : (
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '8px',
                padding: '10px 20px',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                e.currentTarget.style.transform = 'scale(1.03)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
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
