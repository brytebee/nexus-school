import React, { useState, useEffect } from 'react';
import { DataTable, Column } from '../components/DataTable';
import { StatusBadge } from '../components/StatusBadge';

interface Transaction {
  id: number;
  amount: number;
  payment_method: string;
  reference_number: string;
  recorded_by: string;
  note: string;
  created_at: string;
}

export function FeeLedger({ studentId, session, term }: { studentId: string; session: string; term: string }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!studentId || !session || !term) return;
    
    async function fetchTransactions() {
      setIsLoading(true);
      try {
        const res = await (window as any).electronAPI.fees.getTransactions({ 
          student_id: studentId, 
          academic_session: session, 
          term 
        });
        if (res.ok) {
          setTransactions(res.data);
        }
      } catch (error) {
        console.error("Failed to load fee ledger:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchTransactions();
  }, [studentId, session, term]);

  const columns: Column<Transaction>[] = [
    {
      header: 'Date',
      cell: (row) => new Date(row.created_at).toLocaleDateString(),
      width: '15%'
    },
    {
      header: 'Amount',
      cell: (row) => <span className="font-mono text-emerald-400 font-semibold">₦{row.amount.toLocaleString()}</span>,
      align: 'right',
      width: '20%'
    },
    {
      header: 'Method',
      cell: (row) => (
        <StatusBadge 
          status={row.payment_method.replace('_', ' ').toUpperCase()} 
          variant={row.payment_method === 'cash' ? 'warning' : 'info'} 
        />
      ),
      align: 'center',
      width: '15%'
    },
    {
      header: 'Reference',
      accessorKey: 'reference_number',
      width: '20%'
    },
    {
      header: 'Admin',
      accessorKey: 'recorded_by',
      width: '15%'
    },
    {
      header: 'Notes',
      accessorKey: 'note',
      width: '15%'
    }
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold text-white tracking-tight">Transaction Ledger</h3>
        <span className="text-xs text-nexus-text-dim px-3 py-1 bg-black/20 rounded-full border border-nexus-border">
          {session} • {term}
        </span>
      </div>
      
      <DataTable 
        data={transactions} 
        columns={columns} 
        isLoading={isLoading} 
        emptyMessage="No payments recorded for this term." 
      />
    </div>
  );
}
