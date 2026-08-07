<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useStore } from '@/composables/useStore'
import type { DashboardStore } from '@/store/dashboard'
import { useToast } from '@nuxt/ui/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import { useUpdateUserMutation, useDeleteUserMutation } from '@/resources/user/mutations'
import { generatePassword } from '@/core/password'

const store = useStore<DashboardStore>()
const toast = useToast()
const { confirm } = useConfirm()
const updateUser = useUpdateUserMutation()
const deleteUser = useDeleteUserMutation()

// Form state
/**
 * Local refs, re-seeded from store.users.active on every selection change so
 * switching rows silently discards any unsaved edits (same as the comment draft
 * pattern in Reports Details).
 */
const formStatus = ref<string>('approved')
const formRole = ref<string>('reporter')
const formName = ref<string>('')
const formEmail = ref<string>('')
const formPassword = ref<string>('')

const isPending = computed(() => store.users.active?.status === 'pending')

const statusColor = (status: string): string => {
    if (status === 'approved') return 'success'
    if (status === 'pending') return 'warning'
    return 'neutral'
}

const statusLabel = (status: string): string => {
    if (status === 'approved') return 'Active'
    if (status === 'pending') return 'Pending'
    return status
}

const roleColor = (role?: string): string => {
    if (role === 'admin') return 'primary'
    if (role === 'developer') return 'info'
    if (role === 'reporter') return 'neutral'
    return 'neutral'
}

const roleLabel = (role?: string): string => {
    if (role === 'admin') return 'Admin'
    if (role === 'developer') return 'Developer'
    if (role === 'reporter') return 'Reporter'
    return '-'
}

function seedForm() {
    const a = store.users.active
    if (!a) return
    formStatus.value = a.status
    formRole.value = a.role ?? 'reporter'
    formName.value = a.name ?? ''
    formEmail.value = a.email ?? ''
    formPassword.value = ''
}

// Re-seed whenever a different user is selected.
watch(() => store.users.active?.id, () => seedForm(), { immediate: true })

// Save / Save & Approve
async function save(approve = false) {
    if (!store.users.active) return
    const data: Record<string, unknown> = {
        status: approve ? 'approved' : formStatus.value,
        role: formRole.value,
        name: formName.value,
        email: formEmail.value,
    }
    if (formPassword.value) data.password = formPassword.value

    try {
        await updateUser.mutateAsync({ id: store.users.active.id, data })
        toast.add({ title: approve ? 'User approved' : 'User updated', color: 'success' })
        formPassword.value = ''
        // Re-fetch detail to pick up server-side computed fields (status, role, stats).
        await store.openUser(store.users.active.id)
    } catch {
        toast.add({ title: 'Could not update user', color: 'error' })
    }
}

// Delete
async function deleteUserAction() {
    if (!store.users.active) return
    const ok = await confirm(
        'Delete user',
        'Are you sure? This cannot be undone.',
        { confirmLabel: 'Delete', color: 'error' },
    )
    if (!ok) return
    const id = store.users.active.id
    try {
        await deleteUser.mutateAsync(id)
        toast.add({ title: 'User deleted', color: 'success' })
        store.closeUser()
    } catch {
        toast.add({ title: 'Could not delete user', color: 'error' })
    }
}
</script>

<template>
    <UDashboardPanel
        id="users-details"
        :default-size="20"
        :ui="{ body: 'sm:p-4', root: 'bg-default' }"
        v-if="store.users.active"
    >
        <template #header>
            <div class="p-4 pb-0">
                <div class="flex items-start justify-between gap-2">
                    <UUser
                        class="min-w-0 flex-1"
                        :ui="{ wrapper: 'min-w-0', name: 'truncate', description: 'truncate' }"
                        :name="store.users.active.name"
                        :avatar="{ alt: store.users.active.name }"
                        :description="store.users.active.email"
                    />
                    <UDashboardSidebarToggle size="xs" class="-mt-1 shrink-0" />
                    <UButton
                        icon="i-lucide-x"
                        size="xs"
                        class="-mt-1 shrink-0"
                        aria-label="Close user"
                        @click="store.closeUser()"
                    />
                </div>
                <USeparator position="end">
                    <div class="flex flex-wrap items-center gap-1">
                        <UBadge :color="statusColor(store.users.active.status)" variant="subtle" size="sm" v-if="store.users.active.status === 'pending'">
                            {{ statusLabel(store.users.active.status) }}
                        </UBadge>
                        <UBadge :color="roleColor(store.users.active.role)" variant="subtle" size="sm">
                            {{ roleLabel(store.users.active.role) }}
                        </UBadge>
                    </div>
                </USeparator>
            </div>
            <div v-if="store.users.active?.stats" class="flex items-stretch gap-2 p-4 pb-3">
                <div class="flex-1 text-center">
                    <div class="text-2xl font-semibold text-highlighted">{{ store.users.active.stats.reports }}</div>
                    <div class="text-xs text-muted">Total</div>
                </div>
                <div class="flex-1 text-center">
                    <div class="text-2xl font-semibold text-highlighted">{{ store.users.active.stats.open }}</div>
                    <div class="text-xs text-muted">Open</div>
                </div>
                <div class="flex-1 text-center">
                    <div class="text-2xl font-semibold text-highlighted">{{ store.users.active.stats.resolved }}</div>
                    <div class="text-xs text-muted">Done</div>
                </div>
            </div>
            <USeparator v-if="store.users.active?.stats" position="end" />
        </template>
        <template #body>
            <UPageCard variant="subtle" :ui="{ container: 'p-0 sm:p-0', header: 'w-full p-3 mb-0', body: 'w-full p-3 border-t border-default' }" class="mt-auto">
                <template #header>
                    <span class="text-sm font-medium text-highlighted">Edit user</span>
                </template>
                <template #body>
                    <div class="flex flex-col gap-3">
                        <UFormField label="Status">
                            <USelectMenu
                                v-model="formStatus"
                                :disabled="store.users.active.id === store.auth.user?.id"
                                :items="[
                                    { label: 'Active', value: 'approved' },
                                    { label: 'Pending', value: 'pending' },
                                ]"
                                value-key="value"
                                class="w-full"
                            />
                        </UFormField>
                        <UFormField label="Role">
                            <USelectMenu
                                v-model="formRole"
                                :disabled="store.users.active.id === store.auth.user?.id"
                                :items="[
                                    { label: 'Admin', value: 'admin' },
                                    { label: 'Developer', value: 'developer' },
                                    { label: 'Reporter', value: 'reporter' },
                                ]"
                                value-key="value"
                                class="w-full"
                            />
                        </UFormField>
                        <UFormField label="Name">
                            <UInput v-model="formName" placeholder="Full name" class="w-full" />
                        </UFormField>
                        <UFormField label="Email">
                            <UInput v-model="formEmail" type="email" placeholder="user@example.com" class="w-full" />
                        </UFormField>
                        <UFormField label="Password" description="Leave blank to keep current password.">
                            <UFieldGroup class="w-full">
                                <UInput v-model="formPassword" type="text" placeholder="New password" class="w-full" />
                                <UTooltip text="Generate a random password" arrow>
                                    <UButton
                                        icon="i-lucide-dice-5"
                                        variant="subtle"
                                        square
                                        aria-label="Generate password"
                                        @click="formPassword = generatePassword()"
                                        :ui="{ base: 'rounded-md' }"
                                    />
                                </UTooltip>
                            </UFieldGroup>
                        </UFormField>
                    </div>
                </template>
            </UPageCard>
        </template>
        <template #footer>
            <div class="flex flex-col gap-2 p-4 pt-0">
                <USeparator position="start" class="mt-2" label="Actions" />

                <div class="flex flex-wrap items-center justify-between gap-2">
                    <UButton
                        v-if="store.users.active?.id !== store.auth.user?.id"
                        color="error"
                        variant="soft"
                        icon="i-lucide-trash"
                        label="Delete user"
                        :loading="deleteUser.isPending.value"
                        @click="deleteUserAction"
                    />

                    <UFieldGroup class="ml-auto">
                        <UButton
                            color="success"
                            variant="subtle"
                            label="Save"
                            icon="i-lucide-check"
                            :loading="updateUser.isPending.value"
                            @click="save(false)"
                        />
                        <UPopover v-if="isPending" :content="{ side: 'bottom', align: 'end' }" arrow>
                            <UButton
                                color="success"
                                variant="outline"
                                icon="i-lucide-chevron-down"
                                aria-label="More save options"
                            />
                            <template #content>
                                <div class="flex flex-col p-1 gap-1">
                                    <UButton
                                        color="neutral"
                                        variant="ghost"
                                        size="sm"
                                        label="Approve & Save"
                                        icon="i-lucide-user-check"
                                        class="justify-start"
                                        :loading="updateUser.isPending.value"
                                        @click="save(true)"
                                    />
                                </div>
                            </template>
                        </UPopover>
                    </UFieldGroup>
                </div>
            </div>
        </template>
    </UDashboardPanel>
</template>
