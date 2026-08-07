<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useStore } from '@/composables/useStore'
import type { DashboardStore } from '@/store/dashboard'
import { useRedline } from '@/composables/useApi'
import { parseApiErrors } from '@/core/api/errors'

const { api } = useRedline()
const store = useStore<DashboardStore>()
const router = useRouter()

// The signed query (email, expires, signature) is carried verbatim from the email link.
const signedQuery = window.location.search.replace(/^\?/, '')

const password = ref('')
const loading = ref(false)
const summary = ref('')
const passwordFieldError = ref<string | false>(false)
const done = ref(false)

// Clear the field-level error as soon as the user types so the field never
// stays red after a failed attempt.
watch(password, () => {
    passwordFieldError.value = false
    summary.value = ''
})

async function submit() {
    if (loading.value || !password.value) return
    loading.value = true
    summary.value = ''
    try {
        const result = await api.auth.resetPassword(signedQuery, password.value)
        if (!result.ok) {
            const parsed = parseApiErrors(result.data)
            const message = parsed.summary ?? parsed.fieldErrors.password?.join(' ')
            summary.value = message ?? 'This reset link is invalid or has expired.'
            passwordFieldError.value = parsed.fieldErrors.password?.join(' ') || false
            return
        }
        done.value = true
    } catch {
        summary.value = 'Network error — please try again.'
    } finally {
        loading.value = false
    }
}

function goHome() {
    store.auth.user = null
    router.replace('/')
}
</script>

<template>
    <div class="flex min-h-screen items-center justify-center bg-default p-4">
        <UCard class="w-[min(380px,100%)]">
            <div class="mb-4 flex items-center gap-2">
                <UIcon name="i-lucide-square-pen" class="size-6 text-primary" />
                <span class="text-lg font-medium text-highlighted">Redline</span>
            </div>

            <h1 class="mb-1 text-2xl font-bold text-highlighted">Set a new password</h1>

            <template v-if="done">
                <p class="my-4 text-muted">Your password has been updated. You can now sign in.</p>
                <UButton block size="lg" @click="goHome">Go to sign in</UButton>
            </template>

            <template v-else>
                <p class="mb-6 text-muted">Choose a new password for your account.</p>

                <form class="flex flex-col gap-4" @submit.prevent="submit">
                    <UFormField label="New password" :error="passwordFieldError">
                        <UInput v-model="password" type="password" autocomplete="new-password" :disabled="loading" class="w-full" />
                    </UFormField>
                </form>

                <p v-if="summary" class="mt-3 text-sm text-error">{{ summary }}</p>

                <UButton block size="lg" class="mt-5" :disabled="loading || !password" :loading="loading" @click="submit">
                    Update password
                </UButton>
            </template>
        </UCard>
    </div>
</template>
