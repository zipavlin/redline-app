<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useStore } from '@/composables/useStore'
import { useRedline } from '@/composables/useApi'
import type { AuthField } from '@/resources/user/model'
import { parseApiErrors, type ApiFieldErrors } from '@/core/api/errors'

const props = withDefaults(defineProps<{ dismissible?: boolean }>(), { dismissible: true })

const { api, config } = useRedline()
const store = useStore()
const toast = useToast()

const fields = computed<AuthField[]>(() => ((config as { fields?: AuthField[] })?.fields ?? []))

const open = computed(() => store.auth.callback !== null && store.auth.authView === 'register')

const name = ref('')
const email = ref('')
const password = ref('')
const loading = ref(false)
// Known fields plus the dynamic extra fields (keys = `field.name` from config).
const fieldErrors = reactive<ApiFieldErrors>({
    name: [],
    email: [],
    password: [],
    ...Object.fromEntries(fields.value.map(f => [f.name, [] as string[]])),
})
const summary = ref('')
const extraValues = reactive<Record<string, unknown>>(
    Object.fromEntries(fields.value.map(f => [f.name, ''])),
)

// Nuxt UI v4: UFormField `error` is `boolean | string` — a raw `string[]` would
// be an EMPTY ARRAY which is TRUTHY and would wrongly mark the field invalid,
// so always pass a joined string or `false`.
function fieldError(field: string): string | false {
    return (fieldErrors[field] ?? []).join(' ') || false
}

function clearFieldErrors() {
    for (const key of Object.keys(fieldErrors)) fieldErrors[key] = []
}

watch([name, email, password, extraValues], () => {
    clearFieldErrors()
    summary.value = ''
})

function extraFieldProps(field: AuthField): Record<string, unknown> {
    const { name: _n, type: _t, label: _l, ...rest } = field
    return rest
}

function close() {
    if (!props.dismissible) return
    store.auth.callback = null
    store.auth.authView = 'login'
}

function onOpenUpdate(value: boolean) {
    if (!value) close()
}

async function submit() {
    if (loading.value) return
    loading.value = true
    clearFieldErrors()
    summary.value = ''
    try {
        const result = await api.auth.register({
            name: name.value,
            email: email.value,
            password: password.value,
            ...extraValues,
        })
        if (!result.ok) {
            const parsed = parseApiErrors(result.data)
            Object.keys(parsed.fieldErrors).forEach(k => {
                fieldErrors[k] = parsed.fieldErrors[k]
            })
            summary.value = parsed.summary ?? ''
            return
        }
        const { user, token } = result.data
        store.activateSession(user, token ?? undefined)
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
        title="Create account"
        description="Start reporting changes and bugs"
        :ui="{ content: 'max-w-sm' }"
        data-component="auth-register"
        @update:open="onOpenUpdate"
    >
        <template #body>
            <form class="flex flex-col gap-4" @submit.prevent="submit">
                <UFormField label="Full name" :error="fieldError('name')">
                    <UInput v-model="name" placeholder="Jane Smith" autocomplete="name" :disabled="loading" class="w-full" />
                </UFormField>
                <UFormField label="Email" :error="fieldError('email')">
                    <UInput v-model="email" type="email" placeholder="you@example.com" autocomplete="email" :disabled="loading" class="w-full" />
                </UFormField>
                <UFormField label="Password" :error="fieldError('password')">
                    <UInput v-model="password" type="password" autocomplete="new-password" :disabled="loading" class="w-full" />
                </UFormField>

                <UFormField v-for="field in fields" :key="field.name" :label="field.label" :error="fieldError(field.name)">
                    <UPinInput
                        v-if="field.type === 'pin'"
                        v-model="(extraValues[field.name] as string[])"
                        :disabled="loading"
                        mask
                        v-bind="extraFieldProps(field)"
                    />
                    <UInputNumber
                        v-else-if="field.type === 'number'"
                        v-model="(extraValues[field.name] as number)"
                        :disabled="loading"
                        class="w-full"
                        v-bind="extraFieldProps(field)"
                    />
                    <UInput
                        v-else
                        v-model="(extraValues[field.name] as string)"
                        :type="field.type === 'password' ? 'password' : 'text'"
                        :disabled="loading"
                        class="w-full"
                        v-bind="extraFieldProps(field)"
                    />
                </UFormField>
            </form>

            <p v-if="summary" class="mt-3 text-sm text-error">{{ summary }}</p>
        </template>

        <template #footer>
            <div class="flex w-full flex-col items-center gap-2">
                <UButton
                    block
                    color="success"
                    variant="subtle"
                    size="lg"
                    icon="i-lucide-user-round-plus"
                    label="Create account"
                    :loading="loading"
                    :disabled="loading"
                    @click="submit"
                />
                <UButton variant="link" size="sm" trailing-icon="i-lucide-arrow-right" @click="store.auth.authView = 'login'">Already have an account? Sign in</UButton>
            </div>
        </template>
    </UModal>
</template>
