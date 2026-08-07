# Redline - UI / Brand Guide

> Reference for widget UI decisions. The actual color theme is driven by
> Nuxt UI `ui.colors` in `vite.config.ts` (primary: rose, secondary: purple,
> neutral: slate, success: lime, info: teal, warning: yellow, danger: red).
> This document captures design intent, not pixel-accurate hex values.

## 1 · Brand Personality

Redline is a **staging-environment bug-reporting tool** embedded inside a host page.
It must feel like a *precision instrument*, not a marketing product.

| Trait | What it means in practice |
|---|---|
| **Unobtrusive** | Invisible at rest; wakes up when needed |
| **Precise** | Clear visual hierarchy; every pixel deliberate |
| **Developer-adjacent** | Clean, dark, efficient |
| **Trustworthy** | Consistent patterns; nothing surprises the user |

## 2 · Typography

**Family:** `system-ui, -apple-system, 'Segoe UI', sans-serif` - no custom web font.
**Monospace:** `monospace` - only for technical strings (element selectors, raw URLs).
