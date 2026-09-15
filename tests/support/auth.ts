/**
 * Shared mount harness for the auth UI slice (AuthLogin / AuthRegister tests).
 *
 * Nuxt UI components are auto-imported by unplugin-vue-components, so VTU
 * `stubs` and global component registration cannot replace them in this env
 * (see the note in CommentList.test.ts: "only explicitly-imported components
 * can be stubbed by name"). Instead each U* component module is mocked at its
 * package subpath (`@nuxt/ui/components/*.vue`) with a v-model aware stand-in;
 * the factories are self-contained so vitest's hoisting cannot break them.
 * `useToast` is mocked the same way, both module paths pointing at one shared
 * `toast` spy (cleared by `vi.restoreAllMocks()` in `afterEach`).
 *
 * State factories are fresh per call - never share a store/api between tests.
 */
import { mount, type VueWrapper } from '@vue/test-utils'
import { vi } from 'vitest'
import AuthLogin from '@/components/shared/auth/AuthLogin.vue'
import AuthRegister from '@/components/shared/auth/AuthRegister.vue'

// Module mocks (registered before any component import).

const toastSpy = vi.hoisted(() => ({ add: vi.fn() }))

vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => toastSpy }))
vi.mock('@nuxt/ui/runtime/composables/useToast', () => ({ useToast: () => toastSpy }))

vi.mock('@nuxt/ui/components/Modal.vue', () => ({
    default: {
        name: 'UModal',
        props: ['open', 'dismissible', 'close', 'title', 'description', 'ui'],
        emits: ['update:open'],
        template: `
            <div class="u-modal">
                <button class="u-modal-close" @click="$emit('update:open', false)">close</button>
                <slot name="body" />
                <slot name="footer" />
            </div>`,
    },
}))

vi.mock('@nuxt/ui/components/Button.vue', () => ({
    default: {
        name: 'UButton',
        props: ['label', 'variant', 'size', 'icon', 'trailingIcon', 'block', 'color', 'loading', 'disabled', 'square', 'ui'],
        emits: ['click'],
        template: `
            <button
                type="button"
                :disabled="disabled"
                :loading="loading || undefined"
                @click="$emit('click')"
            ><slot />{{ label }}</button>`,
    },
}))

vi.mock('@nuxt/ui/components/FormField.vue', () => ({
    default: {
        name: 'UFormField',
        props: ['label', 'error'],
        template: `<div><label>{{ label }}</label><slot /><p v-if="error" class="field-error">{{ error }}</p></div>`,
    },
}))

vi.mock('@nuxt/ui/components/Input.vue', () => ({
    default: {
        name: 'UInput',
        props: ['modelValue', 'type', 'placeholder', 'autocomplete', 'disabled', 'dataTestid'],
        emits: ['update:modelValue'],
        template: `<span class="u-input"><input :value="modelValue" :type="type" :placeholder="placeholder" :autocomplete="autocomplete" :disabled="disabled" :data-testid="dataTestid" @input="$emit('update:modelValue', $event.target.value)" /><slot name="trailing" /></span>`,
    },
}))

vi.mock('@nuxt/ui/components/FieldGroup.vue', () => ({
    default: {
        name: 'UFieldGroup',
        template: `<div class="u-field-group"><slot /></div>`,
    },
}))

vi.mock('@nuxt/ui/components/Tooltip.vue', () => ({
    default: {
        name: 'UTooltip',
        props: ['text', 'arrow'],
        template: `<span class="u-tooltip" :title="text"><slot /></span>`,
    },
}))

vi.mock('@nuxt/ui/components/Switch.vue', () => ({
    default: {
        name: 'USwitch',
        props: ['modelValue', 'label', 'disabled'],
        emits: ['update:modelValue'],
        template: `<label class="u-switch"><input type="checkbox" :checked="modelValue" :disabled="disabled" @change="$emit('update:modelValue', $event.target.checked)" />{{ label }}</label>`,
    },
}))

vi.mock('@nuxt/ui/components/SelectMenu.vue', () => ({
    default: {
        name: 'USelectMenu',
        props: ['modelValue', 'items', 'valueKey', 'disabled'],
        emits: ['update:modelValue'],
        template: `
            <select
                :value="modelValue"
                :disabled="disabled"
                @change="$emit('update:modelValue', $event.target.value)"
            ><option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option></select>`,
    },
}))

/** Shared toast spy - import from here to assert `toast.add` calls. */
export const toast = toastSpy

// State factories (fresh per call).

export const defaultUser = { id: 'u1', name: 'Ada', email: 'ada@test.dev', role: 'reporter' }

/** Fresh login success payload per call - never reuse a shared object. */
export function defaultLoginResult(): {
    ok: boolean
    status: number
    data: { user: typeof defaultUser; token: string }
} {
    return { ok: true, status: 200, data: { user: { ...defaultUser }, token: 't' } }
}

export function createAuthStore() {
    return {
        auth: { user: null, callback: () => {}, authView: 'login' },
        activateSession: vi.fn(),
    }
}

export function createAuthApi() {
    return {
        auth: {
            login: vi.fn(),
            forgotPassword: vi.fn(),
            register: vi.fn(),
        },
    }
}

// Mount and cleanup.

/**
 * Invariant: wrappers are only unmounted here - every test file importing this
 * module must call `unmountAuthMounts()` in its `afterEach`.
 */
const mountedWrappers: VueWrapper[] = []

export interface MountAuthLoginOptions {
    config?: Record<string, unknown>
    store?: ReturnType<typeof createAuthStore>
    /** Fixed login result; ignored when `login` is provided. */
    loginResult?: unknown
    /** Override the login implementation (e.g. a deferred/controllable promise). */
    login?: () => Promise<unknown>
    forgotPassword?: () => Promise<unknown>
    props?: Record<string, unknown>
}

export function mountAuthLogin(options: MountAuthLoginOptions = {}) {
    const store = options.store ?? createAuthStore()
    const api = createAuthApi()
    api.auth.login = options.login
        ? vi.fn(options.login)
        : vi.fn().mockResolvedValue(options.loginResult ?? defaultLoginResult())
    api.auth.forgotPassword = options.forgotPassword
        ? vi.fn(options.forgotPassword)
        : vi.fn().mockResolvedValue({ ok: true })

    const config = { surface: 'dashboard', canRegister: false, mailConfigured: false, loginMode: 'credentials', ...(options.config ?? {}) }
    const wrapper = mount(AuthLogin, {
        props: options.props,
        global: {
            provide: { redline: { api, config }, store },
        },
    })
    mountedWrappers.push(wrapper)
    return { wrapper, store, api }
}

/** Unmount every wrapper created by `mountAuthLogin` - call from `afterEach`. */
export function unmountAuthMounts(): void {
    while (mountedWrappers.length) mountedWrappers.pop()?.unmount()
}

export interface MountAuthRegisterOptions {
    config?: Record<string, unknown>
    store?: ReturnType<typeof createAuthStore>
    /** Fixed register result; ignored when `register` is provided. */
    registerResult?: unknown
    /** Override the register implementation (e.g. a deferred/controllable promise). */
    register?: () => Promise<unknown>
    props?: Record<string, unknown>
}

export function mountAuthRegister(options: MountAuthRegisterOptions = {}) {
    const store = options.store ?? createAuthStore()
    store.auth.authView = 'register'
    const api = createAuthApi()
    api.auth.register = options.register
        ? vi.fn(options.register)
        : vi.fn().mockResolvedValue(
              options.registerResult ?? { ok: true, status: 200, data: { user: { ...defaultUser }, token: 't' } },
          )

    const config = { surface: 'dashboard', canRegister: true, canSelectRole: false, ...(options.config ?? {}) }
    const wrapper = mount(AuthRegister, {
        props: options.props,
        global: {
            provide: { redline: { api, config }, store },
        },
    })
    mountedWrappers.push(wrapper)
    return { wrapper, store, api }
}

// Small interaction/state helpers.

/** Action-oriented locator: the first `<button>` whose text contains `label`. */
export function findButton(wrapper: VueWrapper, label: string) {
    return wrapper.findAll('button').find(button => button.text().includes(label))
}

/** Controllable promise for asserting in-flight state (loading/guards). */
export function deferred<T = unknown>() {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })
    return { promise, resolve, reject }
}

/** Seed localStorage identity/preferences before mounting. */
export function seedIdentity({ email, rememberMe }: { email?: string; rememberMe?: boolean } = {}): void {
    if (email) {
        localStorage.setItem('redline_name', 'Ada')
        localStorage.setItem('redline_email', email)
        localStorage.setItem('redline_role', 'reporter')
    }
    if (rememberMe !== undefined) {
        localStorage.setItem('redline_remember_me', rememberMe ? '1' : '0')
    }
}
