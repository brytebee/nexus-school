import React, { useState, useEffect } from 'react';

interface NewsItem {
  id?: string | number;
  title: string;
  category: string;
  body: string;
  is_published: number;
  created_at?: string;
}

interface PolicyItem {
  id?: string | number;
  title: string;
  order_num: number;
  body: string;
  is_published: number;
}

interface PortalSection {
  id: string;
  icon: string;
  label: string;
  builtin?: boolean;
}

interface PortalCategory {
  id: string;
  label: string;
}

interface ContentSettings {
  sections: PortalSection[];
  categories: PortalCategory[];
}

export function PortalContent() {
  const [activeTab, setActiveTab] = useState<'news' | 'policies' | 'settings'>('news');
  const [news, setNews] = useState<NewsItem[]>([]);
  const [policies, setPolicies] = useState<PolicyItem[]>([]);
  const [settings, setSettings] = useState<ContentSettings>({ sections: [], categories: [] });

  // News Editor States
  const [isNewsEditorOpen, setIsNewsEditorOpen] = useState(false);
  const [newsId, setNewsId] = useState<string | number | null>(null);
  const [newsTitle, setNewsTitle] = useState('');
  const [newsCategory, setNewsCategory] = useState('general');
  const [newsBody, setNewsBody] = useState('');
  const [newsPublished, setNewsPublished] = useState(true);

  // Policy Editor States
  const [isPolicyEditorOpen, setIsPolicyEditorOpen] = useState(false);
  const [policyId, setPolicyId] = useState<string | number | null>(null);
  const [policyTitle, setPolicyTitle] = useState('');
  const [policyOrder, setPolicyOrder] = useState(0);
  const [policyBody, setPolicyBody] = useState('');
  const [policyPublished, setPolicyPublished] = useState(true);

  // Settings Panel Configs
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [newSectionLabel, setNewSectionLabel] = useState('');
  const [newSectionIcon, setNewSectionIcon] = useState('📄');
  const [newCategoryLabel, setNewCategoryLabel] = useState('');

  // Default Categories
  const defaultCategories: PortalCategory[] = [
    { id: 'general', label: 'General Notice' },
    { id: 'pta', label: 'PTA' },
    { id: 'fees', label: 'Fees & Payments' },
    { id: 'infrastructure', label: 'Infrastructure' },
  ];

  const defaultSections: PortalSection[] = [
    { id: 'news', icon: '📢', label: 'News Articles', builtin: true },
    { id: 'policies', icon: '📋', label: 'School Policies', builtin: true },
  ];

  // Combined lists
  const allCategories = [...defaultCategories, ...(settings.categories || [])];
  const allSections = [...defaultSections, ...(settings.sections || [])];

  // Fetch all content on mount
  const fetchContent = async () => {
    if (!window.nexusAPI?.invoke) return;
    try {
      const data = await window.nexusAPI.invoke('portal-content:get-all');
      if (data) {
        setNews(data.news || []);
        setPolicies(data.policies || []);
      }

      const settingsRes = await window.nexusAPI.invoke('portal-content:get-settings');
      if (settingsRes && settingsRes.ok && settingsRes.data) {
        setSettings({
          sections: settingsRes.data.sections || [],
          categories: settingsRes.data.categories || [],
        });
      }
    } catch (err) {
      console.error('Error fetching portal content:', err);
    }
  };

  useEffect(() => {
    fetchContent();
  }, []);

  // News Actions
  const handleOpenNewsEditor = (item: NewsItem | null) => {
    if (item) {
      setNewsId(item.id || null);
      setNewsTitle(item.title || '');
      setNewsCategory(item.category || 'general');
      setNewsBody(item.body || '');
      setNewsPublished(item.is_published === 1);
    } else {
      setNewsId(null);
      setNewsTitle('');
      setNewsCategory('general');
      setNewsBody('');
      setNewsPublished(true);
    }
    setIsNewsEditorOpen(true);
  };

  const handleSaveNews = async () => {
    if (!newsTitle.trim() || !newsBody.trim()) {
      alert('Title and body fields are required.');
      return;
    }
    if (!window.nexusAPI?.invoke) return;

    try {
      const item: NewsItem = {
        title: newsTitle,
        category: newsCategory,
        body: newsBody,
        is_published: newsPublished ? 1 : 0,
      };
      if (newsId) item.id = newsId;

      await window.nexusAPI.invoke('portal-content:save-news', item);
      setIsNewsEditorOpen(false);
      fetchContent();
    } catch (err) {
      console.error('Error saving news:', err);
      alert('Failed saving news article.');
    }
  };

  const handleDeleteNews = async (id: string | number) => {
    const confirm = window.confirm('Delete News Article? This cannot be undone.');
    if (confirm && window.nexusAPI?.invoke) {
      try {
        await window.nexusAPI.invoke('portal-content:delete-news', id);
        fetchContent();
      } catch (err) {
        console.error('Error deleting news:', err);
      }
    }
  };

  // Policy Actions
  const handleOpenPolicyEditor = (item: PolicyItem | null) => {
    if (item) {
      setPolicyId(item.id || null);
      setPolicyTitle(item.title || '');
      setPolicyOrder(item.order_num || 0);
      setPolicyBody(item.body || '');
      setPolicyPublished(item.is_published === 1);
    } else {
      setPolicyId(null);
      setPolicyTitle('');
      setPolicyOrder(0);
      setPolicyBody('');
      setPolicyPublished(true);
    }
    setIsPolicyEditorOpen(true);
  };

  const handleSavePolicy = async () => {
    if (!policyTitle.trim() || !policyBody.trim()) {
      alert('Title and body fields are required.');
      return;
    }
    if (!window.nexusAPI?.invoke) return;

    try {
      const item: PolicyItem = {
        title: policyTitle,
        order_num: policyOrder,
        body: policyBody,
        is_published: policyPublished ? 1 : 0,
      };
      if (policyId) item.id = policyId;

      await window.nexusAPI.invoke('portal-content:save-policy', item);
      setIsPolicyEditorOpen(false);
      fetchContent();
    } catch (err) {
      console.error('Error saving policy:', err);
      alert('Failed saving policy.');
    }
  };

  const handleDeletePolicy = async (id: string | number) => {
    const confirm = window.confirm('Delete Policy? This cannot be undone.');
    if (confirm && window.nexusAPI?.invoke) {
      try {
        await window.nexusAPI.invoke('portal-content:delete-policy', id);
        fetchContent();
      } catch (err) {
        console.error('Error deleting policy:', err);
      }
    }
  };

  // Markdown Import handler
  const handleImportMarkdown = (e: React.ChangeEvent<HTMLInputElement>, type: 'news' | 'policy') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string || '';
      if (type === 'news') {
        setNewsBody(text);
      } else {
        setPolicyBody(text);
      }
    };
    reader.readAsText(file);
  };

  // Settings configurations updates
  const handleAddSection = () => {
    const label = newSectionLabel.trim();
    const icon = newSectionIcon.trim() || '📄';
    if (!label) return;
    const id = 'custom_' + label.toLowerCase().replace(/[^a-z0-9]/g, '_');
    
    if (settings.sections.some(s => s.id === id)) return;

    setSettings(prev => ({
      ...prev,
      sections: [...prev.sections, { id, icon, label }],
    }));
    setNewSectionLabel('');
  };

  const handleRemoveSection = (id: string) => {
    setSettings(prev => ({
      ...prev,
      sections: prev.sections.filter(s => s.id !== id),
    }));
  };

  const handleAddCategory = () => {
    const label = newCategoryLabel.trim();
    if (!label) return;
    const id = 'cat_' + label.toLowerCase().replace(/[^a-z0-9]/g, '_');

    if (settings.categories.some(c => c.id === id) || defaultCategories.some(c => c.label.toLowerCase() === label.toLowerCase())) return;

    setSettings(prev => ({
      ...prev,
      categories: [...prev.categories, { id, label }],
    }));
    setNewCategoryLabel('');
  };

  const handleRemoveCategory = (id: string) => {
    setSettings(prev => ({
      ...prev,
      categories: prev.categories.filter(c => c.id !== id),
    }));
  };

  const handleSaveSettings = async () => {
    if (!window.nexusAPI?.invoke) return;
    try {
      await window.nexusAPI.invoke('portal-content:save-settings', settings);
      setIsSettingsPanelOpen(false);
      alert('Portal layouts and sections updated!');
    } catch (err) {
      console.error('Error saving settings:', err);
      alert('Failed to save settings.');
    }
  };

  return (
    <div className="view active" id="view-portal-content" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '28px 32px', overflowY: 'auto', overflowX: 'hidden' }}>
      {/* View Header */}
      <div className="view-header">
        <div>
          <h2 className="view-title" style={{ color: 'var(--accent-gold)' }}>Portal Content</h2>
          <p className="view-sub">Manage what parents see on the Sovereign Portal</p>
        </div>
        <button 
          id="btn-pc-settings" 
          onClick={() => setIsSettingsPanelOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: 'var(--text-dim)',
            borderRadius: '8px',
            padding: '8px 14px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
            transition: 'all 0.2s'
          }}
          className="pc-settings-toggle-btn"
        >
          ⚙️ Manage Sections
        </button>
      </div>
      
      <div style={{ display: 'flex', gap: '20px', marginTop: '20px', flex: 1, minHeight: 0 }}>
        {/* Dynamic left nav */}
        <div id="pc-nav" style={{ width: '200px', display: 'flex', flexDirection: 'column', gap: '8px', shrink: 0 }}>
          <button 
            id="pc-tab-news" 
            onClick={() => {
              setActiveTab('news');
              setIsNewsEditorOpen(false);
            }}
            style={{
              padding: '12px',
              textAlign: 'left',
              background: activeTab === 'news' ? 'rgba(255,255,255,0.1)' : 'transparent',
              border: 'none',
              borderLeft: activeTab === 'news' ? '3px solid var(--accent-gold, #FFD700)' : 'none',
              color: activeTab === 'news' ? '#fff' : 'var(--text-dim)',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: activeTab === 'news' ? 600 : 400
            }}
          >
            📢 News Articles
          </button>
          <button 
            id="pc-tab-policies" 
            onClick={() => {
              setActiveTab('policies');
              setIsPolicyEditorOpen(false);
            }}
            style={{
              padding: '12px',
              textAlign: 'left',
              background: activeTab === 'policies' ? 'rgba(255,255,255,0.1)' : 'transparent',
              border: 'none',
              borderLeft: activeTab === 'policies' ? '3px solid var(--accent-gold, #FFD700)' : 'none',
              color: activeTab === 'policies' ? '#fff' : 'var(--text-dim)',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: activeTab === 'policies' ? 600 : 400
            }}
          >
            📋 School Policies
          </button>
        </div>
        
        <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '16px', padding: '24px', overflowY: 'auto' }}>
          {/* NEWS TAB */}
          {activeTab === 'news' && (
            <div id="pc-content-news" className="pc-tab-content">
              {!isNewsEditorOpen ? (
                <div id="pc-news-list-view">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '16px', color: '#fff', margin: 0 }}>News Articles</h3>
                    <button className="primary-btn" onClick={() => handleOpenNewsEditor(null)} style={{ padding: '8px 16px', fontSize: '13px' }}>＋ New Article</button>
                  </div>
                  <div id="pc-news-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {news.map(item => (
                      <div
                        key={item.id}
                        className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-4 flex justify-between items-center"
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--accent-gold)', border: '1px solid rgba(255,215,0,0.3)', background: 'rgba(255,215,0,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                              {item.category.toUpperCase()}
                            </span>
                            <h4 style={{ fontWeight: 'bold', color: '#fff', fontSize: '14px', margin: 0 }}>{item.title}</h4>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '6px' }}>
                            {item.is_published ? '🟢 Published' : '🔴 Draft'} •{' '}
                            {item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => handleOpenNewsEditor(item)}
                            className="secondary-btn"
                            style={{ padding: '6px 12px', fontSize: '12px' }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteNews(item.id!)}
                            className="tbl-action-btn"
                            style={{ padding: '6px 12px', fontSize: '12px', color: '#ff6666', border: '1px solid rgba(255,102,102,0.2)' }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}

                    {news.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '40px', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px', color: 'var(--text-dim)', fontSize: '13px' }}>
                        No news articles available. Register announcements using the trigger buttons above.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* News Editor */
                <div id="pc-news-edit-view">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '16px', color: '#fff', margin: 0 }}>{newsId ? 'Edit Article' : 'New Article'}</h3>
                    <button className="secondary-btn" onClick={() => setIsNewsEditorOpen(false)} style={{ padding: '8px 16px', fontSize: '13px' }}>Cancel</button>
                  </div>
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                    <div style={{ flex: 2 }}>
                      <label className="ph-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>Title</label>
                      <input type="text" value={newsTitle} onChange={(e) => setNewsTitle(e.target.value)} className="modern-input" placeholder="Article Title" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="ph-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>Category</label>
                      <select value={newsCategory} onChange={(e) => setNewsCategory(e.target.value)} className="modern-input" style={{ width: '100%' }}>
                        {allCategories.map(cat => (
                          <option key={cat.id} value={cat.id} style={{ background: '#0d1128', color: '#fff' }}>
                            {cat.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label className="ph-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block' }}>Content (Markdown)</label>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <a
                          href="data:text/markdown;charset=utf-8,%23%20School%20News%20Title%0A%0AWrite%20your%20news%20content%20here%20in%20Markdown.%20You%20can%20use%20bullet%20points%20or%20headings."
                          download="News_Template.md"
                          style={{ fontSize: '11px', color: 'var(--accent-gold, #FFD700)', textDecoration: 'none', border: '1px solid var(--accent-gold, #FFD700)', padding: '4px 8px', borderRadius: '4px' }}
                        >
                          📥 Template
                        </a>
                        <label style={{ fontSize: '12px', color: 'var(--accent)', cursor: 'pointer', border: '1px dashed var(--accent)', padding: '4px 8px', borderRadius: '4px' }}>
                          Import .md file
                          <input type="file" accept=".md,.txt" style={{ display: 'none' }} onChange={(e) => handleImportMarkdown(e, 'news')} />
                        </label>
                      </div>
                    </div>
                    <textarea value={newsBody} onChange={(e) => setNewsBody(e.target.value)} className="modern-input" style={{ height: '250px', marginTop: '8px', fontFamily: 'monospace', fontSize: '13px' }} placeholder="Write content in Markdown..."></textarea>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={newsPublished} onChange={(e) => setNewsPublished(e.target.checked)} /> Publish immediately
                    </label>
                    <button className="primary-btn" onClick={handleSaveNews} style={{ padding: '10px 24px' }}>Save Article</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* POLICIES TAB */}
          {activeTab === 'policies' && (
            <div id="pc-content-policies" className="pc-tab-content">
              {!isPolicyEditorOpen ? (
                <div id="pc-policies-list-view">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '16px', color: '#fff', margin: 0 }}>School Policies</h3>
                    <button className="primary-btn" onClick={() => handleOpenPolicyEditor(null)} style={{ padding: '8px 16px', fontSize: '13px' }}>＋ New Policy</button>
                  </div>
                  <div id="pc-policies-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {policies.map(item => (
                      <div
                        key={item.id}
                        className="bg-white/[0.02] border border-white/[0.08] rounded-xl p-4 flex justify-between items-center"
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--accent-gold)', border: '1px solid rgba(255,215,0,0.3)', background: 'rgba(255,215,0,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                              ORDER: {item.order_num}
                            </span>
                            <h4 style={{ fontWeight: 'bold', color: '#fff', fontSize: '14px', margin: 0 }}>{item.title}</h4>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '6px' }}>
                            {item.is_published ? '🟢 Published' : '🔴 Draft'}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => handleOpenPolicyEditor(item)}
                            className="secondary-btn"
                            style={{ padding: '6px 12px', fontSize: '12px' }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeletePolicy(item.id!)}
                            className="tbl-action-btn"
                            style={{ padding: '6px 12px', fontSize: '12px', color: '#ff6666', border: '1px solid rgba(255,102,102,0.2)' }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}

                    {policies.length === 0 && (
                      <div style={{ textAlign: 'center', padding: '40px', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px', color: 'var(--text-dim)', fontSize: '13px' }}>
                        No school policies available. Register standards using the trigger buttons above.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Policy Editor */
                <div id="pc-policies-edit-view">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '16px', color: '#fff', margin: 0 }}>{policyId ? 'Edit Policy' : 'New Policy'}</h3>
                    <button className="secondary-btn" onClick={() => setIsPolicyEditorOpen(false)} style={{ padding: '8px 16px', fontSize: '13px' }}>Cancel</button>
                  </div>
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                    <div style={{ flex: 3 }}>
                      <label className="ph-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>Policy Title</label>
                      <input type="text" value={policyTitle} onChange={(e) => setPolicyTitle(e.target.value)} className="modern-input" placeholder="e.g. Code of Conduct" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="ph-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>Display Order</label>
                      <input type="number" value={policyOrder} onChange={(e) => setPolicyOrder(parseInt(e.target.value) || 0)} className="modern-input" />
                    </div>
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label className="ph-label" style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-dim)', display: 'block' }}>Policy Content (Markdown)</label>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <a
                          href="data:text/markdown;charset=utf-8,%23%20School%20Policy%20Title%0A%0ADefine%20your%20policy%20details%20here%20in%20Markdown."
                          download="Policy_Template.md"
                          style={{ fontSize: '11px', color: 'var(--accent-gold, #FFD700)', textDecoration: 'none', border: '1px solid var(--accent-gold, #FFD700)', padding: '4px 8px', borderRadius: '4px' }}
                        >
                          📥 Template
                        </a>
                        <label style={{ fontSize: '12px', color: 'var(--accent)', cursor: 'pointer', border: '1px dashed var(--accent)', padding: '4px 8px', borderRadius: '4px' }}>
                          Import .md file
                          <input type="file" accept=".md,.txt" style={{ display: 'none' }} onChange={(e) => handleImportMarkdown(e, 'policy')} />
                        </label>
                      </div>
                    </div>
                    <textarea value={policyBody} onChange={(e) => setPolicyBody(e.target.value)} className="modern-input" style={{ height: '250px', marginTop: '8px', fontFamily: 'monospace', fontSize: '13px' }} placeholder="Write content in Markdown..."></textarea>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', fontSize: '14px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={policyPublished} onChange={(e) => setPolicyPublished(e.target.checked)} /> Publish immediately
                    </label>
                    <button className="primary-btn" onClick={handleSavePolicy} style={{ padding: '10px 24px' }}>Save Policy</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Settings Panel Slide-in */}
      <div 
        id="pc-settings-panel" 
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '380px',
          height: '100vh',
          background: 'var(--bg-panel,#0d1128)',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          zIndex: 500,
          transform: isSettingsPanelOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ color: '#fff', fontSize: '16px', fontWeight: 700, margin: 0 }}>Portal Sections</h3>
            <p style={{ color: 'var(--text-dim)', fontSize: '12px', margin: '4px 0 0' }}>Customise what appears in the parent portal sidebar.</p>
          </div>
          <button onClick={() => setIsSettingsPanelOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-dim)', fontSize: '20px', cursor: 'pointer', padding: '4px 8px' }} title="Close">✕</button>
        </div>

        <div style={{ padding: '20px 24px', flex: 1 }}>
          {/* SECTION A: Portal Nav Sections */}
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-gold,#FFD700)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '12px' }}>Portal Navigation Sections</p>
          <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '16px', lineHeight: 1.5 }}>These are the tabs parents see in the portal sidebar. Drag to reorder.</p>
          <div id="pc-sections-list" style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
            {allSections.map(sec => (
              <div
                key={sec.id}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', color: '#fff' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>{sec.icon || '📄'}</span>
                  <span>{sec.label}</span>
                  {sec.builtin && (
                    <span style={{ fontSize: '8px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.08)', padding: '2px 4px', borderRadius: '4px' }}>
                      Built-in
                    </span>
                  )}
                </div>
                {!sec.builtin && (
                  <button onClick={() => handleRemoveSection(sec.id)} style={{ background: 'transparent', border: 'none', color: '#ff6666', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input 
              type="text" 
              value={newSectionLabel} 
              onChange={(e) => setNewSectionLabel(e.target.value)} 
              className="modern-input" 
              placeholder="Section label (e.g. School Blog)" 
              style={{ flex: 2, fontSize: '12px', padding: '8px 10px' }} 
            />
            <input 
              type="text" 
              value={newSectionIcon} 
              onChange={(e) => setNewSectionIcon(e.target.value)} 
              className="modern-input" 
              placeholder="Emoji icon" 
              style={{ flex: '0 0 60px', fontSize: '14px', padding: '8px', textAlign: 'center' }} 
            />
          </div>
          <button onClick={handleAddSection} className="secondary-btn" style={{ width: '100%', fontSize: '12px', padding: '8px', justifyContent: 'center' }}>＋ Add Section</button>

          <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', margin: '24px 0' }}></div>

          {/* SECTION B: Article Categories */}
          <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-gold,#FFD700)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '12px' }}>Article Categories</p>
          <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '16px', lineHeight: 1.5 }}>Labels for news articles. Shown as filter badges in the portal.</p>
          <div id="pc-categories-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
            {allCategories.map(cat => {
              const isBuiltin = defaultCategories.some(c => c.id === cat.id);
              return (
                <div
                  key={cat.id}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '4px 10px', fontSize: '11px', color: '#fff' }}
                >
                  <span>{cat.label}</span>
                  {!isBuiltin && (
                    <button onClick={() => handleRemoveCategory(cat.id)} style={{ background: 'transparent', border: 'none', color: '#ff6666', cursor: 'pointer', fontSize: '12px', padding: 0 }}>×</button>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input 
              type="text" 
              value={newCategoryLabel} 
              onChange={(e) => setNewCategoryLabel(e.target.value)} 
              className="modern-input" 
              placeholder="Category name (e.g. Events)" 
              style={{ flex: 1, fontSize: '12px', padding: '8px 10px' }} 
            />
            <button onClick={handleAddCategory} className="secondary-btn" style={{ fontSize: '12px', padding: '8px 14px', whiteSpace: 'nowrap' }}>＋ Add</button>
          </div>
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button onClick={handleSaveSettings} className="primary-btn" style={{ width: '100%', padding: '12px', fontSize: '14px', justifyContent: 'center' }}>Save Settings</button>
        </div>
      </div>

      {/* Backdrop */}
      {isSettingsPanelOpen && (
        <div 
          id="pc-settings-backdrop" 
          onClick={() => setIsSettingsPanelOpen(false)} 
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 499, backdropFilter: 'blur(2px)' }}
        />
      )}
    </div>
  );
}

export default PortalContent;
