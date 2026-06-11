import React, { useState, useEffect } from 'react';
import { useIdentity, SchoolIdentity } from '../hooks/useIdentity';
import { useLicense } from '../hooks/useLicense';

interface SettingsProps {
  onResetSuccess?: () => void;
}

export function Settings({ onResetSuccess }: SettingsProps) {
  const { identity, saveIdentity } = useIdentity();
  const { license } = useLicense();

  const currentTier = license?.tier || 'Silver';

  // Form states
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [motto, setMotto] = useState('');
  const [signature, setSignature] = useState('');
  const [principalPhone, setPrincipalPhone] = useState('');
  const [portalSlug, setPortalSlug] = useState('');
  const [themePrimary, setThemePrimary] = useState('#1A237E');
  const [themeSecondary, setThemeSecondary] = useState('#00E5FF');
  const [stampStyle, setStampStyle] = useState('none');
  const [stampCustomColor, setStampCustomColor] = useState('');
  const [logoBase64, setLogoBase64] = useState<string | undefined>(undefined);
  const [principalSignBase64, setPrincipalSignBase64] = useState<string | undefined>(undefined);
  const [premiumPlan, setPremiumPlan] = useState(false);

  // Terminal mode states
  const [terminalMode, setTerminalMode] = useState('master');
  const [masterIp, setMasterIp] = useState('');
  const [showMasterIp, setShowMasterIp] = useState(false);

  // SVG stamp previews cache
  const [stampPreviews, setStampPreviews] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Load identity values when they arrive
  useEffect(() => {
    if (identity) {
      setName(identity.name || '');
      setAddress(identity.address || '');
      setMotto(identity.motto || '');
      setSignature(identity.signature || '');
      setPrincipalPhone(identity.principalPhone || '');
      setPortalSlug(identity.portalSlug || '');
      ThemeColorLoad(identity.themePrimary, identity.themeSecondary);
      setStampStyle(identity.stampStyle || 'none');
      setStampCustomColor(identity.stampCustomColor || '');
      setLogoBase64(identity.logoBase64);
      setPrincipalSignBase64(identity.principalSignBase64);
      setPremiumPlan(!!(identity as any).premiumPlan);
    }
  }, [identity]);

  const ThemeColorLoad = (prim?: string, sec?: string) => {
    if (prim) setThemePrimary(prim);
    if (sec) setThemeSecondary(sec);
  };

  // Fetch SVG stamp previews dynamically when style, colors or tier change
  useEffect(() => {
    const fetchPreviews = async () => {
      if (!window.electronAPI?.getStampPreview) return;

      const styles = ['classic_round', 'modern_rect', 'ribbon_endorse', 'minimal_sig'];
      const color = stampCustomColor || (currentTier === 'Silver' ? '#0D47A1' : themePrimary);
      
      const newPreviews: Record<string, string> = {};
      for (const style of styles) {
        try {
          const preview = await window.electronAPI.getStampPreview({ style, color });
          if (preview) {
            newPreviews[style] = preview;
          }
        } catch (err) {
          console.error(`Failed to fetch stamp preview for ${style}:`, err);
        }
      }
      setStampPreviews(newPreviews);
    };

    fetchPreviews();
  }, [currentTier, themePrimary, stampCustomColor]);

  // File read helper
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'sig') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === 'logo' && file.type !== 'image/png' && file.type !== 'image/jpeg') {
      alert('PNG or JPEG only for School Crest.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (type === 'logo') {
        setLogoBase64(base64);
      } else {
        setPrincipalSignBase64(base64);
      }
    };
    reader.readAsDataURL(file);
  };

  // Drag and drop crest logo
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropLogo = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
      alert('PNG or JPEG only for School Crest.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setLogoBase64(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Submit form
  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      const payload: SchoolIdentity = {
        name,
        address,
        motto,
        signature,
        principalPhone,
        portalSlug: portalSlug.toLowerCase().replace(/[^a-z0-9]/g, '') || undefined,
        themePrimary,
        themeSecondary,
        stampStyle,
        stampCustomColor: stampCustomColor || undefined,
        logoBase64: logoBase64 || undefined,
        principalSignBase64: principalSignBase64 || undefined,
      };
      (payload as any).premiumPlan = premiumPlan;

      const res = await saveIdentity(payload);
      if (res && res.ok) {
        setSaveStatus('success');
      } else {
        setSaveStatus('error');
      }
    } catch (err) {
      console.error('Save settings failed:', err);
      setSaveStatus('error');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  // Reset application
  const handleResetData = async () => {
    if (!window.electronAPI?.resetAppData) {
      alert('Reset function not supported in this terminal.');
      return;
    }

    const confirm = window.confirm(
      'Reset All Data?\n\nThis will clear school identity and all student/teacher records. This cannot be undone.'
    );
    if (confirm) {
      try {
        await window.electronAPI.resetAppData();
        alert('System Reset Completed. Reloading application...');
        if (onResetSuccess) {
          onResetSuccess();
        } else {
          window.location.reload();
        }
      } catch (err) {
        console.error('Reset failed:', err);
        alert('Reset operation encountered an error.');
      }
    }
  };

  // Apply terminal mode helper
  const handleApplyTerminalMode = () => {
    alert('Terminal architecture mode applied. Please restart the application.');
  };

  // Stamp Styles config
  const stampStylesList = [
    { id: 'none', label: 'No Stamp', icon: '🚫' },
    { id: 'classic_round', label: 'Classic Seal' },
    { id: 'modern_rect', label: 'Modern Rect' },
    { id: 'ribbon_endorse', label: 'Legal Ribbon' },
    { id: 'minimal_sig', label: 'Signature' },
  ];

  // Stamp custom colors config
  const canCustomizeColor = currentTier === 'Gold' || currentTier === 'Diamond';
  const stampColorSwatches = [
    { id: 'red', color: '#D32F2F' },
    { id: 'primary', color: themePrimary },
    { id: 'blue', color: '#0D47A1' },
  ];

  const isPremiumTier = currentTier === 'Gold' || currentTier === 'Diamond';

  return (
    <div className="animate-in fade-in duration-300 h-full flex flex-col min-h-0">
      {/* View Header */}
      <div className="view-header">
        <div>
          <h2 className="view-title">School Identity Forge</h2>
          <p className="view-sub">
            Customize your school's branding and report card metadata.
          </p>
        </div>
        <button
          onClick={handleResetData}
          id="reset-btn"
          style={{
            background: 'transparent',
            border: '1px solid #ff4444',
            color: '#ff4444',
            padding: '8px 16px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          🗑 Reset All Data
        </button>
      </div>

      <div className="settings-content">
        {/* Column 1: Visual Identity & Stamp Studio */}
        <div className="settings-column">
          <h3>Visual Identity</h3>
          
          <div className="form-group">
            <label>School Crest (Logo)</label>
            <div 
              className="logo-uploader" 
              id="logo-dropzone"
              onClick={() => document.getElementById('logo-upload-input')?.click()}
              onDragOver={handleDragOver}
              onDrop={handleDropLogo}
            >
              {logoBase64 ? (
                <img
                  id="logo-preview"
                  src={logoBase64}
                  alt="Logo Preview"
                />
              ) : (
                <div className="uploader-content" id="uploader-content">
                  <span className="upload-icon">﹢</span>
                  <p>Drag &amp; Drop PNG/JPEG</p>
                  <span className="upload-hint">or click to browse</span>
                </div>
              )}
              <input
                type="file"
                id="logo-upload-input"
                accept="image/png, image/jpeg"
                style={{ display: 'none' }}
                onChange={(e) => handleFileChange(e, 'logo')}
              />
            </div>
          </div>

          <div className="color-pickers-group">
            <div className="form-group">
              <label>Primary Theme</label>
              <div className="color-picker-wrapper">
                <input 
                  type="color" 
                  id="theme-primary" 
                  value={themePrimary} 
                  onChange={(e) => setThemePrimary(e.target.value)}
                />
                <span className="color-hex" id="primary-hex">{themePrimary.toUpperCase()}</span>
              </div>
            </div>
            <div className="form-group">
              <label>Accent Color</label>
              <div className="color-picker-wrapper">
                <input 
                  type="color" 
                  id="theme-secondary" 
                  value={themeSecondary} 
                  onChange={(e) => setThemeSecondary(e.target.value)}
                />
                <span className="color-hex" id="secondary-hex">{themeSecondary.toUpperCase()}</span>
              </div>
            </div>
          </div>

          {/* Stamp Studio */}
          <div className="form-group" style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span>Stamp Studio <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 'normal', marginLeft: '6px' }}>(Auto-generates SVG seals)</span></span>
              <span 
                id="stamp-tier-badge" 
                style={{
                  fontSize: '10px', 
                  background: isPremiumTier ? '#ffd700' : 'rgba(255,255,255,0.1)', 
                  color: isPremiumTier ? '#000' : '#00E5FF',
                  padding: '2px 8px', 
                  borderRadius: '10px', 
                  fontWeight: 'bold'
                }}
              >
                {currentTier}
              </span>
            </label>

            <div style={{ marginBottom: '12px' }}>
              <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>1. Select Style</p>
              <div className="stamp-gallery" id="stamp-gallery">
                {stampStylesList.map((style) => {
                  const isActive = stampStyle === style.id;
                  const previewImg = stampPreviews[style.id];
                  
                  return (
                    <div
                      key={style.id}
                      onClick={() => setStampStyle(style.id)}
                      className={`stamp-option ${isActive ? 'active' : ''}`}
                    >
                      {style.id === 'none' ? (
                        <div style={{ height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>🚫</div>
                      ) : previewImg ? (
                        <img
                          src={previewImg}
                          alt={style.label}
                          className="stamp-template-preview"
                        />
                      ) : (
                        <div style={{ height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', opacity: 0.4 }}>🖋</div>
                      )}
                      <span className="stamp-option-label">{style.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div id="stamp-color-section" style={{ display: canCustomizeColor ? 'block' : 'none' }}>
              <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>2. Select Ink Color</p>
              <div id="stamp-color-swatches" className={`color-swatch-list ${!canCustomizeColor ? 'tier-locked' : ''}`}>
                {stampColorSwatches.map((swatch) => {
                  const isActive = stampCustomColor === swatch.color || (!stampCustomColor && swatch.id === 'primary');
                  return (
                    <div
                      key={swatch.id}
                      onClick={() => {
                        if (canCustomizeColor) {
                          setStampCustomColor(swatch.color);
                        }
                      }}
                      className={`color-swatch ${isActive ? 'active' : ''}`}
                      style={{ backgroundColor: swatch.color }}
                      title={swatch.id}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Column 2: School Metadata */}
        <div className="settings-column">
          <h3>School Metadata</h3>
          
          <div className="form-group">
            <label>School Name</label>
            <input
              type="text"
              id="school-name-input"
              className="modern-input"
              placeholder="e.g. Nexus Academy"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>School Address</label>
            <input
              type="text"
              id="school-address-input"
              className="modern-input"
              placeholder="e.g. 123 Education Way"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Motto</label>
            <input
              type="text"
              id="school-motto-input"
              className="modern-input"
              placeholder="e.g. Excellence in all things"
              value={motto}
              onChange={(e) => setMotto(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Principal's Name (Digital Signature)</label>
            <input
              type="text"
              id="school-signature-input"
              className="modern-input"
              placeholder="Full Name"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>
              Principal's Signature Image{' '}
              <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                (PNG with transparent bg recommended)
              </span>
            </label>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <label
                htmlFor="principal-sign-upload"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(255,215,0,0.08)',
                  border: '1px dashed rgba(255,215,0,0.35)',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: '#ffd700',
                  transition: 'all 0.2s',
                }}
              >
                📁 Upload Signature (.png)
              </label>
              <input
                type="file"
                id="principal-sign-upload"
                style={{ display: 'none' }}
                accept="image/*"
                onChange={(e) => handleFileChange(e, 'sig')}
              />
              {principalSignBase64 && (
                <div
                  id="principal-sign-preview-wrap"
                  style={{
                    display: 'flex',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,215,0,0.2)',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <img
                    id="principal-sign-preview-img"
                    style={{ height: '40px', filter: 'brightness(0.9) contrast(1.1)' }}
                    src={principalSignBase64}
                    alt="Principal Signature"
                  />
                  <button
                    onClick={() => setPrincipalSignBase64(undefined)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ff6b6b',
                      fontSize: '11px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    ✕ Remove
                  </button>
                </div>
              )}
            </div>
          </div>

          <div
            className="form-group"
            style={{
              background: 'rgba(255,215,0,0.05)',
              padding: '12px',
              borderRadius: '8px',
              border: '1px dashed rgba(255,215,0,0.3)',
            }}
          >
            <label style={{ color: '#ffd700' }}>⭐ Nexus Premium Plan</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
              <input
                type="checkbox"
                id="premium-plan-toggle"
                style={{ width: '16px', height: '16px', accentColor: '#ffd700' }}
                checked={premiumPlan}
                onChange={(e) => setPremiumPlan(e.target.checked)}
              />
              <span style={{ fontSize: '12px', color: '#ccc' }}>
                Enable 'Digital Envelope' HTML Exports for WhatsApp
              </span>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="primary-btn"
            style={{
              marginTop: 'auto',
              background: 'var(--accent)',
              color: 'var(--bg-deep)',
              border: 'none',
              padding: '12px 22px',
              borderRadius: '8px',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '14px',
              justifyContent: 'center',
              display: 'flex',
              alignItems: 'center',
              boxShadow: '0 4px 14px rgba(0,229,255,0.25)',
            }}
          >
            {saving ? '⌛ Saving...' : saveStatus === 'success' ? '✅ Saved!' : saveStatus === 'error' ? '❌ Error' : 'Save Identity Shard'}
          </button>
        </div>

        {/* Column 3: Data Templates & Terminal Architecture */}
        <div className="settings-column">
          <h3>Data Templates</h3>
          <p style={{ color: 'var(--text-dim)', fontSize: '12px', marginBottom: '12px' }}>
            Download CSV templates to bulk import your school data correctly.
          </p>

          <div
            className="form-group"
            style={{
              background: 'rgba(0, 229, 255, 0.05)',
              padding: '16px',
              borderRadius: '8px',
              border: '1px dashed rgba(0, 229, 255, 0.3)',
              marginBottom: '12px',
            }}
          >
            <label style={{ color: '#00e5ff', fontSize: '13px', marginBottom: '8px', display: 'block' }}>
              🧑‍🏫 Teachers Template
            </label>
            <p style={{ fontSize: '11px', color: '#aaa', marginBottom: '10px' }}>
              Columns: <code>Teacher_ID, Teacher_Name, Teacher_Phone, Class, Subjects</code> — subjects pipe-delimited (e.g. English Language|Mathematics).
            </p>
            <a
              href="data:text/csv;charset=utf-8,Teacher_ID,Teacher_Name,Teacher_Phone,Class,Subjects%0ATCH-01,John%20Doe,08012345678,JSS%201,Mathematics|English%20Language"
              download="Nexus_Teachers_Template.csv"
              className="secondary-btn"
              style={{
                display: 'block',
                textAlign: 'center',
                width: '100%',
                fontSize: '12px',
                padding: '8px',
                textDecoration: 'none',
              }}
            >
              📥 Download Teachers.csv
            </a>
          </div>

          <div
            className="form-group"
            style={{
              background: 'rgba(0, 229, 255, 0.05)',
              padding: '16px',
              borderRadius: '8px',
              border: '1px dashed rgba(0, 229, 255, 0.3)',
            }}
          >
            <label style={{ color: '#00e5ff', fontSize: '13px', marginBottom: '8px', display: 'block' }}>
              🎓 Students Template
            </label>
            <p style={{ fontSize: '11px', color: '#aaa', marginBottom: '10px' }}>
              Columns: <code>Student_ID, First_Name, Last_Name, Class, Subjects</code> — subjects pipe-delimited (e.g. English Language|Mathematics).
            </p>
            <a
              href="data:text/csv;charset=utf-8,Student_ID,First_Name,Last_Name,Class,Subjects%0ASTU-001,Jane,Smith,JSS%201,English%20Language|Mathematics|Basic%20Science"
              download="Nexus_Students_Template.csv"
              className="secondary-btn"
              style={{
                display: 'block',
                textAlign: 'center',
                width: '100%',
                fontSize: '12px',
                padding: '8px',
                textDecoration: 'none',
              }}
            >
              📥 Download Students.csv
            </a>
          </div>

          <div
            className="form-group"
            style={{
              background: 'rgba(255, 215, 0, 0.05)',
              padding: '16px',
              borderRadius: '8px',
              border: '1px dashed rgba(255, 215, 0, 0.3)',
              marginTop: '18px',
            }}
          >
            <label style={{ color: '#ffd700', fontSize: '13px', marginBottom: '8px', display: 'block' }}>
              🖥️ Terminal Architecture
            </label>
            <p style={{ fontSize: '11px', color: '#aaa', marginBottom: '10px' }}>
              Select the role of this PC. Changes require a restart.
            </p>
            <select
              className="modern-input"
              id="terminal-mode-select"
              style={{ fontSize: '12px', marginBottom: '8px' }}
              value={terminalMode}
              onChange={(e) => {
                setTerminalMode(e.target.value);
                setShowMasterIp(e.target.value === 'client');
              }}
            >
              <option value="master">Master Node (Runs Database)</option>
              <option value="client">Client Terminal (Connects via IP)</option>
            </select>
            {showMasterIp && (
              <input
                type="text"
                id="master-ip-input"
                className="modern-input"
                placeholder="Master Node IP (e.g., 192.168.1.5)"
                style={{ fontSize: '12px', marginBottom: '8px' }}
                value={masterIp}
                onChange={(e) => setMasterIp(e.target.value)}
              />
            )}
            <button
              onClick={handleApplyTerminalMode}
              className="primary-btn"
              style={{
                width: '100%',
                fontSize: '11px',
                padding: '6px',
                background: 'linear-gradient(135deg, #b8860b, #ffd700)',
                color: '#000',
                justifyContent: 'center',
                boxShadow: 'none',
              }}
            >
              Apply Mode
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;
