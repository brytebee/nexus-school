import React, { useState } from 'react';
import { MessageSquare, Send, Reply } from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';

interface InboxMessage {
  id: string;
  sender_name: string;
  sender_phone: string;
  content: string;
  received_at: string;
  status: 'unread' | 'read' | 'replied';
  ai_confidence?: number;
}

const mockMessages: InboxMessage[] = [
  {
    id: 'msg-01',
    sender_name: 'Mr. Adebayo',
    sender_phone: '+2348012345678',
    content: 'Good morning, please why was my son marked absent yesterday? I dropped him off myself.',
    received_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    status: 'unread',
    ai_confidence: 12
  },
  {
    id: 'msg-02',
    sender_name: 'Mrs. Okafor',
    sender_phone: '+2349011122233',
    content: 'Can I pay the school fees in installments this term?',
    received_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    status: 'unread',
    ai_confidence: 45
  }
];

export function PulseInbox() {
  const [messages, setMessages] = useState<InboxMessage[]>(mockMessages);
  const [activeMessage, setActiveMessage] = useState<InboxMessage | null>(null);
  const [replyText, setReplyText] = useState('');

  const handleReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !activeMessage) return;

    // Here we would call the ipcRenderer to push the reply to pending_pulse_messages
    setMessages(msgs => msgs.map(m => m.id === activeMessage.id ? { ...m, status: 'replied' } : m));
    setReplyText('');
    setActiveMessage(null);
  };

  return (
    <div className="flex h-[600px] bg-nexus-panel border border-nexus-border rounded-2xl overflow-hidden shadow-xl">
      {/* Sidebar - Message List */}
      <div className="w-1/3 border-r border-nexus-border flex flex-col bg-black/20">
        <div className="p-4 border-b border-nexus-border bg-black/40">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <MessageSquare size={18} className="text-nexus-accent" />
            Pulse Inbox
          </h3>
          <p className="text-xs text-nexus-text-dim mt-1">Unanswered Parent Queries</p>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {messages.map(msg => (
            <div 
              key={msg.id}
              onClick={() => setActiveMessage(msg)}
              className={`p-4 border-b border-nexus-border/50 cursor-pointer transition-colors hover:bg-white/5 ${activeMessage?.id === msg.id ? 'bg-white/10' : ''}`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="font-semibold text-sm text-white">{msg.sender_name}</span>
                <span className="text-[10px] text-nexus-text-dim">
                  {new Date(msg.received_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-xs text-nexus-text-dim line-clamp-2 mb-2">{msg.content}</p>
              <div className="flex justify-between items-center">
                <StatusBadge 
                  status={msg.status.toUpperCase()} 
                  variant={msg.status === 'unread' ? 'error' : msg.status === 'read' ? 'warning' : 'success'} 
                />
                {msg.ai_confidence !== undefined && (
                  <span className="text-[10px] text-nexus-text-dim bg-black/40 px-1.5 py-0.5 rounded">
                    AI Conf: {msg.ai_confidence}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content - Thread & Reply */}
      <div className="flex-1 flex flex-col bg-black/10">
        {activeMessage ? (
          <>
            <div className="p-6 border-b border-nexus-border bg-black/20 flex justify-between items-center">
              <div>
                <h4 className="text-lg font-medium text-white">{activeMessage.sender_name}</h4>
                <span className="text-sm text-nexus-text-dim">{activeMessage.sender_phone}</span>
              </div>
              <button className="text-xs text-nexus-accent hover:text-white transition-colors border border-nexus-accent/30 px-3 py-1.5 rounded-lg bg-nexus-accent/10">
                View Student Profile
              </button>
            </div>
            
            <div className="flex-1 p-6 overflow-y-auto">
              <div className="bg-white/5 rounded-2xl rounded-tl-none p-4 max-w-[85%] border border-nexus-border">
                <p className="text-sm text-white leading-relaxed">{activeMessage.content}</p>
                <span className="text-[10px] text-nexus-text-dim block mt-2">
                  {new Date(activeMessage.received_at).toLocaleString()}
                </span>
              </div>
              
              {activeMessage.status === 'replied' && (
                <div className="bg-nexus-accent/10 border border-nexus-accent/20 rounded-2xl rounded-tr-none p-4 max-w-[85%] ml-auto mt-4">
                  <p className="text-sm text-white leading-relaxed">Reply has been queued for delivery via WhatsApp.</p>
                  <span className="text-[10px] text-nexus-text-dim block mt-2 text-right">Just now</span>
                </div>
              )}
            </div>

            <div className="p-4 bg-black/40 border-t border-nexus-border">
              <form onSubmit={handleReply} className="flex gap-2">
                <input 
                  type="text" 
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Type a reply to send via WhatsApp..."
                  className="flex-1 bg-black/50 border border-nexus-border rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-nexus-accent transition-colors"
                  disabled={activeMessage.status === 'replied'}
                />
                <button 
                  type="submit"
                  disabled={!replyText.trim() || activeMessage.status === 'replied'}
                  className="bg-nexus-accent hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 rounded-xl transition-colors flex items-center justify-center"
                >
                  <Send size={18} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-nexus-text-dim">
            <Reply size={48} className="mb-4 opacity-20" />
            <p>Select a message to view and reply</p>
          </div>
        )}
      </div>
    </div>
  );
}
