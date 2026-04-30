/**
 * Nexus UI Utilities
 * Reusable components for Search, Pagination, and Debouncing
 */

window.NexusUI = {
    /**
     * Debounces a function to prevent excessive calls.
     * @param {Function} fn  Function to debounce
     * @param {number}   ms  Delay in milliseconds
     */
    debounce(fn, ms = 300) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => fn.apply(this, args), ms);
        };
    },

    /**
     * Renders a professional pagination control.
     * @param {string}   containerId   ID of the container element
     * @param {number}   total         Total record count
     * @param {number}   limit         Records per page
     * @param {number}   current       Zero-indexed current page
     * @param {Function} onPageChange  Callback(newPage)
     */
    renderPagination(containerId, total, limit, current, onPageChange) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const totalPages = Math.ceil(total / limit);
        if (totalPages <= 1) {
            container.innerHTML = "";
            return;
        }

        container.innerHTML = `
            <div class="pagination-ctrl">
                <button class="prev-page" ${current === 0 ? 'disabled' : ''}>← Previous</button>
                <span class="pagination-info">
                    Page <strong>${current + 1}</strong> of ${totalPages}
                    &nbsp;·&nbsp; ${total.toLocaleString()} records
                </span>
                <button class="next-page" ${current >= totalPages - 1 ? 'disabled' : ''}>Next →</button>
            </div>
        `;

        container.querySelector(".prev-page")?.addEventListener("click", () => onPageChange(current - 1));
        container.querySelector(".next-page")?.addEventListener("click", () => onPageChange(current + 1));
    },

    /**
     * Injects a full-width search bar as a second row inside .view-header.
     * Uses design-system classes (.nexus-search-row, .nexus-search-icon, .nexus-search-input)
     * — zero inline styles. Idempotent: safe to call on every view activation.
     *
     * @param {string}   headerSelector  CSS selector for the .view-header element
     * @param {string}   placeholder     Input placeholder text
     * @param {Function} onSearch        Debounced callback(query: string)
     */
    injectSearch(headerSelector, placeholder, onSearch) {
        const header = document.querySelector(headerSelector);
        if (!header || header.querySelector(".nexus-search-row")) return;

        const row = document.createElement("div");
        row.className = "nexus-search-row";
        row.innerHTML = `
            <span class="nexus-search-icon">🔍</span>
            <input
                type="text"
                class="modern-input nexus-search-input"
                placeholder="${placeholder}"
                autocomplete="off"
                spellcheck="false"
            >
        `;

        header.appendChild(row);

        const input = row.querySelector(".nexus-search-input");
        input.addEventListener(
            "input",
            NexusUI.debounce((e) => onSearch(e.target.value.trim()), 380)
        );

        console.log(`[NexusUI] ✓ Search injected → ${headerSelector}`);
    },
};
