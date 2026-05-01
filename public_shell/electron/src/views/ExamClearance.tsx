import React, { useState, useEffect, useRef } from 'react';
import { QrCode, CheckCircle, XCircle, Search, ShieldAlert } from 'lucide-react';

export function ExamClearance() {
  const [scanData, setScanData] = useState('');
  const [result, setResult] = useState<{status: 'cleared' | 'blocked' | 'error', message: string} | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input for physical QR scanners (they act as keyboards)
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanData.trim()) return;
    
    setIsLoading(true);
    setResult(null);
    
    try {
      // Assuming IPC exposure via electronAPI
      const res = await (window as any).electronAPI.fees.getTransactions({
        student_id: scanData.trim(),
        academic_session: '2025/2026', // In production, these come from context
        term: 'First Term'
      });
      
      if (res.ok) {
        const transactions = res.data;
        const lastTx = transactions.length > 0 ? transactions[0] : null;
        
        // Logic: if status is cleared or there are no recorded debts
        if (lastTx && lastTx.status === 'cleared') {
           setResult({ status: 'cleared', message: 'Cleared for Examination' });
        } else {
           setResult({ status: 'blocked', message: 'Outstanding Debt - Blocked' });
        }
      } else {
        setResult({ status: 'blocked', message: 'No Financial Record Found' });
      }
    } catch (err) {
      setResult({ status: 'error', message: 'System Verification Failed' });
    } finally {
      setIsLoading(false);
      setScanData(''); // Reset for next scan
      inputRef.current?.focus();
    }
  };

  return (
    <div className="bg-nexus-panel border border-nexus-border rounded-2xl p-8 max-w-2xl mx-auto flex flex-col items-center">
      <div className="w-16 h-16 rounded-2xl bg-nexus-gold/10 flex items-center justify-center text-nexus-gold mb-6 shadow-lg shadow-nexus-gold/20">
        <QrCode size={32} />
      </div>
      
      <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">Exam Clearance Scanner</h2>
      <p className="text-nexus-text-dim text-center mb-8 max-w-md">
        Scan the student's Portal Access Card or enter their ID manually to verify financial clearance for the current term examinations.
      </p>

      <form onSubmit={handleScan} className="w-full max-w-md relative mb-10">
        <div className="relative flex items-center">
          <Search className="absolute left-4 text-nexus-text-dim" size={20} />
          <input 
            ref={inputRef}
            type="text" 
            value={scanData}
            onChange={(e) => setScanData(e.target.value)}
            placeholder="Scan QR or enter Student ID..."
            className="w-full bg-black/40 border border-nexus-border rounded-xl py-4 pl-12 pr-4 text-white placeholder-nexus-text-dim focus:outline-none focus:ring-2 focus:ring-nexus-gold focus:border-transparent transition-all"
            disabled={isLoading}
          />
        </div>
        <div className="mt-3 text-xs text-center text-nexus-text-dim">
          Waiting for scanner input...
        </div>
      </form>

      {/* Result Display */}
      {result && (
        <div className={`w-full max-w-md p-6 rounded-2xl border flex flex-col items-center animate-in zoom-in-95 duration-300 ${
          result.status === 'cleared' ? 'bg-emerald-500/10 border-emerald-500/30' : 
          result.status === 'blocked' ? 'bg-red-500/10 border-red-500/30' :
          'bg-amber-500/10 border-amber-500/30'
        }`}>
          {result.status === 'cleared' && <CheckCircle size={48} className="text-emerald-400 mb-4" />}
          {result.status === 'blocked' && <ShieldAlert size={48} className="text-red-400 mb-4" />}
          {result.status === 'error' && <XCircle size={48} className="text-amber-400 mb-4" />}
          
          <h3 className={`text-2xl font-bold tracking-tight text-center ${
            result.status === 'cleared' ? 'text-emerald-400' : 
            result.status === 'blocked' ? 'text-red-400' :
            'text-amber-400'
          }`}>
            {result.status.toUpperCase()}
          </h3>
          <p className="text-nexus-text-dim mt-2 font-medium">{result.message}</p>
        </div>
      )}
    </div>
  );
}
