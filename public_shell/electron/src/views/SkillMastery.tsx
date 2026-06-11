import React from 'react';

export function SkillMastery() {
  return (
    <div className="animate-in fade-in duration-300 h-full flex flex-col min-h-0">
      {/* View Header */}
      <div className="view-header">
        <div>
          <h2 
            className="view-title" 
            style={{
              background: 'linear-gradient(135deg, #f59e0b, #10b981)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              display: 'inline-block'
            }}
          >
            🎯 Skill Mastery Tracking
          </h2>
          <p className="view-sub">
            International IEP-standard academic progress reports for every student.
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
              background: 'rgba(245, 158, 11, 0.04)',
              border: '1px solid rgba(245, 158, 11, 0.18)',
              borderRadius: '16px',
              padding: '36px 32px',
              marginBottom: '24px',
              textAlign: 'center',
              boxShadow: '0 8px 32px rgba(245, 158, 11, 0.05)'
            }}
          >
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>🎯</div>
            <h3 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '12px', color: '#f59e0b' }}>
              Beyond Grades — Real Learning Outcomes
            </h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '14px', lineHeight: '1.7', maxWidth: '500px', margin: '0 auto' }}>
              Report cards show scores. Skill Mastery shows <em>what a student can actually do</em>. Aligned to international competency frameworks, these reports tell parents and administrators which skills have been mastered, which are developing, and which need attention.
            </p>
          </div>

          {/* Grid Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>🌐</div>
              <div style={{ fontWeight: 700, marginBottom: '6px', color: '#fff' }}>IEP-Standard Reports</div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.5' }}>
                Competency-based reports aligned to international educational frameworks. Differentiate your school.
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>✅</div>
              <div style={{ fontWeight: 700, marginBottom: '6px', color: '#fff' }}>Mastery Indicators</div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.5' }}>
                Not Attempted / Developing / Approaching / Mastered — clear, actionable status for every skill.
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>👩‍🏫</div>
              <div style={{ fontWeight: 700, marginBottom: '6px', color: '#fff' }}>Teacher Assessment Input</div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.5' }}>
                Teachers record skill assessments from their devices. Syncs to the hub automatically.
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>📄</div>
              <div style={{ fontWeight: 700, marginBottom: '6px', color: '#fff' }}>Printable + Portal</div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.5' }}>
                Skill Mastery reports are printable as PDFs and visible to parents on the school portal.
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

export default SkillMastery;
