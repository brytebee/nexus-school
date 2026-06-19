import React, { useState, useEffect } from 'react';

interface SetupGuideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  moduleName: string;
}

const GUIDE_FILE_MAP: Record<string, string> = {
  'fees': '14-financial-hub.md',
  'portal': '16-sovereign-portal.md',
  'cbt': '18-cbt-arena.md',
  'pulse': '15-nexus-pulse.md',
  'portal-content': '17-portal-content.md',
  'results': '12-grading-results.md',
  'print': '13-print-hub-templates.md',
  'attendance': '11-attendance-mobile.md',
  'students': '10-student-enrolment.md',
  'teachers': '09-teacher-registry.md',
  'settings': '05-settings-identity-stamp.md',
  'classes': '20-class-management.md'
};

const MODULE_DISPLAY_NAMES: Record<string, { title: string; icon: string; tier: string }> = {
  'fees': { title: 'Financial Hub Guide', icon: '💳', tier: 'Gold & Diamond' },
  'portal': { title: 'Sovereign Portal Guide', icon: '🔐', tier: 'Gold & Diamond' },
  'cbt': { title: 'CBT Arena Guide', icon: '💎', tier: 'Diamond Exclusive' },
  'pulse': { title: 'Nexus Pulse Guide', icon: '📡', tier: 'Gold & Diamond' },
  'portal-content': { title: 'Portal Content Guide', icon: '📢', tier: 'All Plans' },
  'results': { title: 'Grading & Results Guide', icon: '📊', tier: 'All Plans' },
  'print': { title: 'Print Hub Guide', icon: '🖨️', tier: 'All Plans' },
  'attendance': { title: 'Attendance Guide', icon: '📋', tier: 'Gold & Diamond' },
  'students': { title: 'Student Directory Guide', icon: '🎓', tier: 'All Plans' },
  'teachers': { title: 'Teacher Registry Guide', icon: '👨‍🏫', tier: 'All Plans' },
  'settings': { title: 'Identity settings Guide', icon: '⚙️', tier: 'All Plans' },
  'classes': { title: 'Class Management Guide', icon: '🏫', tier: 'All Plans' }
};

export function SetupGuideDrawer({ isOpen, onClose, moduleName }: SetupGuideDrawerProps) {
  const [markdown, setMarkdown] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen || !moduleName) return;

    const fetchGuide = async () => {
      setLoading(true);
      setMarkdown('');
      const filename = GUIDE_FILE_MAP[moduleName];
      if (filename) {
        try {
          const content = await (window as any).electronAPI.invoke('read-guide-file', filename);
          if (content) {
            setMarkdown(content);
          } else {
            setMarkdown('### Setup Guide Not Found\nThe requested guide document could not be loaded.');
          }
        } catch (err) {
          setMarkdown('### Setup Guide Loading Error\nFailed to retrieve guide content from system storage.');
        }
      } else {
        setMarkdown('### No Setup Guide Configured\nThere is no setup guide associated with this module.');
      }
      setLoading(false);
    };

    fetchGuide();
  }, [isOpen, moduleName]);

  if (!isOpen) return null;

  const info = MODULE_DISPLAY_NAMES[moduleName] || { title: 'Nexus Setup Guide', icon: '💡', tier: 'All Plans' };

  // Helper function to render bold/italic/code/links in text
  const renderInlineMarkdown = (text: string): string => {
    return text
      // Bold: **text**
      .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--text-main); font-weight:700;">$1</strong>')
      // Italic: *text*
      .replace(/\*(.*?)\*/g, '<em style="color:var(--text-main); font-style:italic;">$1</em>')
      // Inline code: `code`
      .replace(/`(.*?)`/g, '<code style="font-family:var(--font-mono); background:rgba(255,255,255,0.06); padding:2px 6px; border-radius:4px; font-size:11px; color:var(--accent-indigo);">$1</code>')
      // Links: [text](url)
      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="#" onclick="window.electronAPI.openExternal(\'$2\'); return false;" style="color:var(--accent); text-decoration:underline;">$1</a>');
  };

  // Basic custom markdown parser
  const parseMarkdown = (md: string): React.ReactNode[] => {
    const lines = md.split('\n');
    const elements: React.ReactNode[] = [];
    
    let i = 0;
    while (i < lines.length) {
      let line = lines[i];
      
      // Skip empty lines
      if (line.trim() === '') {
        i++;
        continue;
      }
      
      // Divider
      if (line.trim() === '---') {
        elements.push(<hr key={`div-${i}`} style={{ border: 'none', borderBottom: '1px solid var(--glass-border)', margin: '20px 0' }} />);
        i++;
        continue;
      }
      
      // Heading 1 (# title)
      if (line.startsWith('# ')) {
        const title = line.substring(2).trim();
        elements.push(
          <h2 key={`h1-${i}`} style={{ fontSize: '20px', fontWeight: 800, color: '#fff', marginBottom: '14px', marginTop: '10px', letterSpacing: '-0.02em' }}>
            {title}
          </h2>
        );
        i++;
        continue;
      }
      
      // Heading 2 (## title)
      if (line.startsWith('## ')) {
        const title = line.substring(3).trim();
        elements.push(
          <h3 key={`h2-${i}`} style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginTop: '24px', marginBottom: '10px' }}>
            {title}
          </h3>
        );
        i++;
        continue;
      }
      
      // Heading 3 (### title)
      if (line.startsWith('### ')) {
        const title = line.substring(4).trim();
        elements.push(
          <h4 key={`h3-${i}`} style={{ fontSize: '12px', fontWeight: 600, color: '#fff', marginBottom: '6px' }}>
            {title}
          </h4>
        );
        i++;
        continue;
      }
      
      // Alert quotes (> [!NOTE], etc.)
      if (line.trim().startsWith('>')) {
        let alertLines: string[] = [];
        let type: 'note' | 'tip' | 'important' | 'warning' | 'caution' = 'note';
        
        while (i < lines.length && lines[i].trim().startsWith('>')) {
          let text = lines[i].trim().substring(1).trim();
          if (text.startsWith('[!')) {
            const typeMatch = text.match(/\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
            if (typeMatch) {
              type = typeMatch[1].toLowerCase() as any;
              text = text.replace(/\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/i, '').trim();
            }
          }
          if (text) {
            alertLines.push(text);
          }
          i++;
        }
        
        const alertContent = alertLines.join(' ');
        const alertColors = {
          note: { border: 'rgba(99, 102, 241, 0.4)', bg: 'rgba(99, 102, 241, 0.08)', text: '#818cf8', icon: '📝' },
          tip: { border: 'rgba(16, 185, 129, 0.4)', bg: 'rgba(16, 185, 129, 0.08)', text: '#34d399', icon: '💡' },
          important: { border: 'rgba(0, 229, 255, 0.4)', bg: 'rgba(0, 229, 255, 0.08)', text: '#00e5ff', icon: '💎' },
          warning: { border: 'rgba(245, 158, 11, 0.4)', bg: 'rgba(245, 158, 11, 0.08)', text: '#fbbf24', icon: '⚠️' },
          caution: { border: 'rgba(239, 68, 68, 0.4)', bg: 'rgba(239, 68, 68, 0.08)', text: '#f87171', icon: '🚨' }
        };
        const colors = alertColors[type] || alertColors.note;
        
        elements.push(
          <div key={`alert-${i}`} style={{ 
            background: colors.bg, 
            borderLeft: `3px solid ${colors.border}`, 
            borderRadius: 'var(--radius-sm)', 
            padding: '12px 16px', 
            margin: '16px 0',
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-start'
          }}>
            <span style={{ fontSize: '16px', marginTop: '1px' }}>{colors.icon}</span>
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', color: colors.text, display: 'block', marginBottom: '4px', letterSpacing: '0.5px' }}>
                {type}
              </span>
              <p style={{ margin: 0, fontSize: '12px', color: '#b0b8c9', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(alertContent) }} />
            </div>
          </div>
        );
        continue;
      }
      
      // Markdown Table (| Col 1 | Col 2 |)
      if (line.trim().startsWith('|')) {
        let tableLines: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          tableLines.push(lines[i].trim());
          i++;
        }
        
        if (tableLines.length >= 2) {
          const parseRow = (rowStr: string) => {
            return rowStr
              .split('|')
              .map(cell => cell.trim())
              .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
          };
          
          const headers = parseRow(tableLines[0]);
          const rows = tableLines.slice(2).map(rowStr => parseRow(rowStr));
          
          elements.push(
            <div key={`table-${i}`} style={{ margin: '16px 0', overflowX: 'auto', background: 'rgba(0,0,0,0.15)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)' }}>
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid var(--glass-border)' }}>
                    {headers.map((h, idx) => (
                      <th key={idx} style={{ padding: '10px 12px', color: 'var(--text-dim)', textTransform: 'uppercase', fontSize: '10px', letterSpacing: '1px', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIdx) => (
                    <tr key={rowIdx} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      {row.map((cell, cellIdx) => (
                        <td key={cellIdx} style={{ padding: '10px 12px', color: 'var(--text-main)' }} dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(cell) }} />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        continue;
      }
      
      // Ordered List (1. item)
      if (/^\d+\.\s/.test(line.trim())) {
        let listItems: string[] = [];
        while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
          listItems.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
          i++;
        }
        
        elements.push(
          <ol key={`ol-${i}`} style={{ paddingLeft: '20px', margin: '12px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {listItems.map((item, idx) => (
              <li key={idx} style={{ listStyleType: 'decimal', fontSize: '12.5px', color: '#b0b8c9', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(item) }} />
            ))}
          </ol>
        );
        continue;
      }
      
      // Unordered List (- item or * item)
      if (/^[-*]\s/.test(line.trim())) {
        let listItems: string[] = [];
        while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) {
          listItems.push(lines[i].trim().substring(2));
          i++;
        }
        
        elements.push(
          <ul key={`ul-${i}`} style={{ paddingLeft: '20px', margin: '12px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {listItems.map((item, idx) => (
              <li key={idx} style={{ listStyleType: 'disc', fontSize: '12.5px', color: '#b0b8c9', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(item) }} />
            ))}
          </ul>
        );
        continue;
      }
      
      // Regular Paragraph
      elements.push(
        <p key={`p-${i}`} style={{ fontSize: '12.5px', color: '#b0b8c9', lineHeight: 1.6, margin: '12px 0' }} dangerouslySetInnerHTML={{ __html: renderInlineMarkdown(line) }} />
      );
      i++;
    }
    
    return elements;
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end select-none pointer-events-none">
      <style>{`
        .guide-drawer-scrollable::-webkit-scrollbar {
          width: 6px;
        }
        .guide-drawer-scrollable::-webkit-scrollbar-track {
          background: transparent;
        }
        .guide-drawer-scrollable::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.08);
          border-radius: 3px;
        }
        .guide-drawer-scrollable::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.16);
        }
        .guide-item-card {
          margin-bottom: 12px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 20px 24px;
          border-radius: 16px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .guide-item-card:hover {
          background: rgba(0, 229, 255, 0.015);
          border-color: rgba(0, 229, 255, 0.25);
          transform: translateY(-1.5px);
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
        }
        .guide-dismiss-btn {
          width: 100%;
          padding: 16px 0;
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          font-weight: 700;
          color: var(--bg-deep);
          background: var(--accent);
          border: none;
          border-radius: 12px;
          cursor: pointer;
          transition: background 0.18s ease, transform 0.1s ease;
          text-align: center;
          display: block;
          box-shadow: 0 4px 14px rgba(0,229,255,0.25);
        }
        .guide-dismiss-btn:hover {
          background: #4affff;
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0,229,255,0.35);
        }
        .guide-dismiss-btn:active {
          transform: scale(0.985);
        }
      `}</style>

      {/* Backdrop Click Close */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto" onClick={onClose} />

      <div className="relative z-10 w-[480px] h-full bg-[#06091b]/95 border-l border-white/10 flex flex-col justify-between overflow-hidden shadow-2xl animate-in slide-in-from-right duration-300 backdrop-blur-xl pointer-events-auto">
        {/* Header */}
        <div className="px-8 pt-8 pb-5 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-5">
            {/* Elegant Icon Badge */}
            <div 
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-inner shrink-0 transition-all duration-300"
              style={{
                border: `1px solid rgba(0, 229, 255, 0.2)`,
                background: 'rgba(0, 229, 255, 0.04)',
                boxShadow: `inset 0 0 10px rgba(255,255,255,0.02)`
              }}
            >
              {info.icon}
            </div>
            <div className="space-y-1">
              <h3 className="text-[17px] font-bold text-white leading-tight tracking-tight">{info.title}</h3>
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 'bold',
                  padding: '3px 9px',
                  borderRadius: '20px',
                  background: 'rgba(0, 229, 255, 0.08)',
                  color: 'var(--accent)',
                  border: `1px solid rgba(0, 229, 255, 0.25)`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}
              >
                🔐 {info.tier}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full border border-white/10 bg-transparent text-white/50 hover:text-white flex items-center justify-center transition-all duration-200 cursor-pointer outline-none hover:scale-105 active:scale-95"
            title="Close Guide"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1 1l10 10m0-10L1 11" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="guide-drawer-scrollable flex-1 overflow-y-auto px-8 py-2">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100px', color: 'var(--text-dim)' }}>
              Loading setup guide...
            </div>
          ) : (
            parseMarkdown(markdown)
          )}
        </div>

        {/* Footer */}
        <div className="px-8 pb-8 pt-4 shrink-0">
          <button
            onClick={onClose}
            className="guide-dismiss-btn"
          >
            Dismiss Guide
          </button>
        </div>
      </div>
    </div>
  );
}

export default SetupGuideDrawer;
