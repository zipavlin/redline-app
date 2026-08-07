<script setup lang="ts">
/**
 * Persistent dashboard sidebar: logo + Cmd+K search, primary navigation
 * (Reports / Users), and a footer account menu (theme toggle + logout).
 * Rendered once inside the UDashboardGroup in Dashboard.vue so it survives
 * route changes.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from '@nuxt/ui/composables/useToast'
import type {CommandPaletteGroup, NavigationMenuItem} from '@nuxt/ui'
import { useStore } from '@/composables/useStore'
import type { DashboardStore } from '@/store/dashboard'
import { useRedline } from '@/composables/useApi'
import { identity } from '@/core/storage'
import Logo from '@/components/shared/ui/Logo.vue'

const store = useStore<DashboardStore>()
const router = useRouter()
const { api } = useRedline()
const toast = useToast()

const loggingOut = ref(false)

// Computed
const user = computed(() => store.auth.user)

const links = computed(() => {
    return [
        { label: 'Home', icon: 'i-lucide-layout-dashboard', to: '/', exact: true },
        { label: 'Reports', icon: 'i-lucide-messages-square', to: '/reports', exact: true },
        ...(user.value?.isAdmin ? [{ label: 'Users', icon: 'i-lucide-users', to: '/users' }] : []),
    ]
})

const navigationGroups = computed<NavigationMenuItem[][]>(() => {
    return [links.value]
})

// Command palette groups - navigation + quick filters.
const searchGroups = computed<CommandPaletteGroup[]>(() => [
    {
        id: 'go',
        label: 'Go to',
        items: links.value,
    },
    {
        id: 'reports',
        label: 'Reports',
        items: [
            { label: 'All reports', icon: 'i-lucide-list', onSelect: () => applyReportGroup('all') },
            { label: 'Unresolved reports', icon: 'i-lucide-circle-dot', onSelect: () => applyReportGroup('unresolved') },
            { label: 'Resolved reports', icon: 'i-lucide-circle-check', onSelect: () => applyReportGroup('resolved') },
            { label: 'My reports', icon: 'i-lucide-user', onSelect: () => applyMine() },
        ],
    },
])

// Functions
function applyReportGroup(group: 'all' | 'unresolved' | 'resolved') {
    store.report.filter.mine = false
    store.report.filter.statusGroup = group
    router.push('/reports')
}
function applyMine() {
    store.report.filter.mine = true
    store.report.filter.statusGroup = 'all'
    router.push('/reports')
}

async function logout() {
    loggingOut.value = true
    try {
        const result = await api.auth.logout()
        if (result.ok) {
            identity.clearUser()
            identity.clearTokenVerified()
            store.auth.user = null
            window.location.reload()
        } else {
            /**
             * Server refused the logout (401/403/419/500…). Keep the session intact
             * and tell the user instead of silently reloading back into an
             * authenticated app.
             */
            toast.add({ title: 'Could not log out', color: 'error' })
        }
    } catch {
        // Network-level failure - logout never reached the server.
        toast.add({ title: 'Could not log out - check your connection', color: 'error' })
    } finally {
        loggingOut.value = false
    }
}
</script>

<template>
    <UDashboardSidebar
        id="default"
        collapsible
        resizable
        class="bg-elevated/25"
        :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
        <template #header="{ collapsed }">
            <div class="flex w-full items-center gap-2">
                <Logo :size="24" :active="true"></Logo>
                <span v-if="!collapsed" class="text-lg font-semibold text-highlighted">Redline</span>
            </div>
        </template>

        <template #default="{ collapsed }">
            <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" />

            <UNavigationMenu
                :items="navigationGroups"
                orientation="vertical"
                :collapsed="collapsed"
                tooltip
                popover
            />
        </template>

        <template #footer="{ collapsed }">
            <UPopover :content="{ side: 'top', align: 'center' }" class="w-full">
                <UButton
                    :label="collapsed ? undefined : user?.name"
                    :avatar="{ alt: user?.name }"
                    color="neutral"
                    variant="ghost"
                    block
                    :square="collapsed"
                    :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
                    class="data-[state=open]:bg-elevated"
                    :ui="{ trailingIcon: 'text-dimmed ms-auto' }"
                />

                <template #content>
                    <div class="flex w-48 flex-col p-1">
                        <div class="px-3 py-2">
                            <p class="truncate font-medium text-highlighted">{{ user?.name }}</p>
                            <p class="truncate text-xs text-muted">{{ user?.email }}</p>
                        </div>

                        <USeparator />

                        <div class="flex items-center justify-between px-3 py-2">
                            <span class="text-muted">Theme</span>
                            <UButton
                                :icon="store.settings.theme === 'dark' ? 'i-lucide-moon' : 'i-lucide-sun'"
                                square
                                :aria-label="`Switch to ${store.settings.theme === 'dark' ? 'light' : 'dark'} theme`"
                                @click="store.settings.theme = store.settings.theme === 'dark' ? 'light' : 'dark'"
                            />
                        </div>

                        <USeparator />

                        <div class="p-1">
                            <UButton
                                block
                                color="error"
                                variant="subtle"
                                icon="i-lucide-log-out"
                                :loading="loggingOut"
                                :disabled="loggingOut"
                                @click="logout"
                            >
                                Log out
                            </UButton>
                        </div>
                    </div>
                </template>
            </UPopover>
        </template>
    </UDashboardSidebar>

    <UDashboardSearch :groups="searchGroups" />
</template>
