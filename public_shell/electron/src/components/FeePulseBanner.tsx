import React, { useState, useEffect, useRef } from 'react';

interface ProgressPayload {
  batchId: string;
  current: number;
  total: number;
  percentage: number;
  studentName: string;
  status: string;
  isRetry?: boolean;
}

interface CompletePayload {
  batchId?: string;
  total: number;
  sent: number;
  delivered: number;
  read?: number;
  offline: number;
  notOnWa: number;
  failed: number;
  cleared?: number;
  alreadyReminded?: number;
  isRetry?: boolean;
  abortedDisconnected?: boolean;
  duration?: number;
  error?: string;
}

interface FeePulseBannerProps {
  onNavigateToReports?: () => void;
}

export default function FeePulseBanner({ onNavigateToReports }: FeePulseBannerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [state, setState] = useState<'running' | 'completed' | 'error'>('running');
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [completeSummary, setCompleteSummary] = useState<CompletePayload | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.on) return;

    const clearDismissTimer = () => {
      if (dismissTimerRef.current) {
        clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    };

    const unlistenProgress = api.on('fee-reminders-progress', (data: ProgressPayload) => {
      clearDismissTimer();
      setProgress(data);
      setState('running');
      setIsVisible(true);
      setIsMinimized(false);
    });

    const unlistenComplete = api.on('fee-reminders-complete', (data: CompletePayload) => {
      clearDismissTimer();
      if (data.error) {
        setState('error');
      } else {
        setState('completed');
      }
      setCompleteSummary(data);
      setIsVisible(true);

      // Auto-dismiss 15s after completion if not clicked
      dismissTimerRef.current = setTimeout(() => {
        setIsVisible(false);
      }, 15000);
    });

    return () => {
      clearDismissTimer();
      if (typeof unlistenProgress === 'function') unlistenProgress();
      if (typeof unlistenComplete === 'function') unlistenComplete();
    };
  }, []);

  if (!isVisible) return null;

  const handleOpenReport = () => {
    setIsVisible(false);
    localStorage.setItem('nexus_fees_active_tab', 'pulse-reports');
    window.dispatchEvent(new CustomEvent('nexus:navigate-tab', { detail: { tab: 'fees', subtab: 'pulse-reports' } }));
    window.dispatchEvent(new CustomEvent('nexus:navigate-fees-tab', { detail: 'pulse-reports' }));
    if (onNavigateToReports) {
      onNavigateToReports();
    }
  };

  if (isMinimized) {
    return (
      <div
        onClick={() => setIsMinimized(false)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          background: '#0B0F19',
          border: '1px solid rgba(0, 229, 255, 0.4)',
          borderRadius: '24px',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6), 0 0 12px rgba(0, 229, 255, 0.2)',
          color: '#fff',
          fontSize: '12px',
          fontWeight: 600,
        }}
      >
        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: state === 'running' ? '#00e5ff' : '#10b981', animation: state === 'running' ? 'pulse 1.5s infinite' : 'none' }} />
        <span>Fee Pulse: {state === 'running' ? `${progress?.percentage || 0}%` : 'Done'}</span>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        width: '360px',
        background: 'linear-gradient(145deg, #0d1322 0%, #080c14 100%)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderLeft: state === 'completed' ? '4px solid #10b981' : state === 'error' ? '4px solid #ef4444' : '4px solid #00e5ff',
        borderRadius: '12px',
        padding: '16px',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.7), 0 0 20px rgba(0, 229, 255, 0.15)',
        backdropFilter: 'blur(10px)',
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>{state === 'completed' ? '✅' : state === 'error' ? '⚠️' : '📡'}</span>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
              {state === 'completed'
                ? (completeSummary?.isRetry ? 'Fee Pulse Retry Complete' : 'Fee Pulse Complete')
                : state === 'error'
                  ? 'Fee Pulse Alert'
                  : (progress?.isRetry ? 'Retrying Failed Fee Pulse' : 'Fee Pulse in Progress')}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              {state === 'running' && progress
                ? `${progress.isRetry ? 'Retrying' : 'Targeting'} ${progress.total} outstanding debtors`
                : state === 'completed'
                  ? 'Reminders processed successfully'
                  : 'Batch finished'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={() => setIsMinimized(true)}
            title="Minimize"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              fontSize: '13px',
              padding: '2px 6px',
              borderRadius: '4px',
            }}
          >
            _
          </button>
          <button
            onClick={() => setIsVisible(false)}
            title="Dismiss"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748b',
              cursor: 'pointer',
              fontSize: '13px',
              padding: '2px 6px',
              borderRadius: '4px',
            }}
          >
            ✕
          </button>
        </div>
      </div>

      {state === 'running' && progress && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
            <span style={{ color: '#cbd5e1' }}>Sent {progress.current} of {progress.total}</span>
            <span style={{ color: '#00e5ff', fontWeight: 700 }}>{progress.percentage}%</span>
          </div>

          <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden', marginBottom: '8px' }}>
            <div
              style={{
                width: `${progress.percentage}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #00e5ff, #3b82f6)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>

          <div style={{ fontSize: '11px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Current: <span style={{ color: '#94a3b8' }}>{progress.studentName}</span>
          </div>
        </div>
      )}

      {state === 'completed' && completeSummary && (
        <div>
          <div style={{ fontSize: '12px', color: '#cbd5e1', marginBottom: '12px', lineHeight: 1.5 }}>
            {completeSummary.isRetry ? (
              <>
                Retried <b>{completeSummary.total}</b> failed reminder(s): <b>{completeSummary.sent}</b> sent
                {completeSummary.cleared ? `, ${completeSummary.cleared} already cleared` : ''}
                {completeSummary.notOnWa ? `, ${completeSummary.notOnWa} not on WhatsApp` : ''}
                {completeSummary.failed ? `, ${completeSummary.failed} still failed` : ''}.
                {completeSummary.abortedDisconnected ? ' Bot disconnected mid-retry; remaining items will resume on reconnect.' : ''}
              </>
            ) : completeSummary.sent > 0 ? (
              <>Dispatched <b>{completeSummary.sent}</b> reminders ({completeSummary.offline} queued offline, {completeSummary.notOnWa} not on WhatsApp).</>
            ) : completeSummary.alreadyReminded ? (
              <>All debtors were already reminded within the last 24 hours.</>
            ) : (
              <>No eligible debtors found with positive balances.</>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button
              onClick={() => setIsVisible(false)}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#94a3b8',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
            <button
              onClick={handleOpenReport}
              style={{
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                border: '1px solid rgba(2, 132, 199, 0.4)',
                color: '#fff',
                borderRadius: '6px',
                padding: '6px 14px',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              View Delivery Audit Report ↗
            </button>
          </div>
        </div>
      )}

      {state === 'error' && (
        <div>
          <div style={{ fontSize: '12px', color: '#fca5a5', marginBottom: '8px' }}>
            {completeSummary?.error || 'Failed to dispatch reminders. Please check WhatsApp connection.'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setIsVisible(false)}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: '#fff',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
