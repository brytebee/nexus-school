import React from 'react';

export function NotesMarketplace() {
  return (
    <div className="animate-in fade-in duration-300 h-full flex flex-col min-h-0">
      {/* View Header */}
      <div className="view-header">
        <div>
          <h2 
            className="view-title" 
            style={{
              background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              display: 'inline-block'
            }}
          >
            📚 Nexus Notes Marketplace
          </h2>
          <p className="view-sub">
            A digital storefront for teachers to sell curated study materials to students.
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
              background: 'rgba(139, 92, 246, 0.06)',
              border: '1px solid rgba(139, 92, 246, 0.2)',
              borderRadius: '16px',
              padding: '32px',
              marginBottom: '24px',
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: '64px', marginBottom: '16px' }}>📚</div>
            <h3 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '12px', color: '#8b5cf6' }}>
              Teachers Earn. Students Learn.
            </h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '14px', lineHeight: '1.7', maxWidth: '500px', margin: '0 auto' }}>
              Your best teachers spend hours creating brilliant study materials. Nexus Notes lets them monetize that work — selling PDFs, past question compilations, and study guides directly to students via the school portal. The school earns a commission on every sale.
            </p>
          </div>

          {/* Grid Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>💰</div>
              <div style={{ fontWeight: 700, marginBottom: '6px', color: '#fff' }}>Teacher Revenue</div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.5' }}>
                Teachers upload and price their materials. Nexus handles payments, downloads, and delivery automatically.
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>🏫</div>
              <div style={{ fontWeight: 700, marginBottom: '6px', color: '#fff' }}>School Commission</div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.5' }}>
                The school sets a commission rate. Every sale generates passive revenue for the institution.
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>📲</div>
              <div style={{ fontWeight: 700, marginBottom: '6px', color: '#fff' }}>Parent Access via Portal</div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.5' }}>
                Parents browse and purchase from the school's public portal. Instant PDF delivery.
              </div>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px' }}>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>📑</div>
              <div style={{ fontWeight: 700, marginBottom: '6px', color: '#fff' }}>Curated Content Only</div>
              <div style={{ fontSize: '12px', color: 'var(--text-dim)', lineHeight: '1.5' }}>
                School admin approves all materials before listing. Maintain quality control across your marketplace.
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
                Requires the Always-On Portal for parent access. Contact your Nexus partner to upgrade.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NotesMarketplace;
