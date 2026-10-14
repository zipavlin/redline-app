<script setup lang="ts">
/**
 * Report triage-deadline control, in two modes mirroring MemberPopover:
 *
 * - Committed (`reportId` given): a state-colored clock chip opening a popover
 *   whose staged pick is written through the due mutation.
 * - Draft (no `reportId`): the same popover for a not-yet-saved report. Confirming
 *   only emits `update:dueAt`; nothing is persisted.
 *
 * The popover STAGES a pick (a local CalendarDate + Time pair) rather than
 * committing on every click: presets, the date select, the calendar and the time
 * input all mutate ONLY the stage; "Set due date" commits it once, and "Clear"
 * removes the deadline immediately. The select accumulates the presets plus one
 * entry per calendar-picked date for the current session (reset on every open).
 *
 * Draft hosts gate guest rendering themselves; committed editing is gated by the
 * `canEdit` prop - the chip stays openable read-only when it is false (the body
 * shows the deadline without edit controls, and no mutation can fire).
 *
 * Every pick is computed in the VIEWER'S LOCAL zone and converted to a UTC
 * RFC3339 string with `toISOString()` for the wire (single stored source of truth).
 */
import { computed, ref, shallowRef, watch } from 'vue'
import { CalendarDate, Time, getLocalTimeZone, today, type DateValue } from '@internationalized/date'
import type { TimeValue } from 'reka-ui'
import { getFormattedDatetime } from '@/core/datetime'
import { dueColor, dueIcon, dueShortLabel, dueState, isDueAtUsable } from '@/domain/due'
import { dueMutationError, useReportDueMutation } from '@/resources/report/mutations'
import { useToast } from '@nuxt/ui/composables/useToast'

type PopoverPosition = { side: 'top' | 'bottom'; align: 'start' | 'end' }

interface DateOption {
    label: string
    value: string
}

interface Preset {
    label: string
    value: string
    resolve: () => Date
}

const props = withDefaults(defineProps<{
    reportId?: string
    /** Feeds `dueState` so a closed report renders its deadline as parked. */
    status?: string
    canEdit?: boolean
    placement?: 'bottom-end' | 'top-start'
    size?: 'xs' | 'sm'
}>(), {
    status: 'new',
    canEdit: false,
    placement: 'bottom-end',
    size: 'xs',
})

const dueAt = defineModel<string | null>('dueAt', { default: null })
const open = defineModel<boolean>('open', { default: false })

const toast = useToast()
const dueMutation = useReportDueMutation()

const isCommitted = computed(() => !!props.reportId)
// Draft selection is always editable; the committed mode is gated by its prop.
const editable = computed(() => (isCommitted.value ? props.canEdit : true))
const pending = computed(() => isCommitted.value && dueMutation.isPending.value)

const state = computed(() => dueState(dueAt.value, props.status, Date.now()))
const triggerLabel = computed<string | undefined>(() => {
    if (!isDueAtUsable(dueAt.value)) return undefined
    return dueShortLabel(dueAt.value) || undefined
})
const triggerVariant = computed<string>(() => {
    if (!isDueAtUsable(dueAt.value)) return 'ghost'
    return 'subtle'
})
const tooltipText = computed(() => {
    if (!isDueAtUsable(dueAt.value)) return 'Set due date'
    const suffix = state.value === 'overdue' ? ' · overdue' : ''
    return `${getFormattedDatetime(dueAt.value)}${suffix}`
})
const contentPosition = computed<PopoverPosition>(() =>
    props.placement === 'top-start'
        ? { side: 'top', align: 'start' }
        : { side: 'bottom', align: 'end' },
)

/**
 * The seeded stored deadline: a committed report whose `due_at` is usable, else
 * null. The single derivation of "seeded" - it drives both the stage seeding in
 * `resetStage` and the calendar's lower bound below, so the two cannot drift.
 * Drafts never seed (they start empty).
 */
const storedDeadline = computed<string | null>(() =>
    isCommitted.value && isDueAtUsable(dueAt.value) ? dueAt.value : null,
)

/**
 * Calendar lower bound: a NEW deadline cannot be created in the past, so the
 * calendar is floored at today - but only when nothing is seeded. A seeded stored
 * deadline may be overdue and must stay reachable, so the bound is dropped.
 */
const calendarMinValue = computed<DateValue | undefined>(() =>
    storedDeadline.value ? undefined : today(getLocalTimeZone()),
)

/** The staged pick - a local date + time pair, committed only by "Set due date". */
const stageDate = ref<DateValue>()
const stageTime = ref<TimeValue>()
/**
 * The calendar's displayed month. Driven explicitly rather than inferred, because
 * Reka only seeds the shown month from the model value once on init: a later
 * programmatic stage (a preset across a month boundary) would leave the grid on
 * the stale month. Undefined for a fresh empty stage so the calendar defaults.
 */
const stagePlaceholder = ref<DateValue>()
/** The date select's selected option key; empty until something is staged. */
const selectedOption = ref<string | undefined>(undefined)
/** Calendar-picked dates for this session, newest-first (deduped by date). */
const pickedDates = shallowRef<CalendarDate[]>([])
/** True while the inner date select's own menu is open (nested-overlay guard). */
const dateSelectOpen = ref(false)

/** The stage combined into a local Date and serialized to UTC for the wire. */
const stagedInstant = computed<string | null>(() => {
    const date = stageDate.value
    const time = stageTime.value
    if (!date || !time) return null
    const local = new Date(date.year, date.month - 1, date.day, time.hour, time.minute, 0, 0)
    return Number.isNaN(local.getTime()) ? null : local.toISOString()
})

/** A confirm only makes sense when the stage resolves to a DIFFERENT instant. */
const hasNewStage = computed<boolean>(() => {
    const staged = stagedInstant.value
    if (!staged) return false
    if (!isDueAtUsable(dueAt.value)) return true
    return Date.parse(staged) !== Date.parse(dueAt.value)
})

const canConfirm = computed(() => editable.value && !pending.value && hasNewStage.value)
const canClear = computed(() => editable.value && !pending.value && !!dueAt.value)

const MONTH_LABELS = ['jan.', 'feb.', 'mar.', 'apr.', 'may', 'jun.', 'jul.', 'aug.', 'sep.', 'oct.', 'nov.', 'dec.']

/** Local-zone presets, each resolved to its wall-clock Date at click time. */
const PRESETS: Preset[] = [
    { label: 'End of today', value: 'preset:today', resolve: endOfToday },
    { label: 'End of tomorrow', value: 'preset:tomorrow', resolve: endOfTomorrow },
    { label: 'In a week', value: 'preset:week', resolve: inWeek },
]

/** Presets first, then this session's picks, newest-first. */
const dateOptions = computed<DateOption[]>(() => [
    ...PRESETS.map(({ label, value }) => ({ label, value })),
    ...pickedDates.value.map((date) => ({ label: formatPickLabel(date), value: dateKey(date) })),
])

watch(open, (isOpen) => {
    if (isOpen) resetStage()
})

function endOfToday(): Date {
    const date = new Date()
    date.setHours(16, 0, 0, 0)
    return date
}

function endOfTomorrow(): Date {
    const date = new Date()
    date.setDate(date.getDate() + 1)
    date.setHours(16, 0, 0, 0)
    return date
}

/** Same local clock, seven days out. */
function inWeek(): Date {
    const date = new Date()
    date.setDate(date.getDate() + 7)
    return date
}

function dateKey(date: DateValue): string {
    const month = String(date.month).padStart(2, '0')
    const day = String(date.day).padStart(2, '0')
    return `${date.year}-${month}-${day}`
}

/** Short lowercase month + day, with the year only when it is not the current one. */
function formatPickLabel(date: DateValue): string {
    const label = `${MONTH_LABELS[date.month - 1]} ${date.day}`
    return date.year === new Date().getFullYear() ? label : `${label}, ${date.year}`
}

function toCalendarDate(date: DateValue): CalendarDate {
    return date instanceof CalendarDate ? date : new CalendarDate(date.year, date.month, date.day)
}

/** Structural guard for the calendar's date value (its emit union also allows ranges/arrays). */
function isCalendarDateValue(value: unknown): value is DateValue {
    return !!value && typeof value === 'object' && 'year' in value && 'month' in value && 'day' in value
}

/** Reset the session on every open: fresh pick list, stage seeded from the value. */
function resetStage(): void {
    dateSelectOpen.value = false
    pickedDates.value = []
    selectedOption.value = undefined
    const stored = storedDeadline.value
    // Draft starts empty even when a value exists; only a committed report seeds
    // its stored deadline into the picker.
    if (stored) {
        const base = new Date(stored)
        const date = new CalendarDate(base.getFullYear(), base.getMonth() + 1, base.getDate())
        stageDate.value = date
        stagePlaceholder.value = date
        stageTime.value = new Time(base.getHours(), base.getMinutes())
        pickedDates.value = [date]
        selectedOption.value = dateKey(date)
    } else {
        stageDate.value = undefined
        stagePlaceholder.value = undefined
        stageTime.value = undefined
    }
}

/** Preset pick: stage its full datetime and navigate the calendar to its date. */
function applyPreset(value: string): void {
    const preset = PRESETS.find((entry) => entry.value === value)
    if (!preset) return
    const local = preset.resolve()
    const date = new CalendarDate(local.getFullYear(), local.getMonth() + 1, local.getDate())
    stageDate.value = date
    stagePlaceholder.value = date
    stageTime.value = new Time(local.getHours(), local.getMinutes())
    selectedOption.value = value
}

/** Stage a picked date, falling back to 16:00 local when no time is staged yet. */
function stagePickedDate(date: CalendarDate): void {
    stageDate.value = date
    stagePlaceholder.value = date
    if (!stageTime.value) stageTime.value = new Time(16, 0)
}

/** Pick entry: stage its date, keeping the staged time (16:00 fallback). */
function applyPickedDate(value: string): void {
    const picked = pickedDates.value.find((date) => dateKey(date) === value)
    if (!picked) return
    stagePickedDate(picked)
    selectedOption.value = value
}

/** Route a select change without committing anything. */
function selectOption(value: string | undefined): void {
    if (!value) {
        selectedOption.value = undefined
    } else if (value.startsWith('preset:')) {
        applyPreset(value)
    } else {
        applyPickedDate(value)
    }
}

/** Calendar day-click: stage the date and add/select its pick entry. */
function pickDate(value: unknown): void {
    if (!isCalendarDateValue(value)) return
    const date = toCalendarDate(value)
    stagePickedDate(date)
    pickedDates.value = [date, ...pickedDates.value.filter((entry) => dateKey(entry) !== dateKey(date))]
    selectedOption.value = dateKey(date)
}

/** A time edit changes only the time of the staged date. */
function pickTime(value: unknown): void {
    if (isTimeValue(value)) stageTime.value = value
}

/** Structural guard for the time input's value (its emit union also allows time ranges). */
function isTimeValue(value: unknown): value is TimeValue {
    return !!value && typeof value === 'object' && 'hour' in value && 'minute' in value
}

function confirm(): void {
    if (!canConfirm.value) return
    void commit(stagedInstant.value)
}

function clear(): void {
    if (!canClear.value) return
    void commit(null)
}

function commit(value: string | null): void {
    if (!editable.value || pending.value) return
    if (!isCommitted.value) {
        dueAt.value = value
        open.value = false
        return
    }
    void commitServer(value)
}

async function commitServer(value: string | null): Promise<void> {
    try {
        await dueMutation.mutateAsync({ id: props.reportId!, due_at: value })
        open.value = false
    } catch (error) {
        toast.add({ title: dueMutationError(error), color: 'error' })
    }
}
</script>

<template>
    <UPopover
        v-model:open="open"
        :content="contentPosition"
        :dismissible="!dateSelectOpen"
        arrow
    >
        <UTooltip :text="tooltipText" arrow>
            <UButton
                :color="dueColor(state)"
                :variant="triggerVariant"
                :size="size"
                square
                :icon="dueIcon(state)"
                :label="triggerLabel"
                :aria-label="tooltipText"
            />
        </UTooltip>

        <template #content>
            <div class="flex flex-col gap-2 p-3 w-64">
                <template v-if="editable">
                    <UCalendar
                        :model-value="stageDate"
                        :placeholder="stagePlaceholder"
                        :year-controls="false"
                        size="xs"
                        class="w-full"
                        :min-value="calendarMinValue"
                        @update:model-value="pickDate"
                    />

                    <USeparator />

                    <div class="flex items-center gap-2">
                        <USelect
                            v-model:open="dateSelectOpen"
                            :model-value="selectedOption"
                            :items="dateOptions"
                            placeholder="Pick a date"
                            size="xs"
                            class="flex-1"
                            @update:model-value="selectOption"
                        />
                        <UInputTime
                            :model-value="stageTime"
                            :hour-cycle="12"
                            size="xs"
                            @update:model-value="pickTime"
                        />
                    </div>

                    <USeparator />

                    <div class="flex items-center justify-between gap-2">
                        <UButton
                            label="Clear"
                            color="neutral"
                            variant="ghost"
                            size="xs"
                            :disabled="!canClear"
                            @click="clear"
                        />
                        <UButton
                            label="Set due date"
                            color="primary"
                            variant="solid"
                            size="xs"
                            :disabled="!canConfirm"
                            @click="confirm"
                        />
                    </div>
                </template>

                <div v-else class="flex flex-col gap-1">
                    <span class="text-sm font-medium">{{ isDueAtUsable(dueAt) ? getFormattedDatetime(dueAt) : 'No due date' }}</span>
                    <span class="text-xs text-muted">Only the author or a developer can change the due date.</span>
                </div>
            </div>
        </template>
    </UPopover>
</template>
