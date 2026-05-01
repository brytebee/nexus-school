import React, { useState, useEffect } from 'react';
import { BookOpen, Upload, Search, FileText, Trash2, Database } from 'lucide-react';
import { StatusBadge } from '../components/StatusBadge';

export function NexusScholar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({ documentCount: 0, documents: [], chunkCount: 0 });
  const [isUploading, setIsUploading] = useState(false);
  const [isQuerying, setIsQuerying] = useState(false);

  const fetchStats = async () => {
    try {
      const data = await (window as any).electronAPI.scholar.getStats();
      setStats(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    // We assume electronAPI exposes scholar
    if (!(window as any).electronAPI.scholar) {
      (window as any).electronAPI.scholar = {
        getStats: () => (window as any).ipcRenderer.invoke('scholar:get-stats'),
        query: (q: string) => (window as any).ipcRenderer.invoke('scholar:query', q),
        upload: (data: any) => (window as any).ipcRenderer.invoke('scholar:upload', data),
        clear: () => (window as any).ipcRenderer.invoke('scholar:clear')
      };
    }
    fetchStats();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      // In Electron, File objects have a 'path' property
      const filePath = (file as any).path;
      const res = await (window as any).electronAPI.scholar.upload({
        filePath,
        fileName: file.name
      });
      
      if (res.ok) {
        fetchStats();
      } else {
        alert("Upload failed: " + res.error);
      }
    } catch (err) {
      alert("Error parsing document.");
    } finally {
      setIsUploading(false);
      e.target.value = ''; // reset
    }
  };

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsQuerying(true);
    try {
      const res = await (window as any).electronAPI.scholar.query(query);
      setResults(res);
    } catch (err) {
      console.error(err);
    } finally {
      setIsQuerying(false);
    }
  };

  const clearIndex = async () => {
    if (confirm("Are you sure you want to delete the entire knowledge base?")) {
      await (window as any).electronAPI.scholar.clear();
      fetchStats();
      setResults([]);
    }
  };

  return (
    <div className="flex gap-6 h-[600px]">
      {/* Sidebar: Document Upload & Stats */}
      <div className="w-1/3 bg-nexus-panel border border-nexus-border rounded-2xl p-6 flex flex-col shadow-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-xl">
            <Database size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Knowledge Base</h2>
            <p className="text-xs text-nexus-text-dim">Nexus Scholar Engine</p>
          </div>
        </div>

        {/* Upload Button */}
        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-nexus-border hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all rounded-xl cursor-pointer mb-6 relative overflow-hidden group">
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            <Upload className="w-8 h-8 text-nexus-text-dim group-hover:text-indigo-400 mb-2 transition-colors" />
            <p className="text-sm text-nexus-text-dim">
              {isUploading ? "Extracting text..." : <><span className="font-semibold text-white">Click to upload</span> PDF/DOCX</>}
            </p>
          </div>
          <input type="file" className="hidden" accept=".pdf,.docx,.txt" onChange={handleFileUpload} disabled={isUploading} />
          {isUploading && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-sm">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </label>

        {/* Stats */}
        <div className="bg-black/30 border border-nexus-border rounded-xl p-4 mb-4 flex justify-between items-center">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-nexus-text-dim font-semibold mb-1">Indexed Documents</p>
            <p className="text-2xl font-bold text-white">{stats.documentCount}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-nexus-text-dim font-semibold mb-1">Text Chunks</p>
            <p className="text-2xl font-bold text-indigo-400">{stats.chunkCount}</p>
          </div>
        </div>

        {/* Document List */}
        <div className="flex-1 overflow-y-auto min-h-0 border border-nexus-border bg-black/20 rounded-xl p-2">
          {stats.documents.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-nexus-text-dim italic text-center p-4">
              No documents indexed. Upload policies, handbooks, or FAQs.
            </div>
          ) : (
            stats.documents.map((doc: string, i: number) => (
              <div key={i} className="flex items-center gap-2 p-2 hover:bg-white/5 rounded-lg text-sm text-white">
                <FileText size={14} className="text-nexus-text-dim flex-shrink-0" />
                <span className="truncate">{doc}</span>
              </div>
            ))
          )}
        </div>
        
        {stats.chunkCount > 0 && (
          <button onClick={clearIndex} className="mt-4 text-xs text-red-400 hover:text-red-300 flex items-center justify-center gap-1 p-2 transition-colors">
            <Trash2 size={12} /> Clear Index
          </button>
        )}
      </div>

      {/* Main Area: Query Testing */}
      <div className="flex-1 bg-nexus-panel border border-nexus-border rounded-2xl p-6 flex flex-col shadow-xl">
        <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
          <BookOpen size={20} className="text-indigo-400" />
          Test Grounded Queries
        </h3>
        <p className="text-sm text-nexus-text-dim mb-6">
          Search the index exactly how the Nexus Pulse Bot will when parents ask unstructured questions.
        </p>

        <form onSubmit={handleQuery} className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-nexus-text-dim" size={20} />
          <input 
            type="text" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. What is the policy for medical emergencies?"
            className="w-full bg-black/40 border border-nexus-border rounded-xl py-4 pl-12 pr-32 text-white placeholder-nexus-text-dim focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
          />
          <button 
            type="submit"
            disabled={isQuerying || !query.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {isQuerying ? "Searching..." : "Ask Scholar"}
          </button>
        </form>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto space-y-4">
          {results.length === 0 && !isQuerying && query && (
            <div className="text-center p-8 bg-black/20 rounded-xl border border-nexus-border border-dashed">
              <p className="text-nexus-text-dim">No highly relevant chunks found. The bot would say: <br/><em>"I'm sorry, I couldn't find information regarding this in the school's knowledge base."</em></p>
            </div>
          )}
          
          {results.map((res, i) => (
            <div key={i} className="bg-black/30 border border-nexus-border rounded-xl p-5 relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500"></div>
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-indigo-300 bg-indigo-500/10 px-2 py-1 rounded-md">
                  <FileText size={12} />
                  {res.docName}
                </div>
                <StatusBadge status={`Score: ${res.score.toFixed(2)}`} variant="success" />
              </div>
              <p className="text-sm text-white/90 leading-relaxed font-serif">
                "{res.text}"
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
