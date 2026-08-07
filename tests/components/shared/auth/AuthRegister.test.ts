import { describe, it, expect, vi, afterEach } from 'vitest'
import { flushPromises, type VueWrapper } from '@vue/test-utils'

// U* component + useToast mocks are registered by the shared auth harness.
import {
    findButton,
    mountAuthRegister,
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

async function setInputs(wrapper: VueWrapper, { name, email, password }: { name?: string; email?: string; password?: string }) {
    if (name !== undefined) await wrapper.find('input[autocomplete="name"]').setValue(name)
    if (email !== undefined) await wrapper.find('input[type="email"]').setValue(email)
    if (password !== undefined) await wrapper.find('input[type="password"]').setValue(password)
}

async function submitRegister(wrapper: VueWrapper) {
    await findButton(wrapper, 'Create account')!.trigger('click')
    await flushPromises()
}

describe('AuthRegister', () => {
    describe('role selection', () => {
        it('hides the role selector when canSelectRole is false (fail-closed default)', async () => {
            const { wrapper } = mountAuthRegister({ config: { surface: 'dashboard' } })
            await flushPromises()

            expect(wrapper.find('select').exists()).toBe(false)
        })

        it('shows the role selector when canSelectRole is true', async () => {
            const { wrapper } = mountAuthRegister({ config: { surface: 'dashboard', canSelectRole: true } })
            await flushPromises()

            expect(wrapper.find('select').exists()).toBe(true)
        })

        it('never offers the admin role on public registration', async () => {
            const { wrapper } = mountAuthRegister({ config: { surface: 'dashboard', canSelectRole: true } })
            await flushPromises()

            const labels = wrapper.findAll('option').map(option => option.text())
            expect(labels).toEqual(['Reporter', 'Developer'])
        })

        it('submits the default reporter role', async () => {
            const { wrapper, api } = mountAuthRegister({ config: { surface: 'dashboard', canSelectRole: true } })
            await flushPromises()
            await setInputs(wrapper, { name: 'Ada', email: 'ada@test.dev', password: 'secret' })

            await submitRegister(wrapper)

            expect(api.auth.register).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Ada', email: 'ada@test.dev', password: 'secret', role: 'reporter' }),
            )
        })

        it('submits the role selected in the dropdown', async () => {
            const { wrapper, api } = mountAuthRegister({ config: { surface: 'dashboard', canSelectRole: true } })
            await flushPromises()
            await setInputs(wrapper, { name: 'Ada', email: 'ada@test.dev', password: 'secret' })

            await wrapper.find('select').setValue('developer')
            await submitRegister(wrapper)

            expect(api.auth.register).toHaveBeenCalledWith(expect.objectContaining({ role: 'developer' }))
        })

        it('renders role-keyed validation errors from the backend', async () => {
            const { wrapper } = mountAuthRegister({
                config: { surface: 'dashboard', canSelectRole: true },
                registerResult: {
                    ok: false,
                    status: 422,
                    data: { errors: { role: ['The selected role is invalid.'] } },
                },
            })
            await flushPromises()
            await setInputs(wrapper, { name: 'Ada', email: 'ada@test.dev', password: 'secret' })

            await submitRegister(wrapper)

            expect(wrapper.text()).toContain('The selected role is invalid.')
        })
    })

    describe('registration submission', () => {
        it('activates the session, shows a welcome toast, and closes on success', async () => {
            const { wrapper, store, api } = mountAuthRegister({
                config: { surface: 'dashboard', canSelectRole: true },
                registerResult: {
                    ok: true,
                    status: 200,
                    data: { user: { id: 'u1', name: 'Ada', email: 'ada@test.dev', role: 'reporter' }, token: 't' },
                },
            })
            await flushPromises()
            await setInputs(wrapper, { name: 'Ada', email: 'ada@test.dev', password: 'secret' })

            await submitRegister(wrapper)

            expect(store.activateSession).toHaveBeenCalledWith(
                { id: 'u1', name: 'Ada', email: 'ada@test.dev', role: 'reporter' },
                't',
            )
            expect(toast.add).toHaveBeenCalledWith({ title: 'Welcome, Ada!', color: 'success' })
            expect(api.auth.register).toHaveBeenCalledTimes(1)
            expect(store.auth.callback).toBeNull()
            expect(store.auth.authView).toBe('login')
        })

        it('shows a network error and does not activate the session when the request rejects', async () => {
            const { wrapper, store } = mountAuthRegister({
                config: { surface: 'dashboard' },
                register: () => Promise.reject(new Error('offline')),
            })
            await flushPromises()
            await setInputs(wrapper, { name: 'Ada', email: 'ada@test.dev', password: 'secret' })

            await submitRegister(wrapper)

            expect(wrapper.text()).toContain('Network error')
            expect(store.activateSession).not.toHaveBeenCalled()
        })

        it('shows the backend approval message, keeps the modal open, and does not activate the session on a pending registration (202)', async () => {
            const { wrapper, store } = mountAuthRegister({
                config: { surface: 'dashboard' },
                registerResult: {
                    ok: true,
                    status: 202,
                    data: { errors: ['Your registration was created and needs to be approved by admin user.'], pending: true },
                },
            })
            await flushPromises()
            await setInputs(wrapper, { name: 'Ada', email: 'ada@test.dev', password: 'secret' })

            await submitRegister(wrapper)

            expect(wrapper.text()).toContain('Your registration was created and needs to be approved by admin user.')
            expect(wrapper.text()).not.toContain('Network error')
            expect(store.activateSession).not.toHaveBeenCalled()
            expect(store.auth.callback).not.toBeNull()
        })
    })

    describe('password field', () => {
        it('shows the strength meter and label once the user types a password', async () => {
            const { wrapper } = mountAuthRegister({ config: { surface: 'dashboard' } })
            await flushPromises()

            expect(wrapper.find('[data-testid="password-strength"]').exists()).toBe(false)

            await wrapper.find('input[data-testid="password-input"]').setValue('secret')

            const meter = wrapper.find('[data-testid="password-strength"]')
            expect(meter.exists()).toBe(true)
            expect(wrapper.find('[data-testid="password-strength-label"]').text()).toBe('Weak')
        })

        it('toggles the input type and aria-pressed via the eye button', async () => {
            const { wrapper } = mountAuthRegister({ config: { surface: 'dashboard' } })
            await flushPromises()
            await wrapper.find('input[data-testid="password-input"]').setValue('secret')

            const show = wrapper.find('button[aria-label="Show password"]')
            expect(show.exists()).toBe(true)
            expect(show.attributes('aria-pressed')).toBe('false')
            expect(wrapper.find('input[type="password"]').exists()).toBe(true)

            await show.trigger('click')

            const hide = wrapper.find('button[aria-label="Hide password"]')
            expect(hide.exists()).toBe(true)
            expect(hide.attributes('aria-pressed')).toBe('true')
            expect(wrapper.find('input[type="password"]').exists()).toBe(false)
            expect(wrapper.find('input[data-testid="password-input"]').attributes('type')).toBe('text')
        })

        it('fills the field with a generated password and updates the strength meter', async () => {
            const { wrapper } = mountAuthRegister({ config: { surface: 'dashboard' } })
            await flushPromises()

            await wrapper.find('button[aria-label="Generate password"]').trigger('click')

            const input = wrapper.find('input[data-testid="password-input"]').element as HTMLInputElement
            expect(input.value).not.toBe('')
            expect(input.value).toHaveLength(16)

            const meter = wrapper.find('[data-testid="password-strength"]')
            expect(meter.exists()).toBe(true)
            expect(['Fair', 'Good', 'Strong']).toContain(
                wrapper.find('[data-testid="password-strength-label"]').text(),
            )
        })

        it('submits the typed password together with name/email/role even when revealed', async () => {
            const { wrapper, api } = mountAuthRegister({ config: { surface: 'dashboard', canSelectRole: true } })
            await flushPromises()
            await setInputs(wrapper, { name: 'Ada', email: 'ada@test.dev' })

            await wrapper.find('button[aria-label="Show password"]').trigger('click')
            await wrapper.find('input[data-testid="password-input"]').setValue('secret')

            await submitRegister(wrapper)

            expect(api.auth.register).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'Ada', email: 'ada@test.dev', password: 'secret', role: 'reporter' }),
            )
        })
    })
})
