# CLAUDE.md

This file defines **non-negotiable rules and workflow expectations** for Claude Code (claude.ai/code) when working in this repository.  
Treat this document as a **project constitution**, not a suggestion.

---

## Development Commands

```bash
npm start          # Start Expo dev server
npm run android    # Start on Android
npm run ios        # Start on iOS
npm run web        # Start on web
npm run lint       # Run ESLint
```

---

## Core Principles

- Optimize for clarity over cleverness
- Code should be easy to read, easy to delete, easy to extend
- Prefer explicit, boring solutions over abstraction
- Visual fidelity and product intent matter more than technical novelty
- This is vibe coding, but with senior-engineer discipline

---

## Mandatory Workflow (Follow in Order)

1. Propose a plan before writing any code
   - Describe architecture, files touched, and responsibilities
   - Keep it concise but complete

2. Confirm before implementing
   - New libraries
   - New patterns or abstractions
   - Non-trivial logic or data models
   - Structural refactors

3. If uncertain
   - Present 2 clear options
   - Explain tradeoffs
   - Recommend one explicitly

4. Do not write code unless you are at least 98% confident in correctness and intent

---

## Code Quality Standards (Strict)

- Components must be:
  - Small
  - Focused
  - Single-responsibility
- Prefer:
  - Named functions over inline logic
  - Early returns over nested conditionals
  - Flat structures over deep trees
- Avoid:
  - Over-abstraction
  - Premature optimization
  - Future-proofing unless requested

---

## Styling & Readability

- Code should be readable without comments
- Use comments only to explain why, not what
- Consistent formatting and naming is mandatory
- No clever one-liners if they reduce clarity

---

## Product & Design Constraints

- Visual fidelity to wireframes is the top priority
- Do not reinterpret product intent
- Do not improve UX or flows unless explicitly asked
- Ask before:
  - Changing spacing, layout, hierarchy, or motion
  - Introducing new UI patterns or interactions

Product taste belongs to the human, not the model.

---

## Refactors

- Allowed only if they:
  - Improve clarity
  - Improve maintainability
  - Improve fidelity to product intent
- Never refactor just because
- Always explain refactor value before doing it

---

## Security & Configuration

- Never hardcode secrets
- Always use:
  ```ts
  process.env.*
  ```
- If environment setup is unclear, ask first

---

## Mandatory Post-Implementation Review

After writing any code, Claude must perform a self-review before presenting the final answer:

- Re-read all changed files top to bottom
- Check for:
  - Runtime errors
  - Edge cases
  - Incorrect assumptions
  - Missing imports or dependencies
  - Type mismatches
  - Broken navigation or state flows
- Ensure:
  - Code matches the approved plan
  - No unintended side effects were introduced
  - No leftover TODOs, console logs, or dead code

If any issues are found, fix them **before** responding.

---

## Final Rule

If there is any ambiguity, stop and ask.  
Incorrect confidence is worse than slow progress.
