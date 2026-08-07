<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRedline } from '@/composables/useApi'
import { useCreateUserMutation, type InvitationError } from '@/resources/user/mutations'
import { generatePassword } from '@/core/password'
import { useToast } from '@nuxt/ui/composables/useToast'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const { config } = useRedline()
const toast = useToast()

const createUser = useCreateUserMutation()

const mailConfigured = computed(() => Boolean((config as { mailConfigured?: boolean })?.mailConfigured))

// Form state
const name = ref('')
const email = ref('')
const role = ref('reporter')
const password = ref('')
const error = ref('')

const roleItems = [
    { label: 'Reporter', value: 'reporter' },
    { label: 'Developer', value: 'developer' },
    { label: 'Admin', value: 'admin' },
]

function invitationFailureReason(error: InvitationError | null): string {
    switch (error) {
        case 'mail_not_configured':
            return 'mailer not configured'
        case 'send_failed':
            return 'sending failed'
        default:
            return 'unknown reason'
    }
}

// Re-seed whenever the modal opens so a previous draft never leaks through.
watch(() => props.open, (open) => {
    if (!open) return
    name.value = ''
    email.value = ''
    role.value = 'reporter'
    password.value = ''
    error.value = ''
})

// Submit
async function submit() {
    if (createUser.isPending.value) return
    error.value = ''
    const data: Record<string, unknown> = {
        name: name.value,
        email: email.value,
        role: role.value,
    }
    if (password.value) data.password = password.value

    try {
        const { invitationSent, invitationError } = await createUser.mutateAsync(data)
        if (!password.value && !invitationSent) {
            toast.add({
                title: `User created - invitation email couldn't be sent (${invitationFailureReason(invitationError)})`,
                color: 'warning',
            })
        } else {
            toast.add({ title: invitationSent ? 'Invitation sent' : 'User created', color: 'success' })
        }
        emit('update:open', false)
    } catch {
        error.value = 'Could not create user - please try again.'
    }
}
</script>

<template>
    <UModal
        :open="open"
        title="Create user"
        description="Add a new account to the team"
        :ui="{ content: 'max-w-sm' }"
        data-component="create-user"
        @update:open="(v: boolean) => emit('update:open', v)"
    >
        <template #body>
            <form class="flex flex-col gap-4" @submit.prevent="submit">
                <UFormField label="Name">
                    <UInput v-model="name" placeholder="Full name" class="w-full" />
                </UFormField>
                <UFormField label="Email">
                    <UInput v-model="email" type="email" placeholder="user@example.com" class="w-full" />
                </UFormField>
                <UFormField label="Role">
                    <USelectMenu v-model="role" :items="roleItems" value-key="value" class="w-full" />
                </UFormField>
                <UFormField
                    label="Password"
                    :description="mailConfigured
                        ? 'Leave blank to email a set-password invitation.'
                        : 'Required - no mailer is configured on this server.'"
                >
                    <UFieldGroup class="w-full">
                        <UInput v-model="password" type="text" placeholder="Password" class="w-full" />
                        <UTooltip text="Generate a random password" arrow>
                            <UButton
                                icon="i-lucide-dice-5"
                                variant="subtle"
                                square
                                aria-label="Generate password"
                                @click="password = generatePassword()"
                                :ui="{ base: 'rounded-md' }"
                            />
                        </UTooltip>
                    </UFieldGroup>
                </UFormField>
            </form>

            <p v-if="error" class="mt-3 text-sm text-error">{{ error }}</p>
        </template>

        <template #footer>
            <UButton
                icon="i-lucide-user-plus"
                label="Create user"
                color="success"
                variant="subtle"
                :loading="createUser.isPending.value"
                @click="submit"
                class="ml-auto"
            />
        </template>
    </UModal>
</template>
