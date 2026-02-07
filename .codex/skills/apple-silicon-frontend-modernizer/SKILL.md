---
name: apple-silicon-frontend-modernizer
description: Upgrade existing frontend applications into modern Apple-silicon-inspired animated web experiences with depth, clarity, and premium motion. Use when users ask to refresh UI/UX, modernize visual design, add meaningful animations, improve interaction polish, or align a FE app with Apple-like product aesthetics while keeping accessibility and performance strong.
---

# Apple Silicon Frontend Modernizer

## Overview

Use this skill to redesign and implement frontend upgrades that feel precise, calm, and premium. Focus on intentional typography, layered surfaces, fluid motion, and strict performance and accessibility constraints.

## Workflow

1. Confirm scope and constraints.
Decide whether to update the full app, a page, or a component set. Capture framework, design system limits, browser support, animation appetite, and performance budgets.

2. Run a UI and interaction audit.
Review typography, spacing rhythm, color depth, hierarchy, interaction states, and perceived latency. Record concrete gaps and rank by impact.

3. Define the Apple-inspired direction.
Choose a visual system with:
- Crisp typography with expressive font pairing (avoid default `Inter`/`Roboto`/`Arial` stacks unless already required).
- Layered backgrounds (gradient fields, soft noise, translucency) instead of flat fills.
- Controlled motion language: spring-like easing, short enter transitions, purposeful hover/press responses.
- Compact, high-contrast information hierarchy and generous whitespace.

4. Implement with reusable tokens first.
Create or update design tokens (color, radius, blur, elevation, motion duration/easing). Then apply them across layout primitives before polishing component-level animations.

5. Guard accessibility and performance.
Respect `prefers-reduced-motion`, preserve keyboard/focus visibility, and keep contrast and hit targets compliant. Avoid heavy repaint patterns (large blur + frequent transforms) and keep animation on transform/opacity where possible.

6. Verify and report.
Run project verification commands and summarize changed files, UX outcomes, and measurable improvements (CLS/LCP responsiveness, interaction smoothness, accessibility checks).

## Implementation Rules

- Preserve existing architecture and design-system contracts unless user asks for structural changes.
- Prefer CSS variables and shared motion utilities over one-off inline styles.
- Use 2-4 meaningful animations per page rather than many micro-effects.
- Keep transitions fast and subtle; avoid long decorative motion.
- Ensure desktop and mobile layouts both feel intentional.

## Trigger Examples

- "Modernize this dashboard to feel like Apple product pages."
- "Improve this React app UI with premium motion and glass depth."
- "Refresh this frontend with animated interactions and better visual hierarchy."
- "Make this web page feel Apple-silicon-level polished without killing performance."

## Resources

- Read `references/apple-motion-style-guide.md` for visual direction, animation constraints, and Do/Don't patterns.
- Read `references/frontend-modernization-checklist.md` for a repeatable audit and implementation checklist.
- Reuse `assets/apple-motion-tokens.css` as a starting token file for motion, depth, and surface styling.
