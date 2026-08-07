<script setup lang="ts">
/**
 * A date-range picker: a trigger button showing the selected range that opens a
 * popover with a two-month UCalendar in range mode. Talks to the parent in plain
 * ISO `YYYY-MM-DD` strings (matching the dashboard filter store / API params),
 * converting to/from `@internationalized/date` internally.
 */
import { computed } from 'vue'
import { CalendarDate, DateFormatter, getLocalTimeZone, parseDate, type DateValue } from '@internationalized/date'

const props = defineProps<{
    from: string | null
    to: string | null
}>()

const emit = defineEmits<{
    'update:from': [value: string | null]
    'update:to': [value: string | null]
}>()

interface DateRange { start: DateValue | undefined; end: DateValue | undefined }

const df = new DateFormatter('en-GB', { dateStyle: 'medium' })

function toCalendarDate(iso: string | null): CalendarDate | null {
    if (!iso) return null
    try { return parseDate(iso) } catch { return null }
}
function format(cd: CalendarDate | null): string {
    return cd ? df.format(cd.toDate(getLocalTimeZone())) : ''
}

const range = computed<DateRange>({
    get: () => ({ start: toCalendarDate(props.from) ?? undefined, end: toCalendarDate(props.to) ?? undefined }),
    set: (value) => {
        emit('update:from', value?.start ? value.start.toString() : null)
        emit('update:to', value?.end ? value.end.toString() : null)
    },
})

const label = computed(() => {
    const start = toCalendarDate(props.from)
    const end = toCalendarDate(props.to)
    if (start && end) return `${format(start)} – ${format(end)}`
    if (start) return `From ${format(start)}`
    if (end) return `Until ${format(end)}`
    return 'Any date'
})

const hasValue = computed(() => !!(props.from || props.to))

function clear() {
    emit('update:from', null)
    emit('update:to', null)
}
</script>

<template>
    <UPopover :content="{ side: 'bottom', align: 'start' }">
        <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-calendar"
            :label="label"
            class="w-full justify-start"
            :ui="{ label: 'truncate' }"
        >
            <template v-if="hasValue" #trailing>
                <UIcon
                    name="i-lucide-x"
                    class="ms-auto size-4 text-dimmed hover:text-default"
                    @click.stop="clear"
                />
            </template>
        </UButton>

        <template #content>
            <UCalendar v-model="range" range :number-of-months="2" class="p-2" />
        </template>
    </UPopover>
</template>
