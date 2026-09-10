---
name: anti-ai-slop-design
description: "Standards, anti-patterns, heuristics, and verification checklist to permanently prevent AI slop in UI, dashboard, and web design. Enforces data honesty, real keyboard listeners, domain-specific vocabulary, and human intentionality."
risk: safe
source: "studentops/anti-slop-design"
date_added: "2026-09-10"
---

# Anti-AI-Slop Design Standards & Heuristics

This skill establishes strict principles, anti-patterns, and verification procedures to permanently eliminate **"AI Slop"** from interface and dashboard engineering.

---

## 1. What is "AI Slop" in UI Design?

AI Slop occurs when generative models regurgitate the statistical median of their training sets rather than designing with human intentionality and domain understanding. 

It is characterized by:
- Superficial imitation of premier products (Linear, Vercel, Apple) without providing functional mechanics.
- Faux-technical jargon masking a lack of domain knowledge.
- Fabricated data points, trends, and shortcuts that deceive users.
- Homogenized, repetitive bento grids that degrade information hierarchy.

---

## 2. The 10 Deadly Sins of AI Design Slop

### Sin 1: Sci-Fi & DevOps Cosplay (Domain Dishonesty)
- **The Slop**: Calling standard operations software a "cockpit", "telemetry grid", "mission control", or "matrix". Using badges like `"Systems Nominal"`, `"All Systems Go"`, and glowing pulsating green LEDs on apps that have no system telemetry. Writing subtitles like `"AI agent ready for multi-turn execution"`.
- **The Rule**: Use authentic, human-centric, domain-accurate language. In operations/HR: "Operations Overview", "Attendance Rosters", "Task Grading Queue", "Cohort Schedule".

### Sin 2: The Metric Card Lie (Fake Trends & Phantom Deltas)
- **The Slop**: Slapping fake trend badges like `+100% verified`, `+12.4% from last week`, or `'next in 2 days'` into colored percentage chips when no historical baseline or rate-of-change calculation exists.
- **The Rule**: Never fabricate a trend. If there is no time-series historical baseline, display truthful secondary operational context (e.g. `18 Present · 2 Late · 1 Absent` or `Enrolled across 4 committees`).

### Sin 3: Ghost Shortcuts & Cargo Cult Badges
- **The Slop**: Rendering `⌘1`, `⌘2`, `⌘K`, or `Ctrl+Enter` badges on buttons and search bars without attaching active keyboard event listeners (`window.addEventListener('keydown', ...)`). Pressing `⌘1` simply switches browser tabs.
- **The Rule**: If an interface displays a keyboard shortcut badge, it **must be 100% functional, bound, and tested**. Otherwise, do not render a shortcut badge.

### Sin 4: Fetching Data to Drop It
- **The Slop**: Calling real endpoints in `Promise.all([api.getStats(), api.getMeetings(), api.getEvents(), ...])`, dropping the variable (`const [stats, meetings, , scores] = ...`), and replacing it with hardcoded mock text in the UI (`"next in 2 days"`).
- **The Rule**: If an API endpoint is queried, its data must be bound to the UI. If data is not needed, do not waste bandwidth fetching it.

### Sin 5: Hardcoding Developer or Personal Data
- **The Slop**: Hardcoding specific developer names or prompt queries (e.g. `prompt: "Show me Ziad's evaluation scores"`) into global template cards or action chips.
- **The Rule**: All action chips and prompts must be dynamic, role-tailored, and generic to any user on the platform.

### Sin 6: The Bento Grid Monoculture
- **The Slop**: Forcing every single dashboard into uniform 4-column grids of identical square boxes with an icon in a pastel square, a giant number, and a fake trend chip.
- **The Rule**: Design with visual rhythm and variable density. Pair high-density tabular records with clean summary metrics, chronological event timelines, and focused action lists.

### Sin 7: Hero & Robot Worship (AI Billboard Slop)
- **The Slop**: Dominating dashboards with giant "Launch AI Agent" hero banners, robot mascots, and glowing purple gradients on screens where users came to complete real work.
- **The Rule**: The user interface serves the human user. The AI agent is an integrated capability, not a narcissistic billboard. Keep triggers understated, functional, and contextual.

### Sin 8: Role Blindness & Ignored Context
- **The Slop**: Rendering an identical static dashboard for every user, ignoring whether they are an Admin, Committee Head, or Student Member.
- **The Rule**: Always pass the authenticated user (`currentUser`) into dashboard views and tailor metrics, pending tasks, and action starters to their exact role and team.

### Sin 9: Happy-Path Delusion
- **The Slop**: Hardcoding `items.slice(0, 3)` with no empty states, no loading skeletons, no overflow handling, and no way to view the full dataset. Hardcoding badges like `"Processed"` regardless of whether an item is scheduled or cancelled.
- **The Rule**: Always handle zero states, loading skeletons, and real status fields (`COMPLETED`, `LIVE`, `SCHEDULED`). Always provide a drilldown link (`View All →`).

### Sin 10: Emoji & Vibe Slop
- **The Slop**: Sprinkling emojis across UI headers, buttons, cards, and responses to fake "friendliness", or adding decorative ambient gradient meshes that create visual noise.
- **The Rule**: Strictly adhere to the project's design system: No emojis anywhere; use clean Lucide icons, Cairo font for Arabic text, and high-contrast, accessible typography.

### Sin 11: The Duplicate Page Header Icon Box ("Favicon on the Title")
- **The Slop**: Slapping a colored rounded block (e.g. `<div className="w-8 h-8 rounded bg-emerald-600 flex items-center justify-center shadow-sm"><Icon className="w-4 h-4 text-white" /></div>`) or an inline icon right next to the page `<h1>`/`<h2>` heading. Because the navigation sidebar and mobile headers already display the section icon, repeating it in a colorful square badge next to the page title is redundant visual clutter, ruins clean typographic alignment, and is an unmistakable hallmark of AI template slop.
- **The Rule**: Keep page titles purely typographic and crisp (`<h1 className="text-xl font-bold text-slate-900 tracking-tight">Title</h1>`). Never prepend decorative icon boxes or favicons to main page headings.

### Sin 12: Mobile Horizontal Table Scroll & Column Bloat
- **The Slop**: Packing 8–10 columns into a table, fragmenting single composite entities across multiple columns (e.g. separate columns for English Name and Arabic Name, or separate columns for Attendance Progress and Attendance Counts), and wrapping the result in `<div className="overflow-x-auto"><table className="min-w-[640px]">`. On mobile screens (320px–480px), users are trapped having to swipe horizontally back and forth between a row's name on the left and its scores or action buttons on the right.
- **The Rule**:
  1. **Zero Horizontal Scroll on Mobile**: Always provide a dual-mode responsive layout: `hidden md:block` for the dense desktop table, and `block md:hidden` transforming rows into structured, high-utility **Data Cards**. Cards present the primary identity, a compact key-value metric strip, and full-width touch-accessible action buttons.
  2. **Composite Grouping**: Merge single composite concepts into cohesive cells (Arabic primary in Cairo font + Latin secondary; Role + University stacked; Progress meter + count breakdown merged).
  3. **No Redundant Sub-Scores or Sequence Badges**: Never render sub-scores (such as `Interaction /5`) in top-level table columns when composite parent scores (`Behavior /23`) already include them. Never display redundant sequence pills (e.g., `Session #1`) right next to a title that already says `Session 1: ...` or when chronological context (date, meeting code) already identifies the entry.

---

## 3. Pre-Commit Anti-Slop Verification Checklist

Before submitting any UI component or dashboard change, verify:
- [ ] **Zero Fake Trends**: Are all deltas, percentages, and metrics calculated from real data?
- [ ] **Zero Ghost Shortcuts**: Does every displayed `⌘` or `Ctrl` shortcut have an active keyboard handler?
- [ ] **Zero Duplicate Header Icons**: Are page titles clean and typographic without redundant icon boxes or badges that duplicate the sidebar?
- [ ] **Zero Mobile Horizontal Table Scroll**: Do all tables transform gracefully into responsive cards on mobile (`block md:hidden`) without requiring horizontal scrolling?
- [ ] **Zero Redundant Columns & Badges**: Are composite identities (Arabic + Latin name), contacts, and metrics grouped efficiently without duplicate sub-scores or redundant sequence pills (`Session #X`)?
- [ ] **Zero Sci-Fi Jargon**: Is the vocabulary grounded in the product's actual domain (no "cockpit", "telemetry", "systems nominal")?
- [ ] **Zero Discarded APIs**: Are all fetched API responses in `Promise.all` actively bound to the view?
- [ ] **Zero Personal Hardcoding**: Are all names and prompts dynamic and role-appropriate?
- [ ] **Role-Adaptive**: Does the screen adapt meaningfully to `currentUser.role`?
- [ ] **Zero Emojis**: Are all icons from Lucide, with typography handled cleanly in English and Arabic?
- [ ] **Build Validation**: Does `npm run build` pass with 0 errors?
