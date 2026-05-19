// portal-content-ui.js

let portalContentData = { news: [], policies: [] };

async function loadPortalContent() {
    try {
        const data = await window.nexusAPI.invoke('portal-content:get-all');
        portalContentData = data;
        renderNewsList();
        renderPoliciesList();
    } catch (e) {
        console.error("Failed to load portal content:", e);
    }
}

// ── NEWS ──────────────────────────────────────────────────────────────
function renderNewsList() {
    const list = document.getElementById('pc-news-list');
    if(!list) return;
    
    if(!portalContentData.news.length) {
        list.innerHTML = '<div style="color:var(--text-dim);padding:20px;text-align:center;">No news articles.</div>';
        return;
    }

    list.innerHTML = portalContentData.news.map(n => `
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
            <div>
                <span style="font-size:10px;font-weight:700;color:var(--accent);text-transform:uppercase;padding:2px 6px;border:1px solid var(--accent);border-radius:4px;margin-right:8px;">${n.category}</span>
                <span style="font-weight:700;color:#fff;">${n.title}</span>
                <div style="font-size:12px;color:var(--text-dim);margin-top:4px;">${n.is_published ? '🟢 Published' : '🔴 Draft'} • ${new Date(n.created_at).toLocaleDateString()}</div>
            </div>
            <div style="display:flex;gap:8px;">
                <button class="secondary-btn" onclick='editNews(${JSON.stringify(n).replace(/'/g, "&apos;")})' style="padding:6px 12px;font-size:12px;">Edit</button>
                <button class="danger-btn" onclick="deleteNews(${n.id})" style="padding:6px 12px;font-size:12px;">Delete</button>
            </div>
        </div>
    `).join('');
}

function showNewsEditor(isNew = true, data = null) {
    document.getElementById('pc-news-id').value = data ? data.id : '';
    document.getElementById('pc-news-title').value = data ? data.title : '';
    document.getElementById('pc-news-category').value = data ? data.category : 'general';
    document.getElementById('pc-news-body').value = data ? data.body : '';
    document.getElementById('pc-news-published').checked = data ? !!data.is_published : true;
    
    document.getElementById('pc-news-list-view').style.display = 'none';
    document.getElementById('pc-news-edit-view').style.display = 'block';
}

function hideNewsEditor() {
    document.getElementById('pc-news-list-view').style.display = 'block';
    document.getElementById('pc-news-edit-view').style.display = 'none';
}

async function saveNews() {
    const id = document.getElementById('pc-news-id').value;
    const title = document.getElementById('pc-news-title').value.trim();
    const category = document.getElementById('pc-news-category').value;
    const body = document.getElementById('pc-news-body').value.trim();
    const is_published = document.getElementById('pc-news-published').checked ? 1 : 0;

    if(!title || !body) {
        Swal.fire({ icon: 'error', title: 'Missing Fields', text: 'Title and body are required.' });
        return;
    }

    try {
        const item = { title, category, body, is_published };
        if(id) item.id = id;
        
        await window.nexusAPI.invoke('portal-content:save-news', item);
        await loadPortalContent();
        hideNewsEditor();
        Swal.fire({ icon: 'success', title: 'Saved', text: 'News article saved successfully.', timer: 1500, showConfirmButton: false });
    } catch(e) {
        Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to save news.' });
    }
}

async function deleteNews(id) {
    const res = await Swal.fire({
        title: 'Delete News?',
        text: "This action cannot be undone.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Yes, delete'
    });
    if(res.isConfirmed) {
        await window.nexusAPI.invoke('portal-content:delete-news', id);
        await loadPortalContent();
    }
}

function editNews(data) {
    showNewsEditor(false, data);
}

// ── POLICIES ──────────────────────────────────────────────────────────
function renderPoliciesList() {
    const list = document.getElementById('pc-policies-list');
    if(!list) return;
    
    if(!portalContentData.policies.length) {
        list.innerHTML = '<div style="color:var(--text-dim);padding:20px;text-align:center;">No policies.</div>';
        return;
    }

    list.innerHTML = portalContentData.policies.map(p => `
        <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;">
            <div>
                <span style="font-size:10px;font-weight:700;color:var(--accent);text-transform:uppercase;padding:2px 6px;border:1px solid var(--accent);border-radius:4px;margin-right:8px;">Order: ${p.order_num}</span>
                <span style="font-weight:700;color:#fff;">${p.title}</span>
                <div style="font-size:12px;color:var(--text-dim);margin-top:4px;">${p.is_published ? '🟢 Published' : '🔴 Draft'}</div>
            </div>
            <div style="display:flex;gap:8px;">
                <button class="secondary-btn" onclick='editPolicy(${JSON.stringify(p).replace(/'/g, "&apos;")})' style="padding:6px 12px;font-size:12px;">Edit</button>
                <button class="danger-btn" onclick="deletePolicy(${p.id})" style="padding:6px 12px;font-size:12px;">Delete</button>
            </div>
        </div>
    `).join('');
}

function showPolicyEditor(isNew = true, data = null) {
    document.getElementById('pc-pol-id').value = data ? data.id : '';
    document.getElementById('pc-pol-title').value = data ? data.title : '';
    document.getElementById('pc-pol-order').value = data ? data.order_num : '0';
    document.getElementById('pc-pol-body').value = data ? data.body : '';
    document.getElementById('pc-pol-published').checked = data ? !!data.is_published : true;
    
    document.getElementById('pc-policies-list-view').style.display = 'none';
    document.getElementById('pc-policies-edit-view').style.display = 'block';
}

function hidePolicyEditor() {
    document.getElementById('pc-policies-list-view').style.display = 'block';
    document.getElementById('pc-policies-edit-view').style.display = 'none';
}

async function savePolicy() {
    const id = document.getElementById('pc-pol-id').value;
    const title = document.getElementById('pc-pol-title').value.trim();
    const order_num = parseInt(document.getElementById('pc-pol-order').value || '0', 10);
    const body = document.getElementById('pc-pol-body').value.trim();
    const is_published = document.getElementById('pc-pol-published').checked ? 1 : 0;

    if(!title || !body) {
        Swal.fire({ icon: 'error', title: 'Missing Fields', text: 'Title and body are required.' });
        return;
    }

    try {
        const item = { title, order_num, body, is_published };
        if(id) item.id = id;
        
        await window.nexusAPI.invoke('portal-content:save-policy', item);
        await loadPortalContent();
        hidePolicyEditor();
        Swal.fire({ icon: 'success', title: 'Saved', text: 'Policy saved successfully.', timer: 1500, showConfirmButton: false });
    } catch(e) {
        Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to save policy.' });
    }
}

async function deletePolicy(id) {
    const res = await Swal.fire({
        title: 'Delete Policy?',
        text: "This action cannot be undone.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'Yes, delete'
    });
    if(res.isConfirmed) {
        await window.nexusAPI.invoke('portal-content:delete-policy', id);
        await loadPortalContent();
    }
}

function editPolicy(data) {
    showPolicyEditor(false, data);
}

// ── TABS ──────────────────────────────────────────────────────────────
function switchPcTab(tab) {
    // Hide all content panels
    document.querySelectorAll('.pc-tab-content').forEach(c => c.style.display = 'none');

    // Reset all tab buttons to inactive style
    document.querySelectorAll('.pc-tab').forEach(t => {
        t.classList.remove('active');
        t.style.background = 'transparent';
        t.style.color      = 'var(--text-dim)';
        t.style.borderLeft = 'none';
        t.style.fontWeight = '400';
    });

    // Activate the selected tab button
    const activeBtn = document.getElementById('pc-tab-' + tab);
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.style.background  = 'rgba(255,255,255,0.1)';
        activeBtn.style.color       = '#fff';
        activeBtn.style.borderLeft  = '3px solid var(--accent-gold, #FFD700)';
        activeBtn.style.fontWeight  = '600';
    }

    // Show the selected content panel
    const panel = document.getElementById('pc-content-' + tab);
    if (panel) panel.style.display = 'block';

    hideNewsEditor();
    hidePolicyEditor();
}

// ── MD IMPORT ─────────────────────────────────────────────────────────
function importMarkdown(inputEl, targetTextAreaId) {
    const file = inputEl.files[0];
    if(!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById(targetTextAreaId).value = e.target.result;
        inputEl.value = ''; // Reset
    };
    reader.readAsText(file);
}

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    // Only load if portal content view is activated or if we want to preload
    // Let's hook into showView
    const origShowView = window.showView;
    window.showView = function(viewId) {
        if(origShowView) origShowView(viewId);
        if(viewId === 'portal-content') {
            loadPortalContent();
            pcLoadSettings();
        }
    };
});

// ── SETTINGS PANEL ────────────────────────────────────────────────────

/** In-memory settings state for the panel session */
let _pcSettings = {
    sections:   [], // [{ id, icon, label, order }]  — custom additional sections
    categories: [], // [{ id, label }]               — custom article categories
};

/** Built-in sections that cannot be removed */
const PC_BUILTIN_SECTIONS = [
    { id: 'news',     icon: '📢', label: 'News Articles',   builtin: true },
    { id: 'policies', icon: '📋', label: 'School Policies', builtin: true },
];

/** Built-in categories that cannot be removed */
const PC_BUILTIN_CATEGORIES = [
    { id: 'general',        label: 'General Notice' },
    { id: 'pta',            label: 'PTA' },
    { id: 'fees',           label: 'Fees & Payments' },
    { id: 'infrastructure', label: 'Infrastructure' },
];

async function pcLoadSettings() {
    try {
        const res = await window.nexusAPI.invoke('portal-content:get-settings');
        if (res && res.ok && res.data) {
            _pcSettings = res.data;
        }
    } catch(e) {
        // Settings not saved yet — use defaults
    }
    if (!_pcSettings.sections)   _pcSettings.sections   = [];
    if (!_pcSettings.categories) _pcSettings.categories = [];
    pcPopulateCategorySelects();
}

window.pcOpenSettings = function() {
    pcRenderSections();
    pcRenderCategories();
    document.getElementById('pc-settings-panel').style.transform   = 'translateX(0)';
    document.getElementById('pc-settings-backdrop').style.display  = 'block';
};

window.pcCloseSettings = function() {
    document.getElementById('pc-settings-panel').style.transform   = 'translateX(100%)';
    document.getElementById('pc-settings-backdrop').style.display  = 'none';
};

function pcRenderSections() {
    const list = document.getElementById('pc-sections-list');
    if (!list) return;
    const all = [...PC_BUILTIN_SECTIONS, ..._pcSettings.sections];
    list.innerHTML = all.map(s => `
        <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;">
          <span style="font-size:16px;flex:0 0 auto;">${s.icon || '📄'}</span>
          <span style="flex:1;font-size:13px;color:${s.builtin ? 'var(--text-dim)' : '#fff'};">${s.label}${s.builtin ? ' <span style="font-size:10px;opacity:0.5;">(built-in)</span>' : ''}</span>
          ${!s.builtin ? `<button onclick="pcRemoveSection('${s.id}')" style="background:transparent;border:none;color:#ff6b6b;cursor:pointer;font-size:16px;padding:0 4px;" title="Remove">×</button>` : ''}
        </div>
    `).join('');
}

function pcRenderCategories() {
    const list = document.getElementById('pc-categories-list');
    if (!list) return;
    const all = [...PC_BUILTIN_CATEGORIES, ..._pcSettings.categories];
    list.innerHTML = all.map(c => `
        <div style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:20px;font-size:12px;color:${PC_BUILTIN_CATEGORIES.find(b => b.id === c.id) ? 'var(--text-dim)' : '#fff'};">
          ${c.label}
          ${!PC_BUILTIN_CATEGORIES.find(b => b.id === c.id) ? `<button onclick="pcRemoveCategory('${c.id}')" style="background:transparent;border:none;color:#ff6b6b;cursor:pointer;font-size:13px;line-height:1;padding:0 0 0 4px;">×</button>` : ''}
        </div>
    `).join('');
}

window.pcAddSection = function() {
    const label = document.getElementById('pc-new-section-label')?.value.trim();
    const icon  = document.getElementById('pc-new-section-icon')?.value.trim() || '📄';
    if (!label) { document.getElementById('pc-new-section-label')?.focus(); return; }
    const id = 'custom_' + label.toLowerCase().replace(/[^a-z0-9]/g, '_');
    if (_pcSettings.sections.find(s => s.id === id)) return;
    _pcSettings.sections.push({ id, icon, label });
    document.getElementById('pc-new-section-label').value = '';
    document.getElementById('pc-new-section-icon').value  = '';
    pcRenderSections();
};

window.pcRemoveSection = function(id) {
    _pcSettings.sections = _pcSettings.sections.filter(s => s.id !== id);
    pcRenderSections();
};

window.pcAddCategory = function() {
    const label = document.getElementById('pc-new-category-label')?.value.trim();
    if (!label) { document.getElementById('pc-new-category-label')?.focus(); return; }
    const id = 'cat_' + label.toLowerCase().replace(/[^a-z0-9]/g, '_');
    if (_pcSettings.categories.find(c => c.id === id)) return;
    if (PC_BUILTIN_CATEGORIES.find(c => c.label.toLowerCase() === label.toLowerCase())) return;
    _pcSettings.categories.push({ id, label });
    document.getElementById('pc-new-category-label').value = '';
    pcRenderCategories();
};

window.pcRemoveCategory = function(id) {
    _pcSettings.categories = _pcSettings.categories.filter(c => c.id !== id);
    pcRenderCategories();
};

window.pcSaveSettings = async function() {
    try {
        await window.nexusAPI.invoke('portal-content:save-settings', _pcSettings);
        pcPopulateCategorySelects();
        pcCloseSettings();
        if (typeof Swal !== 'undefined') {
            Swal.fire({ icon: 'success', title: 'Saved', text: 'Portal sections updated.', timer: 1500, showConfirmButton: false });
        }
    } catch(e) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to save settings.' });
        }
    }
};

/** Keeps the category <select> in the article editor in sync with current settings */
function pcPopulateCategorySelects() {
    const sel = document.getElementById('pc-news-category');
    if (!sel) return;
    const all = [...PC_BUILTIN_CATEGORIES, ..._pcSettings.categories];
    sel.innerHTML = all.map(c => `<option value="${c.id}">${c.label}</option>`).join('');
}

