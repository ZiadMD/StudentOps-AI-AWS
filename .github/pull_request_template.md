## Pull Request Overview

### Summary of Changes
<!-- Provide a clear, high-level summary of what this PR introduces or fixes. -->

### Related Issues
<!-- Link related issues using GitHub keywords, e.g., Closes #12, Fixes #34 -->

---

## Type of Change
- [ ] **Bug Fix** (non-breaking fix for an existing issue)
- [ ] **New Feature** (non-breaking addition to functionality)
- [ ] **Agent / Tooling Update** (new ReAct tool, prompt modification, or policy change)
- [ ] **UI / UX Polish** (visual improvements following 2026 SaaS guidelines)
- [ ] **Performance / Refactor** (code restructuring without functional change)
- [ ] **Security / Auth** (permissions, sensitive barriers, secrets management)
- [ ] **Documentation** (updates to README, AGENTS.md, or architecture docs)

---

## Verification & Testing Checklist

### Backend Checks
- [ ] Dependencies synced via `uv sync`
- [ ] Database seeds successfully: `uv run python -m app.seed.seed_data`
- [ ] Automated tests pass: `uv run pytest tests -v`
- [ ] Any sensitive agent actions enforce `requires_confirmation=True` and log to Audit

### Frontend Checks
- [ ] Production build succeeds with **zero TypeScript errors**: `npm run build`
- [ ] Tested responsive layout and light-mode hierarchy
- [ ] Dual Arabic + English strings render cleanly without layout overflow
- [ ] AI Agent streaming renders tokens smoothly with blinking cursor

### Security & Anti-Slop Hygiene
- [ ] No hardcoded API keys, tokens, or credentials in commit history
- [ ] Zero emoji slop in UI, prompts, agent responses, or documentation
- [ ] `.env` is omitted and `.env.example` is updated if new environment variables were introduced

---

## Screenshots / Demos (If Applicable)
<!-- Add screenshots, screen recordings, or tool trace previews here -->
