import React, { useState, useEffect, useRef } from 'react';

interface PortalInfo {
  schoolName: string;
  brandUrl: string;
  realUrl: string;
  mdnsUrl: string | null;
  lanIp: string;
  port: number;
  allIps: string[];
}

export function SovereignPortal() {
  const [portalInfo, setPortalInfo] = useState<PortalInfo | null>(null);
  const [activeUrl, setActiveUrl] = useState('');
  const [activeIp, setActiveIp] = useState('');
  const [toastMsg, setToastMsg] = useState('');

  // Settings states
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [domainSlug, setDomainSlug] = useState('');

  const qrContainerRef = useRef<HTMLDivElement>(null);

  // Derives hope.edu.nexus style brand urls
  const deriveBrandUrl = (name: string) => {
    const part = (name || 'Nexus').split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    return `http://${part}.edu.nexus`;
  };

  const fetchPortalInfo = async () => {
    if (!window.electronAPI) return;
    try {
      if (window.electronAPI.portal?.getInfo) {
        const info = await window.electronAPI.portal.getInfo();
        if (info) {
          setPortalInfo(info);
          setActiveUrl(info.realUrl || 'http://localhost:3002/portal');
          setActiveIp(info.lanIp || '127.0.0.1');
        }
      }
      
      const identity = await window.electronAPI.getIdentity();
      if (identity && identity.portalSlug) {
        setDomainSlug(identity.portalSlug);
      }
    } catch (err) {
      console.error('Error fetching portal info:', err);
      // Fallback
      try {
        const identity = await window.electronAPI.getIdentity();
        const name = identity?.name || 'Nexus';
        const fallbackInfo = {
          schoolName: name,
          brandUrl: deriveBrandUrl(name),
          realUrl: 'http://localhost:3002/portal',
          mdnsUrl: null,
          lanIp: '127.0.0.1',
          port: 3002,
          allIps: ['127.0.0.1'],
        };
        setPortalInfo(fallbackInfo);
        setActiveUrl(fallbackInfo.realUrl);
        setActiveIp(fallbackInfo.lanIp);
        if (identity && identity.portalSlug) {
          setDomainSlug(identity.portalSlug);
        }
      } catch (_) {}
    }
  };

  useEffect(() => {
    fetchPortalInfo();
  }, []);

  // Render QR Code based on activeUrl changes
  useEffect(() => {
    if (!activeUrl || !qrContainerRef.current) return;
    
    // Clear container
    qrContainerRef.current.innerHTML = '';

    try {
      const QRCodeLib = (window as any).QRCode;
      if (QRCodeLib) {
        new QRCodeLib(qrContainerRef.current, {
          text: activeUrl,
          width: 200,
          height: 200,
          colorDark: '#000000',
          colorLight: '#ffffff',
          correctLevel: 3, // QRCode.CorrectLevel.H
        });
      } else {
        console.error('Global QRCode library is not loaded');
      }
    } catch (err) {
      console.error('Error rendering portal QR:', err);
    }
  }, [activeUrl]);

  const handleIpChipClick = (ip: string) => {
    if (!portalInfo) return;
    const port = portalInfo.port || 3002;
    const newUrl = `http://${ip}:${port}/portal`;
    
    setActiveUrl(newUrl);
    setActiveIp(ip);

    // Copy to clipboard
    navigator.clipboard.writeText(newUrl);
    setToastMsg(`Switched broadcasting interface & copied link: ${ip}`);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(activeUrl);
    setToastMsg('Copied URL to Clipboard!');
    setTimeout(() => setToastMsg(''), 2500);
  };

  const handleOpenLocal = () => {
    window.open(activeUrl, '_blank');
  };

  const handleSaveQRImage = () => {
    if (!qrContainerRef.current) return;
    const canvas = qrContainerRef.current.querySelector('canvas');
    if (!canvas) {
      alert('QR code canvas is not generated yet.');
      return;
    }

    const schoolName = (portalInfo?.schoolName || 'Nexus')
      .split(' ')[0]
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    const filename = `nexus-portal-qr-${schoolName}.png`;

    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
    
    setToastMsg(`Saved QR image as: ${filename}`);
    setTimeout(() => setToastMsg(''), 3000);
  };

  const handleSaveSlug = async () => {
    try {
      await window.electronAPI.saveIdentity({ portalSlug: domainSlug });
      setToastMsg('Portal Configuration saved successfully!');
      setTimeout(() => setToastMsg(''), 3000);
      fetchPortalInfo(); // reload settings
      setIsSettingsOpen(false);
    } catch (err) {
      alert('Failed to save portal configuration.');
    }
  };

  return (
    <div className="view active" id="view-portal" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '28px 32px', overflowY: 'auto', overflowX: 'hidden' }}>
      {/* View Header */}
      <div className="view-header" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid var(--glass-border)', flexShrink: 0, gap: '12px 16px', minWidth: 0 }}>
        <div>
          <h2 className="view-title" style={{ color: 'var(--accent-gold)', fontSize: 'var(--text-h1)', fontWeight: 700, letterSpacing: 'var(--tracking-h)', lineHeight: 1.2 }}>Sovereign Portal</h2>
          <p className="view-sub" style={{ fontSize: 'var(--text-body)', color: 'var(--text-dim)', marginTop: '4px', lineHeight: 1.5 }}>Parent access gateway · WhatsApp PIN · 12-hour session</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button 
            className="primary-btn" 
            onClick={() => {
              if ((window as any).showModuleSetupGuide) {
                (window as any).showModuleSetupGuide('portal');
              } else {
                const Swal = (window as any).Swal;
                if (Swal) Swal.fire({ title: 'Setup Guide', text: 'No guide available.', background: '#0d1235', color: '#fff', showCloseButton: true, showConfirmButton: false });
              }
            }} 
            style={{ padding: '7px 16px', fontSize: '12px', background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.3)', color: '#00e5ff', cursor: 'pointer', boxShadow: 'none' }}
          >
            💡 Setup Guide
          </button>
          
          <div className="pulse-indicator" id="portal-status-badge" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', padding: '6px 14px', borderRadius: '20px', color: '#10B981', fontSize: '12px', fontWeight: 'bold' }}>
            <span className="pulse-dot" style={{ width: '8px', height: '8px', background: '#10B981', borderRadius: '50%', display: 'inline-block', boxShadow: '0 0 8px #10B981' }} />
            <span>Broadcasting Live</span>
          </div>

          <button 
            id="btn-portal-settings-toggle" 
            title="Portal Settings" 
            onClick={() => setIsSettingsOpen(true)}
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', color: 'var(--text-dim)', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '16px' }}
          >
            ⚙️
          </button>
        </div>
      </div>

      {toastMsg && (
        <div style={{ background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.25)', padding: '10px 14px', borderRadius: '8px', fontSize: '12px', color: '#00e5ff', marginBottom: '18px' }}>
          {toastMsg}
        </div>
      )}

      {/* Slide-in Settings Drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '400px',
          height: '100vh',
          background: '#0d1235',
          borderLeft: '1px solid var(--glass-border)',
          zIndex: 2001,
          transform: isSettingsOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-10px 0 40px rgba(0,0,0,0.5)',
        }}
      >
        {/* Drawer Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h3 style={{ color: '#fff', fontSize: '16px', fontWeight: 700, margin: 0 }}>⚙️ Portal Configuration</h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '12px', margin: '4px 0 0' }}>Customise your parent portal domain and settings.</p>
          </div>
          <button
            onClick={() => setIsSettingsOpen(false)}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: '20px', cursor: 'pointer', padding: '4px 8px' }}
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Drawer Body */}
        <div style={{ padding: '24px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>Domain Slug</p>
          <div className="form-group">
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-dim)' }}>Domain Slug <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>(locked to .edu.nexus)</span></label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
              <input 
                type="text" 
                id="portal-slug-input" 
                className="modern-input" 
                placeholder="Auto-derived from school name" 
                style={{ borderRadius: '8px 0 0 8px', flex: 1 }} 
                value={domainSlug}
                onChange={(e) => setDomainSlug(e.target.value)}
              />
              <span style={{ background: 'rgba(0,229,255,0.1)', border: '1px solid rgba(0,229,255,0.2)', borderLeft: 'none', padding: '10px 14px', borderRadius: '0 8px 8px 0', fontSize: '12px', color: 'var(--accent)', whiteSpace: 'nowrap', fontWeight: 700 }}>.edu.nexus</span>
            </div>
            <p style={{ fontSize: '10px', color: 'var(--text-dim)', margin: '4px 0 0 0', fontStyle: 'italic' }}>Leave blank to auto-generate. QR code encodes the real LAN IP.</p>
          </div>
        </div>

        {/* Drawer Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--glass-border)', flexShrink: 0 }}>
          <button id="btn-portal-slug-save" className="primary-btn" onClick={handleSaveSlug} style={{ width: '100%', padding: '12px', fontSize: '14px', justifyContent: 'center' }}>Save Configuration</button>
        </div>
      </div>

      {/* Backdrop */}
      {isSettingsOpen && (
        <div
          onClick={() => setIsSettingsOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2000, backdropFilter: 'blur(4px)', WebkitAppRegion: 'no-drag' } as any}
        />
      )}

      <div className="portal-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px' }}>
        {/* LEFT: Network Bridge & Controls */}
        <div className="portal-panel" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <h3 className="portal-panel-title" style={{ color: '#fff', fontSize: '16px', marginBottom: '8px', margin: '0 0 8px 0', fontWeight: 600 }}>Network Bridge</h3>
            <p className="portal-panel-desc" style={{ color: 'var(--text-dim)', fontSize: '13px', marginBottom: '20px', margin: '0 0 20px 0' }}>Parents on your school network can scan the QR code to open the portal.</p>
            
            <div className="ip-selector-group" style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '11px', textTransform: 'uppercase', color: '#888', display: 'block', marginBottom: '8px' }}>Select Broadcasting Interface</label>
              <div id="portal-ip-list" className="ip-chip-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {portalInfo?.allIps.map(ip => {
                  const isActive = activeIp === ip;
                  return (
                    <button
                      key={ip}
                      onClick={() => handleIpChipClick(ip)}
                      style={{
                        padding: '6px 12px',
                        background: isActive ? 'rgba(0,229,255,0.15)' : 'rgba(0,0,0,0.2)',
                        border: isActive ? '1px solid rgba(0,229,255,0.4)' : '1px solid rgba(255,255,255,0.06)',
                        color: isActive ? '#00e5ff' : '#fff',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '12px',
                        cursor: 'pointer',
                        borderRadius: '8px',
                        fontWeight: isActive ? 700 : 400,
                        transition: 'all 0.15s'
                      }}
                    >
                      {ip}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="url-copy-box" style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '8px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span id="portal-local-url" style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--accent-gold)' }}>{activeUrl}</span>
              <button onClick={handleCopyLink} className="icon-btn" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#fff', fontSize: '14px' }} title="Copy Link">📋</button>
            </div>
            
            <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '20px' }}>
              mDNS: <span id="portal-mdns-url" style={{ color: '#fff' }}>{portalInfo?.mdnsUrl || 'Not supported on this router network'}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button className="primary-btn" onClick={handleOpenLocal} style={{ flex: 1, background: 'var(--accent-gold)', color: '#000', border: 'none', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', justifyContent: 'center', fontSize: '13px', boxShadow: 'none' }}>🌐 Open Local</button>
          </div>
        </div>

        {/* RIGHT: QR Code */}
        <div className="portal-qr-card" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <h3 style={{ color: '#fff', fontSize: '14px', marginBottom: '15px', margin: '0 0 15px 0', textAlign: 'center', fontWeight: 600 }}>Portal QR Code</h3>
          <div 
            ref={qrContainerRef} 
            id="portal-qr-container"
            style={{ background: '#fff', padding: '15px', borderRadius: '12px', display: 'inline-block' }}
          />
          <p style={{ marginTop: '15px', margin: '15px 0 0 0', fontSize: '11px', color: 'var(--text-dim)', textAlign: 'center' }}>
            Print and place at school reception.
          </p>
          <button 
            id="btn-download-portal-qr"
            onClick={handleSaveQRImage}
            style={{
              marginTop: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff',
              borderRadius: '8px',
              padding: '8px 16px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              transition: 'background 0.2s'
            }}
          >
            🖼️ Save as Image
          </button>
        </div>

      </div>
    </div>
  );
}

export default SovereignPortal;
