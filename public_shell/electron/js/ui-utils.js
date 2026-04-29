/**
 * Nexus UI Utilities
 * Reusable components for Search, Pagination, and Debouncing
 */

window.NexusUI = {
    /**
     * Debounces a function to prevent excessive calls
     */
    debounce(fn, ms = 300) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => fn.apply(this, args), ms);
        };
    },

    /**
     * Renders a professional pagination control
     */
    renderPagination(containerId, total, limit, current, onPageChange) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const totalPages = Math.ceil(total / limit);
        if (totalPages <= 1) {
            container.innerHTML = "";
            return;
        }

        let html = `
            <div class="pagination-ctrl" style="display:flex;align-items:center;justify-content:center;gap:12px;margin-top:20px;padding:15px;border-top:1px solid var(--glass-border);">
                <button class="small-btn prev-page" ${current === 0 ? 'disabled' : ''} style="min-width:80px;">← Previous</button>
                <span style="font-size:12px;color:var(--text-dim);">Page <strong>${current + 1}</strong> of ${totalPages}</span>
                <button class="small-btn next-page" ${current >= totalPages - 1 ? 'disabled' : ''} style="min-width:80px;">Next →</button>
            </div>
        `;

        container.innerHTML = html;

        container.querySelector(".prev-page")?.addEventListener("click", () => onPageChange(current - 1));
        container.querySelector(".next-page")?.addEventListener("click", () => onPageChange(current + 1));
    },

    /**
     * Injects a search bar into a view header if it doesn't exist
     */
    injectSearch(headerSelector, placeholder, onSearch) {
        const header = document.querySelector(headerSelector);
        if (!header || header.querySelector(".nexus-search-input")) return;

        const searchWrap = document.createElement("div");
        searchWrap.className = "nexus-search-wrap";
        searchWrap.style = "position:relative; flex: 1 1 100%; order: 10; margin-top: 8px;";
        searchWrap.innerHTML = `
            <input type="text" class="modern-input nexus-search-input" placeholder="${placeholder}" 
                   style="width:100%; padding:10px 12px 10px 40px; font-size:13px; border-radius:10px; 
                          -webkit-app-region: no-drag; position: relative; z-index: 10; background: rgba(0,0,0,0.3);">
            <span style="position:absolute; left:14px; top:50%; transform:translateY(-50%); opacity:0.6; pointer-events: none; font-size: 16px;">🔍</span>
        `;

        console.log(`[NexusUI] Injecting search into ${headerSelector}`);
        header.appendChild(searchWrap);

        const input = searchWrap.querySelector(".nexus-search-input");
        input.addEventListener("input", NexusUI.debounce((e) => onSearch(e.target.value), 400));
    }
};
