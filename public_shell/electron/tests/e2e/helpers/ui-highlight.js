/**
 * helpers/ui-highlight.js
 *
 * Injects a visual annotation layer into the Electron renderer for video guides.
 *
 * Provides:
 *   - injectHighlighter(page)  — call once after the app loads
 *   - showCaption(page, text)  — display a step caption at the bottom
 *   - hideCaption(page)        — clear the caption
 *   - clickWithHalo(page, selector, caption?)  — click + ripple + optional caption
 *
 * The halo is a CSS ripple that expands from the click point.
 * The caption is a dark pill at the bottom of the viewport.
 * Both are removed automatically after their animation completes.
 */

/**
 * Injects the highlight CSS + helper functions into the renderer page.
 * Must be called once after firstWindow() / page.goto().
 *
 * @param {import('@playwright/test').Page} page
 */
async function injectHighlighter(page) {
  await page.addStyleTag({
    content: `
      /* ── Nexus E2E Video Annotator ── */

      .nx-halo {
        position: fixed;
        pointer-events: none;
        border-radius: 50%;
        background: rgba(0, 229, 255, 0.35);
        border: 2px solid rgba(0, 229, 255, 0.8);
        transform: translate(-50%, -50%) scale(0);
        animation: nx-ripple 0.75s ease-out forwards;
        z-index: 999999;
      }

      @keyframes nx-ripple {
        0%   { width: 10px; height: 10px; opacity: 1;   transform: translate(-50%, -50%) scale(0); }
        100% { width: 80px; height: 80px; opacity: 0;   transform: translate(-50%, -50%) scale(1); }
      }

      #nx-caption {
        position: fixed;
        bottom: 28px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(10, 14, 46, 0.92);
        border: 1px solid rgba(0, 229, 255, 0.4);
        color: #e8eaf6;
        font-family: 'Inter', 'Segoe UI', sans-serif;
        font-size: 14px;
        font-weight: 500;
        padding: 10px 28px;
        border-radius: 30px;
        backdrop-filter: blur(12px);
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
        z-index: 1000000;
        max-width: 720px;
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        transition: opacity 0.3s ease;
        pointer-events: none;
      }

      #nx-caption.nx-hidden {
        opacity: 0;
        pointer-events: none;
      }
    `,
  });

  // Inject helper functions into the page's window object
  await page.evaluate(() => {
    window.__nx_spawnHalo = (x, y) => {
      const halo = document.createElement('div');
      halo.className = 'nx-halo';
      halo.style.left = `${x}px`;
      halo.style.top = `${y}px`;
      document.body.appendChild(halo);
      setTimeout(() => halo.remove(), 800);
    };

    window.__nx_showCaption = (text) => {
      let cap = document.getElementById('nx-caption');
      if (!cap) {
        cap = document.createElement('div');
        cap.id = 'nx-caption';
        document.body.appendChild(cap);
      }
      cap.textContent = text;
      cap.classList.remove('nx-hidden');
    };

    window.__nx_hideCaption = () => {
      const cap = document.getElementById('nx-caption');
      if (cap) cap.classList.add('nx-hidden');
    };
  });
}

/**
 * Shows a caption pill at the bottom of the viewport.
 * @param {import('@playwright/test').Page} page
 * @param {string} text
 */
async function showCaption(page, text) {
  await page.evaluate((t) => window.__nx_showCaption(t), text);
}

/**
 * Hides the caption pill.
 * @param {import('@playwright/test').Page} page
 */
async function hideCaption(page) {
  await page.evaluate(() => window.__nx_hideCaption());
}

/**
 * Clicks an element and spawns a cyan halo ripple at the click point.
 * Optionally shows a caption before clicking.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string | import('@playwright/test').Locator} selectorOrLocator
 * @param {string} [caption]
 */
async function clickWithHalo(page, selectorOrLocator, caption) {
  if (caption) await showCaption(page, caption);

  const locator =
    typeof selectorOrLocator === 'string'
      ? page.locator(selectorOrLocator)
      : selectorOrLocator;

  const box = await locator.boundingBox();
  if (box) {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.evaluate(({ x, y }) => window.__nx_spawnHalo(x, y), { x: cx, y: cy });
  }

  await locator.click();
}

module.exports = { injectHighlighter, showCaption, hideCaption, clickWithHalo };
