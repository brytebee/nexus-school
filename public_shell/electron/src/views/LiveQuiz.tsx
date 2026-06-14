import React from 'react';

export function LiveQuiz() {
  return (
    <div className="animate-in fade-in duration-300 h-full flex flex-col min-h-0">
      {/* View Header */}
      <div className="view-header">
        <div>
          <h2 
            className="view-title" 
            style={{
              background: 'linear-gradient(135deg, #00e5ff, #a855f7)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              display: 'inline-block'
            }}
          >
            ⚡ Live Quiz Arena
          </h2>
          <p className="view-sub">
            Redefined Local Event System — Gamified classroom and hall quiz engine.
          </p>
        </div>
        <span 
          style={{
            fontSize: '11px',
            fontWeight: 700,
            background: 'rgba(0, 229, 255, 0.15)',
            color: '#00e5ff',
            padding: '6px 14px',
            borderRadius: '20px',
            border: '1px solid rgba(0, 229, 255, 0.3)'
          }}
        >
          💎 Diamond Tier
        </span>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        <div style={{ maxWidth: '750px', margin: '0 auto', width: '100%' }}>
          {/* Hero Card */}
          <div 
            style={{
              background: 'rgba(0, 229, 255, 0.04)',
              border: '1px solid rgba(0, 229, 255, 0.15)',
              borderRadius: '20px',
              padding: '36px 32px',
              marginBottom: '28px',
              textAlign: 'center',
              boxShadow: '0 8px 32px rgba(0, 229, 255, 0.03)'
            }}
          >
            <div style={{ fontSize: '64px', marginBottom: '16px', filter: 'drop-shadow(0 0 12px rgba(0,229,255,0.4))' }}>⚡</div>
            <h3 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '12px', color: '#fff' }}>
              Digitize Hall Competitions & Debates
            </h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '14px', lineHeight: '1.7', maxWidth: '560px', margin: '0 auto' }}>
              Host highly engaging quiz events right inside your school hall or classroom. No expensive hardware buzzers or internet connection needed. Everything runs off your local hub network in real-time.
            </p>
          </div>

          {/* Workflow Steps / How It Works */}
          <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            System Architecture & Event Flow
          </h4>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
            {/* Step 1 */}
            <div style={{ display: 'flex', gap: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '14px', padding: '20px' }}>
              <div style={{ fontSize: '32px', display: 'flex', alignItems: 'center' }}>🖥️</div>
              <div>
                <h5 style={{ fontWeight: 700, color: '#fff', fontSize: '14px', marginBottom: '4px' }}>1. The Host Stage (Projector Screen)</h5>
                <p style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.6' }}>
                  The master console runs on the school admin's laptop and connects to a projector or large TV. Renders questions, options list, live countdowns, and dynamic real-time scores visible to the entire hall.
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div style={{ display: 'flex', gap: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '14px', padding: '20px' }}>
              <div style={{ fontSize: '32px', display: 'flex', alignItems: 'center' }}>📲</div>
              <div>
                <h5 style={{ fontWeight: 700, color: '#fff', fontSize: '14px', marginBottom: '4px' }}>2. Contestant Terminals (QR Connection)</h5>
                <p style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.6' }}>
                  Contestants or teams use their own mobile devices or school tablets connected to the host laptop's local Wi-Fi hotspot. By scanning a QR code shown on the projector screen, they instantly join the lobby without downloading any app.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div style={{ display: 'flex', gap: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '14px', padding: '20px' }}>
              <div style={{ fontSize: '32px', display: 'flex', alignItems: 'center' }}>🔌</div>
              <div>
                <h5 style={{ fontWeight: 700, color: '#fff', fontSize: '14px', marginBottom: '4px' }}>3. Real-Time WebSockets (Low Latency)</h5>
                <p style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.6' }}>
                  A localized WebSocket server running inside the Hub processes button taps and buzzer hits instantly. The contestant's device screen changes dynamically between an option selector keypad and a giant buzzer button.
                </p>
              </div>
            </div>

            {/* Step 4 */}
            <div style={{ display: 'flex', gap: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '14px', padding: '20px' }}>
              <div style={{ fontSize: '32px', display: 'flex', alignItems: 'center' }}>🏆</div>
              <div>
                <h5 style={{ fontWeight: 700, color: '#fff', fontSize: '14px', marginBottom: '4px' }}>4. Gamified Leaderboard & Sync</h5>
                <p style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.6' }}>
                  Scores are automatically calculated based on correct answers and response speeds. Leaderboards shuffle dynamically with vibrant animations. Upon quiz completion, results can be synced directly to class performance files.
                </p>
              </div>
            </div>
          </div>

          {/* Marketing/Tier Note */}
          <div 
            style={{
              background: 'rgba(168, 85, 247, 0.06)',
              border: '1px solid rgba(168, 85, 247, 0.2)',
              borderRadius: '16px',
              padding: '24px',
              marginBottom: '40px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '16px'
            }}
          >
            <div style={{ fontSize: '28px' }}>💡</div>
            <div>
              <div style={{ fontWeight: 700, color: '#c084fc', marginBottom: '4px', fontSize: '14px' }}>Marketing & Pitch Mode Enablement</div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.6' }}>
                While reserved for the <strong>Diamond Plan</strong> subscription, sales representatives can activate **Pitch Mode** in the settings. This runs a simulated lobby session with virtual mock contestants, allowing you to showcase live buzzer races during demos to close deals with school admins instantly.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LiveQuiz;
