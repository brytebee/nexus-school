# Nexus School OS — Design System Specification v2.3
> **Philosophy:** Linear.app × Stripe × Vercel × Notion aesthetic.
> A dark, space-inspired, high-fidelity web shell built on glassmorphic elements, absolute geometry, and stateful cyber-neon accents (Cyan and Gold).
> The goal is a **genuinely impressive** UI — one that would not embarrass us in front of YC Demo Day investors.

This document serves as the absolute visual and interaction guideline for Nexus School OS V2. Every React component, style sheet, and UI element must strictly implement these specification rules to guarantee pixel-perfect visual cohesion across the platform.

> **Reference sites (for aesthetic vocabulary):** [Linear.app](https://linear.app) · [Vercel.com](https://vercel.com) · [Stripe.com](https://stripe.com) · [Notion.so](https://notion.so)

> **⚠️ v2.3 Correction Notice:** Section 4B (Tab Navigation) has been fully rewritten following a pixel-perfect V1 HTML audit. The previous "Pill Tabs" spec used `.ph-type-btn` which does **not** appear as a tab rail anywhere in V1 — it was incorrect. Three real V1 tab patterns are now documented below. Any code still using `.ph-type-btn` as a tab navigation rail must be migrated.

---

## 1. Core Visual Foundations

### A. The Color Palette
Our color system relies on high-contrast neon accents layered over deep space blues and translucent glass surfaces. 

```css
:root {
    /* Backgrounds & Paneling */
    --bg-root:       #05081A;            /* Absolute page root — deepest space black-indigo */
    --bg-deep:       #0A0E2E;            /* Main viewport absolute background */
    --bg-sidebar:    rgba(0, 0, 0, 0.35); /* Translucent sidebar sheet */
    --bg-dark:       #0d1235;            /* Solid panel/drawer container base */
    --glass:         rgba(255, 255, 255, 0.04);  /* Primary card backdrop */
    --glass-border:  rgba(255, 255, 255, 0.09);  /* Sub-pixel card and line borders */

    /* Stateful Accents */
    --primary:       #1A237E;            /* Deep indigo brand base */
    --accent:        #00E5FF;            /* Electric Cyan — primary interactive accent */
    --accent-green:  #00E676;            /* Neon green — secondary CTA / success highlights */
    --accent-indigo: #8C9EFF;            /* Soft indigo light — premium card aura / halos */
    --accent-gold:   #FFD700;            /* Bright Gold — premium features & billing accent */

    /* Typography Color Spectrum */
    --text-main:     #FFFFFF;            /* Full white body & title text */
    --text-dim:      rgba(255, 255, 255, 0.45); /* Secondary descriptors and metadata */

    /* Feedback Colors */
    --success:       #10B981;            /* Emerald green — cleared and positive status */
    --warning:       #F59E0B;            /* Amber orange — partial status and alerts */
    --danger:        #EF4444;            /* Crimson red — unpaid status, warnings, and errors */
}
```

### B. Glassmorphism Specifications
Glassmorphism is the core signature of the Nexus School OS. Translucent surfaces must be used to establish layering and hierarchy.
- **Glass Overlay Class (`.glass`)**: Applied to cards and containers.
  - Backdrop blur of `blur(24px)` to obscure background elements.
  - A subtle linear gradient: `linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))`.
  - Border: `1px solid var(--glass-border)`.
- **Background Ambient Glow**:
  - The main app shell must paint an ambient indigo radial glow under all layers:
    `radial-gradient(ellipse at 20% 50%, rgba(26,35,126,0.35) 0%, transparent 60%)`.


---

## 2. Geometry, Spacing Rhythm & Breathing Room

Absolute margins and container dimensions keep the layout locked in place without horizontal scrolls or viewport layout shifts. Layout spacing is calibrated to the highly polished **About** view profile for compact, pixel-perfect information density.

### A. Spacing Tokens

| Spacing Token | CSS Value | Target Placement / Usage |
|---|---|---|
| `--sidebar-w` | `220px` | Sidebar panel navigation width |
| `--titlebar-h` | `46px` | Absolute Electron frameless window header height |
| `--view-pad` | `28px 32px` | Internal view container pad (`top/bottom` `left/right`) |
| `--grid-gap` | `18px` | Spacing grid gap and margins between layout blocks |
| `--card-pad` | `24px` | Standard internal padding for primary interactive cards |
| `--card-pad-sm` | `22px` | Internal padding for secondary detail panels |
| `--radius-xl` | `24px` | Main modal dialogues and premium cards |
| `--radius-lg` | `16px` | Data grids, tables, and statistics cards |
| `--radius-md` | `10px` | Tabs navigation items, modals headers, dropdown boxes |
| `--radius-sm` | `8px` | Modern input controls and small action buttons |

### B. Spacing Rhythm & Breathing Room Rules
- **Cards Padding**: Primary interactive cards use `24px` internal padding (`--card-pad`). Secondary details panels and minor widgets use `22px` (`--card-pad-sm`). Never exceed this density inside Electron views.
- **Layout & Section Gaps**: Grid layouts, flex rows, and adjacent content containers must use `18px` gap (`--grid-gap`) and `18px` bottom margins (`marginBottom: '18px'`).
  > [!NOTE]
  > `--grid-gap` is defined globally in `:root` inside `index.css` to guarantee horizontal card gaps in grid views and vertical spacing in flex columns. Always use `alignSelf: 'center'` instead of absolute centering margins like `margin: '0 auto'` on child flex items when column-gaps must apply properly.
- **Heading-to-Text Spacing**:
  - H3 card headings: `font-size: 17px; margin-bottom: 8px;`
  - Subheading / description paragraphs: `font-size: 12px; line-height: 1.7; margin-bottom: 16px;`
  - Uppercase section headings: `font-size: 11px; letter-spacing: 1px; margin-bottom: 14px;`
- **Structured Lists & Detail Records**:
  - Key-value detail records: `margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 12px;`
  - Inline spec / subtext items: `font-size: 12px; display: flex; flex-direction: column; gap: 5px; color: var(--text-dim);`
  - Horizontal/Wrap tag lists: `display: flex; gap: 24px; flex-wrap: wrap;`
- **View Header Margin**: The margin directly below the standard view header is strictly set to `18px` or `marginBottom: '18px'`.

---

## 3. Typography & Text Hierarchy

We use Inter Variable font with **5 distinct levels**. No two section headings should feel the same weight or size. Tight kerning on headings establishes the premium sleek look. Body text always gets room to breathe (`line-height: 1.7`).

### A. Font Families
- **Headings & Body UI (`--font-heading`)**: `'Inter', -apple-system, system-ui, sans-serif`
  - Load Inter as a variable font from Google Fonts for optical sizing.
- **Numerical & Financial Data (`--font-mono`)**: `'JetBrains Mono', 'Fira Code', ui-monospace, monospace`
  - Ensures tabular alignment for numbers, IDs, and financial tallies.

### B. 5-Level Type Hierarchy

| Level | Role | App Shell Size | Display/Marketing Size | Weight | Tracking |
|---|---|---|---|---|---|
| **H1** | Page / view title | `24px` | `80–96px` (hero, `clamp(48px, 8vw, 96px)`) | `700` | `-0.03em` |
| **H2** | Section title | `18px` | `48–56px` (`clamp(32px, 5vw, 56px)`) | `700` | `-0.02em` |
| **H3** | Card / panel heading | `15px` | `28px` | `600` | `-0.01em` |
| **Body** | Descriptors / paragraphs | `13px` | `16–18px` | `400` | `0` |
| **Label** | Badges, table `th`, metadata | `11px` | `11–12px` | `500` | `+0.08em` (uppercase) |

```css
/* App Shell Variables (Electron/React views) */
--text-h1:      24px;
--text-h2:      18px;
--text-h3:      15px;
--text-body:    13px;
--text-label:   11px;
--tracking-h:   -0.03em;
--lh-body:      1.7;     /* Always 1.7 — no compressed body copy */
--lh-heading:   1.2;
```

### C. Component Class Bindings
- **`.view-title`**: `font-size: var(--text-h1); font-weight: 700; letter-spacing: var(--tracking-h); line-height: var(--lh-heading);`
- **`.view-sub`**: `font-size: var(--text-body); color: var(--text-dim); line-height: var(--lh-body); margin-top: 4px;`
- **`th`, `.stat-label`, `.badge`**: `font-size: var(--text-label); text-transform: uppercase; letter-spacing: 0.08em;`

> **Rule:** Never place two headings of the same `font-size` adjacent to each other. Hierarchy must always be visually apparent on first glance.

> **Inline Style Rule:** Never re-declare properties on `h2.view-title` or `p.view-sub` that are already provided by the CSS class definition (e.g., `fontSize`, `fontWeight`, `letterSpacing`, `lineHeight`, `color`). These inline overrides create drift. Only add inline styles for **exceptions** (e.g., a gold gradient text-fill on CBT Arena's title).

---

## 4. Standardized UI Components

### A. The View Header Layout
Every page view must begin with a uniform header block. The `.view-header` CSS class handles all layout internally — **do not add inline styles to the wrapper div that duplicate what the class already provides**.

```html
<!-- ✅ CORRECT — class handles all layout -->
<div class="view-header">
  <div>
    <h2 class="view-title">💳 Financial Hub</h2>
    <p class="view-sub">Configure billing structures and review active roster balances.</p>
  </div>
  <div class="view-header-actions">
    <!-- Quick actions, Settings triggers, or Dispatches go here -->
  </div>
</div>

<!-- ❌ WRONG — redundant inline styles create drift and override bugs -->
<div class="view-header" style="display:flex; justify-content:space-between; ...">
  <h2 class="view-title" style="fontSize: 'var(--text-h1)'; fontWeight: 700; ...">
```

**Critical:** All view titles use `<h2 class="view-title">`, **not** `<h1>`. This matches the V1 HTML exactly across every view.

---

### B. Tab Navigation Patterns — Three Real V1 Styles

There are **three distinct tab navigation patterns** in the V1 HTML, each used in specific views. Use the correct one for each context.

---

#### Pattern 1: `fees-tab-btn` — Underline Rail *(Financial Hub, Attendance, Nexus Pulse)*

The most common tab style. Sits directly below the `.view-header`, separated by a bottom border on the rail wrapper. Individual tabs have no visible border — only the active tab gets a bottom underline indicator via the `.active` class.

```html
<!-- Wrapper: flush padding, border-bottom forms the rail line -->
<div style="display:flex; gap:4px; padding:0 20px; border-bottom:1px solid var(--glass-border); flex-shrink:0;">
  <button class="fees-tab-btn active" id="tab-id-one">📋 Tab One</button>
  <button class="fees-tab-btn"        id="tab-id-two">🏗️ Tab Two</button>
  <button class="fees-tab-btn"        id="tab-id-three">🎓 Tab Three</button>
</div>
```

**CSS (already in `index.css`):**
```css
.fees-tab-btn {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;    /* underline placeholder */
  color: var(--text-dim);
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: -1px;                     /* overlaps the rail border-bottom */
}
.fees-tab-btn.active {
  color: var(--accent);
  border-bottom-color: var(--accent);      /* cyan underline on active */
  font-weight: 600;
}
.fees-tab-btn:hover:not(.active) {
  color: var(--text-main);
}
```

**React usage:**
```tsx
<div style={{ display:'flex', gap:'4px', padding:'0 20px', borderBottom:'1px solid var(--glass-border)', flexShrink:0 }}>
  {tabs.map(tab => (
    <button
      key={tab.id}
      className={`fees-tab-btn${activeTab === tab.id ? ' active' : ''}`}
      onClick={() => setActiveTab(tab.id)}
    >
      {tab.label}
    </button>
  ))}
</div>
```

---

#### Pattern 2: `ph-tab` — Ghost Text Rail *(CBT Arena)*

Used in the CBT Arena. Tabs have **no border at all** — just text with color and weight changes. The rail wrapper itself has a `border-bottom` and `margin-bottom`. Active state is handled via inline styles only (no `.active` CSS class needed).

```html
<!-- Wrapper: gap 10px, border-bottom below, padding-bottom separates rail from content -->
<div style="display:flex; gap:10px; margin-bottom:20px; border-bottom:1px solid var(--glass-border); padding-bottom:10px;">
  <button class="ph-tab" id="tab-cbt-banks" style="background:transparent; border:none; color:var(--text-dim); cursor:pointer; font-size:14px; padding:5px 10px; border-radius:4px;">📚 Question Banks</button>
  <button class="ph-tab" id="tab-cbt-deploy" style="background:transparent; border:none; color:var(--text-dim); cursor:pointer; font-size:14px; padding:5px 10px; border-radius:4px;">🚀 Deploy Exam</button>
</div>
```

**React usage:**
```tsx
<div style={{ display:'flex', gap:'10px', marginBottom:'20px', borderBottom:'1px solid var(--glass-border)', paddingBottom:'10px' }}>
  {tabs.map(tab => {
    const isActive = activeTab === tab.id;
    return (
      <button
        key={tab.id}
        className="ph-tab"
        onClick={() => setActiveTab(tab.id)}
        style={{
          background: 'transparent', border: 'none',
          color: isActive ? '#fff' : 'var(--text-dim)',
          cursor: 'pointer', fontSize: '14px',
          padding: '5px 10px', borderRadius: '4px',
          fontWeight: isActive ? '600' : '400',
        }}
      >
        {tab.icon} {tab.label}
      </button>
    );
  })}
</div>
```

---

#### Pattern 3: `pc-tab` — Vertical Sidebar Nav *(Portal Content)*

Used only in Portal Content. Navigation is a **left-side vertical column** inside a horizontal flex layout, not a top tab bar. Active item gets a gold left-border accent and white text on a semi-transparent background.

```html
<!-- Outer wrapper: flex row, content on right -->
<div style="display:flex; gap:20px; margin-top:20px;">
  <!-- Left nav column -->
  <div id="pc-nav" style="width:200px; display:flex; flex-direction:column; gap:8px;">
    <button id="pc-tab-news" class="pc-tab active"
      style="padding:12px; text-align:left; background:rgba(255,255,255,0.1);
             border:none; border-left:3px solid var(--accent-gold,#FFD700);
             color:#fff; border-radius:8px; cursor:pointer; font-weight:600;">
      📢 News Articles
    </button>
    <button id="pc-tab-policies" class="pc-tab"
      style="padding:12px; text-align:left; background:transparent;
             border:none; color:var(--text-dim);
             border-radius:8px; cursor:pointer; font-weight:400;">
      📋 School Policies
    </button>
  </div>
  <!-- Right content area -->
  <div style="flex:1; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.05); border-radius:16px; padding:24px;">
    <!-- Tab panel content here -->
  </div>
</div>
```

---

#### ⚠️ `.ph-type-btn` — NOT a tab rail class

`.ph-type-btn` appears in V1 as a generic styled button (e.g., upload labels, standalone action buttons). It is **never used as a tab navigation rail** in any V1 view. Do not use it for tab navigation.

---

## 5. Forms, Inputs & Action Buttons

### A. Modern Form Inputs & Dropdowns (`.modern-input`)
All input fields, text areas, and select dropdown lists must share the exact same surface styling and transition focus outlines:
- **Field Styles**: Background `rgba(0,0,0,0.2)`, border `1px solid var(--glass-border)`, border radius `var(--radius-sm)` (8px), font-size `13px`, and padding `10px 14px`.
- **Select Dropdowns**: Select menus must use `<select className="modern-input">` with proper sizing. Under high-density/tight form layouts, font-size can be adjusted to `12px` to prevent layout overflow.
- **Form Groups (`.form-group`)**: Group labels and fields vertically using `display: flex; flex-direction: column; gap: 6px;`.
  - Group Labels: `font-size: 12px; font-weight: 600; color: var(--text-dim);`
- **Focus State**:
  - Border Color: `var(--accent)` (electric cyan)
  - Background: `rgba(0,0,0,0.3)`
  - Box Shadow: `0 0 0 3px rgba(0,229,255,0.1)` (cyan neon ring glow)

### B. Action Buttons
Buttons must present absolute clarity regarding priority and state:

1. **Primary Call-To-Action (`.primary-btn`)**:
   - Background: `var(--accent)`
   - Text Color: `var(--bg-deep)` (high-contrast dark text)
   - Box Shadow: `0 4px 14px rgba(0,229,255,0.25)`
   - Layout: `display: inline-flex; align-items: center; gap: 6px; white-space: nowrap;`
   - Spacing: Anchored with a top margin of `16px` (`marginTop: '16px'`) when positioned at the base of cards or form containers.
   - Hover: `transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,229,255,0.35); background: #4affff;`
2. **Outlined Secondary Button (`.secondary-btn`)**:
   - Background: `transparent`
   - Border: `1px solid rgba(0, 229, 255, 0.35)`
   - Text Color: `var(--accent)`
   - Layout: `display: inline-flex; align-items: center; gap: 6px;`
   - Hover: `background: rgba(0,229,255,0.08); border-color: var(--accent); transform: translateY(-1px);`
3. **Small Outline Button (`.small-btn`)**:
   - Used inside narrow lists or pagination strips.
   - Background: `var(--bg-dark)`
   - Border: `1px solid var(--glass-border)`
   - Padding: `6px 12px`
   - Font-size: `11px`
4. **Stateful Danger Button (`.danger-btn`)**:
   - Used for deletions or revocations.
   - Background: `linear-gradient(135deg, #ff4d4d 0%, #ff1a1a 100%)`
   - Box Shadow: `0 4px 15px rgba(255, 77, 77, 0.2)`

---

## 5b. Mobile-First Responsive Rules

All views must be **truly mobile-first**. The Electron shell has a minimum width but the web portal and landing pages must hold at 320px without horizontal scroll.

### A. Core Rules
- **No hardcoded `width` values** on containers inside view panels — use `max-width` with `width: 100%`.
- **Font scaling**: Use `clamp()` for display/hero text. Example: `font-size: clamp(28px, 5vw, 56px);`
- **Hero stack**: On screens ≤ 768px, hero content must stack vertically: copy on top, visual below.
- **Tables**: Wrap all `.data-table` in a horizontally scrollable container on narrow viewports.
- **Sidebar**: Collapses to an icon-only strip ≤ 768px, or uses an overlay drawer.

### B. Breakpoints
```css
/* Mobile-first breakpoints */
@media (min-width: 640px)  { /* sm  — tablet portrait  */ }
@media (min-width: 768px)  { /* md  — tablet landscape */ }
@media (min-width: 1024px) { /* lg  — desktop          */ }
@media (min-width: 1280px) { /* xl  — wide desktop     */ }
```

---

## 6. Layout Grids & Tables

### A. Data Grid Containers (`.table-container`)
Data grids must remain isolated from absolute scrollbleeds and inherit proper panel backing:
- Wrapper Background: `rgba(0,0,0,0.15)`
- Border: `1px solid var(--glass-border)`
- Border Radius: `var(--radius-lg)`
- Overflow-y: `auto` for scroll lock.

### B. Data Table Structure (`.data-table`)
- Headings (`th`):
  - Background: `rgba(0,0,0,0.4)` (sticky position header)
  - Color: `var(--text-dim)`
  - Text-transform: `uppercase`
  - Font-size: `10px`
  - Letter-spacing: `1px`
  - Border-bottom: `1px solid var(--glass-border)`
- Rows (`tr`):
  - Border-bottom: `1px solid rgba(255,255,255,0.05)`
  - Hover: `background: rgba(255,255,255,0.04);`

---

## 7. Metrics & Card snapping

### A. Snapshot Statistics (`.stat-card`)
Metrics dashboards must map to responsive cards with glowing cyan neon border triggers:
- Background: `var(--glass)`
- Border: `1px solid var(--glass-border)`
- Border-radius: `var(--radius-lg)`
- Hover State: `border-color: var(--accent); transform: translateY(-2px);`
- Value Title (`.stat-value`): `font-size: 32px; font-weight: 700; color: var(--accent); letter-spacing: -1px;`
- Label (`.stat-label`): `font-size: 10px; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px;`

---

## 7b. Premium "iPhone Box" Gold Card

The featured / Gold tier card must feel unmistakably **premium** — like lifting an iPhone out of its box. It should command attention without shouting.

### Specification
- **Background**: Separate from sibling cards — use `linear-gradient(145deg, #1a1060 0%, #0d0830 100%)` (deeper, richer dark)
- **Border**: `1px solid rgba(255, 215, 0, 0.4)` with `box-shadow: 0 0 60px rgba(140, 158, 255, 0.15), 0 20px 60px rgba(0,0,0,0.5)` (soft indigo aura + deep shadow lift)
- **Scale**: `transform: scale(1.04)` vs sibling cards on desktop (visually elevated)
- **Accent Color**: `var(--accent-gold)` (#FFD700) for price, badge, and CTA button
- **Badge**: A `RECOMMENDED` or `POPULAR` pill badge at top center, using gold background + dark text
- **Hover Animation**: Soft pulse — `box-shadow` expands and contracts on a 2s loop (`.gold-pulse` animation)

```css
@keyframes goldPulse {
    0%, 100% { box-shadow: 0 0 40px rgba(255, 215, 0, 0.15), 0 20px 60px rgba(0,0,0,0.5); }
    50%       { box-shadow: 0 0 80px rgba(255, 215, 0, 0.30), 0 24px 80px rgba(0,0,0,0.6); }
}
.gold-card-premium {
    animation: goldPulse 2s ease-in-out infinite;
}
```

---

## 8. Form Fields & Advanced Settings Panel Layouts

To maintain perfect alignment with the V1 identity setup, form fields must be stacked and grouped using strict CSS grid/flex guidelines.

### A. Form Groups & Field Stackers (`.form-group`)
- **Container**: `display: flex; flex-direction: column; gap: 6px;`
- **Label**: `font-size: 12px; font-weight: 600; color: var(--text-dim);`
- **Helper Texts**: Standard text under input elements must use `font-size: 10px; color: var(--text-dim); font-style: italic;`

### B. Double-Column Settings Configuration (`.settings-content`)
- **Content Wrapper**: `display: flex; gap: 40px; flex: 1; overflow-y: auto;`
- **Columns (`.settings-column`)**: `flex: 1; display: flex; flex-direction: column; gap: 18px;`
- **Section Headers (`.settings-column h3`)**:
  - Font-size: `11px`
  - Color: `var(--accent)` (electric cyan)
  - Letter-spacing: `1.5px`
  - Text-transform: `uppercase`
  - Padding-bottom: `8px`
  - Border-bottom: `1px solid var(--glass-border)`

### C. Logo Drag & Drop Uploader (`.logo-uploader`)
- **Drop Zone**:
  - Height: `110px`
  - Border: `2px dashed var(--glass-border)`
  - Border-radius: `var(--radius-md)`
  - Display: `flex; align-items: center; justify-content: center;`
  - Background: `rgba(0,0,0,0.1)`
  - Hover State: `border-color: rgba(255,255,255,0.35); background: var(--glass);`
- **Contents (`.uploader-content`)**: `text-align: center; pointer-events: none;`

---

## 9. Overlays, Dialogues & Slide-in Drawers

Drawers are used to isolate complex parameter forms (like reminder dates, Google OAuth tokens, or principal phone configurations) without leaving the view scope.

### A. Backdrop Blur Overlay (Standardized Drawer Overlay)
- **Overlay Container (`#admin-mgmt-overlay` / General Drawer Overlay)**:
  - Position: `fixed; inset: 0;`
  - Background: `rgba(0, 0, 0, 0.55)` (subtle dark backing)
  - Z-Index: `2000` (must sit above standard workspace nav lists)
  - Web Region: `-webkit-app-region: no-drag`

### B. Slide-in Drawer Sheet
- **Drawer Container (`#admin-mgmt-panel` / General Drawer Panel)**:
  - Position: `fixed; top: 0; bottom: 0; width: 400px; height: 100vh;`
  - Background: `#0d1235` (solid deep panel back)
  - Border-left: `1px solid var(--glass-border)`
  - Z-Index: `2001`
  - Transition: `right 0.32s cubic-bezier(0.4, 0, 0.2, 1)`
  - Default closed position: `right: -430px;` (fully hidden out of viewport)
  - Active opened state class (`.open`): `right: 0;` (slides inside view smoothly)

### C. Standard Centered Modal Dialogs
For pop-up dialog boxes (e.g., adding/editing records, confirmation screens):

- **Overlay Wrapper (`.modal-backdrop` / inline style equivalent)**:
  - Position: `fixed; inset: 0;`
  - Z-Index: `2000` (must sit above workspace view layout layers)
  - Layout: `display: flex; align-items: center; justify-content: center;`
  - Background: `rgba(0, 0, 0, 0.75)` (darkened backdrop for dialog focus)
  - Backdrop Blur: `backdrop-filter: blur(8px)` (premium space depth)
  - Interaction safety: `user-select: none;` and `-webkit-app-region: no-drag;`

- **Dialog Box Card Container (`.modal-card` / inline style equivalent)**:
  - Background: `var(--bg-dark)` (solid panel back, `#0d1235`)
  - Border: `1px solid var(--glass-border)`
  - Border Radius: `var(--radius-xl)` (24px for premium dialogue curves)
  - Dimensions: Responsive width (e.g., `400px` for small forms, `width: 90%; maxWidth: 950px; height: 80vh` for complex ledger tables), flexible or fixed depending on content
  - Layout: `display: flex; flex-direction: column; overflow: hidden;`
  - Box Shadow: `0 20px 60px rgba(0, 0, 0, 0.5)` (heavy elevation shadow lift)

- **Modal Header (`.modal-header` / inline style equivalent)**:
  - Padding: `16px 24px`
  - Border Bottom: `1px solid var(--glass-border)`
  - Display: `flex; justify-content: space-between; align-items: center;`
  - Background: `rgba(0, 0, 0, 0.15)`
  - Flex Shrink: `0`
  - **Title (`h3`)**: `font-weight: 700; color: var(--text-main); font-size: 14px; margin: 0;`
  - **Close Button**: `background: transparent; border: none; color: var(--text-dim); cursor: pointer; font-size: 18px; display: flex; align-items: center;`

- **Modal Body (`.modal-body` / inline style equivalent)**:
  - Padding: `24px` (or `20px 24px` for tight/dense scrolling tables)
  - Layout: `flex: 1; display: flex; flex-direction: column; gap: 16px; overflow-y: auto;`
  - Fields & Form Controls: Use `.form-group` stacked layouts and inputs styled with `className="modern-input"`.

- **Modal Footer (`.modal-footer` / inline style equivalent)**:
  - Padding: `16px 24px`
  - Border Top: `1px solid var(--glass-border)`
  - Background: `rgba(0, 0, 0, 0.15)`
  - Flex Shrink: `0`
  - Layout: `display: flex; justify-content: flex-end; gap: 8px;`
  - Buttons: Cancel/Close buttons use `.secondary-btn` class, action buttons use `.primary-btn` class.

---

## 9b. Micro-Animations & Motion Patterns

Subtle motion is what separates good from genuinely impressive. All animations must be **purposeful and lightweight** — no GSAP, no Framer Motion. CSS keyframes only.

### A. Section Fade-In-Up (Entrance Animation)
Apply to view containers, stat cards, and major content sections on mount:
```css
@keyframes fadeInUp {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
}
.fade-in-up {
    animation: fadeInUp 0.45s cubic-bezier(0.4, 0, 0.2, 1) both;
}
/* Staggered children — add to nth-child selectors */
.fade-in-up:nth-child(2) { animation-delay: 0.08s; }
.fade-in-up:nth-child(3) { animation-delay: 0.16s; }
```

### B. CTA Breathing Glow (Primary Button)
The main call-to-action button has a slow, gentle glow that breathes at idle:
```css
@keyframes breatheGlow {
    0%, 100% { box-shadow: 0 4px 14px rgba(0, 229, 255, 0.20); }
    50%       { box-shadow: 0 4px 28px rgba(0, 229, 255, 0.50); }
}
.primary-btn {
    animation: breatheGlow 3s ease-in-out infinite;
}
.primary-btn:hover {
    animation: none; /* Stop breathing on direct hover for snappy feedback */
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 229, 255, 0.45);
}
```

### C. Card Hover Lift (`.stat-card`, `.glass-card`)
```css
.stat-card, .glass-card {
    transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}
.stat-card:hover, .glass-card:hover {
    transform: translateY(-4px);
    border-color: var(--accent);
    box-shadow: 0 8px 32px rgba(0, 229, 255, 0.12);
}
```

### D. Motion Rules
- All transition durations: `0.2s` (fast interactions) or `0.45s` (entrance animations).
- Always use `cubic-bezier(0.4, 0, 0.2, 1)` (Material easing) for smooth deceleration.
- Respect `prefers-reduced-motion`: wrap all keyframe animations in a check:
```css
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

---

## 10. Indicators & Loading Animations

Tabular and connection actions require lightweight, glowing sync animations to keep the view active and alive.

### A. Glowing Connection Pulse (`.dot`)
- **Style**:
  - Width & Height: `6px`
  - Background: `var(--accent)` (cyan)
  - Border-radius: `50%`
  - Box Shadow: `0 0 8px var(--accent)`
  - Animation: `pulse-dot 2s infinite`

### B. Linear Progress Loading Bar (`.bar-container`)
- **Outer Track (`.bar-container`)**:
  - Width: `80px`
  - Height: `4px`
  - Background: `rgba(255,255,255,0.1)`
  - Border-radius: `2px`
  - Overflow: `hidden`
- **Pulsing Fill (`.bar-fill`)**:
  - Width: `30%`
  - Height: `100%`
  - Background: `var(--accent)`
  - Animation: `linearProgress 1.5s infinite ease-in-out`
  - Keyframe translate loop:
    ```css
    @keyframes linearProgress {
        0%   { transform: translateX(-100%); }
        100% { transform: translateX(350%); }
    }
    ```

---

## 11. Window Chrome & Drag Zones

Electron app window drag support must be preserved in all React shells:

- **Sidebar Top Drag Region (`.sidebar-titlebar`)**:
  - Height: `var(--titlebar-h)`
  - Web Region: `-webkit-app-region: drag` (enables mouse drag move for frameless window chrome)
  - Border-bottom: `1px solid var(--glass-border)`
- **macOS Traffic Lights Area (`.traffic-light-space`)**:
  - Width: `72px` (Traffic lights safe zone reservation; no clickable elements can sit inside this horizontal segment to avoid system overlap)

---

## 12. Performance Budget

Every shipped view and page must target a **Lighthouse score of 90+** on mobile. This is a hard constraint, not a guideline.

| Metric | Target | How to achieve |
|---|---|---|
| **LCP** | ≤ 2.5s | Preload hero images; use `<Image>` with `priority` prop |
| **FID / INP** | ≤ 100ms | No heavy JS on main thread; defer non-critical scripts |
| **CLS** | ≤ 0.1 | Reserve space for images/embeds with `aspect-ratio` |
| **Bundle size** | < 200KB gzip (per route) | Code-split views; lazy-load non-critical views |
| **Images** | Use WebP/AVIF | All images must use Next.js `<Image>` with `fill` + `sizes` props |

### Rules
- **No new npm packages** unless available via CDN (avoids bundle bloat).
- Lazy-load off-screen views with React `Suspense` + `lazy()`.
- All font faces must use `font-display: swap`.
- Avoid layout thrash: never read then write DOM dimensions in the same frame.

---

## 13. The Design Self-Critique Loop

Before any view is considered complete, apply this review:

> *"Look at this as a design critic at a YC Demo Day. What 3 things would embarrass you in front of investors? Fix them now."*

### Common failure modes to check:
1. **Two headings of identical weight/size** adjacent to each other — fix the hierarchy.
2. **Cards that feel crowded** — add padding, increase gap.
3. **Flat, unanimated CTAs** — add the breathing glow or hover lift.
4. **Inconsistent border-radius** — every card, input, and button must match the token table.
5. **Placeholder colors** (plain red, plain blue) — replace with the curated palette tokens.
6. **Missing loading states** — every async action needs a spinner or skeleton.
7. **Tables with no hover state** — every `tr` must have `hover: background: rgba(255,255,255,0.04)`.
8. **Wrong tab class** — always check which of the 3 tab patterns applies to your view before writing markup.
9. **Redundant inline styles** — if the CSS class already defines a property, do not repeat it inline.

This self-review loop is where UI jumps from _good_ to _genuinely impressive_.
