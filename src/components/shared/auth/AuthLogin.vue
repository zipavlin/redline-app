<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useStore } from '@/composables/useStore'
import { useRedline } from '@/composables/useApi'
import { identity } from '@/core/storage'
import { parseApiErrors, type ApiFieldErrors } from '@/core/api/errors'
import { useToast } from '@nuxt/ui/composables/useToast'

const props = withDefaults(defineProps<{ dismissible?: boolean }>(), { dismissible: true })

const { api, config } = useRedline()
const store = useStore()
const toast = useToast()

const open = computed(() => store.auth.callback !== null && store.auth.authView === 'login')
const mailConfigured = computed(() => Boolean((config as { mailConfigured?: boolean })?.mailConfigured))
const surface = computed(() => (config as { surface?: 'widget' | 'dashboard' }).surface)
const canRegister = computed(() => Boolean((config as { canRegister?: boolean }).canRegister))
const isWidget = computed(() => surface.value === 'widget')
const dashboardUrl = computed(() => String((config as { dashboard?: string }).dashboard ?? ''))

const email = ref(identity.getUser()?.email ?? '')
const password = ref('')
const rememberMe = ref(identity.isRememberMe())
const loading = ref(false)
const fieldErrors = reactive<ApiFieldErrors>({ email: [], password: [] })
const summary = ref('')

// Nuxt UI v4: UFormField `error` is `boolean | string` — a raw `string[]` would
// be an EMPTY ARRAY which is TRUTHY and would wrongly mark the field invalid,
// so always pass a joined string or `false`.
function fieldError(field: keyof ApiFieldErrors): string | false {
    return fieldErrors[field].join(' ') || false
}

watch([email, password], () => {
    fieldErrors.email = []
    fieldErrors.password = []
    summary.value = ''
})

function close() {
    if (!props.dismissible) return
    store.auth.callback = null
    store.auth.authView = 'login'
}

function onOpenUpdate(value: boolean) {
    if (!value) close()
}

async function forgot() {
    if (!email.value) {
        summary.value = 'Enter your email above, then click “Forgot password?”.'
        return
    }
    summary.value = ''
    await api.auth.forgotPassword(email.value)
    toast.add({ title: 'If that email is registered, a reset link is on its way.', color: 'success' })
}

function openDashboard() {
    window.open(dashboardUrl.value, '_blank', 'noopener')
}

async function submit() {
    if (loading.value) return
    loading.value = true
    fieldErrors.email = []
    fieldErrors.password = []
    summary.value = ''
    try {
        const result = await api.auth.login({ email: email.value, password: password.value, remember_me: rememberMe.value })
        if (!result.ok) {
            const parsed = parseApiErrors(result.data)
            fieldErrors.email = parsed.fieldErrors.email ?? []
            fieldErrors.password = parsed.fieldErrors.password ?? []
            summary.value = parsed.summary ?? ''
            return
        }
        const { user, token } = result.data
        store.activateSession(user, token ?? undefined, { rememberMe: rememberMe.value })
        toast.add({ title: `Welcome, ${user.name}!`, color: 'success' })
        close()
    } catch {
        summary.value = 'Network error — please try again.'
    } finally {
        loading.value = false
    }
}
</script>

<template>
    <UModal
        :open="open"
        :dismissible="dismissible"
        :close="dismissible"
        title="Sign in"
        description="Enter your credentials to continue"
        :ui="{ content: 'max-w-sm' }"
        data-component="auth-login"
        @update:open="onOpenUpdate"
    >
        <template #body>
            <form class="flex flex-col gap-4" @submit.prevent="submit">
                <UFormField label="Email" :error="fieldError('email')">
                    <UInput v-model="email" type="email" placeholder="you@example.com" autocomplete="email" :disabled="loading" class="w-full" />
                </UFormField>
                <UFormField label="Password" :error="fieldError('password')">
                    <UInput v-model="password" type="password" autocomplete="current-password" :disabled="loading" class="w-full" />
                </UFormField>
                <USwitch v-model="rememberMe" label="Remember me" :disabled="loading" />
            </form>

            <UButton v-if="mailConfigured" variant="link" size="sm" class="mt-2 px-0" :disabled="loading" @click="forgot">
                Forgot password?
            </UButton>

            <p v-if="summary" class="mt-3 text-sm text-error">{{ summary }}</p>
        </template>

        <template #footer>
            <div class="flex w-full items-center flex-col gap-2">
                <UButton
                    block
                    color="success"
                    variant="subtle"
                    size="lg"
                    icon="i-lucide-user-round-check"
                    label="Sign in"
                    :loading="loading"
                    :disabled="loading"
                    @click="submit"
                />
                <UButton v-if="isWidget && canRegister" variant="link" size="sm" trailing-icon="i-lucide-arrow-right" @click="openDashboard">Need an account? Go to dashboard</UButton>
                <UButton v-else-if="!isWidget && canRegister" variant="link" size="sm" trailing-icon="i-lucide-arrow-right" @click="store.auth.authView = 'register'">Don't have an account? Create one</UButton>
            </div>
        </template>
    </UModal>
</template>
