---
name: Institutional Rigor
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#44474c'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#75777d'
  outline-variant: '#c5c6cd'
  surface-tint: '#525f75'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#0e1c2f'
  on-primary-container: '#77849c'
  inverse-primary: '#bac7e1'
  secondary: '#545f73'
  on-secondary: '#ffffff'
  secondary-container: '#d5e0f8'
  on-secondary-container: '#586377'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#00174b'
  on-tertiary-container: '#497cff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d6e3fe'
  primary-fixed-dim: '#bac7e1'
  on-primary-fixed: '#0e1c2f'
  on-primary-fixed-variant: '#3a475c'
  secondary-fixed: '#d8e3fb'
  secondary-fixed-dim: '#bcc7de'
  on-secondary-fixed: '#111c2d'
  on-secondary-fixed-variant: '#3c475a'
  tertiary-fixed: '#dbe1ff'
  tertiary-fixed-dim: '#b4c5ff'
  on-tertiary-fixed: '#00174b'
  on-tertiary-fixed-variant: '#003ea8'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 16px
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
  data-mono-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
  data-mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 14px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-compact: 0.5rem
  margin: 1.5rem
  margin-dense: 1rem
  space-2xs: 0.125rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
  space-2xl: 2rem
---

## Brand & Style

This design system is engineered specifically for mission-critical institutional operations—specifically high-volume corporate KYC onboarding, case file reviews, and document-chasing workflows. The aesthetic projects absolute dependability, mathematical precision, and sovereign institutional authority.

The visual direction rejects consumer-grade software frivolities (no whimsical decorative blobs, unnecessary gradient fills, or playful micro-animations). Instead, it adopts a **Corporate / Modern utilitarian style with high-density information architecture**. Visual priority is dictated by regulatory deadlines, document verification states, and risk-weight hierarchies.

Key characteristics:
- **Trustworthy & Authoritative:** Built upon a foundation of deep midnight navies and pristine tabular surfaces that echo traditional tier-one investment banking terminals.
- **Scannable & Dense:** Optimized for analysts and compliance officers handling hundreds of multi-jurisdictional verification items per shift.
- **Unambiguous Semantics:** Statuses and alerts leverage high-visibility, WCAG AAA/AA-compliant color codings paired with distinct textual descriptions and structural indicators.

## Colors

The palette balances deep naval structure with cool slate backgrounds and crisp white cards to maximize contrast and sustained reading comfort under rigorous multi-hour sessions.

### Core Palette
- **Primary Navy (`#0B192C`):** Used for top-level operational chrome, global navigation bars, modal headers, and dominant primary action triggers.
- **Secondary Slate (`#1E293B`):** Applied to secondary headers, table section titles, side navigation panels, and structural divider accents.
- **Tertiary Blue (`#2563EB`):** Dedicated interactive accent for primary links, keyboard focus indicators, active tab markers, and selection states.
- **Neutral Core (`#64748B`):** Supporting metadata, tabular secondary markers, and inactive structural elements.

### Surface Tiers
- **Canvas Base:** `#F8FAFC` (Cool grey-white providing reduced eye glare during long operational shifts).
- **Secondary Surface Canvas:** `#F1F5F9` (Data grid alternate striping, nested child panels, and read-only container backdrops).
- **Card & Data Surface:** `#FFFFFF` (Elevated data cards, dropdown menus, filter trays, and primary table views).

### Borders & Dividers
- **Hairline Border:** `#E2E8F0` (Default cell dividers, form outlines, panel splits).
- **Structural Border:** `#CBD5E1` (Emphasized column boundaries, active input focus bases, header bottom rules).

### Semantic & Operational Tokens
- **Overdue / Critical SLA Breach:** Crimson Red `#DC2626` text, `#FEE2E2` fill, `#FECACA` border.
- **Warning / Due Today:** Warm Amber `#D97706` text, `#FEF3C7` fill, `#FDE68A` border.
- **Verified / Compliant:** Emerald Slate `#15803D` text, `#DCFCE7` fill, `#BBF7D0` border.
- **Draft / In Review / Pending:** Slate Blue `#4338CA` text, `#EEF2FF` fill, `#E0E7FF` border.

## Typography

Typography strictly serves scannability, vertical compacting, and unambiguous identification of complex reference numbers. 

### Font Pairing
- **Primary Typeface (Inter):** Leveraged for all navigation, headings, metadata, narrative notes, and field labels. Inter provides clean vertical metrics, neutral geometric terminals, and high legibility at micro scales (11px–13px).
- **Tabular Data Typeface (JetBrains Mono):** Mandated for LEI numbers, corporate tax IDs, case tracking references, ISO currency entries, timestamps, and SLA countdown tickers. It prevents visual drift when cross-referencing vertical columns.

### Type Scale Rules
- **Header Discipline:** Top-level page titles never exceed 24px (`headline-lg`). Visual impact is generated through contrast and structured density rather than oversized display text.
- **Tabular Lining Numbers:** All numerical fields in standard body copy must use OpenType tabular figure flags (`tnum`) to ensure aligned accounting tables.
- **Uppercase Labels:** Micro-badges, table headers, and field categories use `label-sm` with a `0.04em` letter spacing for rapid categorization.

## Layout & Spacing

The layout model is a **fluid, full-canvas responsive grid** engineered for dual-monitor workstation environments (1920x1080 and above) while remaining operational on portable analyst laptops.

### Grid Architecture
- **Desktop (>=1440px):** 12-column dynamic fluid layout. Default gutter is `1rem` (16px), with canvas margins locked at `1.5rem` (24px). Sidebar workspaces (e.g., Document Viewer split-screen) collapse into 4/8 or 6/6 column splits.
- **Compact Workspace / Laptop (1024px–1439px):** 12-column layout with `0.75rem` (12px) gutters and `1rem` (16px) margins. Side filters convert to docked accordions.
- **Tablet / Lower Resolving Screens (<1024px):** Operational views shift to single primary workbench with slide-over drawers for KYC file scrutiny.

### Spacing Principles
- Compact vertical rhythms are standard: table cell padding adheres to `0.5rem` (8px) vertical and `0.75rem` (12px) horizontal.
- Information grouping relies primarily on `0.25rem`–`0.5rem` (`space-xs` to `space-sm`) gaps between field labels and controls.
- Major document chase sections and entity verification tiers are partitioned using explicit `1.5rem` (`space-xl`) breaks.

## Elevation & Depth

To maintain institutional authority and reduce visual clutter, this design system rejects heavy drop shadows in favor of **structural borders combined with subtle, high-spread ambient diffusion**.

### Layering Rules
- **Base Canvas (`#F8FAFC`):** Lowest layer containing global page views and workflow queues.
- **Tier 1 (Surface Cards & Grids - `#FFFFFF`):** Sits on the base with a hairline outline (`1px solid #E2E8F0`) and an imperceptible grounding tint: `0 1px 2px 0 rgba(15, 23, 42, 0.04)`.
- **Tier 2 (Popovers, Sticky Headers & Filter Trays):** Bordered with `#CBD5E1` and layered above the grid: `0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.04)`.
- **Tier 3 (Modals & Split Inspection Drawers):** Encased in `#CBD5E1` with high-def focus depth: `0 10px 15px -3px rgba(15, 23, 42, 0.1), 0 4px 6px -4px rgba(15, 23, 42, 0.05)`, backed by a `50%` opacity slate backdrop (`#0B192C` at `0.5`).

### Focus Rings
All keyboard-focused interactive components display a crisp, non-blurred `2px` solid ring in `#2563EB` with an offset of `2px` to guarantee zero ambiguity during rapid tab-indexing.

## Shapes

The design system uses a **Soft (Level 1)** corner architecture. This ensures a disciplined, professional cadence that feels modern while avoiding the casual, toy-like appearance of rounded or pill interfaces.

### Corner Radius Tokens
- **Base Components (`0.25rem` / 4px):** Form inputs, buttons, status chips, tabular badges, and table header rows.
- **Containers & Cards (`0.5rem` / 8px):** Case record cards, split-pane inspection panels, modals, and slide-in trays.
- **Never Used:** Pill shapes (`9999px`) or ultra-round contours (`>8px`). Roundness must never conflict with tabular column alignments or micro-spacing margins.

## Components

### 1. Data Tables (High-Density Workbench)
- **Header:** Sticky positioning (`top: 0`), background `#F1F5F9`, typography `label-sm` uppercase, border bottom `2px solid #CBD5E1`.
- **Rows:** Alternate row striping using `#FFFFFF` and `#F8FAFC`. Default row height constrained to `36px` (compact) or `44px` (standard). Row borders are `1px solid #E2E8F0`.
- **Hover & Selection:** Hover applies `#F1F5F9`. Multi-selected rows feature a `2px` left inset bar in `#2563EB` with a surface tint of `#EFF6FF`.
- **Sticky Column:** Fixed leftmost column for Legal Entity Name and internal Case ID with a subtle right-border rule.

### 2. Status Chips & Badges
- **Structure:** Always display an explicit inline SVG status icon (12px) paired with uppercase `label-sm` text. Never rely on color alone.
- **Overdue Badge:** Background `#FEF2F2`, border `#FECACA`, text `#DC2626`, icon: Alert Circle.
- **Due Today / Warning Badge:** Background `#FEF3C7`, border `#FDE68A`, text `#D97706`, icon: Clock / Triangle Alert.
- **Verified / On Track Badge:** Background `#DCFCE7`, border `#BBF7D0`, text `#15803D`, icon: Check Circle.
- **Draft / In Review Badge:** Background `#EEF2FF`, border `#E0E7FF`, text `#4338CA`, icon: Refresh / Document.

### 3. Action Buttons
- **Primary:** Background `#0B192C`, text `#FFFFFF`, hover `#1E293B`, focus ring `2px solid #2563EB`. Padding: `6px 12px` (dense) or `8px 16px` (standard).
- **Secondary:** Background `#FFFFFF`, border `1px solid #CBD5E1`, text `#0F172A`, hover `#F8FAFC`.
- **Destructive:** Background `#DC2626`, text `#FFFFFF`, hover `#B91C1C`.
- **Chase Trigger (Tertiary Direct):** Transparent base with `#2563EB` text, underlined on hover, used inline inside table cells.

### 4. Input Fields & Selectors
- **Height & Spacing:** Form elements adhere strictly to a `32px` (dense) or `36px` (standard) vertical scale.
- **State Visuals:** Default border `1px solid #CBD5E1`, background `#FFFFFF`. Active focus changes border to `#2563EB` with matching `2px` focus outline. Error state triggers `1px solid #DC2626` with red input text.
- **Read-Only / System-Verified:** Background `#F1F5F9`, border `1px solid #E2E8F0`, cursor `default`.

### 5. Checkboxes & Radio Controls
- **Geometry:** Checkboxes use `4px` corner radii; radio targets are circular. Size: `14px x 14px`.
- **Unchecked:** Border `1px solid #94A3B8`, background `#FFFFFF`.
- **Checked:** Background `#0B192C`, border `#0B192C`, interior glyph `#FFFFFF`.

### 6. Document Inspection Cards
- Enclosed modules for Kyc/AML corporate filings (e.g., Certificate of Incorporation, UBO registers).
- Header carries file name, version timestamp (`data-mono-sm`), and status chip.
- Lower chassis features quick document chase actions (`Send Reminder`, `Reject with Deficiency Note`, `Mark as Verified`).