import re, pathlib

src = pathlib.Path("portal.html").read_text()

# ── 1. Inject sidebar CSS before </style> ─────────────────────────────────────
SIDEBAR_CSS = """
        .portal-header{position:fixed;top:0;left:0;right:0;z-index:100;height:60px;display:flex;align-items:center;justify-content:space-between;padding:0 18px;background:rgba(11,15,25,.92);backdrop-filter:blur(20px);border-bottom:1px solid rgba(255,255,255,.07);}
        .hdr-left{display:flex;align-items:center;gap:10px;}
        .hdr-logo{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,var(--primary),var(--secondary));display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;flex-shrink:0;}
        .hdr-name{font-size:14px;font-weight:800;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .hdr-class{font-size:11px;color:var(--secondary);font-weight:700;letter-spacing:.5px;}
        .hamburger{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:12px;width:40px;height:40px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;color:#fff;flex-shrink:0;transition:background .2s;}
        .hamburger:active{background:rgba(255,255,255,.15);}
        #sb-backdrop{display:none;position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:200;backdrop-filter:blur(4px);}
        #sidebar{position:fixed;top:0;right:0;bottom:0;width:72vw;max-width:280px;background:rgba(16,22,38,.97);border-left:1px solid rgba(255,255,255,.1);z-index:201;transform:translateX(100%);transition:transform .35s cubic-bezier(.16,1,.3,1);padding:0;display:flex;flex-direction:column;}
        #sidebar.open{transform:translateX(0);}
        .sb-top{padding:24px 20px 16px;border-bottom:1px solid rgba(255,255,255,.07);}
        .sb-school{font-size:16px;font-weight:800;margin-bottom:2px;}
        .sb-sub{font-size:11px;color:var(--text-dim);font-weight:600;letter-spacing:.5px;}
        .sb-close{position:absolute;top:18px;right:16px;background:rgba(255,255,255,.08);border:none;color:#fff;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:16px;}
        .nav-items{padding:12px 12px;flex:1;overflow-y:auto;}
        .nav-item{display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:14px;cursor:pointer;transition:background .2s;font-weight:600;font-size:15px;color:rgba(255,255,255,.7);margin-bottom:4px;}
        .nav-item:active,.nav-item.active{background:rgba(255,255,255,.1);color:#fff;}
        .nav-item .ni{font-size:20px;width:28px;text-align:center;}
        .sb-logout{margin:12px;padding:14px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:transparent;color:rgba(255,255,255,.5);font-size:14px;font-weight:600;cursor:pointer;width:calc(100% - 24px);}
        #dash-main{padding-top:72px;min-height:100vh;}
        .section{display:none;padding:20px 18px 40px;animation:slideUp .4s cubic-bezier(.16,1,.3,1);}
        .section.active{display:block;}
        .sec-title{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:var(--text-dim);margin-bottom:16px;}
        .news-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:20px;padding:18px 20px;margin-bottom:12px;cursor:pointer;transition:background .2s;}
        .news-card:active{background:rgba(255,255,255,.08);}
        .news-tag{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--secondary);margin-bottom:6px;}
        .news-title{font-size:16px;font-weight:700;line-height:1.4;margin-bottom:6px;}
        .news-date{font-size:12px;color:var(--text-dim);}
        .news-body{display:none;margin-top:14px;font-size:14px;color:rgba(255,255,255,.8);line-height:1.7;border-top:1px solid rgba(255,255,255,.07);padding-top:14px;}
        .news-body h2{font-size:15px;font-weight:800;margin:12px 0 6px;}
        .news-body h3{font-size:13px;font-weight:700;margin:10px 0 4px;color:var(--secondary);}
        .news-body p{margin-bottom:8px;}
        .news-body strong{color:#fff;font-weight:700;}
        .news-body table{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0;}
        .news-body td,.news-body th{padding:8px 10px;border:1px solid rgba(255,255,255,.1);text-align:left;}
        .news-body th{background:rgba(255,255,255,.05);font-weight:700;}
        .policy-item{border:1px solid rgba(255,255,255,.08);border-radius:16px;margin-bottom:10px;overflow:hidden;}
        .policy-hdr{padding:16px 18px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:15px;background:rgba(255,255,255,.03);}
        .policy-hdr:active{background:rgba(255,255,255,.07);}
        .policy-arrow{transition:transform .3s;color:var(--secondary);font-size:12px;}
        .policy-item.open .policy-arrow{transform:rotate(180deg);}
        .policy-body{display:none;padding:16px 18px;font-size:13px;color:rgba(255,255,255,.8);line-height:1.7;border-top:1px solid rgba(255,255,255,.08);}
        .policy-item.open .policy-body{display:block;}
        .policy-body h2{font-size:14px;font-weight:800;margin:10px 0 4px;}
        .policy-body h3{font-size:13px;font-weight:700;margin:8px 0 4px;color:var(--secondary);}
        .policy-body p{margin-bottom:8px;}
        .policy-body table{width:100%;border-collapse:collapse;font-size:12px;margin:8px 0;}
        .policy-body td,.policy-body th{padding:7px 9px;border:1px solid rgba(255,255,255,.1);}
        .policy-body th{background:rgba(255,255,255,.05);font-weight:700;}
        .policy-body strong{color:#fff;}
        .att-ring-wrap{display:flex;flex-direction:column;align-items:center;padding:24px 0 12px;}
        .att-pct{font-size:52px;font-weight:900;letter-spacing:-2px;color:var(--secondary);}
        .att-lbl{font-size:12px;color:var(--text-dim);font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-top:4px;}
        .att-bar{height:8px;background:rgba(255,255,255,.08);border-radius:8px;margin:16px 0;overflow:hidden;}
        .att-fill{height:100%;border-radius:8px;background:linear-gradient(90deg,var(--primary),var(--secondary));transition:width .6s ease;}
        .fee-row{display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:14px;}
        .fee-row:last-child{border:none;font-weight:800;font-size:16px;padding-top:16px;}
        .fee-lbl{color:rgba(255,255,255,.75);}
        .fee-amt{font-weight:700;color:#fff;}
        .bal-badge{text-align:center;padding:20px;border-radius:20px;margin-bottom:20px;}
        .bal-badge.ok{background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.3);}
        .bal-badge.due{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);}
        .bal-val{font-size:36px;font-weight:900;letter-spacing:-1px;}
        .bal-sub{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-top:4px;opacity:.7;}
"""
src = src.replace("    </style>", SIDEBAR_CSS + "    </style>", 1)

# ── 2. Replace dashboard view ─────────────────────────────────────────────────
OLD_DASH = """        <!-- VIEW 4: DASHBOARD -->
        <div id="view-dashboard" class="view">
            <div class="card" style="padding: 32px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px;">
                    <div>
                        <div id="dash-child-class" style="font-size: 12px; color: var(--secondary); font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;">CLASS NAME</div>
                        <h2 id="dash-child-name" style="margin-bottom: 0; font-size: 22px;">Student Name</h2>
                    </div>
                    <button id="btn-logout" style="width: auto; padding: 10px 16px; font-size: 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; box-shadow: none;">Switch</button>
                </div>

                <div class="stat-grid">
                    <div class="stat-item">
                        <div class="stat-val" id="stat-attendance">0%</div>
                        <div class="stat-lab">Attendance</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-val" id="stat-fees">₦0</div>
                        <div class="stat-lab">Balance</div>
                    </div>
                </div>

                <div style="margin-top: 36px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px;">
                        <span style="font-size: 13px; font-weight: 800; color: #fff; text-transform: uppercase; letter-spacing: 1px;">Academic Results</span>
                        <span style="font-size: 12px; color: var(--secondary); font-weight: 600;" id="dash-term">Term Name</span>
                    </div>
                    <div id="results-list" style="background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05); border-radius: 20px; padding: 8px 24px;">
                        <!-- Results injected here -->
                    </div>
                </div>
            </div>
        </div>"""

NEW_DASH = """        <!-- VIEW 4: DASHBOARD (hamburger sidebar) -->
        <div id="view-dashboard" class="view">
            <div class="portal-header">
                <div class="hdr-left">
                    <div class="hdr-logo" id="hdr-logo-abbr">NX</div>
                    <div>
                        <div class="hdr-name" id="dash-child-name">Student Name</div>
                        <div class="hdr-class" id="dash-child-class">CLASS</div>
                    </div>
                </div>
                <button class="hamburger" onclick="openSidebar()">☰</button>
            </div>

            <div id="sb-backdrop" onclick="closeSidebar()"></div>
            <nav id="sidebar">
                <div class="sb-top">
                    <div class="sb-school" id="sb-school-name">Nexus School</div>
                    <div class="sb-sub" id="dash-term">FIRST TERM</div>
                </div>
                <button class="sb-close" onclick="closeSidebar()">✕</button>
                <div class="nav-items">
                    <div class="nav-item active" id="ni-results" onclick="showSection('results')"><span class="ni">🎓</span>Results</div>
                    <div class="nav-item" id="ni-fees"    onclick="showSection('fees')">   <span class="ni">💰</span>Fees</div>
                    <div class="nav-item" id="ni-attend"  onclick="showSection('attendance')"><span class="ni">📅</span>Attendance</div>
                    <div class="nav-item" id="ni-news"    onclick="showSection('news')">   <span class="ni">📢</span>News</div>
                    <div class="nav-item" id="ni-policy"  onclick="showSection('policies')"><span class="ni">📋</span>Policies</div>
                </div>
                <button class="sb-logout" id="btn-logout">Switch Student</button>
            </nav>

            <div id="dash-main">
                <div id="sec-results" class="section active">
                    <div class="sec-title">Academic Results</div>
                    <div id="results-list" style="background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.05);border-radius:20px;padding:8px 20px;"></div>
                </div>
                <div id="sec-fees" class="section">
                    <div class="sec-title">Fees & Payments</div>
                    <div id="fees-content"></div>
                </div>
                <div id="sec-attendance" class="section">
                    <div class="sec-title">Attendance</div>
                    <div id="attendance-content"></div>
                </div>
                <div id="sec-news" class="section">
                    <div class="sec-title">School News</div>
                    <div id="news-list"></div>
                </div>
                <div id="sec-policies" class="section">
                    <div class="sec-title">School Policies</div>
                    <div id="policies-list"></div>
                </div>
            </div>
        </div>"""

src = src.replace(OLD_DASH, NEW_DASH, 1)

# ── 3. Inject new JS before the boot sequence comment ────────────────────────
NEW_JS = """
        // ── Sidebar ───────────────────────────────────────────────────────────
        function openSidebar()  { document.getElementById('sidebar').classList.add('open'); document.getElementById('sb-backdrop').style.display='block'; }
        function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sb-backdrop').style.display='none'; }

        let _curSection = 'results';
        function showSection(name) {
            closeSidebar();
            ['results','fees','attendance','news','policies'].forEach(s => {
                document.getElementById('sec-'+s).classList.toggle('active', s===name);
                const ni = document.getElementById('ni-'+({'results':'results','fees':'fees','attendance':'attend','news':'news','policies':'policy'}[s]));
                if(ni) ni.classList.toggle('active', s===name);
            });
            _curSection = name;
            if(name==='news' && !_newsLoaded) loadNews();
            if(name==='policies' && !_polLoaded) loadPolicies();
        }

        // ── Markdown lite renderer ────────────────────────────────────────────
        function mdToHtml(t) {
            return t
                .replace(/^## (.+)$/mg,'<h2>$1</h2>')
                .replace(/^### (.+)$/mg,'<h3>$1</h3>')
                .replace(/\\*\\*(.+?)\\*\\*/g,'<strong>$1</strong>')
                .replace(/^\\| (.+) \\|$/mg, row => '<tr>' + row.split('|').filter((_,i,a)=>i>0&&i<a.length-1).map(c=>'<td>'+c.trim()+'</td>').join('') + '</tr>')
                .replace(/(<tr>.*<\\/tr>\\n?)+/g, m => '<table>' + m.replace(/<td>[-: ]+<\\/td>/g,'') + '</table>')
                .replace(/^(?!<[htu]).+$/mg,'<p>$&</p>')
                .replace(/<p><\\/p>/g,'');
        }

        // ── News ─────────────────────────────────────────────────────────────
        let _newsLoaded = false;
        async function loadNews() {
            const el = document.getElementById('news-list');
            el.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:20px">Loading…</p>';
            try {
                const d = await api('/portal/api/news');
                if(!d.ok || !d.news.length) { el.innerHTML='<p style="text-align:center;color:var(--text-dim);padding:20px">No news yet.</p>'; return; }
                el.innerHTML = d.news.map(n => {
                    const cats = {pta:'PTA',infrastructure:'Infrastructure',fees:'Fees',general:'Notice'};
                    const dt   = new Date(n.created_at).toLocaleDateString('en-NG',{day:'numeric',month:'long',year:'numeric'});
                    return `<div class="news-card" onclick="toggleNews(this)">
                        <div class="news-tag">${cats[n.category]||n.category}</div>
                        <div class="news-title">${n.title}</div>
                        <div class="news-date">${dt}</div>
                        <div class="news-body">${mdToHtml(n.body)}</div>
                    </div>`;
                }).join('');
                _newsLoaded = true;
            } catch(e){ el.innerHTML='<p style="color:var(--danger);text-align:center;padding:20px">Could not load news.</p>'; }
        }
        function toggleNews(card) {
            const body = card.querySelector('.news-body');
            body.style.display = body.style.display==='block'?'none':'block';
        }

        // ── Policies ─────────────────────────────────────────────────────────
        let _polLoaded = false;
        async function loadPolicies() {
            const el = document.getElementById('policies-list');
            el.innerHTML = '<p style="color:var(--text-dim);text-align:center;padding:20px">Loading…</p>';
            try {
                const d = await api('/portal/api/policies');
                if(!d.ok || !d.policies.length) { el.innerHTML='<p style="text-align:center;color:var(--text-dim);padding:20px">No policies published yet.</p>'; return; }
                el.innerHTML = d.policies.map(p=>`
                    <div class="policy-item">
                        <div class="policy-hdr" onclick="togglePolicy(this.parentElement)">
                            <span>${p.title}</span><span class="policy-arrow">▼</span>
                        </div>
                        <div class="policy-body">${mdToHtml(p.body)}</div>
                    </div>`).join('');
                _polLoaded = true;
            } catch(e){ el.innerHTML='<p style="color:var(--danger);text-align:center;padding:20px">Could not load policies.</p>'; }
        }
        function togglePolicy(item) { item.classList.toggle('open'); }

"""
src = src.replace("        // ── Boot sequence", NEW_JS + "        // ── Boot sequence", 1)

# ── 4. Patch renderDashboard to fill new sections ───────────────────────────
OLD_RD_END = """            DOM.statFees.textContent = balance <= 0 ? 'CLEARED' : '₦' + balance.toLocaleString();
            DOM.statFees.style.color = balance <= 0 ? 'var(--success)' : 'var(--danger)';"""

NEW_RD_END = """            // Fees section
            const feesEl = document.getElementById('fees-content');
            if(feesEl) {
                const bal = balance;
                const cleared = bal <= 0;
                feesEl.innerHTML = `
                    <div class="bal-badge ${cleared?'ok':'due'}">
                        <div class="bal-val" style="color:${cleared?'var(--success)':'var(--danger)'}">${cleared?'CLEARED':'₦'+bal.toLocaleString()}</div>
                        <div class="bal-sub">${cleared?'All fees settled':'Outstanding Balance'}</div>
                    </div>
                    <div class="card" style="padding:16px 20px">
                        <div class="fee-row"><span class="fee-lbl">Total Billed</span><span class="fee-amt">₦${(fees.total_billed||0).toLocaleString()}</span></div>
                        <div class="fee-row"><span class="fee-lbl">Total Paid</span><span class="fee-amt" style="color:var(--success)">₦${(fees.total_paid||0).toLocaleString()}</span></div>
                        <div class="fee-row"><span class="fee-lbl">Balance</span><span class="fee-amt" style="color:${cleared?'var(--success)':'var(--danger)'}">₦${Math.max(0,bal).toLocaleString()}</span></div>
                    </div>`;
            }
            // Attendance section
            const attEl = document.getElementById('attendance-content');
            if(attEl) {
                attEl.innerHTML = `
                    <div class="att-ring-wrap">
                        <div class="att-pct">${pct}%</div>
                        <div class="att-lbl">Attendance Rate</div>
                    </div>
                    <div class="att-bar"><div class="att-fill" style="width:${pct}%"></div></div>
                    <div style="display:flex;gap:12px;margin-top:8px">
                        <div class="stat-item" style="flex:1"><div class="stat-val">${present}</div><div class="stat-lab">Present</div></div>
                        <div class="stat-item" style="flex:1"><div class="stat-val">${att.length-present}</div><div class="stat-lab">Absent</div></div>
                        <div class="stat-item" style="flex:1"><div class="stat-val">${att.length}</div><div class="stat-lab">School Days</div></div>
                    </div>`;
            }
            // Sync header logo
            const hdrLogo = document.getElementById('hdr-logo-abbr');
            const sbName  = document.getElementById('sb-school-name');
            if(hdrLogo) { hdrLogo.textContent = DOM.logoAbbr.textContent; hdrLogo.style.cssText = DOM.logoAbbr.style.cssText; }
            if(sbName)  sbName.textContent = DOM.schoolName.textContent;"""

src = src.replace(OLD_RD_END, NEW_RD_END, 1)

# ── 5. Remove old stat-grid from dashboard (it's now in sections) ───────────
# The stat-grid and results-list are now in sections, but DOM references remain valid.

pathlib.Path("portal.html").write_text(src)
print(f"portal.html written — {len(src.splitlines())} lines")
