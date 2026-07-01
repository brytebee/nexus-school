import React, { useState, useEffect } from 'react';
import { useLicense } from '../hooks/useLicense';
import { useIdentity } from '../hooks/useIdentity';
import { MessageSquare, Send, Reply } from 'lucide-react';

interface InboxMessage {
  id: string | number;
  sender_name: string;
  sender_phone: string;
  content: string;
  received_at: string;
  status: 'unread' | 'read' | 'replied' | 'bot_handled';
  ai_confidence?: number;
  direction?: 'incoming' | 'outgoing';
}

interface ConversationThread {
  sender_phone: string;
  sender_name: string;
  latest_message: InboxMessage;
  messages: InboxMessage[];
}

export function NexusPulse() {
  const { license } = useLicense();
  const { identity, updateIdentity } = useIdentity();
  const currentTier = license?.tier || 'Silver';
  const isGold = currentTier === 'Gold' || currentTier === 'Diamond';
  const isDiamond = currentTier === 'Diamond';

  const Swal = (window as any).Swal;

  // Tabs: 'inbox' | 'bot_sync' | 'guardian'
  const [activeTab, setActiveTab] = useState<'inbox' | 'bot_sync' | 'guardian'>('inbox');

  // Slide-in settings drawer
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [principalPhone, setPrincipalPhone] = useState('');
  const [autostartBot, setAutostartBot] = useState(false);
  const [savingPhone, setSavingPhone] = useState(false);

  // WhatsApp Inbox State
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [activePhone, setActivePhone] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  // Bot Status State
  const [botStatus, setBotStatus] = useState<'starting' | 'qr' | 'authenticated' | 'ready' | 'disconnected' | 'error'>('disconnected');
  const [botStatusDesc, setBotStatusDesc] = useState('Click "Start Bot" to initialise the WhatsApp engine.');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [loadingAction, setLoadingAction] = useState(false);

  // Cloud Bridge State (Diamond)
  const [showCloudConfig, setShowCloudConfig] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [savingCreds, setSavingCreds] = useState(false);
  const [cloudStatus, setCloudStatus] = useState({
    isConfigured: false,
    refreshToken: '',
    securityKey: '',
  });
  const [syncingCloud, setSyncingCloud] = useState(false);
  const [copiedKey, setCopiedKey] = useState<'security' | 'refresh' | null>(null);

  // Load configuration & identity phone
  useEffect(() => {
    if (identity?.principalPhone) {
      setPrincipalPhone(identity.principalPhone);
    }
    
    // Autostart toggle loading
    const stored = localStorage.getItem('nexus_pulse_autostart');
    setAutostartBot(stored === 'true');

    // Bot initial state sync
    const syncBotState = async () => {
      if (!window.electronAPI?.pulse?.status) return;
      try {
        const current = await window.electronAPI.pulse.status();
        if (current) handleBotStatusChange(current);
      } catch (_) {}
    };
    syncBotState();

    // Cloud Bridge details sync
    hydrateCloudStatus();
  }, [identity]);

  const fetchInboxMessages = async () => {
    if (window.electronAPI?.invoke) {
      try {
        const msgs = await window.electronAPI.invoke('pulse-inbox:get-messages');
        setMessages(msgs || []);
      } catch (err) {
        console.error('Failed to fetch inbox messages:', err);
      }
    }
  };

  useEffect(() => {
    if (activeTab === 'inbox') {
      fetchInboxMessages();
      // Poll every 30 seconds as a fallback in case IPC event is missed
      const interval = setInterval(fetchInboxMessages, 30_000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  useEffect(() => {
    if (window.electronAPI?.on) {
      window.electronAPI.on('pulse:new-message', (newMsg: InboxMessage) => {
        setMessages(prev => {
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [newMsg, ...prev];
        });
      });
    }
  }, []);

  const threads = React.useMemo(() => {
    const map: { [phone: string]: ConversationThread } = {};
    const sorted = [...messages].sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime());
    
    sorted.forEach(msg => {
      const phone = msg.sender_phone;
      if (!map[phone]) {
        map[phone] = {
          sender_phone: phone,
          sender_name: msg.sender_name,
          latest_message: msg,
          messages: []
        };
      }
      map[phone].messages.push(msg);
      if (new Date(msg.received_at).getTime() >= new Date(map[phone].latest_message.received_at).getTime()) {
        map[phone].latest_message = msg;
        if (msg.sender_name !== 'Unknown Parent') {
          map[phone].sender_name = msg.sender_name;
        }
      }
    });
    
    return Object.values(map).sort((a, b) => 
      new Date(b.latest_message.received_at).getTime() - new Date(a.latest_message.received_at).getTime()
    );
  }, [messages]);

  const activeThread = threads.find(t => t.sender_phone === activePhone) || null;

  const handleSelectThread = async (thread: ConversationThread) => {
    setActivePhone(thread.sender_phone);
    const unreadMessages = thread.messages.filter(m => m.direction !== 'outgoing' && m.status === 'unread');
    if (unreadMessages.length > 0 && window.electronAPI?.invoke) {
      for (const msg of unreadMessages) {
        try {
          await window.electronAPI.invoke('pulse-inbox:mark-read', msg.id);
          setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'read' as const } : m));
        } catch (err) {
          console.error('Failed to mark message read:', err);
        }
      }
    }
  };

  useEffect(() => {
    if (activePhone && window.electronAPI?.invoke) {
      const activeThreadObj = threads.find(t => t.sender_phone === activePhone);
      if (activeThreadObj) {
        const unreadMessages = activeThreadObj.messages.filter(m => m.direction !== 'outgoing' && m.status === 'unread');
        unreadMessages.forEach(async (msg) => {
          try {
            await window.electronAPI.invoke('pulse-inbox:mark-read', msg.id);
            setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, status: 'read' as const } : m));
          } catch (err) {
            console.error('Failed to mark message read:', err);
          }
        });
      }
    }
  }, [messages, activePhone, threads]);

  // Handle WhatsApp bot status updates from Electron
  const handleBotStatusChange = (val: { status: any; data?: any }) => {
    const { status, data } = val;
    setBotStatus(status);
    setLoadingAction(false);

    switch (status) {
      case 'starting':
        setBotStatusDesc('Please wait while the WhatsApp engine starts.');
        setQrCodeDataUrl('');
        break;
      case 'qr':
        setBotStatusDesc('Open WhatsApp on the school phone → Linked Devices → Link a Device → Scan code.');
        if (data) setQrCodeDataUrl(data);
        break;
      case 'authenticated':
        setBotStatusDesc('Session verified. The bot will be ready in a moment.');
        setQrCodeDataUrl('');
        break;
      case 'ready':
        setBotStatusDesc('Parents can now WhatsApp the school number to check results, attendance & fees.');
        setQrCodeDataUrl('');
        break;
      case 'error':
        setBotStatusDesc(data ? `Error: ${data}` : 'Bot encountered an initialization error.');
        setQrCodeDataUrl('');
        break;
      case 'disconnected':
      default:
        setBotStatusDesc('Click "Start Bot" to initialise the WhatsApp engine. Scan the QR code.');
        setQrCodeDataUrl('');
        break;
    }
  };

  // Register WhatsApp status listeners
  useEffect(() => {
    if (window.electronAPI?.onPulseStatus) {
      window.electronAPI.onPulseStatus((val: any) => handleBotStatusChange(val));
    }
    if (window.electronAPI?.pulse?.onCloudSynced) {
      window.electronAPI.pulse.onCloudSynced(() => {
        addCloudLog('Synced ✓');
      });
    }
    if (window.electronAPI?.pulse?.onSyncError) {
      window.electronAPI.pulse.onSyncError((msg: any) => {
        addCloudLog(`Error: ${msg}`);
      });
    }
  }, []);

  const addCloudLog = (statusMsg: string) => {
    const statusEl = document.getElementById('react-cloud-sync-status');
    if (statusEl) statusEl.textContent = statusMsg;
  };

  const hydrateCloudStatus = async () => {
    if (!isDiamond || !window.electronAPI?.pulse?.getCloudStatus) return;
    try {
      const cs = await window.electronAPI.pulse.getCloudStatus();
      if (cs) {
        setCloudStatus({
          isConfigured: cs.isConfigured,
          refreshToken: cs.refreshToken || '',
          securityKey: cs.securityKey || '',
        });
      }
    } catch (err) {
      console.error('Failed hydrating cloud details:', err);
    }
  };

  const handleStartBot = () => {
    if (!window.electronAPI?.pulse?.start) return;
    setLoadingAction(true);
    setBotStatusDesc('Starting WhatsApp connection...');
    window.electronAPI.pulse.start();
  };

  const handleStopBot = () => {
    if (!window.electronAPI?.pulse?.stop) return;
    setLoadingAction(true);
    setBotStatusDesc('Stopping WhatsApp engine...');
    window.electronAPI.pulse.stop();
  };

  const handleSaveGoogleCreds = async () => {
    if (!clientId || !clientSecret || !window.electronAPI?.pulse?.saveGoogleCreds) return;
    setSavingCreds(true);
    try {
      window.electronAPI.pulse.saveGoogleCreds({ clientId, clientSecret });
      
      // Delay and fetch OAuth link
      await new Promise(r => setTimeout(r, 1200));
      const url = await window.electronAPI.pulse.getGoogleAuthUrl();
      if (url && window.electronAPI?.send) {
        window.electronAPI.send('shell:openExternal', url);
      } else {
        if (Swal) Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'Credentials saved. Restart if browser did not open.', showConfirmButton: false, timer: 4000, background: '#0d1235', color: '#fff' });
      }
      setShowCloudConfig(false);
      hydrateCloudStatus();
    } catch (err) {
      console.error('Failed saving credentials:', err);
    } finally {
      setSavingCreds(false);
    }
  };

  const handleTriggerSyncNow = () => {
    if (!window.electronAPI?.pulse?.triggerSync) return;
    setSyncingCloud(true);
    window.electronAPI.pulse.triggerSync();
    setTimeout(() => setSyncingCloud(false), 5000);
  };

  const handleSavePhone = async () => {
    if (!principalPhone || !window.electronAPI?.saveIdentity) return;
    setSavingPhone(true);
    try {
      const res = await window.electronAPI.saveIdentity({
        ...identity,
        principalPhone: principalPhone.trim()
      });
      if (res?.ok) {
        if (updateIdentity) {
          updateIdentity({ principalPhone: principalPhone.trim() });
        }
        setIsSettingsOpen(false);
      }
    } catch (err) {
      console.error('Failed saving principal phone:', err);
    } finally {
      setSavingPhone(false);
    }
  };

  const handleAutostartToggle = (checked: boolean) => {
    setAutostartBot(checked);
    localStorage.setItem('nexus_pulse_autostart', checked ? 'true' : 'false');
    if (window.electronAPI?.send) {
      window.electronAPI.send('pulse:set-autostart', checked);
    }
  };

  const handleReplyMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !activeThread) return;

    const latestIncoming = [...activeThread.messages]
      .reverse()
      .find(m => m.direction !== 'outgoing');

    if (!latestIncoming) return;
    
    const textToSubmit = replyText.trim();
    setReplyText('');

    if (window.electronAPI?.invoke) {
      try {
        const res = await window.electronAPI.invoke('pulse-inbox:reply', {
          id: latestIncoming.id,
          phone: activeThread.sender_phone,
          replyText: textToSubmit
        });
        if (res?.ok) {
          setMessages(msgs => msgs.map(m => m.id === latestIncoming.id ? { ...m, status: 'replied' as const } : m));
          if (Swal) {
            Swal.fire({
              toast: true,
              position: 'top-end',
              icon: 'success',
              title: 'Reply queued for delivery.',
              showConfirmButton: false,
              timer: 3000,
              background: '#0d1235',
              color: '#fff'
            });
          }
        }
      } catch (err) {
        console.error('Failed to send reply:', err);
      }
    }
  };

  const handleCopyText = (text: string, type: 'security' | 'refresh') => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(type);
      setTimeout(() => setCopiedKey(null), 1500);
    });
  };

  // Fee Recovery Pulse button
  const handleTriggerFeePulse = () => {
    if (!window.electronAPI) return;
    window.electronAPI.send('trigger-fee-reminders');
    if (Swal) {
      Swal.fire({
        title: 'Fee Recovery Pulse Dispatched',
        text: 'Personalized outstanding balance invoices have been queued in Vercel/WhatsApp engine.',
        icon: 'success',
        background: '#0B0F19',
        color: '#fff',
      });
    }
  };

  return (
    <div className="fade-in-up" style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--grid-gap)', overflow: 'hidden' }}>
      
      {/* Header bar */}
      <div className="view-header">
        <div>
          <h2 className="view-title">📡 Nexus Pulse</h2>
          <p className="view-sub">
            Automated Parent Communication WhatsApp Assistant
            <span style={{
              fontSize: '9px',
              fontWeight: 900,
              color: '#FFD700',
              background: 'rgba(255, 215, 0, 0.1)',
              padding: '2px 8px',
              borderRadius: '9999px',
              border: '1px solid rgba(255, 215, 0, 0.15)',
              marginLeft: '10px'
            }}>
              Gold+
            </span>
          </p>
        </div>
        <div className="view-header-actions">
          {isGold && (
            <>
              {botStatus === 'ready' || botStatus === 'authenticated' || botStatus === 'starting' || botStatus === 'qr' ? (
                <button
                  onClick={handleStopBot}
                  disabled={loadingAction}
                  className="danger-btn"
                >
                  {loadingAction ? 'Stopping...' : botStatus === 'qr' ? '⏹ Cancel link' : '⏹ Stop Bot'}
                </button>
              ) : (
                <button
                  onClick={handleStartBot}
                  disabled={loadingAction}
                  className="primary-btn"
                >
                  {loadingAction ? 'Starting...' : '🤖 Start Bot'}
                </button>
              )}
            </>
          )}
          <button
            onClick={() => setIsSettingsOpen(true)}
            title="Pulse Settings"
            className="secondary-btn"
          >
            ⚙️ Settings
          </button>
        </div>
      </div>

      {/* Tabs navigation — V1 fees-tab-btn underline rail */}
      <div style={{ display: 'flex', gap: '4px', padding: '0 20px', borderBottom: '1px solid var(--glass-border)', flexShrink: 0 }}>
        <button
          onClick={() => setActiveTab('inbox')}
          className={`fees-tab-btn${activeTab === 'inbox' ? ' active' : ''}`}
        >
          💬 WhatsApp Inbox
        </button>
        <button
          onClick={() => setActiveTab('bot_sync')}
          className={`fees-tab-btn${activeTab === 'bot_sync' ? ' active' : ''}`}
        >
          🤖 Bot Sync &amp; Controls
        </button>
        <button
          onClick={() => setActiveTab('guardian')}
          className={`fees-tab-btn${activeTab === 'guardian' ? ' active' : ''}`}
        >
          🛡️ Guardian Shield
        </button>
      </div>

      {/* View Content area */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        
        {/* Tier Lock Gate */}
        {!isGold ? (
          <div className="glass-card" style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: 'var(--card-pad)',
            maxWidth: '450px',
            margin: '24px auto',
            gap: '16px'
          }}>
            <span style={{ fontSize: '36px' }}>🔐</span>
            <h3 style={{ fontSize: 'var(--text-h3)', fontWeight: 600, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
              Gold Tier Required
            </h3>
            <p style={{ color: 'var(--text-dim)', fontSize: 'var(--text-body)', lineHeight: 'var(--lh-body)', margin: 0 }}>
              Nexus Pulse automates parent notifications via WhatsApp, facilitating instant responses, automated attendance shield alerts, term snapshots, and fee invoices.
            </p>
            <span style={{
              fontSize: '10px',
              fontWeight: 700,
              color: 'var(--warning)',
              padding: '6px 14px',
              background: 'rgba(245, 158, 11, 0.1)',
              borderRadius: '9999px',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              display: 'block'
            }}>
              Upgrade subscription to unlock
            </span>
          </div>
        ) : (
          <>
            
            {/* SUBVIEW: Parent messaging inbox */}
            {activeTab === 'inbox' && (
              <div className="pulse-inbox-container">
                {/* Inbox Left Sidebar */}
                <div className="pulse-inbox-sidebar">
                  <div className="pulse-inbox-sidebar-header">
                    <h3>
                      <MessageSquare size={14} style={{ color: 'var(--accent)' }} />
                      Pulse Queue
                      {messages.filter(m => m.direction !== 'outgoing' && m.status === 'unread').length > 0 && (
                        <span style={{
                          marginLeft: '6px',
                          background: 'var(--danger)',
                          color: '#fff',
                          fontSize: '9px',
                          fontWeight: 800,
                          padding: '2px 6px',
                          borderRadius: '9999px',
                          lineHeight: 1
                        }}>
                          {messages.filter(m => m.direction !== 'outgoing' && m.status === 'unread').length}
                        </span>
                      )}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <p style={{ margin: 0 }}>Unanswered Parent Queries</p>
                      <button
                        onClick={fetchInboxMessages}
                        title="Refresh inbox"
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-dim)',
                          cursor: 'pointer',
                          fontSize: '14px',
                          padding: '2px 4px',
                          lineHeight: 1,
                          transition: 'color 0.2s'
                        }}
                        onMouseOver={e => (e.currentTarget.style.color = 'var(--accent)')}
                        onMouseOut={e => (e.currentTarget.style.color = 'var(--text-dim)')}
                      >↻</button>
                    </div>
                  </div>
                  <div className="pulse-inbox-list">
                    {threads.length === 0 ? (
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        padding: '32px 16px',
                        textAlign: 'center',
                        color: 'var(--text-dim)',
                        gap: '10px'
                      }}>
                        <span style={{ fontSize: '32px', opacity: 0.3 }}>💬</span>
                        <p style={{ fontSize: '11px', lineHeight: 1.6, margin: 0, opacity: 0.6 }}>
                          No parent messages yet.
                          <br />
                          When parents WhatsApp the school number, their unrecognised or free-form messages will appear here.
                        </p>
                        <span style={{
                          fontSize: '9px',
                          color: 'var(--accent)',
                          background: 'rgba(0,229,255,0.08)',
                          border: '1px solid rgba(0,229,255,0.2)',
                          borderRadius: '9999px',
                          padding: '3px 10px',
                          fontWeight: 600
                        }}>Inbox is live ✓</span>
                      </div>
                    ) : threads.map(thread => {
                      const hasUnread = thread.messages.some(m => m.direction !== 'outgoing' && m.status === 'unread');
                      const displayStatus = hasUnread ? 'unread' : thread.latest_message.status;
                      const isOutgoing = thread.latest_message.direction === 'outgoing';

                      return (
                        <div
                          key={thread.sender_phone}
                          onClick={() => handleSelectThread(thread)}
                          className={`pulse-message-item${activePhone === thread.sender_phone ? ' active' : ''}`}
                        >
                          <div className="pulse-message-meta">
                            <span className="pulse-message-sender">{thread.sender_name}</span>
                            <span className="pulse-message-time">
                              {new Date(thread.latest_message.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="pulse-message-preview">
                            {isOutgoing ? `You: ${thread.latest_message.content}` : thread.latest_message.content}
                          </p>
                          <div className="pulse-message-footer">
                            <span className={`pulse-status-badge ${displayStatus}`}>
                              {displayStatus.toUpperCase()}
                            </span>
                            {thread.latest_message.ai_confidence !== undefined && thread.latest_message.ai_confidence !== null && !isOutgoing && (
                              <span className="pulse-ai-badge">
                                AI: {thread.latest_message.ai_confidence}%
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Inbox Chat Panel */}
                <div className="pulse-chat-panel">
                  {activeThread ? (
                    <>
                      <div className="pulse-chat-header">
                        <div>
                          <h4>{activeThread.sender_name}</h4>
                          <span>{activeThread.sender_phone}</span>
                        </div>
                        <button className="secondary-btn" style={{ padding: '6px 12px', fontSize: '11px' }}>
                          View Student Profile
                        </button>
                      </div>

                      <div className="pulse-chat-messages" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', padding: '16px' }}>
                        {activeThread.messages.map((msg) => {
                          const isOutgoing = msg.direction === 'outgoing';
                          return (
                            <div
                              key={msg.id}
                              className={isOutgoing ? "pulse-bubble-outgoing" : "pulse-bubble-incoming"}
                            >
                              <p>{msg.content}</p>
                              <span>
                                {isOutgoing ? (msg.sender_name || 'Bot') : (msg.sender_name || 'Parent')} • {new Date(msg.received_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      <div className="pulse-chat-input-area">
                        <form onSubmit={handleReplyMessage} style={{ display: 'flex', gap: '8px' }}>
                          <input
                            type="text"
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Type a response to parent..."
                            className="modern-input"
                            style={{ flex: 1 }}
                          />
                          <button
                            type="submit"
                            disabled={!replyText.trim()}
                            className="primary-btn"
                            style={{ padding: '10px 18px', animation: 'none' }}
                          >
                            <Send size={14} />
                          </button>
                        </form>
                      </div>
                    </>
                  ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', fontSize: '12px', userSelect: 'none' }}>
                      <Reply size={32} className="mb-3 opacity-20" />
                      <p>Select a parent conversation thread to view history and reply.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SUBVIEW: Bot sync engine status */}
            {activeTab === 'bot_sync' && (
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--grid-gap)' }}>
                
                {/* Bot control Panel */}
                <div className="pulse-bot-panel">
                  
                  {/* Status icon badge */}
                  <div style={{ fontSize: '48px', marginBottom: '16px' }}>
                    {botStatus === 'starting' ? '⏳' : botStatus === 'qr' ? '📱' : botStatus === 'authenticated' ? '🔐' : botStatus === 'ready' ? '✅' : botStatus === 'error' ? '❌' : '🤖'}
                  </div>
                  
                  <h3 style={{ fontSize: 'var(--text-h3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: botStatus === 'ready' ? 'var(--accent-green)' : 'var(--text-main)' }}>
                    {botStatus === 'starting' ? 'Initialising Bot…' : botStatus === 'qr' ? 'Scan WhatsApp QR Code' : botStatus === 'authenticated' ? 'Authenticated — Loading…' : botStatus === 'ready' ? 'Bot is Online' : botStatus === 'error' ? 'Bot Error' : 'Bot is Disconnected'}
                  </h3>
                  
                  <p style={{ fontSize: 'var(--text-body)', color: 'var(--text-dim)', marginTop: '8px', maxWidth: '450px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 'var(--lh-body)', margin: 0 }}>
                    {botStatusDesc}
                  </p>

                  {/* QR Canvas Container */}
                  {botStatus === 'qr' && qrCodeDataUrl && (
                    <div className="pulse-bot-qr-wrapper">
                      <img
                        src={qrCodeDataUrl}
                        alt="WhatsApp Authentication QR Code"
                        style={{ width: '200px', height: '200px', borderRadius: 'var(--radius-sm)', display: 'block' }}
                      />
                    </div>
                  )}
                </div>

                {/* Cloud Bridge configuration sync section */}
                <div style={{ background: 'var(--glass)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '22px', maxWidth: '576px', width: '100%', alignSelf: 'center', display: 'flex', flexDirection: 'column', gap: '18px', flexShrink: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px' }}>
                    <div>
                      <h4 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-gold)', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>
                        💎 Always-On Cloud Bridge
                      </h4>
                      <p style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px', margin: 0 }}>
                        Sync data to Google Drive for 24/7 parent responses even when this laptop is off.
                      </p>
                    </div>
                    <span style={{ fontSize: '9px', fontWeight: 900, color: 'var(--accent)', background: 'rgba(0, 229, 255, 0.1)', padding: '2px 8px', borderRadius: '9999px', border: '1px solid rgba(0, 229, 255, 0.15)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Diamond
                    </span>
                  </div>

                  {!isDiamond ? (
                    <div style={{ textAlign: 'center', padding: '24px 16px', background: 'rgba(255, 255, 255, 0.02)', border: '1px dashed var(--glass-border)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <span style={{ fontSize: '24px', display: 'block' }}>💎</span>
                      <h4 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Diamond Tier Required</h4>
                      <p style={{ fontSize: '10px', color: 'var(--text-dim)', maxWidth: '320px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 'var(--lh-body)', margin: 0 }}>
                        The Always-On Cloud Bridge allows Nexus to answer parents inquiries 24/7 via Vercel edge routes when your laptop is turned off.
                      </p>
                      <span style={{ fontSize: '9px', fontWeight: 900, color: 'var(--accent)', background: 'rgba(0, 229, 255, 0.1)', padding: '4px 12px', borderRadius: '9999px', border: '1px solid rgba(0, 229, 255, 0.20)', display: 'inline-block', alignSelf: 'center' }}>
                        Upgrade to Diamond to unlock
                      </span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      
                      {/* Setup Credentials toggle action */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '22px' }}>
                        <div>
                          <span style={{ fontSize: '12px', color: 'var(--text-main)', fontWeight: 500, display: 'block' }}>Google cloud authentication credentials</span>
                          <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>Configure Client ID/Secret parameters</span>
                        </div>
                        <button
                          onClick={() => setShowCloudConfig(!showCloudConfig)}
                          className="secondary-btn"
                        >
                          Configure
                        </button>
                      </div>

                      {/* Credentials Input Forms */}
                      {showCloudConfig && (
                        <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '22px', display: 'flex', flexDirection: 'column', gap: '18px', animation: 'fadeInUp 0.3s cubic-bezier(0.4, 0, 0.2, 1) both' }}>
                          <div className="form-group">
                            <label>Google Client ID</label>
                            <input
                              type="text"
                              value={clientId}
                              onChange={(e) => setClientId(e.target.value)}
                              placeholder="Google App Client ID"
                              className="modern-input"
                            />
                          </div>
                          <div className="form-group">
                            <label>Google Client Secret</label>
                            <input
                              type="password"
                              value={clientSecret}
                              onChange={(e) => setClientSecret(e.target.value)}
                              placeholder="Google App Client Secret"
                              className="modern-input"
                            />
                          </div>
                          <button
                            onClick={handleSaveGoogleCreds}
                            disabled={savingCreds || !clientId || !clientSecret}
                            className="primary-btn"
                            style={{ width: '100%', justifyContent: 'center' }}
                          >
                            {savingCreds ? 'Saving Credentials...' : 'Save & Authenticate'}
                          </button>
                        </div>
                      )}

                      {/* Sync now panel */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0, 0, 0, 0.2)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '16px' }}>
                        <div>
                          <span style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'block' }}>Cloud Sync Status:</span>
                          <span id="react-cloud-sync-status" style={{
                            fontSize: '12px',
                            fontWeight: 'bold',
                            display: 'block',
                            color: (cloudStatus.isConfigured && cloudStatus.refreshToken) ? 'var(--accent-green)' : 'var(--danger)'
                          }}>
                            {cloudStatus.isConfigured && cloudStatus.refreshToken
                              ? 'Connected'
                              : cloudStatus.isConfigured
                                ? 'Authorization Required'
                                : 'Not Configured'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {cloudStatus.isConfigured && cloudStatus.refreshToken && (
                            <button
                              onClick={handleTriggerSyncNow}
                              disabled={syncingCloud}
                              className="secondary-btn"
                            >
                              {syncingCloud ? 'Syncing...' : 'Sync Now'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Security keys & token masks */}
                      {cloudStatus.securityKey && (
                        <div style={{ background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.15)', borderRadius: 'var(--radius-lg)', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '10px', color: 'var(--accent-gold)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>
                              🔐 Pulse Security Key
                            </span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <code style={{ flex: 1, background: 'rgba(0, 0, 0, 0.35)', border: '1px solid var(--glass-border)', borderRadius: '4px', padding: '8px 12px', fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-main)', lineHeight: '1.7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', userSelect: 'all' }}>
                                {cloudStatus.securityKey.slice(0, 14)}••••••••••••••••••••
                              </code>
                              <button
                                onClick={() => handleCopyText(cloudStatus.securityKey, 'security')}
                                className="gold-action-btn"
                              >
                                {copiedKey === 'security' ? 'Copied ✓' : 'Copy'}
                              </button>
                            </div>
                          </div>

                          {cloudStatus.refreshToken && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '12px' }}>
                              <span style={{ fontSize: '10px', color: 'var(--accent-gold)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>
                                🔑 Google Refresh Token
                              </span>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <code style={{ flex: 1, background: 'rgba(0, 0, 0, 0.35)', border: '1px solid var(--glass-border)', borderRadius: '4px', padding: '8px 12px', fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-main)', lineHeight: '1.7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', userSelect: 'all' }}>
                                  {cloudStatus.refreshToken.slice(0, 14)}••••••••••••••••••••
                                </code>
                                <button
                                  onClick={() => handleCopyText(cloudStatus.refreshToken, 'refresh')}
                                  className="gold-action-btn"
                                >
                                  {copiedKey === 'refresh' ? 'Copied ✓' : 'Copy'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* SUBVIEW: Guardian Shield */}
            {activeTab === 'guardian' && (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <div style={{ maxWidth: '900px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  
                  {/* Grid section cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--grid-gap)' }}>
                    
                    {/* Snapshot Briefing Card */}
                    <div className="glass-card" style={{ padding: 'var(--card-pad)', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '220px' }}>
                      <div style={{ position: 'absolute', top: '16px', right: '16px', fontSize: '24px', opacity: 0.1 }}>📰</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <h3 style={{ fontSize: 'var(--text-h3)', fontWeight: 600, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Institutional Briefing</h3>
                        <p style={{ fontSize: 'var(--text-body)', color: 'var(--text-dim)', lineHeight: 'var(--lh-body)', margin: 0 }}>
                          Automated snapshots of attendance metrics, capacity, and critical financials dispatched to the Principal's secure device.
                        </p>
                      </div>
                      
                      <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                          <span style={{ color: 'var(--text-dim)' }}>Dispatch Target Time</span>
                          <span style={{ fontWeight: 'bold', color: 'var(--text-main)' }}>09:00 AM Daily</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                          <span style={{ color: 'var(--text-dim)' }}>Principal Secure Phone</span>
                          <span style={{ fontWeight: 'bold', color: 'var(--accent-gold)', fontFamily: 'var(--font-mono)' }}>
                            {identity?.principalPhone || 'Not Configured'}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent-green)', background: 'rgba(0, 230, 118, 0.1)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(0, 230, 118, 0.15)', textTransform: 'uppercase' }}>
                          Enabled
                        </span>
                        <button
                          onClick={() => setIsSettingsOpen(true)}
                          className="secondary-btn"
                          style={{ padding: '6px 12px', fontSize: '10px' }}
                        >
                          ⚙️ Configure
                        </button>
                      </div>
                    </div>

                    {/* Attendance Safety Net Card */}
                    <div className="glass-card" style={{ padding: 'var(--card-pad)', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '220px' }}>
                      <div style={{ position: 'absolute', top: '16px', right: '16px', fontSize: '24px', opacity: 0.1 }}>🔔</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <h3 style={{ fontSize: 'var(--text-h3)', fontWeight: 600, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>Attendance Safety Net</h3>
                        <p style={{ fontSize: 'var(--text-body)', color: 'var(--text-dim)', lineHeight: 'var(--lh-body)', margin: 0 }}>
                          Dispatches automated parent WhatsApp notifications immediately when a student is marked Absent during daily registers sync.
                        </p>
                      </div>

                      <div style={{ background: 'rgba(0, 229, 255, 0.05)', border: '1px solid rgba(0, 229, 255, 0.15)', borderRadius: 'var(--radius-md)', padding: '12px', fontSize: '11px', color: 'var(--accent)', fontWeight: 500, fontStyle: 'italic', lineHeight: 'var(--lh-body)', marginTop: '16px' }}>
                        "Hello! Ward *[Student]* was marked *ABSENT* today at *[School]*."
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent)' }}>Real-time Alerting</span>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent-green)', background: 'rgba(0, 230, 118, 0.1)', padding: '2px 8px', borderRadius: '4px', border: '1px solid rgba(0, 230, 118, 0.15)', textTransform: 'uppercase' }}>
                          Active
                        </span>
                      </div>
                    </div>

                  </div>

                  {/* Recovery & Performance Section */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--grid-gap)', paddingBottom: '24px' }}>
                    
                    {/* Financial Recovery trigger */}
                    <div style={{ background: 'linear-gradient(145deg, #1a1060 0%, #0d0830 100%)', border: '1px solid rgba(255, 215, 0, 0.4)', borderRadius: 'var(--radius-lg)', padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '180px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <h4 style={{ fontSize: 'var(--text-h3)', fontWeight: 700, color: 'var(--accent-gold)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>💳 Financial Recovery</h4>
                        <p style={{ fontSize: 'var(--text-body)', color: 'var(--text-dim)', lineHeight: 'var(--lh-body)', margin: 0 }}>
                          Initiate school-wide automated debtor reminders. Dispatches WhatsApp bills to outstanding parent files.
                        </p>
                      </div>
                      <button
                        onClick={handleTriggerFeePulse}
                        className="gold-action-btn"
                        style={{ justifyContent: 'center', width: '100%', padding: '10px 18px', fontSize: '13px', marginTop: '16px' }}
                      >
                        🚀 Trigger Fee Recovery Pulse
                      </button>
                    </div>

                    {/* Academic Digest Schedule */}
                    <div className="glass-card" style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '180px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <h4 style={{ fontSize: 'var(--text-h3)', fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 }}>📈 Academic Digest</h4>
                        <p style={{ fontSize: 'var(--text-body)', color: 'var(--text-dim)', lineHeight: 'var(--lh-body)', margin: 0 }}>
                          Staged weekly progress indexes and performance summary reports are scheduled for dispatch every Friday evening.
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px', marginTop: '16px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                          Next Dispatch: <b style={{ color: 'var(--text-main)' }}>Friday, 4:00 PM</b>
                        </span>
                        <span style={{ fontSize: '9px', fontWeight: 900, color: 'var(--text-dim)', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', padding: '2px 8px', borderRadius: '4px' }}>
                          SCHEDULED
                        </span>
                      </div>
                    </div>

                  </div>

                </div>
              </div>
            )}

          </>
        )}

      </div>

      {/* Settings slide-in panel overlay drawer */}
      {isSettingsOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.55)', zIndex: 2000, backdropFilter: 'blur(4px)', userSelect: 'none' }} onClick={() => setIsSettingsOpen(false)} />
          <div style={{ position: 'fixed', top: 0, bottom: 0, right: 0, width: '400px', height: '100vh', background: '#0d1235', borderLeft: '1px solid var(--glass-border)', zIndex: 2001, display: 'flex', flexDirection: 'column', transition: 'right 0.32s cubic-bezier(0.4, 0, 0.2, 1)', userSelect: 'none' }}>
            
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: 'rgba(0, 0, 0, 0.15)' }}>
              <h3 style={{ fontSize: 'var(--text-h2)', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>⚙️ Pulse Settings</h3>
              <button
                onClick={() => setIsSettingsOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '24px', lineHeight: 1, cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              
              {/* Principal Phone settings */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <span style={{ fontSize: '10px', color: 'var(--accent-gold)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>
                  Principal Secure Phone
                </span>
                <p style={{ fontSize: '10px', color: 'var(--text-dim)', lineHeight: '1.5', margin: 0 }}>
                  Active WhatsApp phone number for snapshot institutional briefings and security verification alerts.
                </p>
                <div className="form-group">
                  <input
                    type="text"
                    placeholder="e.g. 2348012345678"
                    value={principalPhone}
                    onChange={(e) => setPrincipalPhone(e.target.value)}
                    className="modern-input font-mono"
                  />
                </div>
                <button
                  onClick={handleSavePhone}
                  disabled={savingPhone || !principalPhone.trim()}
                  className="primary-btn"
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    background: 'var(--accent-green)',
                    color: '#000',
                    boxShadow: '0 4px 14px rgba(0, 230, 118, 0.25)',
                    marginTop: '0px',
                    animation: 'none',
                  }}
                >
                  {savingPhone ? 'Saving...' : 'Save Phone'}
                </button>
              </div>

              {/* Always-on setup bridge link shortcut */}
              {isDiamond && (
                <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>
                    CLOUD BRIDGE SYNC
                  </span>
                  <p style={{ fontSize: '10px', color: 'var(--text-dim)', lineHeight: '1.5', margin: 0 }}>
                    Automated, offline 24/7 parent feedback configurations via Google Drive bridge connection.
                  </p>
                  <button
                    onClick={() => { setIsSettingsOpen(false); setActiveTab('bot_sync'); setShowCloudConfig(true); }}
                    className="secondary-btn"
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    Configure Cloud Setup ↓
                  </button>
                </div>
              )}

              {/* Bot Behavior settings */}
              <div style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>
                  BOT BEHAVIOUR
                </span>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-main)', fontWeight: 500 }}>Auto-start bot on app launch</span>
                  <input
                    type="checkbox"
                    checked={autostartBot}
                    onChange={(e) => handleAutostartToggle(e.target.checked)}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </div>
              </div>

            </div>
          </div>
        </>
      )}

    </div>
  );
}

export default NexusPulse;
