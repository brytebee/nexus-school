import React, { useState } from 'react';
import { FeeLedger } from './views/FeeLedger';
import { ExamClearance } from './views/ExamClearance';
import { PulseInbox } from './views/PulseInbox';
import { NexusScholar } from './views/NexusScholar';

function App() {
  const [activeTab, setActiveTab] = useState<'ledger' | 'scanner' | 'inbox' | 'scholar'>('scholar');

  return (
    <div className="min-h-screen bg-nexus-bg text-nexus-text font-inter p-6 lg:p-12 overflow-y-auto">
      {/* Hero Section */}
      <div className="max-w-4xl mx-auto space-y-4 mb-16">
        <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight text-white animate-in fade-in slide-in-from-bottom-4 duration-700">
          Nexus School OS <span className="text-nexus-accent drop-shadow-md">React</span>
        </h1>
        <p className="text-lg lg:text-xl text-nexus-text-dim max-w-2xl leading-relaxed">
          The next-generation frontend is active. Running side-by-side with the legacy system,
          bringing world-class Silicon Valley aesthetics to enterprise school management.
        </p>
      </div>

      {/* Action Cards */}
      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 mb-16">
        
        <div className="bg-nexus-panel border border-nexus-border rounded-2xl p-8 hover:shadow-2xl hover:shadow-nexus-gold/10 transition-all duration-300 group">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-10 h-10 rounded-full bg-nexus-gold/10 flex items-center justify-center text-nexus-gold">
              🏗️
            </div>
            <h3 className="text-2xl font-bold tracking-tight text-white group-hover:text-nexus-gold transition-colors">Fee Structure</h3>
          </div>
          <p className="text-nexus-text-dim text-sm leading-relaxed mb-6">
            Migrate the tabular fee builder into a highly reusable <code>&lt;DataTable /&gt;</code> component to handle class-level billing natively in React.
          </p>
          <button className="bg-white/5 hover:bg-white/10 text-white border border-nexus-border rounded-lg px-5 py-2.5 text-sm font-medium transition-colors w-full">
            Begin Migration
          </button>
        </div>

        <div className="bg-nexus-panel border border-nexus-border rounded-2xl p-8 hover:shadow-2xl hover:shadow-nexus-accent/10 transition-all duration-300 group">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-10 h-10 rounded-full bg-nexus-accent/10 flex items-center justify-center text-nexus-accent">
              📝
            </div>
            <h3 className="text-2xl font-bold tracking-tight text-white group-hover:text-nexus-accent transition-colors">CBT Engine</h3>
          </div>
          <p className="text-nexus-text-dim text-sm leading-relaxed mb-6">
            Implement the Diamond-tier Examination client using React Router, enabling a fully isolated, secure testing environment for students.
          </p>
          <button className="bg-gradient-to-r from-nexus-accent/80 to-blue-600 hover:from-nexus-accent hover:to-blue-500 text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors w-full shadow-lg shadow-nexus-accent/20">
            Initialize CBT
          </button>
        </div>

      </div>

      {/* Demo of Reusable Component Architecture */}
      <div className="max-w-4xl mx-auto p-8 border border-nexus-border rounded-2xl bg-black/20">
        <div className="flex items-center justify-between mb-8 border-b border-nexus-border pb-4">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">Diamond Components Preview</h2>
            <p className="text-nexus-text-dim text-sm">Live previews of new React views utilizing the Tailwind design system.</p>
          </div>
          <div className="flex bg-black/40 rounded-lg p-1 border border-nexus-border">
            <button 
              onClick={() => setActiveTab('ledger')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'ledger' ? 'bg-nexus-panel text-white shadow' : 'text-nexus-text-dim hover:text-white'}`}
            >
              Fee Ledger
            </button>
            <button 
              onClick={() => setActiveTab('scanner')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'scanner' ? 'bg-nexus-panel text-white shadow' : 'text-nexus-text-dim hover:text-white'}`}
            >
              Exam Scanner
            </button>
            <button 
              onClick={() => setActiveTab('inbox')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'inbox' ? 'bg-nexus-panel text-white shadow' : 'text-nexus-text-dim hover:text-white'}`}
            >
              Pulse Inbox
            </button>
            <button 
              onClick={() => setActiveTab('scholar')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'scholar' ? 'bg-indigo-600 text-white shadow' : 'text-nexus-text-dim hover:text-white'}`}
            >
              Nexus Scholar
            </button>
          </div>
        </div>
        
        {activeTab === 'ledger' && <FeeLedger studentId="demo-student-id" session="2025/2026" term="First Term" />}
        {activeTab === 'scanner' && <ExamClearance />}
        {activeTab === 'inbox' && <PulseInbox />}
        {activeTab === 'scholar' && <NexusScholar />}
      </div>

    </div>
  );
}

export default App;
