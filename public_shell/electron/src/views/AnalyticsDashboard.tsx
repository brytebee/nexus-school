import React from 'react';

interface AnalyticsDashboardProps {
  onOpenHelp?: () => void;
}

export function AnalyticsDashboard({ onOpenHelp }: AnalyticsDashboardProps) {
  return (
    <div className="animate-in fade-in duration-300 h-full flex flex-col min-h-0">
      {/* View Header */}
      <div className="view-header">
        <div>
          <h2 
            className="view-title" 
            style={{
              background: 'linear-gradient(135deg, #10b981, #3b82f6)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              display: 'inline-block'
            }}
          >
            📈 Analytics Dashboard
          </h2>
          <p className="view-sub">
            At-risk flagging, subject heatmaps, and grade progression intelligence.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {onOpenHelp && (
            <button 
              className="primary-btn" 
              onClick={onOpenHelp} 
              style={{
                padding: '7px 16px', 
                fontSize: '12px', 
                background: 'rgba(0,229,255,0.1)', 
                border: '1px solid rgba(0,229,255,0.3)', 
                color: '#00e5ff'
              }}
            >
              💡 Feature Guide
            </button>
          )}
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
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto min-h-0 pr-1">
        <div style={{ maxWidth: '700px', margin: '0 auto', width: '100%' }}>
          {/* Hero Card */}
          <div 
            style={{
              background: 'rgba(16, 185, 129, 0.06)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              borderRadius: '16px',
              padding: '32px',
              marginBottom: '24px',
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>📈</div>
            <h3 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '12px', color: '#10b981' }}>
              From Report Cards to Intelligence
            </h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '14px', lineHeight: '1.7', maxWidth: '500px', margin: '0 auto' }}>
              Stop reacting to failure after the term. The Analytics Dashboard flags students at risk <em>before</em> they fail. Subject heatmaps reveal where your school is weakest. Grade progression shows who is truly improving.
            </p>
          </div>

          {/* Grid Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>🚨</div>
              <div style={{ fontWeight: 700, marginBottom: '6px', color: '#fff' }}>At-Risk Flagging</div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.5' }}>
                Automatically identifies students with declining scores, attendance patterns, or missed submissions.
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>🗺️</div>
              <div style={{ fontWeight: 700, marginBottom: '6px', color: '#fff' }}>Subject Heatmaps</div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.5' }}>
                Visual grid of class performance by subject. Spot which teachers need support and which subjects underperform.
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>📉</div>
              <div style={{ fontWeight: 700, marginBottom: '6px', color: '#fff' }}>Grade Progression</div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.5' }}>
                Track individual student performance across multiple terms. Identify consistent improvers and decliners.
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>📋</div>
              <div style={{ fontWeight: 700, marginBottom: '6px', color: '#fff' }}>Admin Reports</div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.5' }}>
                Exportable PDF reports for board meetings, proprietor reviews, and accreditation audits.
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
                Part of the Elite Intelligence suite. Contact your Nexus partner to upgrade your school.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AnalyticsDashboard;
