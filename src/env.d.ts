/// <reference types="vite/client" />

export {}

// Globals set by the bootstraps for the Blade shells to instantiate.
declare global {
    interface Window {
        Redline?: unknown
    }
}

// SFC modules for the TypeScript language service (vue-tsc resolves the real types).
// The `*.vue` glob also matches `*.ce.vue` custom-element SFCs.
declare module '*.vue' {
    import type { DefineComponent } from 'vue'
    const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
    export default component
}
