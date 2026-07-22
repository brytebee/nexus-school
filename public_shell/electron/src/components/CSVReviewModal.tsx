import React, { useState } from 'react';
import { Modal } from './Modal';

interface CSVRowIssue {
  rowIndex: number;
  field: string;
  reason: string;
}

interface CSVRowNorm {
  rowIndex: number;
  field: string;
  from: string;
  to: string;
}

interface CSVReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: {
    cleanCount: number;
    blocking: CSVRowIssue[];
    normalizable: CSVRowNorm[];
  } | null;
  onAccept: () => void;
}

export function CSVReviewModal({ isOpen, onClose, result, onAccept }: CSVReviewModalProps) {
  const [expandNorms, setExpandNorms] = useState(false);
  const [expandBlocking, setExpandBlocking] = useState(false);

  if (!result) return null;

  const { cleanCount, blocking, normalizable } = result;
  const hasBlocking = blocking.length > 0;
  const hasNormalizable = normalizable.length > 0;
  const canImport = cleanCount > 0 && !hasBlocking;

  const visibleNorms = expandNorms ? normalizable : normalizable.slice(0, 2);
  const remainingNormsCount = normalizable.length - 2;

  const visibleBlocking = expandBlocking ? blocking : blocking.slice(0, 2);
  const remainingBlockingCount = blocking.length - 2;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="📊 CSV Import Review"
      subtitle="Review dry-run check results before committing updates to database."
      maxWidth="540px"
      footer={
        <>
          <button
            onClick={onClose}
            style={{
              padding: '9px 18px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.05)',
              color: '#94a3b8',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Cancel — Fix CSV
          </button>
          <button
            onClick={onAccept}
            disabled={!canImport}
            style={{
              padding: '9px 18px',
              fontSize: '13px',
              fontWeight: 700,
              borderRadius: '8px',
              background: canImport ? '#00E5FF' : 'rgba(255, 255, 255, 0.05)',
              color: canImport ? '#000000' : 'rgba(255, 255, 255, 0.3)',
              border: canImport ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
              boxShadow: canImport ? '0 0 15px rgba(0, 229, 255, 0.35)' : 'none',
              cursor: canImport ? 'pointer' : 'not-allowed',
              opacity: canImport ? 1 : 0.6,
              transition: 'all 0.15s ease',
            }}
          >
            Accept & Import
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Status Header Badge Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
          <div style={{ padding: '12px', borderRadius: '12px', textAlign: 'center', backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
            <div style={{ fontSize: '20px' }}>✅</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#34d399', marginTop: '4px' }}>{cleanCount}</div>
            <div style={{ fontSize: '10px', color: '#a7f3d0', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Ready</div>
          </div>
          <div style={{ padding: '12px', borderRadius: '12px', textAlign: 'center', backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
            <div style={{ fontSize: '20px' }}>⚠️</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#fbbf24', marginTop: '4px' }}>{normalizable.length}</div>
            <div style={{ fontSize: '10px', color: '#fde68a', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Warnings</div>
          </div>
          <div style={{ padding: '12px', borderRadius: '12px', textAlign: 'center', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
            <div style={{ fontSize: '20px' }}>❌</div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#f87171', marginTop: '4px' }}>{blocking.length}</div>
            <div style={{ fontSize: '10px', color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Blocked</div>
          </div>
        </div>

        {/* Blocking Errors Section */}
        {hasBlocking && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '14px 16px', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.25)', backgroundColor: 'rgba(239, 68, 68, 0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h4 style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#f87171', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>❌</span> Blocked Rows (Import Inhibited)
              </h4>
              <span style={{ fontSize: '10px', color: '#fca5a5', padding: '2px 8px', borderRadius: '9999px', backgroundColor: 'rgba(239, 68, 68, 0.2)', fontWeight: 600 }}>
                Must Resolve
              </span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#fca5a5' }}>
              {visibleBlocking.map((err, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'start', justifyContent: 'space-between', gap: '16px', padding: '6px 0', borderBottom: idx < visibleBlocking.length - 1 ? '1px solid rgba(239, 68, 68, 0.1)' : 'none' }}>
                  <span style={{ fontWeight: 600, color: '#f87171', flexShrink: 0 }}>Row {err.rowIndex}:</span>
                  <span style={{ textAlign: 'left', flex: 1 }}>{err.reason}</span>
                </div>
              ))}
            </div>

            {remainingBlockingCount > 0 && (
              <button
                onClick={() => setExpandBlocking(!expandBlocking)}
                style={{ background: 'none', border: 'none', width: '100%', textAlign: 'center', fontSize: '12px', color: '#f87171', fontWeight: 600, paddingTop: '8px', cursor: 'pointer', borderTop: '1px solid rgba(239, 68, 68, 0.15)' }}
              >
                {expandBlocking ? '▲ Show less' : `▼ {${remainingBlockingCount}} other fields require your attention. Click to view.`}
              </button>
            )}
          </div>
        )}

        {/* Normalisable Warning Section */}
        {hasNormalizable && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '14px 16px', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.25)', backgroundColor: 'rgba(245, 158, 11, 0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h4 style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#fbbf24', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>⚠️</span> Normalisations (Auto-corrected)
              </h4>
              <span style={{ fontSize: '10px', color: '#fde68a', padding: '2px 8px', borderRadius: '9999px', backgroundColor: 'rgba(245, 158, 11, 0.2)', fontWeight: 600 }}>
                Auto Fix
              </span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: '#fde68a' }}>
              {visibleNorms.map((norm, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '6px 0', borderBottom: idx < visibleNorms.length - 1 ? '1px solid rgba(245, 158, 11, 0.1)' : 'none' }}>
                  <div style={{ textAlign: 'left', flex: 1 }}>
                    <span style={{ fontWeight: 600, color: '#fbbf24', marginRight: '8px' }}>Row {norm.rowIndex}:</span>
                    <span style={{ color: '#94a3b8' }}>"{norm.field}"</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <span style={{ textDecoration: 'line-through', opacity: 0.5 }}>{norm.from}</span>
                    <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>→</span>
                    <span style={{ color: '#34d399', fontWeight: 'bold' }}>{norm.to}</span>
                  </div>
                </div>
              ))}
            </div>

            {remainingNormsCount > 0 && (
              <button
                onClick={() => setExpandNorms(!expandNorms)}
                style={{ background: 'none', border: 'none', width: '100%', textAlign: 'center', fontSize: '12px', color: '#fbbf24', fontWeight: 600, paddingTop: '8px', cursor: 'pointer', borderTop: '1px solid rgba(245, 158, 11, 0.15)' }}
              >
                {expandNorms ? '▲ Show less' : `▼ {${remainingNormsCount}} other fields require your attention. Click to view.`}
              </button>
            )}
          </div>
        )}

        {/* General Summary / Help Tip */}
        <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5, textAlign: 'center', margin: 0 }}>
          {hasBlocking 
            ? "Your CSV file contains rows that cannot be processed. Please fix the blocked rows and try again." 
            : "Review the proposed normalization updates. Click 'Accept & Import' to apply changes and write to database."
          }
        </p>
      </div>
    </Modal>
  );
}
