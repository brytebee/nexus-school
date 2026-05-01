"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const uploadZone = document.getElementById("scholar-upload-zone");
    const fileInput = document.getElementById("scholar-file-input");
    const statsDiv = document.getElementById("scholar-stats");
    const queryInput = document.getElementById("scholar-query-input");
    const searchBtn = document.getElementById("btn-scholar-search");
    const resultsDiv = document.getElementById("scholar-results");

    async function loadStats() {
        if (!window.electronAPI) return;
        try {
            const stats = await window.electronAPI.invoke("scholar:get-stats");
            statsDiv.innerHTML = `
                <div style="margin-top:10px;">
                    <strong>Documents Indexed:</strong> ${stats.documentCount || 0}<br>
                    <strong>Paragraphs in Memory:</strong> ${stats.chunkCount || 0}<br>
                    <strong>Vocabulary Size:</strong> ${stats.vocabSize || 0}
                </div>
            `;
        } catch (e) {
            console.error('[Scholar] Failed to load stats:', e);
        }
    }

    if (uploadZone && fileInput) {
        uploadZone.addEventListener("click", () => fileInput.click());
        uploadZone.addEventListener("dragover", (e) => {
            e.preventDefault();
            uploadZone.style.borderColor = "var(--accent)";
        });
        uploadZone.addEventListener("dragleave", () => {
            uploadZone.style.borderColor = "var(--glass-border)";
        });
        uploadZone.addEventListener("drop", (e) => {
            e.preventDefault();
            uploadZone.style.borderColor = "var(--glass-border)";
            if (e.dataTransfer.files.length > 0) {
                handleFile(e.dataTransfer.files[0]);
            }
        });
        fileInput.addEventListener("change", (e) => {
            if (e.target.files.length > 0) handleFile(e.target.files[0]);
        });
    }

    async function handleFile(file) {
        if (!window.electronAPI) return;
        uploadZone.innerHTML = `<div style="padding:20px;">Processing ${file.name}...<br><small>Extracting text and building vector index</small></div>`;
        
        try {
            const buffer = await file.arrayBuffer();
            const res = await window.electronAPI.invoke("scholar:upload", { fileData: buffer, fileName: file.name });
            
            if (res.ok) {
                uploadZone.innerHTML = `
                    <div style="font-size:32px;margin-bottom:10px;color:#4CAF50;">✅</div>
                    <div>${file.name} successfully indexed.</div>
                `;
                setTimeout(() => {
                    uploadZone.innerHTML = `
                        <div style="font-size:32px;margin-bottom:10px;">📄</div>
                        <div>Drag & Drop PDF/DOCX or click to browse</div>
                    `;
                }, 3000);
                loadStats();
            } else {
                uploadZone.innerHTML = `<div style="color:#ff4444;">Error: ${res.error}</div>`;
            }
        } catch (err) {
            console.error('[Scholar] Upload failed:', err);
            uploadZone.innerHTML = `<div style="color:#ff4444;">Error reading file: ${err.message}</div>`;
        }
    }

    const performSearch = async () => {
        if (!window.electronAPI) return;
        const q = queryInput.value.trim();
        if (!q) return;

        resultsDiv.innerHTML = "Searching...";
        const res = await window.electronAPI.invoke("scholar:query", q);
        if (res.ok) {
            if (res.results.length === 0) {
                resultsDiv.innerHTML = "<div style='color:var(--text-dim);'>No relevant information found in the knowledge base.</div>";
            } else {
                let html = '';
                if (res.answer) {
                    html += `
                        <div style="background:rgba(0, 229, 255, 0.1); border:1px solid rgba(0, 229, 255, 0.2); padding:20px; border-radius:12px; margin-bottom:20px;">
                            <div style="font-size:12px; font-weight:700; color:#00e5ff; margin-bottom:8px; text-transform:uppercase; letter-spacing:1px;">✨ AI Synthesis</div>
                            <div style="font-size:14px; line-height:1.6; color:#fff;">${res.answer.replace(/\\n/g, '<br>')}</div>
                        </div>
                    `;
                } else {
                    html += `<div style="font-size:12px; color:var(--text-dim); margin-bottom:10px;">Provide a Gemini API Key in Settings for AI answers. Showing raw sources:</div>`;
                }

                html += res.results.map(r => `
                    <div style="background:rgba(255,255,255,0.05);padding:15px;border-radius:8px;margin-bottom:10px;border-left:3px solid var(--accent);">
                        <div style="font-size:11px;color:var(--accent);margin-bottom:5px;">SOURCE: ${r.docName} (Score: ${r.score.toFixed(2)})</div>
                        <div style="font-size:13px;line-height:1.5;color:var(--text-dim);">${r.text}</div>
                    </div>
                `).join('');
                
                resultsDiv.innerHTML = html;
            }
        } else {
            resultsDiv.innerHTML = `<div style="color:#ff4444;">Error: ${res.error}</div>`;
        }
    };

    if (searchBtn) searchBtn.addEventListener("click", performSearch);
    if (queryInput) {
        queryInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") performSearch();
        });
    }

    // Save Gemini API Key
    const saveKeyBtn = document.getElementById("btn-scholar-apikey-save");
    if (saveKeyBtn) {
        saveKeyBtn.addEventListener("click", async () => {
            const key = document.getElementById("gemini-api-key-input")?.value?.trim();
            if (key === undefined) return;
            await window.electronAPI.invoke("app-settings:set", { key: "gemini_api_key", value: key });
            saveKeyBtn.textContent = "✅ Saved!";
            setTimeout(() => { saveKeyBtn.textContent = "Save Key"; }, 1500);
        });
    }

    // Export so nav.js can call it
    window.scholarInit = async () => {
        await loadStats();
        // Restore saved API key into the panel input
        if (window.electronAPI) {
            const row = await window.electronAPI.invoke("app-settings:get", "gemini_api_key");
            const input = document.getElementById("gemini-api-key-input");
            if (input && row) input.value = row;
        }
    };
});
