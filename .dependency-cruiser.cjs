/**
 * Layering rules for src. Dependencies point DOWN only:
 *
 *   domain/     ← (leaf) pure business logic — no imports from other app layers
 *   core/       → domain/                         (browser I/O + API transport)
 *   resources/  → core/, domain/, composables/    (feature-based data fetching)
 *   store/      → resources/, domain/, core/, composables/
 *   components/ → everything
 *
 * Cross-resource imports within resources/ are allowed (e.g. comment/mutations.ts
 * importing report/keys.ts for cache invalidation).
 */
module.exports = {
    forbidden: [
        {
            name: 'domain-is-a-leaf',
            comment: 'domain/ is pure logic — it must not import from core/, resources/, store/, components/, or composables/.',
            severity: 'error',
            from: { path: '^src/domain/' },
            to: { path: '^src/(core|resources|store|components|composables)/' },
        },
        {
            name: 'core-above-domain',
            comment: 'core/ may import domain/ — but not resources/, store/, components/, composables/.',
            severity: 'error',
            from: { path: '^src/core/' },
            to: { path: '^src/(resources|store|components|composables)/' },
        },
        {
            name: 'resources-above-core',
            comment: 'resources/ may import core/, domain/, composables/ — but not store/ or components/. Cross-resource imports within resources/ are allowed.',
            severity: 'error',
            from: { path: '^src/resources/' },
            to: { path: '^src/(store|components)/' },
        },
    ],
    options: {
        doNotFollow: { path: 'node_modules' },
        tsConfig: { fileName: 'tsconfig.json' },
        tsPreCompilationDeps: true,
        enhancedResolveOptions: {
            extensions: ['.ts', '.js', '.vue'],
        },
    },
}
