# Apple Motion Style Guide

## Visual Direction

- Build calm, premium surfaces using neutral foundations and restrained accents.
- Prefer soft depth with layered shadows and translucent panels over hard borders.
- Use strong typographic hierarchy: large clear headings, compact supportive text, generous spacing.

## Motion System

- Use short enter transitions: 180-320ms.
- Use hover/press transitions: 120-180ms.
- Prefer easing curves that feel spring-like but controlled.
- Limit simultaneous motion groups; stagger only when hierarchy benefits.

## Animation Patterns

- Page load: fade + translateY(8-16px) staggered by section.
- Cards: subtle lift and shadow bloom on hover.
- CTA: tiny scale and luminance shift on hover/press.
- Modals/drawers: opacity + transform only, no layout reflow animation.

## Accessibility Rules

- Always provide reduced-motion fallback with near-instant transitions.
- Keep focus rings visible and stylistically integrated.
- Maintain readable contrast on translucent backgrounds.

## Performance Rules

- Animate transform and opacity first.
- Avoid expensive continuous blur animations.
- Keep large backdrop-filter usage sparse and static where possible.
- Test low-power mobile devices before finalizing motion intensity.

## Avoid

- Long cinematic animations.
- Excess parallax or scroll-jacking.
- Random animation timing per component.
- Flat single-layer backgrounds for hero sections.
