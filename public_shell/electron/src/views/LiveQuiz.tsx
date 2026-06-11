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
              background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              display: 'inline-block'
            }}
          >
            ⚡ Live Quiz System
          </h2>
          <p className="view-sub">
            Kahoot-style real-time classroom quiz engine — no app install required.
          </p>
        </div>
        <span 
          style={{
            fontSize: '11px',
            fontWeight: 700,
            background: 'rgba(99, 102, 241, 0.15)',
            color: '#818cf8',
            padding: '6px 14px',
            borderRadius: '20px',
            border: '1px solid rgba(99, 102, 241, 0.3)'
          }}
        >
          Coming in Next Release
        </span>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        <div style={{ maxWidth: '700px', margin: '0 auto', width: '100%' }}>
          {/* Hero Card */}
          <div 
            style={{
              background: 'rgba(245, 158, 11, 0.06)',
              border: '1px solid rgba(245, 158, 11, 0.2)',
              borderRadius: '16px',
              padding: '32px',
              marginBottom: '24px',
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>⚡</div>
            <h3 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '12px', color: '#f59e0b' }}>
              Turn Every Lesson into a Game
            </h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '14px', lineHeight: '1.7', maxWidth: '500px', margin: '0 auto' }}>
              The teacher projects a question on the board. Students answer on their phones. A live leaderboard updates in real-time. No app install — just a browser. Closes demo deals in 60 seconds.
            </p>
          </div>

          {/* Grid Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>📱</div>
              <div style={{ fontWeight: 700, marginBottom: '6px', color: '#fff' }}>Browser-Only</div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.5' }}>
                Students connect to the school's local hub via WiFi. No app download. Just open a browser.
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>🏆</div>
              <div style={{ fontWeight: 700, marginBottom: '6px', color: '#fff' }}>Live Leaderboard</div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.5' }}>
                Real-time scoring, animations, and excitement. Students compete, teachers engage.
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>📊</div>
              <div style={{ fontWeight: 700, marginBottom: '6px', color: '#fff' }}>Instant Analytics</div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.5' }}>
                See which questions students got wrong most. Identify weak spots immediately.
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔗</div>
              <div style={{ fontWeight: 700, marginBottom: '6px', color: '#fff' }}>Linked to CBT Banks</div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.5' }}>
                Pull questions directly from your existing CBT Question Banks for review sessions.
              </div>
            </div>
          </div>

          {/* Tier Footer */}
          <div 
            style={{
              background: 'rgba(99, 102, 241, 0.08)',
              border: '1px solid rgba(99, 102, 241, 0.2)',
              borderRadius: '12px',
              padding: '20px',
              paddingTop: '24px',
              marginTop: '32px',
              marginBottom: '32px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px'
            }}
          >
            <div style={{ fontSize: '32px' }}>💎</div>
            <div>
              <div style={{ fontWeight: 700, color: '#818cf8', marginBottom: '4px' }}>Diamond Tier Feature</div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                Available as part of the CBT Engine suite. Contact your Nexus partner to upgrade.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LiveQuiz;
