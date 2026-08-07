import { describe, it, expect, vi, afterEach } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'

// U* component + useToast mocks are registered by the shared auth harness.
import {
    defaultUser,
    deferred,
    findButton,
    mountAuthLogin,
    seedIdentity,
    toast,
    unmountAuthMounts,
} from '../../../support/auth'
import { resetBrowserGlobals } from '../../../support/browser'

afterEach(() => {
    unmountAuthMounts()
    vi.clearAllMocks()
    vi.restoreAllMocks()
    resetBrowserGlobals()
})

async function setInputs(
    wrapper: VueWrapper,
    { email, password, rememberMe }: { email?: string; password?: string; rememberMe?: boolean },
) {
    if (email !== undefined) await wrapper.find('input[type="email"]').setValue(email)
    if (password !== undefined) await wrapper.find('input[type="password"]').setValue(password)
    if (rememberMe !== undefined) await wrapper.find('input[type="checkbox"]').setValue(rememberMe)
}

async function submitLogin(wrapper: VueWrapper) {
    await findButton(wrapper, 'Sign in')!.trigger('click')
    await flushPromises()
}

describe('AuthLogin', () => {
    describe('registration actions', () => {
        it('opens the register page in a new tab from the widget registration link', async () => {
            const open = vi.spyOn(window, 'open').mockImplementation(() => null)
            const { wrapper } = mountAuthLogin({
                config: { surface: 'widget', canRegister: true, dashboard: 'https://app.test/redline' },
            })
            await flushPromises()

            await findButton(wrapper, 'Sign up')!.trigger('click')

            expect(open).toHaveBeenCalledWith('https://app.test/redline/register', '_blank', 'noopener')
        })

        it('opens the register page without a double slash when the dashboard URL ends with a slash', async () => {
            const open = vi.spyOn(window, 'open').mockImplementation(() => null)
            const { wrapper } = mountAuthLogin({
                config: { surface: 'widget', canRegister: true, dashboard: 'https://app.test/redline/' },
            })
            await flushPromises()

            await findButton(wrapper, 'Sign up')!.trigger('click')

            expect(open).toHaveBeenCalledWith('https://app.test/redline/register', '_blank', 'noopener')
        })

        it('falls back to the default /redline base when no dashboard URL is configured', async () => {
            const open = vi.spyOn(window, 'open').mockImplementation(() => null)
            const { wrapper } = mountAuthLogin({
                config: { surface: 'widget', canRegister: true, dashboard: '' },
            })
            await flushPromises()

            await findButton(wrapper, 'Sign up')!.trigger('click')

            expect(open).toHaveBeenCalledWith(location.origin + '/redline/register', '_blank', 'noopener')
        })

        it('switches to the register view from the dashboard registration link', async () => {
            const { wrapper, store } = mountAuthLogin({
                config: { surface: 'dashboard', canRegister: true },
            })
            await flushPromises()

            await findButton(wrapper, 'Create one')!.trigger('click')

            expect(store.auth.authView).toBe('register')
        })

        it('offers no registration action on either surface when registration is disabled', async () => {
            const open = vi.spyOn(window, 'open').mockImplementation(() => null)
            const widget = mountAuthLogin({
                config: { surface: 'widget', canRegister: false, dashboard: 'https://app.test/redline' },
            })
            const dashboard = mountAuthLogin({
                config: { surface: 'dashboard', canRegister: false },
            })
            await flushPromises()

            expect(findButton(widget.wrapper, 'Sign up')).toBeUndefined()
            expect(findButton(dashboard.wrapper, 'Create one')).toBeUndefined()
            expect(widget.store.auth.authView).toBe('login')
            expect(dashboard.store.auth.authView).toBe('login')
            expect(open).not.toHaveBeenCalled()
        })
    })

    describe('login submission', () => {
        it('activates the session with the returned user/token/remember-me, shows a welcome toast, and closes', async () => {
            const user = { ...defaultUser }
            const { wrapper, store, api } = mountAuthLogin({
                config: { surface: 'dashboard' },
                loginResult: { ok: true, status: 200, data: { user, token: 't' } },
            })
            await flushPromises()

            await setInputs(wrapper, { email: 'ada@test.dev', password: 'secret' })
            await submitLogin(wrapper)

            expect(api.auth.login).toHaveBeenCalledWith({ email: 'ada@test.dev', password: 'secret', remember_me: false })
            expect(store.activateSession).toHaveBeenCalledWith(user, 't', { rememberMe: false })
            expect(toast.add).toHaveBeenCalledWith({ title: 'Welcome, Ada!', color: 'success' })
            expect(store.auth.callback).toBeNull()
            expect(store.auth.authView).toBe('login')
        })

        it('renders field-keyed validation errors (and no network summary) on a 422', async () => {
            const { wrapper } = mountAuthLogin({
                config: { surface: 'dashboard' },
                loginResult: {
                    ok: false,
                    status: 422,
                    data: {
                        errors: {
                            email: ['The email field is required.'],
                            password: ['The password field is required.'],
                        },
                    },
                },
            })
            await flushPromises()

            await submitLogin(wrapper)

            expect(wrapper.text()).toContain('The email field is required.')
            expect(wrapper.text()).toContain('The password field is required.')
            expect(wrapper.text()).not.toContain('Network error')
        })

        it('renders the joined summary (and no field errors) on a flat error payload', async () => {
            const { wrapper } = mountAuthLogin({
                config: { surface: 'dashboard' },
                loginResult: { ok: false, status: 401, data: { errors: ['Invalid credentials.'] } },
            })
            await flushPromises()

            await submitLogin(wrapper)

            expect(wrapper.text()).toContain('Invalid credentials.')
            expect(wrapper.text()).not.toContain('Network error')
            expect(wrapper.findAll('.field-error')).toHaveLength(0)
        })

        it('shows a network error and does not activate the session when the request rejects', async () => {
            const { wrapper, store } = mountAuthLogin({
                config: { surface: 'dashboard' },
                login: () => Promise.reject(new Error('offline')),
            })
            await flushPromises()
            await setInputs(wrapper, { email: 'ada@test.dev', password: 'secret' })

            await submitLogin(wrapper)

            expect(wrapper.text()).toContain('Network error')
            expect(store.activateSession).not.toHaveBeenCalled()
            expect((findButton(wrapper, 'Sign in')!.element as HTMLButtonElement).disabled).toBe(false)
        })

        it('shows the pending-approval message and does not activate the session on a 202', async () => {
            const { wrapper, store } = mountAuthLogin({
                config: { surface: 'dashboard' },
                loginResult: { ok: true, status: 202, data: { errors: ['Account not yet approved.'], pending: true } },
            })
            await flushPromises()
            await setInputs(wrapper, { email: 'ada@test.dev', password: 'secret' })

            await submitLogin(wrapper)

            expect(wrapper.text()).toContain('Account not yet approved.')
            expect(wrapper.text()).not.toContain('Network error')
            expect(store.activateSession).not.toHaveBeenCalled()
            expect(store.auth.callback).not.toBeNull()
        })

        it('disables the form while submitting and ignores a second submit', async () => {
            const pending = deferred<{
                ok: boolean
                status: number
                data: { user: typeof defaultUser; token?: string }
            }>()
            const { wrapper, api } = mountAuthLogin({
                config: { surface: 'dashboard' },
                login: () => pending.promise,
            })
            await flushPromises()
            await setInputs(wrapper, { email: 'ada@test.dev', password: 'secret' })

            const signIn = findButton(wrapper, 'Sign in')!
            await signIn.trigger('click')

            expect(api.auth.login).toHaveBeenCalledTimes(1)
            expect((signIn.element as HTMLButtonElement).disabled).toBe(true)
            expect((wrapper.find('input[type="email"]').element as HTMLInputElement).disabled).toBe(true)

            // A second click while the request is in flight is ignored.
            await signIn.trigger('click')
            expect(api.auth.login).toHaveBeenCalledTimes(1)

            pending.resolve({ ok: true, status: 200, data: { user: { ...defaultUser }, token: 't' } })
            await flushPromises()

            expect((signIn.element as HTMLButtonElement).disabled).toBe(false)
        })
    })

    describe('identity prefill & remember-me', () => {
        it('prefills the email and remember-me state from stored identity', async () => {
            seedIdentity({ email: 'ada@test.dev', rememberMe: true })
            const { wrapper } = mountAuthLogin({ config: { surface: 'dashboard' } })
            await flushPromises()

            expect((wrapper.find('input[type="email"]').element as HTMLInputElement).value).toBe('ada@test.dev')
            expect((wrapper.find('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(true)
        })

        it('sends the remember-me flag with the login request and session activation', async () => {
            const user = { ...defaultUser }
            const { wrapper, store, api } = mountAuthLogin({
                config: { surface: 'dashboard' },
                loginResult: { ok: true, status: 200, data: { user, token: 't' } },
            })
            await flushPromises()

            await setInputs(wrapper, { email: 'ada@test.dev', password: 'secret', rememberMe: true })
            await submitLogin(wrapper)

            expect(api.auth.login).toHaveBeenCalledWith({ email: 'ada@test.dev', password: 'secret', remember_me: true })
            expect(store.activateSession).toHaveBeenCalledWith(user, 't', { rememberMe: true })
        })
    })

    describe('password reset', () => {
        it('asks the user to enter an email before sending a reset request when the field is empty', async () => {
            const { wrapper, api } = mountAuthLogin({
                config: { surface: 'dashboard', mailConfigured: true },
            })
            await flushPromises()

            await findButton(wrapper, 'Forgot password?')!.trigger('click')

            expect(wrapper.text()).toContain('Enter your email above')
            expect(api.auth.forgotPassword).not.toHaveBeenCalled()
        })

        it('sends the reset request for the entered email and confirms via toast', async () => {
            const { wrapper, api } = mountAuthLogin({
                config: { surface: 'dashboard', mailConfigured: true },
            })
            await flushPromises()
            await setInputs(wrapper, { email: 'ada@test.dev' })

            await findButton(wrapper, 'Forgot password?')!.trigger('click')
            await flushPromises()

            expect(api.auth.forgotPassword).toHaveBeenCalledWith('ada@test.dev')
            expect(toast.add).toHaveBeenCalledWith(
                expect.objectContaining({ title: expect.stringContaining('reset link'), color: 'success' }),
            )
        })

        it('shows a network error summary and no toast when the reset request rejects', async () => {
            const { wrapper, api } = mountAuthLogin({
                config: { surface: 'dashboard', mailConfigured: true },
                forgotPassword: () => Promise.reject(new Error('offline')),
            })
            await flushPromises()
            await setInputs(wrapper, { email: 'ada@test.dev' })

            await findButton(wrapper, 'Forgot password?')!.trigger('click')
            await flushPromises()

            expect(api.auth.forgotPassword).toHaveBeenCalledWith('ada@test.dev')
            expect(wrapper.text()).toContain('Network error')
            expect(toast.add).not.toHaveBeenCalled()
        })

        it('shows a generic summary and no toast when the reset request returns a non-ok result', async () => {
            const { wrapper, api } = mountAuthLogin({
                config: { surface: 'dashboard', mailConfigured: true },
                forgotPassword: () => Promise.resolve({ ok: false, status: 500, data: null }),
            })
            await flushPromises()
            await setInputs(wrapper, { email: 'ada@test.dev' })

            await findButton(wrapper, 'Forgot password?')!.trigger('click')
            await flushPromises()

            expect(api.auth.forgotPassword).toHaveBeenCalledWith('ada@test.dev')
            expect(wrapper.text()).toContain('Could not send the reset link. Please try again later.')
            expect(toast.add).not.toHaveBeenCalled()
        })
    })

    describe('error recovery & dismissal', () => {
        it('clears field errors and the summary as soon as the user edits a field', async () => {
            const { wrapper } = mountAuthLogin({
                config: { surface: 'dashboard' },
                loginResult: { ok: false, status: 422, data: { errors: { email: ['The email field is required.'] } } },
            })
            await flushPromises()
            await submitLogin(wrapper)
            expect(wrapper.text()).toContain('The email field is required.')

            await setInputs(wrapper, { email: 'ada@test.dev' })

            expect(wrapper.text()).not.toContain('The email field is required.')
            expect(wrapper.findAll('.field-error')).toHaveLength(0)
        })

        it('closes when the modal emits a close event (dismissible by default)', async () => {
            const { wrapper, store } = mountAuthLogin({ config: { surface: 'dashboard' } })
            await flushPromises()
            expect(store.auth.callback).not.toBeNull()

            await wrapper.find('.u-modal-close').trigger('click')

            expect(store.auth.callback).toBeNull()
            expect(store.auth.authView).toBe('login')
        })

        it('stays open on the close event when the modal is not dismissible', async () => {
            const { wrapper, store } = mountAuthLogin({
                config: { surface: 'dashboard' },
                props: { dismissible: false },
            })
            await flushPromises()
            expect(store.auth.callback).not.toBeNull()

            await wrapper.find('.u-modal-close').trigger('click')

            expect(store.auth.callback).not.toBeNull()
        })
    })
})
