# Frontend Modernization Checklist

## 1. Baseline Audit

- Capture before screenshots (desktop + mobile).
- Note current typography stack and spacing scale.
- Record pain points in hierarchy, readability, and interaction feedback.
- Run baseline performance/accessibility checks.

## 2. Token Foundation

- Define color tokens for background, surface, text, accent.
- Define radius, shadow, blur, and border-opacity tokens.
- Define motion duration and easing tokens.
- Define responsive spacing scale.

## 3. Layout and Surfaces

- Replace flat backgrounds with layered gradient/surface composition.
- Normalize container widths and vertical rhythm.
- Introduce surface hierarchy for cards, panels, and overlays.

## 4. Interaction and Motion

- Add entry motion to major sections only.
- Add hover/press/focus feedback to interactive elements.
- Add transition consistency across buttons, cards, and nav.
- Implement reduced-motion behavior.

## 5. Quality Gate

- Verify no focus trap or keyboard regressions.
- Validate contrast and legibility in all states.
- Confirm mobile layout and motion quality.
- Re-run perf/accessibility checks and compare to baseline.
