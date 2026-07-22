import React from 'react';
import { Modal } from './Modal';

interface SetupGuardModalProps {
  isOpen: boolean;
  onClose: () => void;
  step: 'identity' | 'classes' | 'teachers' | 'students' | 'term' | string;
  message: string;
}

export function SetupGuardModal({ isOpen, onClose, step, message }: SetupGuardModalProps) {
  const getStepButtonLabel = () => {
    switch (step) {
      case 'identity':
        return 'Go to School Identity';
      case 'classes':
        return 'Configure Classes';
      case 'teachers':
        return 'Go to Teacher Directory';
      case 'students':
        return 'Go to Student Directory';
      case 'term':
        return 'Go to Print Hub / Term Settings';
      default:
        return 'Go to Setup';
    }
  };

  const handleNavigate = () => {
    let tab = 'dashboard';
    switch (step) {
      case 'identity':
        tab = 'settings';
        break;
      case 'classes':
        tab = 'classes';
        break;
      case 'teachers':
        tab = 'teachers';
        break;
      case 'students':
        tab = 'students';
        break;
      case 'term':
        tab = 'printhub';
        break;
    }
    
    window.dispatchEvent(new CustomEvent('nexus-nav', { detail: tab }));
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="⚠️ Setup Step Required"
      subtitle="Complete prerequisite configuration to unlock ledger write operations."
      maxWidth="520px"
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
            Cancel
          </button>
          <button
            onClick={handleNavigate}
            style={{
              padding: '9px 18px',
              fontSize: '13px',
              fontWeight: 700,
              borderRadius: '8px',
              background: '#00E5FF',
              color: '#000000',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 0 15px rgba(0, 229, 255, 0.35)',
              transition: 'all 0.15s ease',
            }}
          >
            {getStepButtonLabel()}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <p style={{ margin: 0, fontSize: '13px', color: '#cbd5e1', lineHeight: 1.6 }}>
          {message}
        </p>

        <div
          style={{
            padding: '14px 16px',
            borderRadius: '12px',
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
          }}
        >
          <span style={{ color: '#f87171', fontSize: '18px', lineHeight: 1 }}>⚠️</span>
          <p style={{ margin: 0, fontSize: '12px', color: '#fca5a5', lineHeight: 1.5 }}>
            To maintain database integrity, write operations are strictly guarded in sequence:
            <strong style={{ color: '#fff', display: 'block', marginTop: '4px' }}>
              Identity → Classes → Teachers → Students → Term Settings
            </strong>
          </p>
        </div>
      </div>
    </Modal>
  );
}
