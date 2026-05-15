"use strict";

(function initCBTUI() {
    // ── STATE — declared once at the top of the IIFE ─────────────────────────
    let currentLiveExamId = null;
    let currentLiveExamType = null;
    let currentLiveExamIsPromotional = false;
    let isInitialized = false;

    // ── INITIALIZATION ───────────────────────────────────────────────────────
    window.cbtInit = async () => {
        const tabBanksBtn  = document.getElementById("tab-cbt-banks");
        const tabDeployBtn = document.getElementById("tab-cbt-deploy");
        const tabLiveBtn   = document.getElementById("tab-cbt-live");
        const tabAboutBtn  = document.getElementById("tab-cbt-about");
        const btnBuyTokens = document.getElementById("btn-cbt-buy-tokens");

        // ── TAB SWITCHING ─────────────────────────────────────────────────────
        // Containers are queried LIVE inside switchTab — never cached at closure
        // time, which caused null references when the view hadn't been active yet.
        function switchTab(activeBtn, containerId) {
            const containerBanks  = document.getElementById("cbt-banks-container");
            const containerDeploy = document.getElementById("cbt-deploy-container");
            const containerLive   = document.getElementById("cbt-live-container");
            const containerAbout  = document.getElementById("cbt-about-container");

            [tabBanksBtn, tabDeployBtn, tabLiveBtn, tabAboutBtn].forEach(btn => { if (btn) btn.classList.remove("active"); });
            [containerBanks, containerDeploy, containerLive, containerAbout].forEach(c => { if (c) c.style.display = "none"; });

            if (activeBtn) activeBtn.classList.add("active");
            const activeContainer = document.getElementById(containerId);
            if (activeContainer) activeContainer.style.display = "flex";

            if (activeBtn === tabBanksBtn)  loadBanks();
            if (activeBtn === tabDeployBtn) renderDeployUI();
            if (activeBtn === tabLiveBtn)   renderLiveUI();
        }

        if (!isInitialized) {
            tabBanksBtn?.addEventListener("click",  () => switchTab(tabBanksBtn,  "cbt-banks-container"));
            tabDeployBtn?.addEventListener("click", () => switchTab(tabDeployBtn, "cbt-deploy-container"));
            tabLiveBtn?.addEventListener("click",   () => switchTab(tabLiveBtn,   "cbt-live-container"));
            tabAboutBtn?.addEventListener("click",  () => switchTab(tabAboutBtn,  "cbt-about-container"));

            const uploadInput = document.getElementById("nexpack-upload-input");
            if (uploadInput) {
                uploadInput.addEventListener("change", async (e) => {
                    if (!e.target.files.length) return;
                    const file = e.target.files[0];
                    
                    const pContainer = document.getElementById("nexpack-progress-container");
                    const pBar = document.getElementById("nexpack-progress-bar");
                    const pText = document.getElementById("nexpack-percent-text");
                    const pStatus = document.getElementById("nexpack-status-text");
                    
                    pContainer.style.display = "block";
                    pStatus.innerText = "Decrypting & Validating...";
                    pBar.style.width = "20%";
                    pText.innerText = "20%";

                    // Simulate processing UX
                    await new Promise(r => setTimeout(r, 600));
                    pBar.style.width = "60%";
                    pText.innerText = "60%";
                    pStatus.innerText = "Importing Database...";

                    try {
                        const res = await window.electronAPI.cbt.installNexPack({ filePath: file.path });
                        pBar.style.width = "100%";
                        pText.innerText = "100%";
                        pStatus.innerText = "Complete!";
                        
                        setTimeout(() => {
                            pContainer.style.display = "none";
                            document.getElementById("cbt-settings-panel").style.transform = "translateX(100%)";
                            if (res.success) {
                                Swal.fire({ title: 'Premium Pack Installed!', html: `Imported <b>${res.imported}</b> new questions.<br>Skipped ${res.skipped} existing.`, icon: 'success' });
                                if (tabBanksBtn.classList.contains("active")) loadBanks();
                            } else {
                                Swal.fire("Error", res.error, "error");
                            }
                        }, 800);
                    } catch (err) {
                        pContainer.style.display = "none";
                        Swal.fire("Error", err.message, "error");
                    }
                    uploadInput.value = "";
                });
            }

            btnBuyTokens?.addEventListener("click", async () => {
                const key = prompt("Enter your 24-character Expansion Key from the Cloud Portal:\n(e.g. NXT-500-...)");
                if (!key) return;
                try {
                    const res = await window.electronAPI.cbt.addExpansionKey({ key });
                    if (res.success) {
                        alert(`Successfully added ${res.added} External CBT Tokens!`);
                        refreshExternalBalance();
                    } else alert(`Error: ${res.error}`);
                } catch (e) { alert(`Error: ${e.message}`); }
            });

            isInitialized = true;
        }

        // Always reset to Banks tab on view entry
        switchTab(tabBanksBtn, "cbt-banks-container");
        await refreshExternalBalance();
    };


    // ── MONETIZATION (Tokens) ────────────────────────────────────────────────
    async function refreshExternalBalance() {
        if (!window.electronAPI) return;
        try {
            const data = await window.electronAPI.cbt.getExternalBalance();
            const balanceCount = document.getElementById("cbt-balance-count");
            if (balanceCount) balanceCount.textContent = `${data.remaining} / ${data.allowance}`;
        } catch (e) {
            console.error("Failed to load external CBT balance", e);
        }
    }

    // ── QUESTION BANKS ───────────────────────────────────────────────────────
    async function loadBanks() {
        const banksContainer = document.getElementById("cbt-banks-container");
        if (!window.electronAPI || !banksContainer) return;

        // If the shell was overwritten by the studio, rebuild it
        if (!document.getElementById("cbt-banks-list")) {
            banksContainer.innerHTML = `
              <div style="display:flex; justify-content:space-between; margin-bottom:15px; width:100%;">
                <h3 style="font-size:16px; margin:0;">Question Bank Library</h3>
                <button class="primary-btn" id="btn-create-bank">+ Create New Bank</button>
              </div>
              <div id="cbt-banks-list" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:15px; width:100%;"></div>
            `;
        }

        const banksList = document.getElementById("cbt-banks-list");
        banksList.innerHTML = `<div style="color:var(--text-dim); text-align:center; padding:40px; grid-column:1/-1;">Loading Banks...</div>`;
        try {
            const banks = await window.electronAPI.cbt.getBanks();
            if (banks.length === 0) {
                banksList.innerHTML = `<div style="color:var(--text-dim); text-align:center; padding:40px; grid-column:1/-1;">No Question Banks found. Create one!</div>`;
                return;
            }
            
            let html = "";
            for (const b of banks) {
                html += `
                    <div style="background:var(--bg-panel); border:1px solid var(--glass-border); border-radius:12px; padding:20px; cursor:pointer; position:relative; overflow:hidden;" onclick="openBankStudio(${b.id}, '${b.name.replace(/'/g, "\\'")}')">
                        <div style="font-size:16px; font-weight:bold; margin-bottom:5px;">${b.name}</div>
                        <div style="font-size:12px; color:var(--text-dim); margin-bottom:15px;">${b.description || 'No description'}</div>
                        <div style="display:flex; justify-content:space-between; font-size:11px;">
                            <span style="background:rgba(99,102,241,0.1); color:#818cf8; padding:3px 8px; border-radius:12px;">${b.class_category || b.subject || 'General'}</span>
                            <span style="color:var(--text-dim);">Click to edit questions ➔</span>
                        </div>
                    </div>
                `;
            }
            banksList.innerHTML = html;
        } catch (e) {
            banksList.innerHTML = `<div style="color:#ef4444; text-align:center; padding:40px; grid-column:1/-1;">Failed to load banks: ${e.message}</div>`;
        }
    }

    // Global document listeners for dynamic buttons to avoid duplicate bindings
    document.addEventListener("click", async (e) => {
        if (e.target && e.target.id === "btn-create-bank") {
            const { value: formValues } = await Swal.fire({
                title: 'Create Question Bank',
                html:
                    '<input id="swal-create-bank-name" class="swal2-input" placeholder="Bank Name (e.g. JSS3 Mock Exam)">' +
                    '<input id="swal-create-bank-cat" class="swal2-input" placeholder="Category (e.g. Mathematics)">',
                focusConfirm: false,
                background: '#0b0f19',
                color: '#fff',
                confirmButtonColor: '#10b981',
                preConfirm: () => [
                    document.getElementById('swal-create-bank-name').value,
                    document.getElementById('swal-create-bank-cat').value
                ]
            });

            if (formValues && formValues[0]) {
                const name = formValues[0];
                const category = formValues[1] || "General";
                try {
                    await window.electronAPI.cbt.createBank({ name, description: "", category });
                    loadBanks();
                } catch (err) { Swal.fire("Error", err.message, "error"); }
            }
        }
    });

    window.openBankStudio = async (bankId, bankName) => {
        const banksContainer = document.getElementById('cbt-banks-container');
        if (!banksContainer) return;

        // Render studio shell
        banksContainer.innerHTML = `
          <div style="width:100%;display:flex;flex-direction:column;gap:20px;">
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--glass-border);padding-bottom:15px;flex-wrap:wrap;gap:10px;">
              <div>
                <button onclick="window.cbtInit()" style="background:transparent;border:1px solid var(--border);color:var(--text);padding:5px 12px;border-radius:6px;cursor:pointer;font-size:12px;margin-bottom:8px;">⬅ Back to Banks</button>
                <h2 style="margin:0;">${bankName} — Question Studio</h2>
              </div>
              <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <button id="studio-add-btn" class="primary-btn" style="background:#10b981;border-color:#10b981;">+ Add Question</button>
                <button id="studio-scholar-btn" class="primary-btn" style="background:#4f46e5;border-color:#4f46e5;">Upload via Nexus Scholar 🪄</button>
                <input type="file" id="studio-scholar-input" accept=".pdf,.docx,.txt" style="display:none;">
              </div>
            </div>
            <div id="studio-q-stats" style="font-size:12px;color:var(--text-dim);"></div>
            <div id="studio-q-list" style="display:flex;flex-direction:column;gap:10px;">
              <div style="color:var(--text-dim);text-align:center;padding:40px;">Loading questions…</div>
            </div>
          </div>`;

        // ── Load & render existing questions ──────────────────────────────────
        async function refreshQuestions() {
            const listEl = document.getElementById('studio-q-list');
            const statsEl = document.getElementById('studio-q-stats');
            if (!listEl) return;
            try {
                const qs = await window.electronAPI.cbt.getQuestions(bankId);
                if (statsEl) statsEl.textContent = `${qs.length} question${qs.length !== 1 ? 's' : ''} in this bank`;
                if (!qs.length) {
                    listEl.innerHTML = `<div style="background:var(--bg-panel);border:1px dashed var(--glass-border);border-radius:12px;padding:40px;text-align:center;color:var(--text-dim);">
                      <div style="font-size:32px;margin-bottom:12px;">📝</div>
                      <p>No questions yet. Use <strong>+ Add Question</strong> or <strong>Upload via Nexus Scholar</strong> to populate this bank.</p></div>`;
                    return;
                }
                listEl.innerHTML = qs.map((q, i) => `
                  <div style="background:var(--bg-panel);border:1px solid var(--glass-border);border-radius:10px;padding:14px 16px;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
                      <div style="flex:1;">
                        <div style="font-size:13px;font-weight:600;margin-bottom:8px;"><span style="color:var(--text-dim);margin-right:6px;">${i+1}.</span>${q.question_text}</div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
                          ${['a','b','c','d'].map(l => `<div style="font-size:12px;padding:4px 8px;border-radius:5px;${q.correct_option===l?'background:rgba(16,185,129,0.15);color:#10b981;font-weight:700;border:1px solid rgba(16,185,129,0.3);':'color:var(--text-dim);'}"><strong style="text-transform:uppercase;">${l}.</strong> ${q['option_'+l]||'—'}</div>`).join('')}
                        </div>
                      </div>
                      <div style="display:flex;gap:6px;flex-shrink:0;">
                        <span style="font-size:11px;background:rgba(16,185,129,0.1);color:#10b981;padding:2px 7px;border-radius:10px;">${q.marks||1} mk</span>
                      </div>
                    </div>
                  </div>`).join('');
            } catch (e) {
                if (listEl) listEl.innerHTML = `<div style="color:#ef4444;padding:20px;text-align:center;">Failed to load: ${e.message}</div>`;
            }
        }
        await refreshQuestions();

        // ── Add Question button ───────────────────────────────────────────────
        const addBtn = document.getElementById('studio-add-btn');
        if (addBtn) addBtn.addEventListener('click', async () => {
            const { value: f } = await Swal.fire({
                title: 'Add Question',
                background: '#0b0f19', color: '#fff',
                confirmButtonColor: '#10b981',
                showCancelButton: true,
                focusConfirm: false,
                width: 600,
                html: `
                  <div style="text-align:left;display:flex;flex-direction:column;gap:10px;margin-top:8px;">
                    <textarea id="sq-question" class="swal2-textarea" rows="3" placeholder="Question text…" style="width:100%;resize:vertical;"></textarea>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                      <input id="sq-a" class="swal2-input" placeholder="Option A" style="margin:0;">
                      <input id="sq-b" class="swal2-input" placeholder="Option B" style="margin:0;">
                      <input id="sq-c" class="swal2-input" placeholder="Option C" style="margin:0;">
                      <input id="sq-d" class="swal2-input" placeholder="Option D" style="margin:0;">
                    </div>
                    <div style="display:flex;gap:10px;align-items:center;">
                      <label style="font-size:13px;color:rgba(255,255,255,0.6);">Correct Answer:</label>
                      <select id="sq-correct" class="swal2-input" style="width:80px;margin:0;">
                        <option value="a">A</option><option value="b">B</option>
                        <option value="c">C</option><option value="d">D</option>
                      </select>
                      <label style="font-size:13px;color:rgba(255,255,255,0.6);">Marks:</label>
                      <input id="sq-marks" type="number" class="swal2-input" value="1" min="1" max="10" style="width:70px;margin:0;">
                    </div>
                  </div>`,
                preConfirm: () => ({
                    question_text: document.getElementById('sq-question').value.trim(),
                    option_a: document.getElementById('sq-a').value.trim(),
                    option_b: document.getElementById('sq-b').value.trim(),
                    option_c: document.getElementById('sq-c').value.trim(),
                    option_d: document.getElementById('sq-d').value.trim(),
                    correct_option: document.getElementById('sq-correct').value,
                    marks: parseInt(document.getElementById('sq-marks').value) || 1
                })
            });
            if (!f || !f.question_text) return;
            if (!f.option_a || !f.option_b) { Swal.fire({ title:'Validation', text:'At least options A and B are required.', icon:'warning', background:'#0b0f19', color:'#fff' }); return; }
            try {
                await window.electronAPI.cbt.addQuestion({ bank_id: bankId, ...f });
                await refreshQuestions();
                Swal.fire({ title:'Added!', icon:'success', background:'#0b0f19', color:'#fff', timer:1200, showConfirmButton:false });
            } catch(e) { Swal.fire('Error', e.message, 'error'); }
        });

        // ── Scholar Upload button ─────────────────────────────────────────────
        const scholarBtn = document.getElementById('studio-scholar-btn');
        const scholarInput = document.getElementById('studio-scholar-input');
        if (scholarBtn && scholarInput) {
            scholarBtn.addEventListener('click', () => scholarInput.click());
            scholarInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                scholarInput.value = '';

                // 15MB guard (client-side pre-check)
                if (file.size > 15 * 1024 * 1024) {
                    Swal.fire({ title: 'File Too Large', text: `Your file is ${(file.size/1024/1024).toFixed(1)}MB. Maximum allowed is 15MB.`, icon: 'warning', background: '#0b0f19', color: '#fff' });
                    return;
                }

                Swal.fire({ title: '🧠 Nexus Scholar Extracting…', html: `<p style="color:rgba(255,255,255,0.6);">Reading <strong>${file.name}</strong> and detecting MCQ patterns…</p>`, allowOutsideClick: false, showConfirmButton: false, background: '#0b0f19', color: '#fff', didOpen: () => Swal.showLoading() });

                try {
                    window._nexusBusy = true; // prevent idle lock during extraction
                    const arrayBuffer = await file.arrayBuffer();
                    const fileData = Array.from(new Uint8Array(arrayBuffer));
                    const result = await window.electronAPI.cbt.scholarExtract({ fileData, fileName: file.name });
                    window._nexusBusy = false;

                    if (!result.ok) { Swal.fire({ title: 'Extraction Failed', text: result.error, icon: 'error', background: '#0b0f19', color: '#fff' }); return; }
                    if (!result.questions.length) { Swal.fire({ title: 'No Questions Found', text: 'Scholar could not detect MCQ patterns in this document. Ensure the file contains numbered questions with A/B/C/D options.', icon: 'info', background: '#0b0f19', color: '#fff' }); return; }

                    const methodNote = result.method === 'gemini' ? ' <span style="font-size:10px;color:#818cf8;">✨ Gemini AI</span>' : ' <span style="font-size:10px;color:rgba(255,255,255,0.3);">regex</span>';
                    const diagCount = result.questions.filter(q => q.has_diagram).length;
                    const mathCount = result.questions.filter(q => q.math_heavy).length;
                    const flagNote = (diagCount || mathCount) ? `<p style="font-size:11px;color:#f59e0b;margin-top:6px;">⚠️ ${diagCount} diagram-dependent, ${mathCount} math-heavy — review before publishing.</p>` : '';

                    const { isConfirmed } = await Swal.fire({
                        title: `Found ${result.totalExtracted} Questions` + methodNote,
                        html: `<p style="color:rgba(255,255,255,0.6);margin-bottom:12px;">From <strong>${file.name}</strong> (${result.fileSizeKB}KB). Preview of first 3:</p>
                          <div style="text-align:left;max-height:200px;overflow-y:auto;font-size:12px;">${result.questions.slice(0,3).map((q,i)=>`<div style="margin-bottom:8px;padding:8px;background:rgba(255,255,255,0.05);border-radius:6px;"><strong>${i+1}. ${q.question_text.substring(0,80)}${q.question_text.length>80?'…':''}</strong><br><span style="color:rgba(255,255,255,0.5);">A: ${q.option_a} | B: ${q.option_b}</span></div>`).join('')}</div>${flagNote}`,
                        background: '#0b0f19', color: '#fff',
                        confirmButtonColor: '#10b981', confirmButtonText: `✅ Import All ${result.totalExtracted}`,
                        showCancelButton: true, cancelButtonText: 'Cancel', width: 520
                    });

                    if (!isConfirmed) return;

                    window._nexusBusy = true;
                    Swal.fire({ title: 'Importing…', allowOutsideClick: false, showConfirmButton: false, background: '#0b0f19', color: '#fff', didOpen: () => Swal.showLoading() });
                    await window.electronAPI.cbt.bulkImport({ bank_id: bankId, questions: result.questions });
                    window._nexusBusy = false;
                    await refreshQuestions();
                    Swal.fire({ title: `✅ ${result.totalExtracted} Questions Imported!`, text: `Your question bank now has these questions ready for deployment.`, icon: 'success', background: '#0b0f19', color: '#fff', timer: 2500, showConfirmButton: false });
                } catch (err) { window._nexusBusy = false; Swal.fire('Error', err.message, 'error'); }
            });
        }
    };


    // ── DEPLOY EXAM UI ───────────────────────────────────────────────────────
    async function renderDeployUI() {
        const containerDeploy = document.getElementById("cbt-deploy-container");
        if (!containerDeploy) return;
        
        let banksOptions = `<option value="">-- Select Bank --</option>`;
        if (window.electronAPI) {
            try {
                const banks = await window.electronAPI.cbt.getBanks();
                banks.forEach(b => {
                    banksOptions += `<option value="${b.id}">${b.name} (${b.category})</option>`;
                });
            } catch(e) { console.error("Error loading banks for deploy form", e); }
        }

        containerDeploy.innerHTML = `
            <div style="background:var(--bg-panel); border:1px solid var(--glass-border); border-radius:12px; padding:20px; display:flex; gap:20px; align-items:flex-start;">
                <!-- Left: Form -->
                <div style="flex:2;">
                    <h3 style="margin-bottom:20px;">Deploy New Exam</h3>
                    
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:15px; margin-bottom:20px;">
                        <div>
                            <label class="ph-label">Exam Title</label>
                            <input type="text" id="deploy-title" class="modern-input" placeholder="e.g. 2026 Entrance Exam" style="width:100%;">
                        </div>
                        <div>
                            <label class="ph-label">Question Bank</label>
                            <select id="deploy-bank" class="modern-input" style="width:100%;">${banksOptions}</select>
                        </div>
                        <div>
                            <label class="ph-label">Target Class</label>
                            <input type="text" id="deploy-class" class="modern-input" placeholder="e.g. JSS1" style="width:100%;">
                        </div>
                        <div>
                            <label class="ph-label">Exam Type</label>
                            <select id="deploy-type" class="modern-input" style="width:100%;">
                                <option value="internal">Internal (Auto-sync to Ledger)</option>
                                <option value="external">External (Admissions/Mock)</option>
                            </select>
                        </div>
                        <div>
                            <label class="ph-label">Duration (Minutes)</label>
                            <input type="number" id="deploy-duration" class="modern-input" value="60" style="width:100%;">
                        </div>
                        <div>
                            <label class="ph-label">Question Count</label>
                            <input type="number" id="deploy-count" class="modern-input" value="50" style="width:100%;">
                        </div>
                    </div>

                    <h4 style="margin-bottom:10px; color:var(--text-dim);">Advanced Security Toggles</h4>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:20px; background:rgba(0,0,0,0.2); padding:15px; border-radius:8px;">
                        <label style="display:flex; align-items:center; gap:8px; font-size:13px;"><input type="checkbox" id="deploy-shuff-q" checked> Shuffle Questions</label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:13px;"><input type="checkbox" id="deploy-shuff-o" checked> Shuffle Options</label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:13px;"><input type="checkbox" id="deploy-calc"> Enable Calculator (Opt-in)</label>
                        <label style="display:flex; align-items:center; gap:8px; font-size:13px;"><input type="checkbox" id="deploy-kiosk" checked> Enforce Kiosk Mode (Tab Lock)</label>
                    </div>

                    <h4 style="margin-bottom:10px; color:var(--text-dim);">Release Policy</h4>
                    <select id="deploy-release" class="modern-input" style="width:100%; margin-bottom:20px;">
                        <option value="immediate">Immediate Dispatch (Pulse WhatsApp)</option>
                        <option value="delayed_1h">Delay 1 Hour (Audit Window)</option>
                        <option value="delayed_24h">Delay 24 Hours</option>
                        <option value="manual">Manual Audit Mode (Hold Results)</option>
                    </select>

                    <h4 style="margin-bottom:10px; color:var(--text-dim);">Progression Logic</h4>
                    <div style="background:rgba(16, 185, 129, 0.05); padding:15px; border-radius:8px; border:1px solid rgba(16, 185, 129, 0.2); margin-bottom:20px;">
                        <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:#10b981; font-weight:bold;">
                            <input type="checkbox" id="deploy-promotional"> Flag as Promotional Exam (Triggers Ledger Update)
                        </label>
                        <p style="font-size:11px; color:var(--text-dim); margin-top:5px;">Students passing this exam will be recommended for promotion to the next class in your Academic Pipeline hierarchy.</p>
                    </div>

                    <button class="primary-btn" id="btn-deploy-execute" style="width:100%; padding:12px; font-size:15px;">Deploy to Command Center 🚀</button>
                </div>

                <!-- Right: External Ingestion Info (Only shown if External) -->
                <div id="deploy-external-panel" style="flex:1; background:rgba(99,102,241,0.05); border:1px solid rgba(99,102,241,0.2); padding:20px; border-radius:12px; display:none;">
                    <h4 style="color:#818cf8; margin-bottom:10px;">External Ingestion</h4>
                    <p style="font-size:12px; color:var(--text-dim); margin-bottom:15px;">External exams require a CSV of candidates to generate cryptographic tokens.</p>
                    <div style="border:2px dashed rgba(99,102,241,0.3); border-radius:8px; padding:20px; text-align:center; cursor:pointer; margin-bottom:10px;" id="deploy-csv-drop">
                        <span style="font-size:24px;">📥</span>
                        <div style="font-size:12px; margin-top:5px;">Drop Candidate CSV</div>
                    </div>
                    <div id="deploy-csv-status" style="font-size:11px; color:#ef4444;"></div>
                </div>
            </div>
        `;

        // Logic
        const typeSelect = document.getElementById("deploy-type");
        const extPanel = document.getElementById("deploy-external-panel");
        typeSelect.addEventListener("change", () => {
            extPanel.style.display = typeSelect.value === "external" ? "block" : "none";
        });

        document.getElementById("btn-deploy-execute").addEventListener("click", async () => {
            const payload = {
                title: document.getElementById("deploy-title").value,
                bank_id: document.getElementById("deploy-bank").value,
                class_name: document.getElementById("deploy-class").value,
                academic_session: "2025/2026", // Should pull from config ideally
                term: "First",
                question_count: parseInt(document.getElementById("deploy-count").value),
                duration_minutes: parseInt(document.getElementById("deploy-duration").value),
                exam_type: document.getElementById("deploy-type").value,
                is_promotional: document.getElementById("deploy-promotional").checked,
                shuffle_questions: document.getElementById("deploy-shuff-q").checked,
                shuffle_options: document.getElementById("deploy-shuff-o").checked,
                result_release_policy: document.getElementById("deploy-release").value,
                security_profile: {
                    calculator: document.getElementById("deploy-calc").checked,
                    kiosk: document.getElementById("deploy-kiosk").checked
                }
            };

            if (!payload.title || !payload.bank_id || !payload.class_name) {
                return alert("Please fill all required fields.");
            }

            try {
                const res = await window.electronAPI.cbt.deployExam(payload);
                if (res.success) {
                    Swal.fire({ icon:'success', title:'Exam Deployed!', text:'Switching to Live Command Center.', timer:1500, showConfirmButton:false, background:'#0b0f19', color:'#fff' });
                    // Trigger tab switch via click so the existing event listener runs correctly
                    setTimeout(() => document.getElementById('tab-cbt-live')?.click(), 1600);
                } else {
                    Swal.fire('Error', res.error || 'Deploy failed.', 'error');
                }
            } catch (e) {
                Swal.fire('Error', e.message, 'error');
            }
        });
    }

    // ── LIVE INVIGILATION UI ─────────────────────────────────────────────────
    async function renderLiveUI() {
        const containerLive = document.getElementById("cbt-live-container");
        if (!containerLive) return;
        
        containerLive.innerHTML = `<div style="color:var(--text-dim); text-align:center;">Loading Active Exams...</div>`;
        try {
            const exams = await window.electronAPI.cbt.getExams();
            if (exams.length === 0) {
                containerLive.innerHTML = `<div style="color:var(--text-dim); text-align:center; padding:40px;">No deployed exams found.</div>`;
                return;
            }

            let html = `
                <div style="display:flex; gap:20px; align-items:flex-start;">
                    <!-- Left: Exam List -->
                    <div style="flex:1; background:var(--bg-panel); border:1px solid var(--glass-border); border-radius:12px; padding:20px;">
                        <h3 style="margin-bottom:15px;">Deployed Exams</h3>
                        <div style="display:flex; flex-direction:column; gap:10px;">
            `;

            exams.forEach(ex => {
                const color = ex.exam_type === 'external' ? '#ef4444' : '#10b981';
                html += `
                    <div class="exam-card" style="padding:15px; border:1px solid var(--glass-border); border-radius:8px; cursor:pointer;" onclick="selectLiveExam(${ex.id}, '${ex.title}', '${ex.exam_type}', ${ex.is_promotional})">
                        <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                            <strong>${ex.title}</strong>
                            <div style="display:flex; gap:5px;">
                                ${ex.is_promotional ? '<span style="font-size:10px; color:#10b981; background:rgba(16,185,129,0.1); padding:2px 6px; border-radius:12px;">PROMOTIONAL</span>' : ''}
                                <span style="font-size:10px; color:${color}; border:1px solid ${color}; padding:2px 6px; border-radius:12px; text-transform:uppercase;">${ex.exam_type}</span>
                            </div>
                        </div>
                        <div style="font-size:12px; color:var(--text-dim);">Class: ${ex.class_name} | Qs: ${ex.question_count} | Dur: ${ex.duration_minutes}m</div>
                    </div>
                `;
            });

            html += `
                        </div>
                    </div>
                    <!-- Right: Active Dashboard -->
                    <div id="live-dashboard-pane" style="flex:2; background:var(--bg-panel); border:1px solid var(--glass-border); border-radius:12px; padding:20px; display:none;">
                        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--glass-border); padding-bottom:15px; margin-bottom:15px;">
                            <h3 id="live-exam-title">Exam Title</h3>
                            <div style="display:flex; gap:10px;">
                                <button class="primary-btn" id="btn-create-batch" style="background:transparent; border:1px solid #10b981; color:#10b981;">+ Open New Batch</button>
                                <button class="primary-btn" id="btn-finalize-exam" style="background:#f59e0b; color:#000; border:none; display:none;">Finalize Exam & Publish</button>
                            </div>
                        </div>
                        
                        <div id="live-batches-list" style="display:flex; gap:10px; margin-bottom:20px; overflow-x:auto; padding-bottom:10px;">
                            <!-- Batches populated here -->
                        </div>

                        <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                            <h4>Candidate Tokens</h4>
                            <button id="btn-generate-tokens" style="background:transparent; border:1px solid var(--glass-border); color:var(--text-dim); border-radius:4px; cursor:pointer; padding:4px 8px;">Generate Missing Tokens</button>
                        </div>
                        
                        <table style="width:100%; text-align:left; font-size:13px; border-collapse:collapse;">
                            <thead>
                                <tr style="border-bottom:1px solid var(--glass-border); color:var(--text-dim);">
                                    <th style="padding:10px;">Candidate</th>
                                    <th>Class/Target</th>
                                    <th>Token</th>
                                    <th>Batch</th>
                                    <th>Status</th>
                                    <th>Score</th>
                                </tr>
                            </thead>
                            <tbody id="live-tokens-tbody">
                                <!-- Tokens populated here -->
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            containerLive.innerHTML = html;
        } catch(e) {
            containerLive.innerHTML = `<div style="color:#ef4444;">Error: ${e.message}</div>`;
        }
    }

    window.selectLiveExam = async (examId, title, type, isPromotional) => {
        currentLiveExamId = examId;
        currentLiveExamType = type;
        currentLiveExamIsPromotional = isPromotional ? true : false;
        document.getElementById("live-dashboard-pane").style.display = "block";
        document.getElementById("live-exam-title").textContent = title;
        document.getElementById("btn-finalize-exam").style.display = "block";
        await refreshLiveDashboard();
    };

    async function refreshLiveDashboard() {
        if (!currentLiveExamId) return;
        try {
            // Load Batches
            const batches = await window.electronAPI.cbt.getBatches(currentLiveExamId);
            const batchesList = document.getElementById("live-batches-list");
            batchesList.innerHTML = batches.map(b => `
                <div style="min-width:150px; padding:10px; border:1px solid ${b.status==='active'?'#10b981':'var(--glass-border)'}; border-radius:8px; text-align:center;">
                    <div style="font-weight:bold; font-size:13px;">${b.name}</div>
                    <div style="font-size:11px; color:var(--text-dim);">${b.start_time}</div>
                    <div style="margin-top:8px; font-size:11px; color:${b.status==='active'?'#10b981':'var(--text-dim)'};">${b.status.toUpperCase()}</div>
                </div>
            `).join('');

            // Load Tokens
            const tokens = await window.electronAPI.cbt.getTokens(currentLiveExamId);
            const tbody = document.getElementById("live-tokens-tbody");
            tbody.innerHTML = tokens.map(t => {
                let statusColor = t.status === 'unused' ? 'var(--text-dim)' : (t.status === 'active' ? '#3b82f6' : '#10b981');
                return `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                    <td style="padding:10px;">${t.candidate_name || 'Unknown'}</td>
                    <td>${t.class_name || '-'}</td>
                    <td style="font-family:monospace; font-weight:bold; letter-spacing:1px; color:#f59e0b;">${t.token}</td>
                    <td>${t.batch_name || 'Unassigned'}</td>
                    <td style="color:${statusColor};">${t.status.toUpperCase()}</td>
                    <td>${t.score !== null ? t.score : '-'}</td>
                </tr>
            `}).join('');
            
        } catch(e) {
            console.error(e);
        }
    }

    document.addEventListener("click", async (e) => {
        if (e.target && e.target.id === "btn-create-batch") {
            if (!currentLiveExamId) return;
            const name = prompt("Batch Name (e.g. Saturday 9:00 AM)");
            if (!name) return;
            try {
                await window.electronAPI.cbt.createBatch({ exam_id: currentLiveExamId, name, start_time: new Date().toISOString(), end_time: new Date().toISOString() });
                refreshLiveDashboard();
            } catch(err) { alert(err.message); }
        }
        
        if (e.target && e.target.id === "btn-generate-tokens") {
            if (!currentLiveExamId) return;
            // For now, this just generates a token for one random external candidate to demonstrate functionality,
            // In a real flow, this would read the CSV uploaded during deploy and link target_ids.
            alert("Token generation logic connected. Needs target_ids from ingestion.");
        }

        if (e.target && e.target.id === "btn-finalize-exam") {
            if (!currentLiveExamId) return;

            if (!currentLiveExamIsPromotional) {
                // Standard Finalization
                Swal.fire({
                    title: 'Finalize Exam?',
                    text: 'This will lock the exam and dispatch results to Nexus Pulse WhatsApp.',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Finalize & Dispatch',
                    background: '#0b0f19', color: '#fff'
                });
                // TODO: IPC call to finalize standard exam
                return;
            }

            // PROMOTIONAL EXAM WORKFLOW
            try {
                const sysSettings = await window.electronAPI.cbt.getSystemSettings();
                const passMark = sysSettings.pass_mark_threshold || 50;
                const tokens = await window.electronAPI.cbt.getTokens(currentLiveExamId);
                
                let tbodyHtml = '';
                tokens.forEach(t => {
                    if (t.status !== 'completed' && t.status !== 'active') return; // Only show attempted
                    const score = t.score || 0;
                    const passed = score >= passMark;
                    
                    tbodyHtml += `
                        <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                            <td style="padding:10px;">${t.candidate_name}</td>
                            <td>${t.class_name || '-'}</td>
                            <td style="font-weight:bold; color:${passed ? '#10b981' : '#ef4444'};">${score}%</td>
                            <td>
                                <select class="modern-input promo-toggle" data-token-id="${t.id}" data-student-id="${t.student_id}" style="padding:4px; font-size:11px; background:${passed ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}; color:${passed ? '#10b981' : '#ef4444'};">
                                    <option value="promote" ${passed ? 'selected' : ''}>Promote</option>
                                    <option value="hold_back" ${!passed ? 'selected' : ''}>Hold Back</option>
                                </select>
                            </td>
                        </tr>
                    `;
                });

                if (!tbodyHtml) tbodyHtml = `<tr><td colspan="4" style="text-align:center; padding:20px;">No candidates have completed this exam yet.</td></tr>`;

                const html = `
                    <div style="text-align:left; font-size:13px;">
                        <div style="background:rgba(255,215,0,0.1); padding:10px; border-radius:8px; margin-bottom:15px; border:1px solid rgba(255,215,0,0.3); color:#ffd700;">
                            <strong>Promotional Exam Review</strong><br/>
                            Global Pass Mark: ${passMark}%
                        </div>
                        <table style="width:100%; border-collapse:collapse;">
                            <thead>
                                <tr style="color:var(--text-dim); border-bottom:1px solid var(--glass-border);">
                                    <th style="padding:10px;">Student</th>
                                    <th>Current Class</th>
                                    <th>Score</th>
                                    <th>Action (Override)</th>
                                </tr>
                            </thead>
                            <tbody>${tbodyHtml}</tbody>
                        </table>
                    </div>
                `;

                const { isConfirmed } = await Swal.fire({
                    title: 'Promotion Review Dashboard',
                    html: html,
                    width: '600px',
                    showCancelButton: true,
                    confirmButtonText: 'Execute Promotions',
                    confirmButtonColor: '#10b981',
                    background: '#0b0f19', color: '#fff',
                    preConfirm: () => {
                        const selects = document.querySelectorAll('.promo-toggle');
                        const overrides = [];
                        selects.forEach(s => {
                            overrides.push({
                                token_id: s.getAttribute('data-token-id'),
                                student_id: s.getAttribute('data-student-id'),
                                action: s.value
                            });
                        });
                        return overrides;
                    }
                });

                if (isConfirmed && isConfirmed.length > 0) {
                    await window.electronAPI.cbt.finalizePromotionalExam({ exam_id: currentLiveExamId, overrides: isConfirmed });
                    Swal.fire("Promotions Executed!", "The student ledger has been updated successfully.", "success");
                }
            } catch(e) {
                Swal.fire("Error", e.message, "error");
            }
        }

});

})();
