import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import ui from '@nuxt/ui/vite'
import { fileURLToPath, URL } from 'node:url'

// Two IIFE bundles from one config. Dev (`vite`) serves BOTH entries as ESM from a
// single process - no lib/IIFE constraint applies. Build runs twice, once per target
// (REDLINE_TARGET=widget|dashboard), because lib+IIFE allows only one entry per pass.
//
// The widget entry compiles its root as a Vue Custom Element (Shadow DOM) and needs no
// router; the dashboard is a mounted SPA with vue-router. Nuxt UI's `ui()` plugin bundles
// Tailwind processing (@tailwindcss/vite), auto-imports `U*` components, and generates the
// component type declarations.
const TARGETS = {
    widget: {
        entry:       'src/widget.ts',
        name:        'Redline',
        fileName:    'redline.js',
        cssFileName: 'redline',
    },
    dashboard: {
        entry:       'src/dashboard.ts',
        name:        'RedlineDashboard',
        fileName:    'redline-dashboard.js',
        cssFileName: 'redline-dashboard',
    },
} as const

type TargetKey = keyof typeof TARGETS

export default defineConfig(({ mode }) => {
    const targetKey = (process.env.REDLINE_TARGET ?? 'widget') as TargetKey
    const target = TARGETS[targetKey]
    const isDashboard = targetKey === 'dashboard'

    return {
        plugins: [
            vue(), // `.ce.vue` roots are compiled as custom elements by default
            ui({
                // `router` gates Nuxt UI's Link override: with it, U* `to` renders a
                // vue-router link; without it, a plain <a>. Production builds get the
                // real per-target value (isDashboard). Dev (`vite`) serves BOTH entries
                // from ONE config with REDLINE_TARGET unset (defaults to 'widget' →
                // router:false), which would make the dashboard's nav use plain anchors
                // (full page reloads) - so in dev the router override is always enabled.
                // Safe for the widget: its only U* `to` usages are external protocol
                // URLs with target="_blank" (ToolbarMenu.vue, ReportDetailsVideo.vue,
                // ReportDetailsScreenshot.vue), which take the plain-anchor branch. But
                // the override's setup still calls useRoute() unconditionally, and
                // inject(routeLocationKey) warns on a missing key whether or not the
                // result is used, so in dev the widget provides a route stub - see the
                // configureApp shim in src/widget.ts.
                router: isDashboard || mode === 'development',
                // Both apps drive dark mode from store.settings.theme, so Nuxt UI's
                // color-mode plugin (useDark → `.dark` on <html>) is disabled. The widget
                // sets `.dark` on its shadow wrapper (never touching the host <html>); the
                // dashboard, a standalone page, sets `.dark` on its own <html>.
                colorMode: false,
                theme: {
                    defaultVariants: {
                        color: 'neutral',
                    }
                },
                ui: {
                    colors: {
                        primary: 'rose',
                        secondary: 'purple',
                        neutral: 'slate',
                        success: 'lime',
                        info: 'teal',
                        warning: 'yellow',
                        danger: 'red'
                    },
                    modal: {
                        slots: {
                            content: 'bg-muted',
                            header: 'p-3 sm:px-3 items-start justify-between min-h-0',
                            body: 'p-3 sm:p-3 sm:px-3',
                            footer: 'p-2 sm:px-2 justify-between bg-elevated'
                        },
                        variants: {
                            fullscreen: {
                                false: {
                                    content: 'rounded-2xl'
                                }
                            }
                        }
                    },
                    popover: {
                        slots: {
                            content: 'rounded-2xl bg-muted'
                        }
                    },
                    tooltip: {
                        slots: {
                            content: 'rounded-md bg-muted'
                        }
                    },
                    button: {
                        defaultVariants: {
                            variant: 'ghost',
                        },
                        slots: {
                            base: 'rounded-xl'
                        }
                    },
                    editor: {
                        slots: {
                            base: [
                                'w-full outline-none *:my-1 *:first:mt-0 *:last:mb-0 sm:px-0 selection:bg-primary/20',
                                '[&_p]:leading-5',
                                '[&_a]:text-primary [&_a]:border-b [&_a]:border-transparent [&_a]:hover:border-primary',
                                '[&_a]:transition-colors',
                                '[&_a>code]:border-dashed [&_a:hover>code]:border-primary [&_a:hover>code]:text-primary',
                                '[&_a>code]:transition-colors',
                                '[&_.mention]:text-primary [&_.mention]:font-medium',
                                '[&_:is(h1,h2,h3,h4,h5,h6)]:text-highlighted [&_:is(h1,h2,h3,h4,h5,h6)]:font-bold',
                                '[&_h1]:text-3xl',
                                '[&_h2]:text-2xl',
                                '[&_h3]:text-xl',
                                '[&_h4]:text-lg',
                                '[&_h5]:text-base',
                                '[&_h6]:text-base',
                                '[&_:is(h1,h2,h3,h4,h5,h6)>code]:border-dashed [&_:is(h1,h2,h3,h4,h5,h6)>code]:font-bold',
                                '[&_h2>code]:text-xl/6',
                                '[&_h3>code]:text-lg/5',
                                '[&_blockquote]:border-s-4 [&_blockquote]:border-accented [&_blockquote]:ps-4 [&_blockquote]:italic',
                                '[&_[data-type=horizontalRule]]:my-4 [&_[data-type=horizontalRule]]:py-1',
                                '[&_hr]:border-t [&_hr]:border-default',
                                '[&_pre]:text-sm/6 [&_pre]:border [&_pre]:border-muted [&_pre]:bg-muted [&_pre]:rounded-md [&_pre]:px-2 [&_pre]:py-1 [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:overflow-x-auto',
                                '[&_pre_code]:p-0 [&_pre_code]:text-inherit [&_pre_code]:font-inherit [&_pre_code]:rounded-none [&_pre_code]:inline [&_pre_code]:border-0 [&_pre_code]:bg-transparent',
                                '[&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm [&_code]:font-mono [&_code]:font-medium [&_code]:rounded-md [&_code]:inline-block [&_code]:border [&_code]:border-muted [&_code]:text-highlighted [&_code]:bg-muted',
                                '[&_ul]:ps-5 [&_ul]:list-disc [&_ul]:marker:text-(--ui-border-accented)',
                                '[&_ol]:ps-4 [&_ol>li]:ps-1 [&_ol]:list-decimal [&_ol]:marker:text-muted',
                                '[&_li]:ps-0 [&_li]:my-0',
                                '[&_img]:rounded-md [&_img]:block [&_img]:max-w-full [&_img.ProseMirror-selectednode]:outline-2 [&_img.ProseMirror-selectednode]:outline-primary',
                                '[&_.ProseMirror-selectednode:not(img):not(pre):not([data-node-view-wrapper])]:bg-primary/20'
                            ]
                        }
                    }
                }
            }),
        ],
        resolve: {
            alias: {
                '@': fileURLToPath(new URL('./src', import.meta.url)),
            },
            // Force a SINGLE instance of ProseMirror + TipTap. Two copies of
            // prosemirror-state each start their plugin-key counter at "plugin$",
            // so combining them in one editor throws "Adding different instances of
            // a keyed plugin". Nuxt UI's UEditor pulls these transitively.
            dedupe: [
                '@tiptap/core', '@tiptap/pm', '@tiptap/vue-3', '@tiptap/starter-kit',
                'prosemirror-state', 'prosemirror-view', 'prosemirror-model', 'prosemirror-transform',
                'prosemirror-keymap', 'prosemirror-commands', 'prosemirror-schema-list',
                'prosemirror-dropcursor', 'prosemirror-gapcursor', 'prosemirror-history',
                'prosemirror-inputrules', 'prosemirror-trailing-node',
            ],
        },
        // Pre-bundle the TipTap/ProseMirror entrypoints together so dev serves one
        // shared prosemirror-state (avoids the optimized-vs-raw double instance).
        optimizeDeps: {
            include: [
                '@tiptap/vue-3', '@tiptap/core', '@tiptap/starter-kit',
                '@tiptap/pm/state', '@tiptap/pm/view', '@tiptap/pm/model', '@tiptap/pm/transform',
                '@tiptap/pm/keymap', '@tiptap/pm/commands', '@tiptap/pm/schema-list',
                '@tiptap/pm/dropcursor', '@tiptap/pm/gapcursor', '@tiptap/pm/history',
            ],
        },
        publicDir: false,
        server: {
            cors: true,
            port: 5173,
            warmup: {
                clientFiles: [
                    './src/**/*.vue',
                    './src/**/*.ts',
                    './css/*.css',
                ],
            },
            watch: {
                // Denylist only. An allowlist (`['**', '!src']`) prunes the parent
                // directories chokidar needs to descend, which stops Tailwind v4 from
                // detecting newly-typed utility classes until a full page reload. Vite
                // already ignores node_modules/.git and merges this on top, so we just
                // exclude the compiled output and PHP-side dirs.
                ignored: [
                    '**/docs/**',
                    '**/node_modules/**',
                    '**/tests/**',
                    '**/dist/**',
                ],
            },
        },
        define: {
            // Replace process.env.NODE_ENV in the bundle so browsers don't throw
            // (Vue and other libs gate devtools/warnings behind this variable)
            'process.env.NODE_ENV': JSON.stringify(mode),
        },
        test: {
            // Logic-only unit tests (utils / store slices / identity). Reuses the
            // '@' alias above; happy-dom covers location/cookie/localStorage access.
            environment: 'happy-dom',
            globals: true,
            include: ['tests/**/*.test.{js,ts}'],
        },
        build: {
            minify:    mode === 'development' ? false : 'esbuild',
            sourcemap: mode === 'development' ? 'inline' : false,
            lib: {
                entry:       target.entry,
                formats:     ['iife'],
                name:        target.name,
                fileName:    () => target.fileName,
                cssFileName: target.cssFileName,
            },
            outDir: 'dist',
            emptyOutDir: false,
            watch: mode === 'development' ? { exclude: ['dist/**'] } : null,
            rollupOptions: {
                onwarn(warning, warn) {
                    // @vueuse/core ships misplaced #__PURE__ annotations - harmless, just noise
                    if (warning.code === 'INVALID_ANNOTATION') return
                    warn(warning)
                },
            },
        },
    }
})
