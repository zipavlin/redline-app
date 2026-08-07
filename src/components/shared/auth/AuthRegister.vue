<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useStore } from '@/composables/useStore'
import { useRedline } from '@/composables/useApi'
import type { AuthField } from '@/resources/user/model'
import { parseApiErrors, type ApiFieldErrors } from '@/core/api/errors'
import { generatePassword, passwordStrength } from '@/core/password'
import { useToast } from '@nuxt/ui/composables/useToast'

const props = withDefaults(defineProps<{ dismissible?: boolean }>(), { dismissible: true })

const { api, config } = useRedline()
const store = useStore()
const toast = useToast()

// State
const name = ref('')
const email = ref('')
const password = ref('')
const role = ref('reporter')
const loading = ref(false)
const summary = ref('')
const pending = ref(false)
const passwordVisible = ref(false)

// Computed
const open = computed(() => store.auth.callback !== null && store.auth.authView === 'register')
const fields = computed<AuthField[]>(() => ((config as { fields?: AuthField[] })?.fields ?? []))
const canSelectRole = computed(() => Boolean(config.canSelectRole))
const strength = computed(() => passwordStrength(password.value))
const strengthSegmentClass = computed(() => ({
    error: 'bg-(--ui-error)',
    warning: 'bg-(--ui-warning)',
    success: 'bg-(--ui-success)',
})[strength.value.color])

// Public registration must never offer Admin - the backend silently downgrades it anyway.
const roleItems = [
    { label: 'Reporter', value: 'reporter' },
    { label: 'Developer', value: 'developer' },
]

// State - seeded from the `fields` computed above, so it must follow the Computed group.
// Known fields plus the dynamic extra fields (keys = `field.name` from config).
const fieldErrors = reactive<ApiFieldErrors>({
    name: [],
    email: [],
    password: [],
    role: [],
    ...Object.fromEntries(fields.value.map(f => [f.name, [] as string[]])),
})
const extraValues = reactive<Record<string, unknown>>(
    Object.fromEntries(fields.value.map(f => [f.name, ''])),
)

// Watchers
watch([name, email, password, role, extraValues], () => {
    clearFieldErrors()
    summary.value = ''
    pending.value = false
})

// Functions
/**
 * Nuxt UI v4: UFormField `error` is `boolean | string` - a raw `string[]` would
 * be an EMPTY ARRAY which is TRUTHY and would wrongly mark the field invalid,
 * so always pass a joined string or `false`.
 */
function fieldError(field: string): string | false {
    return (fieldErrors[field] ?? []).join(' ') || false
}

function clearFieldErrors() {
    for (const key of Object.keys(fieldErrors)) fieldErrors[key] = []
}

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
    pending.value = false
    try {
        const result = await api.auth.register({
            name: name.value,
            email: email.value,
            password: password.value,
            role: role.value,
            ...extraValues,
        })
        if (!result.ok || result.status === 202) {
            const parsed = parseApiErrors(result.data)
            Object.keys(parsed.fieldErrors).forEach(k => {
                fieldErrors[k] = parsed.fieldErrors[k]
            })
            summary.value = parsed.summary ?? ''
            pending.value = result.status === 202
            return
        }
        const { user, token } = result.data
        store.activateSession(user, token ?? undefined)
        toast.add({ title: `Welcome, ${user.name}!`, color: 'success' })
        close()
    } catch {
        summary.value = 'Network error - please try again.'
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
                    <UFieldGroup class="w-full">
                        <UInput
                            v-model="password"
                            :type="passwordVisible ? 'text' : 'password'"
                            autocomplete="new-password"
                            :disabled="loading"
                            class="w-full"
                            data-testid="password-input"
                        >
                            <template #trailing>
                                <UButton
                                    :icon="passwordVisible ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                                    variant="ghost"
                                    size="xs"
                                    square
                                    :aria-label="passwordVisible ? 'Hide password' : 'Show password'"
                                    :aria-pressed="passwordVisible"
                                    @click="passwordVisible = !passwordVisible"
                                />
                            </template>
                        </UInput>
                        <UTooltip text="Generate a random password" arrow>
                            <UButton
                                icon="i-lucide-dice-5"
                                variant="subtle"
                                square
                                aria-label="Generate password"
                                :ui="{ base: 'rounded-md' }"
                                @click="password = generatePassword()"
                            />
                        </UTooltip>
                    </UFieldGroup>
                    <div
                        v-if="strength.score > 0"
                        class="mt-2 flex items-center gap-2"
                        data-testid="password-strength"
                    >
                        <div class="flex flex-1 gap-1" aria-hidden="true">
                            <div
                                v-for="segment in 4"
                                :key="segment"
                                class="h-1 flex-1 rounded-full"
                                :class="segment <= strength.score ? strengthSegmentClass : 'bg-(--ui-border-muted)'"
                            />
                        </div>
                        <span class="text-xs text-(--ui-text-muted)" data-testid="password-strength-label">{{ strength.label }}</span>
                    </div>
                </UFormField>

                <UFormField v-if="canSelectRole" label="Role" :error="fieldError('role')">
                    <USelectMenu v-model="role" :items="roleItems" value-key="value" :disabled="loading" class="w-full" />
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

            <p v-if="summary" :class="pending ? 'mt-3 text-sm text-(--ui-text-muted)' : 'mt-3 text-sm text-error'">{{ summary }}</p>
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
