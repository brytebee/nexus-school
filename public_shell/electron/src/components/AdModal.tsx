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

export function AdModal({ ad, onClose }: AdModalProps) {
  const [countdown, setCountdown] = useState(ad.skip_after_seconds);
  const [isMuted, setIsMuted] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
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
  }, [ad]);

  const handleCta = () => {
    if ((window as any).electronAPI?.openExternal) {
      (window as any).electronAPI.openExternal(ad.cta_link);
    }
  };

  const embedUrl = `https://www.youtube.com/embed/${ad.youtube_id}?autoplay=1&mute=${isMuted ? 1 : 0}&controls=0&modestbranding=1&rel=0&iv_load_policy=3&showinfo=0`;

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
      `}</style>

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
        <iframe
          src={embedUrl}
          title={ad.title}
          style={{ width: '100%', height: '100%', border: 'none' }}
          allow="autoplay; encrypted-media"
        />

        <button
          onClick={() => setIsMuted(!isMuted)}
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
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>
      </div>

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

          {countdown > 0 ? (
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
