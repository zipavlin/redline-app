<script setup lang="ts">
import type { DashboardReportRow } from '@/resources/report/model'
import { computed, h, resolveComponent } from 'vue'
import type { TableColumn, TableRow } from '@nuxt/ui'
import { useStore } from '@/composables/useStore'
import type { DashboardStore } from '@/store/dashboard'
import { useDashboardTable } from '@/composables/useDashboardTable'
import { getFormattedDatetime, getRelativeTime } from '@/core/datetime'
import { statusColor, statusLabel } from '@/domain/status'
import { useReportList, useReportAggregate } from '@/resources/report/queries'
import { useMemberCandidates } from '@/resources/user/queries'
import ReportFilterTags from '@/components/dashboard/pages/reports/ReportFilterTags.vue'
import DateRangeField from '@/components/shared/ui/DateRangeField.vue'

const store = useStore<DashboardStore>()
const UButton = resolveComponent('UButton')
const UBadge = resolveComponent('UBadge')
const UTooltip = resolveComponent('UTooltip')

const { data: listData, isFetching } = useReportList(() => store.reportListParams())
const { data: authorsData } = useReportAggregate(
    () => ({ 'aggregate[author:unique]': 'id,name' }),
    {
        key: ['authors'],
        select: (res: Record<string, unknown>) => {
            const unique = (res['author'] as Record<string, unknown> | undefined)?.unique
            return Array.isArray(unique) ? unique as { id: string; name: string }[] : []
        },
        staleTime: 60_000,
    },
)
const { data: tabCounts } = useReportAggregate(
    () => ({
        'aggregate[status:count]': 'unresolved,resolved',
        ...store.reportFilterParams(),
    }),
    {
        key: ['tabs'],
        select: (res: Record<string, unknown>) => {
            const statusCounts = (res['status'] as Record<string, unknown> | undefined)?.count as Record<string, number> | undefined
            const unresolved = statusCounts?.unresolved ?? 0
            const resolved = statusCounts?.resolved ?? 0
            return { all: unresolved + resolved, unresolved, resolved }
        },
        staleTime: 30_000,
    },
)

const { data: locationsData } = useReportAggregate(() => ({ 'aggregate[location:unique]': '' }))

/** Candidate users for the member filter - GET /user, gated to developers and hidden on 403. */
const { data: membersData, error: membersError } = useMemberCandidates({
    enabled: () => store.auth.user?.isDeveloper === true,
})

// Computed
const rows = computed<DashboardReportRow[]>(() => listData.value?.data ?? [])
const counts = computed(() => tabCounts.value ?? { all: 0, unresolved: 0, resolved: 0 })
const total = computed(() => listData.value?.meta.total ?? 0)
const lastPage = computed(() => listData.value?.meta.last_page ?? 1)
const authors = computed(() => authorsData.value ?? [])

const locations = computed(() => (locationsData.value?.['location'] as { unique?: string[] } | undefined)?.unique ?? [])

const locationItems = computed(() => [
    { label: 'Any page', value: 'all' },
    ...locations.value.map(loc => ({ label: loc, value: loc })),
])

const selectedLocation = computed({
    get: () => store.report.filter.location ?? 'all',
    set: (v) => { store.report.filter.location = v === 'all' ? null : v },
})

const tabItems = computed(() => [
    { label: `All (${counts.value.all})`, value: 'all' },
    { label: `Unresolved (${counts.value.unresolved})`, value: 'unresolved' },
    { label: `Resolved (${counts.value.resolved})`, value: 'resolved' },
])

const statusGroup = computed({
    get: () => store.report.filter.statusGroup,
    set: (v) => { store.report.filter.statusGroup = v as typeof store.report.filter.statusGroup },
})

const search = computed({
    get: () => store.report.filter.search,
    set: (v) => { store.report.filter.search = v },
})

const authorItems = computed(() => [
    { label: 'Anyone', value: 'all' },
    ...authors.value.map(a => ({ label: a.name, value: a.id })),
])

const reportedBy = computed({
    get: () => store.report.filter.userId ?? 'all',
    set: (v) => { store.report.filter.userId = v === 'all' ? null : v },
})

const memberItems = computed(() => (membersData.value?.data ?? []).map(user => ({ label: user.name ?? user.id, value: user.id })))

const memberLookup = computed(() => (membersData.value?.data ?? []).map(user => ({ id: user.id, name: user.name ?? user.id })))

const memberIds = computed({
    get: () => store.report.filter.memberIds,
    set: (value: string[] | undefined) => { store.report.filter.memberIds = value ?? [] },
})

const memberFilterDenied = computed(() => (membersError.value as { status?: number } | null)?.status === 403)

const showMemberFilter = computed(() => store.auth.user?.isDeveloper === true && !memberFilterDenied.value)

const hasAdvancedFilters = computed(() =>
    store.report.filter.mine || store.report.filter.hasMedia || store.report.filter.hasComments
    || store.report.filter.assignedToMe || store.report.filter.memberIds.length > 0
    || !!store.report.filter.userId || !!store.report.filter.dateFrom || !!store.report.filter.dateTo
    || !!store.report.filter.location,
)

// Shared table behavior (selection, keyboard nav, sort, column visibility).
/**
 * Filters, aggregates, and column definitions stay local; the shared mechanics
 * live in useDashboardTable.
 */
const toggleableColumns = [
    { id: 'status', label: 'Status' },
    { id: 'title', label: 'Report' },
    { id: 'location', label: 'URL' },
    { id: 'filed_by', label: 'Filed by' },
    { id: 'created_at', label: 'Date' },
]
const {
    highlightedIndex,
    tableWrapper,
    columnVisibility,
    columnMenuItems,
    tableMeta,
    sortableHeader,
    onKeydown,
} = useDashboardTable<DashboardReportRow>({
    rows: () => rows.value,
    lastPage: () => lastPage.value,
    page: store.report.page,
    sort: store.report,
    resetSource: () => [
        store.report.filter.statusGroup, store.report.filter.search, store.report.filter.mine,
        store.report.filter.hasMedia, store.report.filter.hasComments, store.report.filter.userId,
        store.report.filter.assignedToMe, store.report.filter.memberIds,
        store.report.filter.dateFrom, store.report.filter.dateTo, store.report.filter.location,
        store.report.sort, store.report.dir,
    ],
    select: (row) => store.openReport(row.id),
    clear: () => store.closeReport(),
    toggleableColumns,
})

// Columns
// Everything renders through cell/header callbacks rather than #<column>-cell slots.
const columns: TableColumn<DashboardReportRow>[] = [
    {
        accessorKey: 'status',
        header: sortableHeader('status', 'Status'),
        cell: ({ row }) => h(
            UBadge,
            { variant: 'subtle', color: statusColor(row.original.status) },
            () => statusLabel(row.original.status),
        ),
    },
    {
        /**
         * `title` is derived server-side from the report body (ReportController::title) -
         * body_preview is the widget's Report field, not a dashboard row field.
         */
        accessorKey: 'title',
        header: 'Report',
        cell: ({ row }) => h('div', { class: 'flex items-center gap-2' }, [
            h('span', { class: 'font-medium text-highlighted' }, row.original.title),
            (row.original.members_count ?? 0) > 0
                ? h(UBadge, {
                    variant: 'subtle',
                    color: 'neutral',
                    size: 'sm',
                    leadingIcon: 'i-lucide-users',
                }, () => String(row.original.members_count))
                : null,
        ]),
    },
    {
        accessorKey: 'location',
        header: sortableHeader('location', 'Url'),
        cell: ({ row }) => h('span', { class: 'text-muted' }, row.original.location),
    },
    {
        id: 'filed_by',
        header: sortableHeader('author', 'Reported by'),
        cell: ({ row }) => h('span', { class: 'text-muted' }, row.original.author?.name ?? '-'),
    },
    {
        accessorKey: 'created_at',
        header: sortableHeader('created_at', 'Date'),
        cell: ({ row }) => h(
            UTooltip,
            { text: getFormattedDatetime(row.original.created_at) },
            () => h('span', getRelativeTime(row.original.created_at)),
        ),
    },
    {
        id: 'open',
        header: '',
        cell: ({ row }) => h(UButton, {
            size: 'xs',
            icon: 'i-lucide-square-arrow-out-up-right',
            to: store.getUrlWithQuery(row.original.url, { 'redline-report': row.original.id }),
            target: '_blank',
            'aria-label': 'Open on page',
            // Don't let the link double as a row select.
            onClick: (e: Event) => e.stopPropagation(),
        }),
        meta: { class: { th: 'w-0', td: 'w-0' } },
    },
]
</script>

<template>
    <UDashboardPanel
        id="reports-table"
    >
        <template #header>
            <UDashboardNavbar title="Reports" :toggle="false">
                <template #leading>
                    <UDashboardSidebarToggle />
                    <UDashboardSidebarCollapse />
                </template>

                <div class="flex min-w-0 items-center gap-2 overflow-x-auto bg-muted rounded-md">
                    <UTabs v-model="statusGroup" color="primary" :items="tabItems" :content="false" size="xs" :ui="{ list: 'bg-muted' }" />
                    <UInput v-model="search" placeholder="Search title" icon="i-lucide-search" />
                </div>


                <template #right>
                    <UPopover :content="{ side: 'bottom', align: 'end' }" arrow>
                        <UButton
                            :color="hasAdvancedFilters ? 'primary' : 'neutral'"
                            :variant="hasAdvancedFilters ? 'soft' : 'outline'"
                            :icon="hasAdvancedFilters ? 'i-lucide-funnel-plus' : 'i-lucide-funnel'"
                            label="Filter"
                        />
                        <template #content>
                            <div class="flex flex-col gap-3 p-3">
                                <USwitch v-model="store.report.filter.mine" label="Only mine" />
                                <USwitch v-model="store.report.filter.assignedToMe" label="Assigned to me" />
                                <USwitch v-model="store.report.filter.hasMedia" label="Has media" />
                                <USwitch v-model="store.report.filter.hasComments" label="Has comments" />
                                <UFormField label="Reported by">
                                    <USelectMenu v-model="reportedBy" :items="authorItems" value-key="value" class="w-full" />
                                </UFormField>
                                <UFormField v-if="showMemberFilter" label="Member">
                                    <USelectMenu v-model="memberIds" :items="memberItems" value-key="value" multiple placeholder="Anyone" class="w-full" />
                                </UFormField>
                                <UFormField label="Page URL">
                                    <USelectMenu v-model="selectedLocation" :items="locationItems" value-key="value" class="w-full" />
                                </UFormField>
                                <UFormField label="Date range">
                                    <DateRangeField
                                        :from="store.report.filter.dateFrom"
                                        :to="store.report.filter.dateTo"
                                        @update:from="v => store.report.filter.dateFrom = v"
                                        @update:to="v => store.report.filter.dateTo = v"
                                    />
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
            <ReportFilterTags :authors="authors" :members="memberLookup" />

            <div :ref="(el) => { tableWrapper = el as HTMLElement | null }" tabindex="0" class="flex min-h-0 flex-1 flex-col outline-none" @keydown="onKeydown">
                <UTable
                    v-model:column-visibility="columnVisibility"
                    :data="rows"
                    :columns="columns"
                    :meta="tableMeta"
                    :get-row-id="(row: DashboardReportRow) => row.id"
                    :loading="isFetching"
                    sticky="header"
                    class="flex-1"
                    @select="(_e: Event, row: TableRow<DashboardReportRow>) => { highlightedIndex = row.index }"
                >
                    <template #empty>
                        <div class="flex flex-col items-center gap-2 py-10 text-center">
                            <UIcon name="i-lucide-inbox" class="size-8 text-dimmed" />
                            <p class="text-sm text-muted">No reports match these filters</p>
                        </div>
                    </template>
                </UTable>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-sm text-muted">{{ total }} reports</p>
                <UPagination
                    v-model:page="store.report.page.page"
                    :items-per-page="store.report.page.perPage"
                    :total="total"
                />
            </div>
        </template>
    </UDashboardPanel>
</template>
