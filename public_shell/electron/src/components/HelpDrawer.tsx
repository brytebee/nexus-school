import React from 'react';

interface HelpItem {
  icon: string;
  title: string;
  tier: 'Silver' | 'Gold' | 'Diamond' | null;
  desc: string;
}

const VIEW_HELP: Record<string, HelpItem> = {
  dashboard: {
    icon: '🏠',
    title: 'Command Center',
    tier: null,
    desc: `Your live school overview — everything at a glance.<br><br><strong style="color:#10b981;">Live Stats:</strong> Teacher count, student enrolment, and real-time grade sync events appear as teachers submit scores from their devices.<br><br><strong style="color:#10b981;">⚙️ Academic Pipeline:</strong> Click the gear icon in the top-right to set your class progression order (e.g. JSS1→SS1) and global pass marks.<br><br><strong style="color:#10b981;">Grade Feed:</strong> Every score synced from a teacher's tablet shows as a live card — your real-time audit trail.<br><br><strong style="color:#10b981;">Quick Action:</strong> Click <em>📄 Generate Report Cards</em> once grades appear in the feed.`
  },
  teachers: {
    icon: '👨‍🏫',
    title: 'Teacher Registry',
    tier: null,
    desc: `Add and manage your entire teaching staff.<br><br><strong style="color:#10b981;">To add a teacher:</strong><br>1. Click <strong>+ Add Teacher</strong><br>2. Enter name, phone number, and host class<br>3. Assign the subjects they teach<br>4. Save — they can now pair their tablet via Sync Hub<br><br><strong style="color:#10b981;">Tip:</strong> A teacher must be registered here before they can receive a QR pairing code. Their phone number is used for Guardian Shield alerts.`
  },
  students: {
    icon: '🎓',
    title: 'Student Registry',
    tier: null,
    desc: `Enrol and manage every student.<br><br><strong style="color:#10b981;">To add a student:</strong><br>1. Click <strong>+ Add Student</strong><br>2. Enter name, class (e.g. SS2A), and reg number<br>3. Add the <em>parent's WhatsApp number</em> with country code (e.g. 2348012345678)<br>4. Assign their subject list<br><br><strong style="color:#10b981;">Bulk Import:</strong> Click <em>📥 Upload CSV</em> to add hundreds of students at once. CSV columns: Name, Class, Reg No, Parent Phone.`
  },
  sync: {
    icon: '🔄',
    title: 'Sync Hub',
    tier: null,
    desc: `Pair teacher tablets and receive grade submissions wirelessly.<br><br><strong style="color:#10b981;">To pair a teacher's device:</strong><br>1. Open the <strong>Nexus Teacher App</strong> on their Android tablet<br>2. Tap <em>Pair with School Hub</em><br>3. Point camera at the QR code on this screen<br>4. The teacher appears in the Dashboard feed when paired<br><br><strong style="color:#10b981;">Troubleshooting:</strong> Both devices must be on the same Wi-Fi. If QR expires, reload this screen.`
  },
  attendance: {
    icon: '📋',
    title: 'Attendance Module',
    tier: 'Gold',
    desc: `Two-layer attendance tracking with automated truancy escalation.<br><br><strong style="color:#f59e0b;">Daily Roll Call (Gold):</strong> Mark whole-day presence per class. Select class → pick date → tick each student → Save.<br><br><strong style="color:#f59e0b;">Subject Roll Call (Diamond):</strong> Track attendance per subject per period — ideal for secondary schools.<br><br><strong style="color:#f59e0b;">Truancy Flags:</strong> When absences exceed your threshold, Guardian Shield auto-alerts the parent via WhatsApp (Diamond).<br><br><strong style="color:#f59e0b;">⚙️ Settings:</strong> Click the gear icon to set thresholds, term dates, and alert templates.`
  },
  fees: {
    icon: '💰',
    title: 'Financial Hub',
    tier: 'Gold',
    desc: `End-to-end fee management from billing to payment recording.<br><br><strong style="color:#f59e0b;">Setup fees:</strong><br>1. Go to <em>Fee Structure</em> → set amounts per class (e.g. SS1: ₦45,000)<br>2. Activate billing for this term — all students are auto-billed<br><br><strong style="color:#f59e0b;">Record a payment:</strong><br>1. Search for the student<br>2. Click <em>Record Payment</em><br>3. Enter amount + date — balance updates instantly<br><br><strong style="color:#f59e0b;">Fee Shield (Diamond):</strong> Blocks report card printing for students with outstanding balances.`
  },
  cbt: {
    icon: '📎',
    title: 'CBT Arena',
    tier: 'Diamond',
    desc: `Computer-Based Testing — from question bank to live exam, fully offline.<br><br><strong style="color:#00e5ff;">Step 1 — Build a Question Bank:</strong><br>• Click <em>+ Create Bank</em> → name it and pick a subject<br>• Open the bank → click <em>+ Add Question</em> to type questions manually<br>• OR click <em>Upload via Nexus Scholar 🪄</em> to extract MCQs from any PDF/DOCX automatically<br><br><strong style="color:#00e5ff;">Step 2 — Deploy:</strong> Switch to the <em>Deploy</em> tab → pick bank, class, duration → 🚀 Deploy<br><br><strong style="color:#00e5ff;">Step 3 — Monitor:</strong> Watch live student progress from the <em>Live</em> tab.`
  },
  printhub: {
    icon: '🖨️',
    title: 'Print Hub',
    tier: null,
    desc: `Generate professional report cards and broadsheets.<br><br><strong style="color:#10b981;">Terminal Report Cards:</strong><br>1. Select class and term<br>2. Click <em>Generate PDF</em> — saved to your Documents folder<br>3. Print or share<br><br><strong style="color:#10b981;">Broadsheets:</strong> Class-level subject tables for staff review — select subject and term.<br><br><strong style="color:#10b981;">Tip:</strong> Use <em>Result Studio</em> to design the report card template before printing here.`
  },
  'result-studio': {
    icon: '🎨',
    title: 'Result Studio',
    tier: null,
    desc: `Design your report card template before printing.<br><br><strong style="color:#10b981;">What you can customise:</strong><br>• Header layout — logo, school name, accreditation badge<br>• Grading scale — letter grades, remarks, performance bands<br>• Footer — address, contact, academic year<br>• Principal signature and stamp style<br><br><strong style="color:#10b981;">How:</strong> Adjust controls in the panel → click <em>Preview</em> to see a sample card → go to Print Hub to generate the full batch.`
  },
  pulse: {
    icon: '📡',
    title: 'Nexus Pulse',
    tier: 'Gold',
    desc: `WhatsApp communication engine — keep parents informed automatically.<br><br><strong style="color:#f59e0b;">One-time setup:</strong><br>1. Scan the WhatsApp QR code with the school's dedicated phone number<br>2. Pulse is now connected and ready<br><br><strong style="color:#f59e0b;">What Pulse sends:</strong><br>• Fee reminders • Attendance alerts (Diamond) • Term digest • Emergency OTPs<br><br><strong style="color:#f59e0b;">Always-On Bridge (Diamond):</strong> Publishes a 24/7 parent portal accessible from anywhere, even when this computer is off.`
  },
  guardian: {
    icon: '🛡️',
    title: 'Guardian Shield',
    tier: 'Gold',
    desc: `Automated school governance — runs in the background so you don't have to.<br><br><strong style="color:#f59e0b;">What Guardian does:</strong><br>• Sends the Principal a daily WhatsApp briefing every morning<br>• Auto-alerts parents when a student misses too many days<br>• Flags students with overdue fees<br>• Monitors CBT integrity<br><br><strong style="color:#f59e0b;">Configure:</strong> Set briefing time → enter Principal's WhatsApp number → toggle the alerts you want → Save.`
  },
  scholar: {
    icon: '🧠',
    title: 'Nexus Scholar',
    tier: 'Diamond',
    desc: `AI knowledge base built from your school's own documents.<br><br><strong style="color:#00e5ff;">Upload documents:</strong><br>1. Click <em>Upload Document</em> (PDF, DOCX, or TXT — max 15MB)<br>2. Scholar indexes it in seconds<br>3. Ask questions in plain English: e.g. <em>"What is the fee for SS3?"</em><br>4. Scholar returns the answer from your documents<br><br><strong style="color:#00e5ff;">CBT Integration:</strong> In CBT Arena → open a Question Bank → click <em>Upload via Nexus Scholar</em> to auto-extract MCQs from past question PDFs.`
  },
  settings: {
    icon: '⚙️',
    title: 'School Identity Forge',
    tier: null,
    desc: `Configure your school's official identity — appears on all reports and the parent portal.<br><br><strong style="color:#10b981;">Set up:</strong><br>• <em>School Name</em> — full official name as on report cards<br>• <em>Logo</em> — PNG/JPG, recommended 200×200px<br>• <em>Address, Motto, Signature</em> — for report footers<br>• <em>Principal Phone</em> — for OTP emergency access and Guardian briefings<br><br><strong style="color:#10b981;">Academic Pipeline:</strong> Set your class progression order (e.g. Nursery 1 → Primary 1 → JSS1) for promotion tracking.<br><br><strong style="color:#10b981;">Important:</strong> Always click <em>Save Identity</em> after changes.`
  },
  about: {
    icon: 'ℹ️',
    title: 'About Nexus School OS',
    tier: null,
    desc: `Your license status, system information, and support details.<br><br><strong style="color:#10b981;">License info:</strong><br>• <em>Current Tier</em> — Silver (Free), Gold, or Diamond<br>• <em>Student Quota</em> — maximum students your license supports<br>• <em>Expiry Date</em> — when your Sovereign Shield license expires<br><br><strong style="color:#10b981;">To upgrade:</strong><br>1. Copy your <em>Hardware Fingerprint</em> from this screen<br>2. Send it to your Nexus Partner<br>3. Enter the license key they provide to activate.`
  },
  'live-quiz': {
    icon: '⚡',
    title: 'Live Quiz System',
    tier: 'Diamond',
    desc: 'Kahoot-style real-time quiz — coming in the next release. Teachers project questions; students answer on their phones via a browser. No app install needed.'
  },
  analytics: {
    icon: '📈',
    title: 'Analytics Dashboard',
    tier: 'Diamond',
    desc: 'At-risk student flagging, subject heatmaps, and grade progression charts — coming in the next release.'
  },
  'notes-marketplace': {
    icon: '📚',
    title: 'Notes Marketplace',
    tier: 'Diamond',
    desc: 'A storefront for teachers to sell study materials to students via the school portal — coming in the next release.'
  },
  'skill-mastery': {
    icon: '🎯',
    title: 'Skill Mastery Tracking',
    tier: 'Diamond',
    desc: 'IEP-standard competency reports that track what students can do, not just their scores — coming in the next release.'
  }
};

interface HelpDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
}

const getTierConfig = (tier: 'Silver' | 'Gold' | 'Diamond' | null) => {
  switch (tier) {
    case 'Diamond':
      return {
        name: 'Diamond Plan',
        accentColor: '#00E5FF', // Electric Cyan
        badgeBg: 'rgba(0, 229, 255, 0.08)',
        badgeBorder: 'rgba(0, 229, 255, 0.25)',
        iconBg: 'rgba(0, 229, 255, 0.04)',
        iconBorder: 'rgba(0, 229, 255, 0.2)',
        cardHoverBg: 'rgba(0, 229, 255, 0.015)',
        cardHoverBorder: 'rgba(0, 229, 255, 0.25)',
        bulletBg: 'rgba(0, 229, 255, 0.08)',
        bulletBorder: 'rgba(0, 229, 255, 0.25)',
        bulletColor: '#00E5FF',
        ctaBg: '#00E5FF',
        ctaHoverBg: '#00B4D8'
      };
    case 'Gold':
      return {
        name: 'Gold Plan',
        accentColor: '#F59E0B', // Rich Warning Amber/Gold
        badgeBg: 'rgba(245, 158, 11, 0.08)',
        badgeBorder: 'rgba(245, 158, 11, 0.25)',
        iconBg: 'rgba(245, 158, 11, 0.04)',
        iconBorder: 'rgba(245, 158, 11, 0.2)',
        cardHoverBg: 'rgba(245, 158, 11, 0.015)',
        cardHoverBorder: 'rgba(245, 158, 11, 0.25)',
        bulletBg: 'rgba(245, 158, 11, 0.08)',
        bulletBorder: 'rgba(245, 158, 11, 0.25)',
        bulletColor: '#F59E0B',
        ctaBg: '#F59E0B',
        ctaHoverBg: '#D97706'
      };
    default:
      return {
        name: 'All Plans',
        accentColor: '#10B981', // Rich Success Green
        badgeBg: 'rgba(16, 185, 129, 0.08)',
        badgeBorder: 'rgba(16, 185, 129, 0.25)',
        iconBg: 'rgba(16, 185, 129, 0.04)',
        iconBorder: 'rgba(16, 185, 129, 0.2)',
        cardHoverBg: 'rgba(16, 185, 129, 0.015)',
        cardHoverBorder: 'rgba(16, 185, 129, 0.25)',
        bulletBg: 'rgba(16, 185, 129, 0.08)',
        bulletBorder: 'rgba(16, 185, 129, 0.25)',
        bulletColor: '#10B981',
        ctaBg: '#10B981',
        ctaHoverBg: '#0E9F6E'
      };
  }
};

export function HelpDrawer({ isOpen, onClose, activeTab }: HelpDrawerProps) {
  if (!isOpen) return null;

  const help = VIEW_HELP[activeTab];
  if (!help) return null;

  const config = getTierConfig(help.tier);

  const cleanHtml = (htmlStr: string) => {
    return htmlStr
      .replace(/#10b981/g, config.accentColor)
      .replace(/#f59e0b/g, config.accentColor)
      .replace(/#00e5ff/g, config.accentColor);
  };

  const parseHelpDesc = (desc: string) => {
    const sections = desc.split('<br><br>');
    return sections.map((sec, idx) => {
      const cleanSec = sec.replace(/^(<br>)+|(<br>)+$/g, '').trim();
      if (!cleanSec) return null;

      // Check if this section contains list items separated by <br>
      if (cleanSec.includes('<br>')) {
        const lines = cleanSec.split('<br>').map(l => l.trim()).filter(Boolean);
        if (lines.length > 1) {
          const titleLine = lines[0];
          const items = lines.slice(1);
          return (
            <div key={idx} className="help-item-card space-y-4">
              <div 
                className="text-[14px] font-bold text-white tracking-wide leading-relaxed" 
                dangerouslySetInnerHTML={{ __html: cleanHtml(titleLine) }} 
              />
              <ul className="space-y-3.5 pl-0.5">
                {items.map((item, itemIdx) => {
                  const match = item.match(/^(\d+\.|\*|•|-)\s*(.*)/);
                  if (match) {
                    const marker = match[1];
                    const content = match[2];
                    const markerClean = marker.trim();
                    const isNumeric = /^\d+/.test(markerClean);

                    return (
                      <li key={itemIdx} className="flex items-start gap-3.5 text-[13px] leading-relaxed text-[#94a3b8]">
                        {isNumeric ? (
                          <span 
                            className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5 transition-all duration-300"
                            style={{
                              background: config.bulletBg,
                              border: `1px solid ${config.bulletBorder}`,
                              color: config.bulletColor,
                              boxShadow: `inset 0 0 6px ${config.bulletBg}`
                            }}
                          >
                            {markerClean.replace('.', '')}
                          </span>
                        ) : (
                          <span 
                            className="mt-2 shrink-0 w-2 h-2 rounded-full transition-all duration-300"
                            style={{
                              background: config.bulletColor,
                              boxShadow: `0 0 8px ${config.bulletColor}`
                            }}
                          />
                        )}
                        <span className="flex-1 text-[#94a3b8]" dangerouslySetInnerHTML={{ __html: cleanHtml(content) }} />
                      </li>
                    );
                  }
                  return (
                    <li key={itemIdx} className="text-[13px] leading-relaxed text-[#94a3b8] pl-6" dangerouslySetInnerHTML={{ __html: cleanHtml(item) }} />
                  );
                })}
              </ul>
            </div>
          );
        }
      }

      return (
        <p 
          key={idx} 
          className="text-[13px] leading-relaxed text-[#94a3b8] help-item-card"
          dangerouslySetInnerHTML={{ __html: cleanHtml(cleanSec) }} 
        />
      );
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end select-none pointer-events-none">
      <style>{`
        .help-drawer-scrollable::-webkit-scrollbar {
          width: 6px;
        }
        .help-drawer-scrollable::-webkit-scrollbar-track {
          background: transparent;
        }
        .help-drawer-scrollable::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.08);
          border-radius: 3px;
        }
        .help-drawer-scrollable::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.16);
        }
        .help-content-rich strong {
          color: ${config.accentColor};
          font-weight: 700;
        }
        .help-content-rich em {
          font-style: normal;
          color: #ffffff;
          font-weight: 700;
        }
        .help-item-card {
          margin-bottom: 12px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.06);
          padding: 20px 24px;
          border-radius: 16px;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .help-item-card:hover {
          background: ${config.cardHoverBg};
          border-color: ${config.cardHoverBorder};
          transform: translateY(-1.5px);
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
        }
        .help-dismiss-btn {
          width: 100%;
          padding: 16px 0;
          font-family: 'Inter', sans-serif;
          font-size: 14px;
          font-weight: 700;
          color: #ffffff;
          background: ${config.ctaBg};
          border: none;
          border-radius: 12px;
          cursor: pointer;
          transition: background 0.18s ease, transform 0.1s ease;
          text-align: center;
          display: block;
          box-shadow: none;
        }
        .help-dismiss-btn:hover {
          background: ${config.ctaHoverBg};
        }
        .help-dismiss-btn:active {
          transform: scale(0.985);
        }
      `}</style>

      {/* Backdrop Click Close */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto" onClick={onClose} />

      <div className="relative z-10 w-[460px] h-full bg-[#06091b]/95 border-l border-white/10 flex flex-col justify-between overflow-hidden shadow-2xl animate-in slide-in-from-right duration-300 backdrop-blur-xl pointer-events-auto">
        {/* Header */}
        <div className="px-8 pt-8 pb-5 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-5">
            {/* Elegant Icon Badge */}
            <div 
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-inner shrink-0 transition-all duration-300"
              style={{
                border: `1px solid ${config.iconBorder}`,
                background: config.iconBg,
                boxShadow: `inset 0 0 10px rgba(255,255,255,0.02)`
              }}
            >
              {help.icon}
            </div>
            <div className="space-y-1">
              <h3 className="text-[17px] font-bold text-white leading-tight tracking-tight">{help.title}</h3>
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 'bold',
                  padding: '3px 9px',
                  borderRadius: '20px',
                  background: config.badgeBg,
                  color: config.accentColor,
                  border: `1px solid ${config.badgeBorder}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}
              >
                ✅ {config.name}
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
        <div className="help-drawer-scrollable flex-1 overflow-y-auto px-8 py-2 help-content-rich">
          {parseHelpDesc(help.desc)}
        </div>

        {/* Footer */}
        <div className="px-8 pb-8 pt-4 shrink-0">
          <button
            onClick={onClose}
            className="help-dismiss-btn"
          >
            Dismiss Guide
          </button>
        </div>
      </div>
    </div>
  );
}

export default HelpDrawer;
