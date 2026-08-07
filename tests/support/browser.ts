/**
 * Browser-global restoration for tests that touch storage or render into the
 * document. Call from `afterEach`, after unmounting wrappers:
 *
 *     localStorage.clear() / sessionStorage.clear()  - identity + prefs leakage
 *     document.body.innerHTML = ''                   - teleported / leftover DOM
 *     delete documentElement.scrollWidth/scrollHeight - capture dimension stubs
 *
 * Timers and window spies are handled by `vi.restoreAllMocks()` in the test
 * file; this helper covers the DOM/storage side only.
 */
export function resetBrowserGlobals(): void {
    localStorage.clear()
    sessionStorage.clear()
    document.body.innerHTML = ''
    delete (document.documentElement as unknown as Record<string, unknown>).scrollWidth
    delete (document.documentElement as unknown as Record<string, unknown>).scrollHeight
}
