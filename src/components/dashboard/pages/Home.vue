<script setup lang="ts">
/**
 * Home dashboard — the landing page (route "/"). Five cards + an admin-only
 * row: Overview donut, Top reporters, Top locations, Recent reports, Admin
 * counters. All queries auto-refresh every 60s.
 */
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useStore } from '@/composables/useStore'
import type { DashboardStore } from '@/store/dashboard'
import { statusSegments, topAuthors } from '@/resources/report/home'
import { useReportAggregate, useReportList } from '@/resources/report/queries'
import { useUserList, useUserTabCounts } from '@/resources/user/queries'
import { filterParams, includeArr, mergeParams, paginateParams } from '@/core/api/params'
import { DASHBOARD_LIST_INCLUDE } from '@/resources/report/constants'
import { getFormattedDatetime, getRelativeTime } from '@/core/datetime'
import { statusColor } from '@/domain/status'
import type { Author } from '@/resources/user/model'
import type { UserRow } from '@/resources/user/model'
import type { DashboardReportRow } from '@/resources/report/model'
import Donut from '@/components/shared/ui/Donut.vue'
import Details from '@/components/dashboard/pages/reports/Details.vue'

const store = useStore<DashboardStore>()
const router = useRouter()

const isAdmin = computed<boolean>(() => store.auth.user?.isAdmin ?? false)
const REFRESH = 60_000

// ── Overview — status donut ────────────────────────────────────────────────
const { data: statusData, dataUpdatedAt } = useReportAggregate(
    () => ({ 'aggregate[status:count]': 'new,noticed,progress,resolved,done' }),
    { key: ['home', 'status'], refetchInterval: REFRESH },
)
const statusCounts = computed<Record<string, number>>(() => {
    const raw = (statusData.value?.['status'] as Record<string, unknown> | undefined)?.count

    return (raw as Record<string, number> | undefined) ?? {}
})
const segments = computed(() => statusSegments(statusCounts.value))

// "Last updated" affordance — driven by the overview query's refetch ticks.
const lastUpdated = ref<Date | null>(null)
watch(dataUpdatedAt, (t) => {
    if (t) lastUpdated.value = new Date(t)
}, { immediate: true })
const updatedText = computed(() =>
    lastUpdated.value
        ? `Updated ${getFormattedDatetime(lastUpdated.value.toISOString(), 'en-GB', { timeStyle: 'short' })}`
        : 'Updating…'
)

// ── Top reporters — author:count joined with the author:unique list ────────
const { data: authorCountData } = useReportAggregate(
    () => ({ 'aggregate[author:count]': '' }),
    { key: ['top-authors'], refetchInterval: REFRESH },
)
// Keyed ['authors'] — cache-shared with the Reports page Table.vue.
const { data: authorsData } = useReportAggregate(
    () => ({ 'aggregate[author:unique]': 'id,name' }),
    {
        key: ['authors'],
        select: (res: Record<string, unknown>) => {
            const unique = (res['author'] as Record<string, unknown> | undefined)?.unique

            return Array.isArray(unique) ? unique as Author[] : []
        },
        staleTime: 60_000,
        refetchInterval: REFRESH,
    },
)
const authorCountMap = computed<Record<string, number>>(() => {
    const raw = (authorCountData.value?.['author'] as Record<string, unknown> | undefined)?.count

    return (raw as Record<string, number> | undefined) ?? {}
})
const reporters = computed(() => topAuthors(authorCountMap.value, authorsData.value ?? [], 3))

// ── Top locations — grouped count, top 5 ───────────────────────────────────
const { data: locationsData } = useReportAggregate(
    () => ({ 'aggregate[location:count]': '' }),
    { refetchInterval: REFRESH },
)
const locations = computed(() => {
    const raw = (locationsData.value?.['location'] as Record<string, unknown> | undefined)?.count as
        | Record<string, number>
        | undefined
    if (!raw) return []

    return Object.entries(raw)
        .filter(([location]) => location !== null && location !== '')
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([location, count]) => ({ location, count }))
})
const maxLocationCount = computed(() => Math.max(1, ...locations.value.map((l) => l.count)))

// ── Recent reports — latest 5, row click opens the existing drawer ─────────
const { data: recentData } = useReportList(
    () => mergeParams(paginateParams(1, 5), { ...DASHBOARD_LIST_INCLUDE }),
    { refetchInterval: REFRESH },
)
const recent = computed<DashboardReportRow[]>(() => recentData.value?.data ?? [])

function openReport(id: string): void {
    store.openReport(id)
}

// ── Admin — user counters + pending approvals (admin-only) ─────────────────
const { data: tabCounts } = useUserTabCounts(() => ({}), { refetchInterval: REFRESH, enabled: isAdmin })
const counts = computed(() => tabCounts.value ?? { all: 0, active: 0, pending: 0 })

const { data: pendingUsersData } = useUserList(
    () => mergeParams(
        paginateParams(1, 2),
        filterParams('status', 'pending'),
        includeArr(['name', 'email']),
    ),
    { refetchInterval: REFRESH, enabled: isAdmin },
)
const pendingUsers = computed<UserRow[]>(() => pendingUsersData.value?.data ?? [])

function goToPendingApprovals(): void {
    store.users.filter.status = 'pending'
    router.push('/redline/users')
}
</script>

<template>
    <UDashboardPanel id="home">
        <template #header>
            <UDashboardNavbar title="Home" :toggle="false">
                <template #leading>
                    <UDashboardSidebarToggle />
                    <UDashboardSidebarCollapse />
                </template>
            </UDashboardNavbar>
        </template>
        <template #body>
            <div class="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                <!-- ── Overview ─────────────────────────────────────────── -->
                <UPageCard variant="subtle" :ui="{ body: 'w-full', header: 'w-full' }">
                    <template #header>
                        <div class="flex w-full items-start justify-between gap-2">
                            <div class="flex items-center gap-2">
                                <UIcon name="i-lucide-pie-chart" class="size-6 shrink-0 text-dimmed" />
                                <span class="font-semibold text-highlighted">Overview</span>
                            </div>
                            <UTooltip :text="updatedText" arrow>
                                <UButton
                                    icon="i-lucide-refresh-cw"
                                    size="xs"
                                    square
                                    aria-label="Last updated"
                                />
                            </UTooltip>
                        </div>
                    </template>
                    <template #body>
                        <USkeleton v-if="statusData === undefined" class="h-32 w-32 rounded-full" />
                        <Donut v-else :segments="segments" />
                    </template>
                </UPageCard>

                <!-- ── Top reporters ────────────────────────────────────── -->
                <UPageCard variant="subtle" :ui="{ body: 'w-full', header: 'w-full' }">
                    <template #header>
                        <div class="flex w-full items-start justify-between gap-2">
                            <div class="flex items-center gap-2">
                                <UIcon name="i-lucide-trophy" class="size-6 shrink-0 text-dimmed" />
                                <span class="font-semibold text-highlighted">Reporters</span>
                            </div>
                            <span class="text-xs text-muted">Top 3</span>
                        </div>
                    </template>
                    <template #body>
                        <div v-if="statusData === undefined || authorsData === undefined" class="flex flex-col gap-3">
                            <USkeleton v-for="i in 3" :key="i" class="h-8 w-full" />
                        </div>
                        <div v-else-if="!reporters.length" class="flex flex-col items-center gap-2 py-6 text-center">
                            <UIcon name="i-lucide-user" class="size-5 text-dimmed" />
                            <p class="text-sm text-muted">No reporters yet</p>
                        </div>
                        <div v-else class="flex flex-col gap-3">
                            <template v-for="(reporter, i) in reporters" :key="reporter.id">
                                <USeparator v-if="i > 0" />
                                <div class="flex items-center gap-3">
                                    <span class="w-5 shrink-0 text-sm tabular-nums text-muted">#{{ i + 1 }}</span>
                                    <UAvatar :alt="reporter.name" size="sm" />
                                    <div class="flex min-w-0 flex-col">
                                        <span class="truncate font-medium text-highlighted">{{ reporter.name }}</span>
                                        <span class="text-sm text-muted">{{ reporter.reports_count }} report{{ reporter.reports_count === 1 ? '' : 's' }}</span>
                                    </div>
                                </div>
                            </template>
                        </div>
                    </template>
                </UPageCard>

                <!-- ── Top locations ────────────────────────────────────── -->
                <UPageCard variant="subtle" class="md:col-span-2 lg:col-span-1" :ui="{ body: 'w-full', header: 'w-full' }">
                    <template #header>
                        <div class="flex w-full items-start justify-between gap-2">
                            <div class="flex items-center gap-2">
                                <UIcon name="i-lucide-map-pin" class="size-6 shrink-0 text-dimmed" />
                                <span class="font-semibold text-highlighted">Locations</span>
                            </div>
                            <span class="text-xs text-muted">Top 5</span>
                        </div>
                    </template>
                    <template #body>
                        <div v-if="locationsData === undefined" class="flex flex-col gap-3">
                            <USkeleton v-for="i in 5" :key="i" class="h-8 w-full" />
                        </div>
                        <div v-else-if="!locations.length" class="flex flex-col items-center gap-2 py-6 text-center">
                            <UIcon name="i-lucide-map-pin-off" class="size-5 text-dimmed" />
                            <p class="text-sm text-muted">No locations yet</p>
                        </div>
                        <div v-else class="flex flex-col gap-3">
                            <template v-for="(loc, i) in locations" :key="loc.location">
                                <USeparator v-if="i > 0" />
                                <div>
                                    <div class="flex items-baseline justify-between gap-2">
                                        <span class="truncate text-sm font-medium text-highlighted">{{ loc.location }}</span>
                                        <span class="shrink-0 text-sm tabular-nums text-muted">{{ loc.count }}</span>
                                    </div>
                                    <div class="mt-1 h-1 w-full overflow-hidden rounded-full bg-elevated">
                                        <div
                                            class="h-full rounded-full bg-primary transition-[width] duration-300"
                                            :style="{ width: `${(loc.count / maxLocationCount) * 100}%` }"
                                        />
                                    </div>
                                </div>
                            </template>
                        </div>
                    </template>
                </UPageCard>

                <!-- ── Recent reports ───────────────────────────────────── -->
                <UPageCard variant="subtle" class="md:col-span-2 lg:col-span-2" :ui="{ body: 'w-full', header: 'w-full', container: 'w-full' }">
                    <template #header>
                        <div class="flex w-full items-start justify-between gap-2">
                            <div class="flex items-center gap-2">
                                <UIcon name="i-lucide-clock" class="size-6 shrink-0 text-dimmed" />
                                <span class="font-semibold text-highlighted">Reports</span>
                            </div>
                            <span class="text-xs text-muted">Latest 5</span>
                        </div>
                    </template>
                    <template #body>
                        <div v-if="recentData === undefined" class="flex flex-col gap-3">
                            <USkeleton v-for="i in 5" :key="i" class="h-8 w-full" />
                        </div>
                        <div v-else-if="!recent.length" class="flex flex-col items-center gap-2 py-6 text-center">
                            <UIcon name="i-lucide-inbox" class="size-6 text-dimmed" />
                            <p class="text-sm text-muted">No reports yet</p>
                        </div>
                        <div v-else class="flex flex-col gap-3">
                            <template v-for="(row, i) in recent" :key="row.id">
                                <USeparator v-if="i > 0" />
                                <div
                                    class="flex cursor-pointer items-center gap-3 rounded-md px-1 py-0.5 hover:bg-elevated/50"
                                    role="button"
                                    tabindex="0"
                                    @click="openReport(row.id)"
                                    @keydown.enter="openReport(row.id)"
                                >
                                    <UBadge :color="statusColor(row.status)" variant="subtle" size="sm" class="shrink-0">
                                        {{ row.status }}
                                    </UBadge>
                                    <div class="flex flex-1 min-w-0 flex-col">
                                        <span class="truncate font-medium text-highlighted">{{ row.title }}</span>
                                        <span class="flex items-center gap-0.5 truncate text-sm text-muted">
                                            <span class="truncate">{{ row.location }}</span>
                                            <UIcon name="i-lucide-dot" class="size-3 shrink-0" />
                                            <span class="shrink-0">{{ getRelativeTime(row.created_at) }}</span>
                                        </span>
                                    </div>
                                    <UIcon name="i-lucide-chevron-right" class="ms-auto shrink-0 size-4 text-dimmed" />
                                </div>
                            </template>
                        </div>
                    </template>
                </UPageCard>

                <!-- ── Admin (admin-only) ───────────────────────────────── -->
                <UPageCard v-if="isAdmin" variant="subtle" class="md:col-span-2 lg:col-span-1" :ui="{ body: 'w-full', header: 'w-full' }">
                    <template #header>
                        <div class="flex w-full items-center gap-2">
                            <UIcon name="i-lucide-users" class="size-6 shrink-0 text-dimmed" />
                            <span class="font-semibold text-highlighted">Users</span>
                        </div>
                    </template>
                    <template #body>
                        <div v-if="tabCounts === undefined" class="flex flex-col gap-3">
                            <USkeleton v-for="i in 3" :key="i" class="h-8 w-full" />
                        </div>
                        <template v-else>
                            <div class="grid grid-cols-3 gap-2">
                                <div>
                                    <div class="text-2xl font-bold tabular-nums text-highlighted">{{ counts.all }}</div>
                                    <div class="text-sm text-muted">Total</div>
                                </div>
                                <div>
                                    <div class="text-2xl font-bold tabular-nums text-highlighted">{{ counts.active }}</div>
                                    <div class="text-sm text-muted">Active</div>
                                </div>
                                <div>
                                    <div class="text-2xl font-bold tabular-nums text-highlighted">{{ counts.pending }}</div>
                                    <div class="text-sm text-muted">Pending</div>
                                </div>
                            </div>

                            <USeparator class="my-4" />

                            <div v-if="counts.pending > 0" class="flex flex-col gap-3">
                                <div class="flex items-center gap-2">
                                    <span class="text-sm font-medium text-highlighted">Pending approvals</span>
                                    <UBadge color="warning" variant="subtle" size="sm">{{ counts.pending }}</UBadge>
                                </div>
                                <div class="flex flex-col gap-2">
                                    <div v-for="user in pendingUsers" :key="user.id" class="flex items-center gap-2">
                                        <UAvatar :alt="user.name ?? ''" size="xs" />
                                        <span class="truncate text-sm text-muted">{{ user.name }}</span>
                                    </div>
                                </div>
                                <UButton
                                    color="primary"
                                    variant="soft"
                                    size="sm"
                                    label="View pending approvals"
                                    :icon="'i-lucide-arrow-right'"
                                    class="self-start"
                                    @click="goToPendingApprovals"
                                />
                            </div>
                            <p v-else class="text-sm text-muted">No pending approvals</p>
                        </template>
                    </template>
                </UPageCard>
            </div>
        </template>
    </UDashboardPanel>

    <Details />
</template>
