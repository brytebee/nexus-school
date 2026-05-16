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
    document.querySelectorAll('.pc-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.pc-tab-content').forEach(c => c.style.display = 'none');
    
    document.getElementById('pc-tab-'+tab).classList.add('active');
    document.getElementById('pc-content-'+tab).style.display = 'block';
    
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
        }
    };
});
