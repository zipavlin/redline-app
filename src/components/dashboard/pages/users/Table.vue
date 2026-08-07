<script setup lang="ts">
import type { UserRow } from '@/resources/user/model'
import { computed, h, ref, resolveComponent } from 'vue'
import type { TableColumn, TableRow } from '@nuxt/ui'
import { useStore } from '@/composables/useStore'
import type { DashboardStore } from '@/store/dashboard'
import { useDashboardTable } from '@/composables/useDashboardTable'
import { getFormattedDatetime, getRelativeTime } from '@/core/datetime'
import { useUserList, useUserTabCounts } from '@/resources/user/queries'
import UserFilterTags from '@/components/dashboard/pages/users/UserFilterTags.vue'
import CreateUser from '@/components/dashboard/pages/users/CreateUser.vue'
import { filterParams, mergeParams, type ListParams } from '@/core/api/params'

const store = useStore<DashboardStore>()
const UButton = resolveComponent('UButton')
const UBadge = resolveComponent('UBadge')
const UTooltip = resolveComponent('UTooltip')

// State
const createOpen = ref(false)
/**
 * Local input value - committed to the store only on Enter or send-button so
 * the query doesn't refetch on every keystroke.
 */
const searchInput = ref(store.users.filter.search)

const { data: listData, isFetching } = useUserList(() => store.userListParams())
/**
 * Tab counts honour search + role but NOT status, so the counts don't jump as
 * the admin switches tabs.
 */
const { data: tabCounts } = useUserTabCounts(() => {
    const parts: ListParams[] = []
    if (store.users.filter.search) parts.push(filterParams('search', store.users.filter.search, 'like'))
    if (store.users.filter.role) parts.push(filterParams('role', store.users.filter.role))
    return mergeParams(...parts)
})

// Computed
const rows = computed<UserRow[]>(() => listData.value?.data ?? [])
const counts = computed(() => tabCounts.value ?? { all: 0, active: 0, pending: 0 })
const total = computed(() => listData.value?.meta.total ?? 0)
const lastPage = computed(() => listData.value?.meta.last_page ?? 1)

const tabItems = computed(() => [
    { label: `All (${counts.value.all})`, value: 'all' },
    { label: `Active (${counts.value.active})`, value: 'active' },
    { label: `Pending (${counts.value.pending})`, value: 'pending' },
])

const statusGroup = computed({
    get: () => store.users.filter.status,
    set: (v) => { store.users.filter.status = v as typeof store.users.filter.status },
})

const roleItems = [
    { label: 'Any role', value: 'all' },
    { label: 'Admin', value: 'admin' },
    { label: 'Developer', value: 'developer' },
    { label: 'Reporter', value: 'reporter' },
]

const selectedRole = computed({
    get: () => store.users.filter.role ?? 'all',
    set: (v) => { store.users.filter.role = v === 'all' ? null : v },
})

const hasAdvancedFilters = computed(() => !!store.users.filter.role)

// Functions
function submitSearch() {
    store.users.filter.search = searchInput.value
}

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

// Shared table behavior (selection, keyboard nav, sort, column visibility).
/**
 * Filters, aggregates, and column definitions stay local; the shared mechanics
 * live in useDashboardTable.
 */
const toggleableColumns = [
    { id: 'status', label: 'Status' },
    { id: 'name', label: 'Name' },
    { id: 'email', label: 'Email' },
    { id: 'role', label: 'Role' },
    { id: 'reports_count', label: 'Reports' },
    { id: 'comments_count', label: 'Comments' },
    { id: 'created_at', label: 'Joined' },
]
const {
    highlightedIndex,
    tableWrapper,
    columnVisibility,
    columnMenuItems,
    tableMeta,
    sortableHeader,
    onKeydown,
} = useDashboardTable<UserRow>({
    rows: () => rows.value,
    lastPage: () => lastPage.value,
    page: store.users.page,
    sort: store.users,
    resetSource: () => [
        store.users.filter.status, store.users.filter.search, store.users.filter.role,
        store.users.sort, store.users.dir,
    ],
    select: (row) => store.openUser(row.id),
    clear: () => store.closeUser(),
    // Mirror an external close (details-panel X button) back to the highlight.
    active: () => store.users.active,
    toggleableColumns,
})

// Columns
// Everything renders through cell/header callbacks rather than #<column>-cell slots.
const columns: TableColumn<UserRow>[] = [
    {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => h(
            UBadge,
            { variant: 'subtle', color: statusColor(row.original.status) },
            () => statusLabel(row.original.status),
        ),
    },
    {
        accessorKey: 'name',
        header: sortableHeader('name', 'Name'),
        cell: ({ row }) => h('span', { class: 'font-medium text-highlighted' }, row.original.name ?? '-'),
    },
    {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) => h('span', { class: 'text-muted' }, row.original.email ?? '-'),
    },
    {
        accessorKey: 'role',
        header: sortableHeader('role', 'Role'),
        cell: ({ row }) => h(
            UBadge,
            { variant: 'subtle', color: roleColor(row.original.role) },
            () => roleLabel(row.original.role),
        ),
    },
    {
        accessorKey: 'reports_count',
        header: sortableHeader('reports:count', 'Reports'),
        cell: ({ row }) => h('span', { class: 'tabular-nums' }, row.original.reports_count ?? 0),
    },
    {
        accessorKey: 'comments_count',
        header: sortableHeader('comments:count', 'Comments'),
        cell: ({ row }) => h('span', { class: 'tabular-nums' }, row.original.comments_count ?? 0),
    },
    {
        accessorKey: 'created_at',
        header: sortableHeader('created_at', 'Joined'),
        cell: ({ row }) => h(
            UTooltip,
            { text: getFormattedDatetime(row.original.created_at) },
            () => h('span', getRelativeTime(row.original.created_at)),
        ),
    },
]
</script>

<template>
    <UDashboardPanel
        id="users-table"
    >
        <template #header>
            <UDashboardNavbar title="Users" :toggle="false">
                <template #leading>
                    <UDashboardSidebarToggle />
                    <UDashboardSidebarCollapse />
                </template>

                <div class="flex min-w-0 items-center gap-2 overflow-x-auto bg-muted rounded-md">
                    <UTabs v-model="statusGroup" color="primary" :items="tabItems" :content="false" size="xs" :ui="{ list: 'bg-muted' }" />
                    <div class="flex items-center">
                        <UInput
                            v-model="searchInput"
                            placeholder="Search name or email"
                            icon="i-lucide-search"
                            @keydown.enter="submitSearch"
                        />
                        <UButton
                            icon="i-lucide-send"
                            variant="ghost"
                            color="neutral"
                            aria-label="Search"
                            class="-ml-7"
                            @click="submitSearch"
                        />
                    </div>
                </div>

                <template #right>
                    <UButton color="primary" icon="i-lucide-user-plus" label="New user" @click="createOpen = true" />
                    <UPopover :content="{ side: 'bottom', align: 'end' }" arrow>
                        <UButton
                            :color="hasAdvancedFilters ? 'primary' : 'neutral'"
                            :variant="hasAdvancedFilters ? 'soft' : 'outline'"
                            :icon="hasAdvancedFilters ? 'i-lucide-funnel-plus' : 'i-lucide-funnel'"
                            label="Filter"
                        />
                        <template #content>
                            <div class="flex flex-col gap-3 p-3">
                                <UFormField label="Role">
                                    <USelectMenu v-model="selectedRole" :items="roleItems" value-key="value" class="w-full" />
                                </UFormField>
                            </div>
                        </template>
                    </UPopover>
                    <UDropdownMenu :items="columnMenuItems" :content="{ align: 'end' }">
                        <UButton color="neutral" variant="outline" icon="i-lucide-settings-2" aria-label="Toggle columns" />
                    </UDropdownMenu>
                </template>
            </UDashboardNavbar>
        </template>
        <template #body>
            <UserFilterTags />

            <div :ref="(el) => { tableWrapper = el as HTMLElement | null }" tabindex="0" class="flex min-h-0 flex-1 flex-col outline-none" @keydown="onKeydown">
                <UTable
                    v-model:column-visibility="columnVisibility"
                    :data="rows"
                    :columns="columns"
                    :meta="tableMeta"
                    :get-row-id="(row: UserRow) => row.id"
                    :loading="isFetching"
                    sticky="header"
                    class="flex-1"
                    @select="(_e: Event, row: TableRow<UserRow>) => { highlightedIndex = row.index }"
                >
                    <template #empty>
                        <div class="flex flex-col items-center gap-2 py-10 text-center">
                            <UIcon name="i-lucide-users" class="size-8 text-dimmed" />
                            <p class="text-sm text-muted">No users match these filters</p>
                        </div>
                    </template>
                </UTable>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-sm text-muted">{{ total }} users</p>
                <UPagination
                    v-model:page="store.users.page.page"
                    :items-per-page="store.users.page.perPage"
                    :total="total"
                />
            </div>
        </template>
    </UDashboardPanel>

    <CreateUser v-model:open="createOpen" />
</template>
