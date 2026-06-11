import React, { useState, useEffect, useRef } from 'react';

export function NexusScholar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({ documentCount: 0, documents: [], chunkCount: 0 });
  const [isUploading, setIsUploading] = useState(false);
  const [isQuerying, setIsQuerying] = useState(false);

  // Settings states
  const [geminiKey, setGeminiKey] = useState('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchStats = async () => {
    try {
      const data = await (window as any).electronAPI.invoke('scholar:get-stats');
      if (data) setStats(data);
    } catch (e) {
      console.error('Error fetching scholar stats:', e);
    }
  };

  useEffect(() => {
    fetchStats();
    
    // Load Gemini API Key on mount
    const loadApiKey = async () => {
      try {
        const key = await (window as any).electronAPI.invoke('app-settings:get', 'gemini_api_key');
        if (key) setGeminiKey(key);
      } catch (err) {
        console.error('Failed loading Gemini key:', err);
      }
    };
    loadApiKey();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      // In Electron, File objects have a 'path' property
      const filePath = (file as any).path;
      const res = await (window as any).electronAPI.invoke('scholar:upload', {
        filePath,
        fileName: file.name
      });
      
      if (res.ok) {
        fetchStats();
      } else {
        alert("Upload failed: " + res.error);
      }
    } catch (err) {
      alert("Error parsing document.");
    } finally {
      setIsUploading(false);
      e.target.value = ''; // reset
    }
  };

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsQuerying(true);
    try {
      const res = await (window as any).electronAPI.invoke('scholar:query', query);
      setResults(res || []);
    } catch (err) {
      console.error('Error querying knowledge base:', err);
    } finally {
      setIsQuerying(false);
    }
  };

  const clearIndex = async () => {
    if (confirm("Are you sure you want to delete the entire knowledge base?")) {
      await (window as any).electronAPI.invoke('scholar:clear');
      fetchStats();
      setResults([]);
    }
  };

  const handleSaveKey = async () => {
    try {
      await (window as any).electronAPI.invoke('app-settings:set', { key: 'gemini_api_key', value: geminiKey });
      alert("Google Gemini API Key saved successfully!");
      setIsSettingsOpen(false);
    } catch (err) {
      alert("Failed to save API key.");
    }
  };

  return (
    <div className="view active" id="view-scholar" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '28px 32px', overflowY: 'auto', overflowX: 'hidden' }}>
      {/* View Header */}
      <div className="view-header">
        <div>
          <h2 className="view-title">Nexus Scholar Engine</h2>
          <p className="view-sub">Offline AI Knowledge Base for automated policy &amp; document retrieval.</p>
        </div>
        <button 
          id="btn-scholar-settings-toggle" 
          title="Scholar Settings" 
          onClick={() => setIsSettingsOpen(true)}
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--glass-border)',
            color: 'var(--text-dim)',
            padding: '6px 10px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '16px'
          }}
        >
          ⚙️
        </button>
      </div>

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
            <h3 style={{ color: '#fff', fontSize: '16px', fontWeight: 700, margin: 0 }}>⚙️ Scholar Settings</h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '12px', margin: '4px 0 0' }}>Configure AI answer generation for Nexus Scholar.</p>
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
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.12em', margin: 0 }}>AI Configuration</p>
          <div className="form-group">
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-dim)' }}>
              Google Gemini API Key <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>(Powers AI Answers)</span>
            </label>
            <input 
              type="password" 
              id="gemini-api-key-input" 
              className="modern-input" 
              placeholder="AIza..." 
              style={{ width: '100%' }} 
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
            />
            <p style={{ fontSize: '10px', color: 'var(--text-dim)', margin: '4px 0 0', fontStyle: 'italic' }}>
              Leave blank for raw search only.{' '}
              <a 
                href="https://aistudio.google.com" 
                onClick={(e) => { e.preventDefault(); (window as any).electronAPI.openExternal('https://aistudio.google.com'); }} 
                style={{ color: '#818cf8', cursor: 'pointer' }}
              >
                Get free key →
              </a>
            </p>
          </div>
        </div>

        {/* Drawer Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--glass-border)', flexShrink: 0 }}>
          <button 
            id="btn-scholar-apikey-save" 
            className="primary-btn" 
            onClick={handleSaveKey}
            style={{ width: '100%', padding: '12px', fontSize: '14px', justifyContent: 'center', background: 'linear-gradient(135deg,#4f46e5,#818cf8)', border: 'none' }}
          >
            Save API Key
          </button>
        </div>
      </div>

      {/* Backdrop */}
      {isSettingsOpen && (
        <div
          onClick={() => setIsSettingsOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 2000, backdropFilter: 'blur(4px)', WebkitAppRegion: 'no-drag' } as any}
        />
      )}

      {/* Main Grid Columns */}
      <div style={{ display: 'flex', gap: '20px', padding: '20px 0', flex: 1, minHeight: 0 }}>
        
        {/* Left Column: Document Ingestion */}
        <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '15px' }}>Document Ingestion</h3>
          
          <div 
            id="scholar-upload-zone" 
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed var(--glass-border)',
              borderRadius: '8px',
              padding: '40px',
              textAlign: 'center',
              cursor: 'pointer',
              marginBottom: '15px',
              position: 'relative'
            }}
          >
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>📄</div>
            <div style={{ fontSize: '13px', color: '#fff' }}>
              {isUploading ? 'Ingesting document...' : 'Drag & Drop PDF/DOCX or click to browse'}
            </div>
            {isUploading && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px' }}>
                <div style={{ width: '24px', height: '24px', border: '2px border-indigo-500', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              </div>
            )}
          </div>
          
          <input 
            type="file" 
            id="scholar-file-input" 
            ref={fileInputRef}
            accept=".pdf,.docx" 
            style={{ display: 'none' }} 
            onChange={handleFileUpload}
          />
          
          <div id="scholar-stats" style={{ fontSize: '13px', color: 'var(--text-dim)', flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '10px' }}>
              <div>
                <span style={{ display: 'block', fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-dim)' }}>Indexed Documents</span>
                <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff' }}>{stats.documentCount || 0}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ display: 'block', fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-dim)' }}>Text Chunks</span>
                <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#818cf8' }}>{stats.chunkCount || 0}</span>
              </div>
            </div>

            {/* Document list inside index */}
            <div style={{ maxHeight: '180px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', padding: '10px' }}>
              {stats.documents && stats.documents.length > 0 ? (
                stats.documents.map((doc: string, idx: number) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 4px', borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '12px', color: '#e2e8f0', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    <span>📄</span> <span title={doc}>{doc}</span>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: '12px', color: 'var(--text-dim)', fontStyle: 'italic', textAlign: 'center', padding: '10px' }}>
                  No documents indexed yet.
                </div>
              )}
            </div>

            {stats.chunkCount > 0 && (
              <button 
                onClick={clearIndex} 
                style={{
                  marginTop: '15px',
                  background: 'transparent',
                  border: 'none',
                  color: '#f87171',
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 0'
                }}
              >
                🗑️ Clear Knowledge Base
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Query Intelligence */}
        <div style={{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '15px' }}>Query Intelligence</h3>
          
          <form onSubmit={handleQuery} style={{ width: '100%', marginBottom: '15px' }}>
            <input 
              type="text" 
              id="scholar-query-input" 
              className="modern-input" 
              placeholder="Ask a question..." 
              style={{ width: '100%', marginBottom: '15px' }} 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button 
              type="submit"
              className="primary-btn" 
              id="btn-scholar-search" 
              disabled={isQuerying || !query.trim()}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {isQuerying ? 'Searching...' : 'Search Knowledge Base'}
            </button>
          </form>

          {/* Results Area */}
          <div id="scholar-results" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {results.length === 0 && !isQuerying && query && (
              <div style={{ textAlign: 'center', padding: '24px', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '10px', color: 'var(--text-dim)', fontSize: '12px' }}>
                No relevant matching chunks found in the index.
              </div>
            )}
            
            {results.map((res, i) => (
              <div 
                key={i} 
                style={{
                  position: 'relative',
                  background: 'rgba(0,0,0,0.25)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  borderLeft: '4px solid #818cf8',
                  fontSize: '12px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#818cf8', marginBottom: '6px', fontWeight: 'bold' }}>
                  <span>{res.docName}</span>
                  <span style={{ color: 'var(--success)' }}>Score: {res.score.toFixed(2)}</span>
                </div>
                <p style={{ color: '#f1f5f9', margin: 0, fontStyle: 'italic', lineHeight: 1.4 }}>
                  "{res.text}"
                </p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

export default NexusScholar;
