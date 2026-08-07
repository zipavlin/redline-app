<script setup lang="ts">
/**
 * Removable chips for the active advanced report filters (everything beyond the
 * status tabs + search). Each chip's ✕ clears just that field on the shared
 * filter store; a trailing "Clear all" resets them together.
 */
import { computed } from 'vue'
import { useStore } from '@/composables/useStore'
import type { DashboardStore } from '@/store/dashboard'

const props = defineProps<{
    authors: { id: string; name: string }[]
}>()

const store = useStore<DashboardStore>()

interface Tag { key: string; label: string; clear: () => void }

// Computed
const authorName = computed(() => props.authors.find(a => a.id === store.report.filter.userId)?.name ?? 'Unknown')

const dateLabel = computed(() => {
    const from = store.report.filter.dateFrom
    const to = store.report.filter.dateTo
    if (from && to) return `${fmtDate(from)} – ${fmtDate(to)}`
    if (from) return `From ${fmtDate(from)}`
    if (to) return `Until ${fmtDate(to)}`
    return ''
})

const tags = computed<Tag[]>(() => {
    const t: Tag[] = []
    if (store.report.filter.mine) {
        t.push({
            key: 'mine',
            label: 'Only mine',
            clear: () => {
                store.report.filter.mine = false
            },
        })
    }
    if (store.report.filter.hasMedia) {
        t.push({
            key: 'media',
            label: 'Has media',
            clear: () => {
                store.report.filter.hasMedia = false
            },
        })
    }
    if (store.report.filter.hasComments) {
        t.push({
            key: 'comments',
            label: 'Has comments',
            clear: () => {
                store.report.filter.hasComments = false
            },
        })
    }
    if (store.report.filter.userId) {
        t.push({
            key: 'author',
            label: `By ${authorName.value}`,
            clear: () => {
                store.report.filter.userId = null
            },
        })
    }
    if (store.report.filter.location) {
        t.push({
            key: 'location',
            label: `Page: ${store.report.filter.location}`,
            clear: () => {
                store.report.filter.location = null
            },
        })
    }
    if (store.report.filter.dateFrom || store.report.filter.dateTo) {
        t.push({
            key: 'date',
            label: dateLabel.value,
            clear: () => {
                store.report.filter.dateFrom = null
                store.report.filter.dateTo = null
            },
        })
    }
    return t
})

// Functions
function fmtDate(iso: string | null): string {
    if (!iso) return ''
    const d = new Date(iso + 'T00:00:00')
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function clearAll() {
    store.report.filter.mine = false
    store.report.filter.hasMedia = false
    store.report.filter.hasComments = false
    store.report.filter.userId = null
    store.report.filter.location = null
    store.report.filter.dateFrom = null
    store.report.filter.dateTo = null
}
</script>

<template>
    <div v-if="tags.length" class="flex flex-wrap items-center gap-1.5">
        <UBadge
            v-for="tag in tags"
            :key="tag.key"
            color="neutral"
            variant="subtle"
            class="gap-1"
        >
            {{ tag.label }}
            <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="link"
                size="xs"
                :padded="false"
                class="p-0"
                aria-label="Remove filter"
                @click="tag.clear"
            />
        </UBadge>

        <UButton variant="link" color="neutral" size="xs" label="Clear all" @click="clearAll" />
    </div>
</template>
