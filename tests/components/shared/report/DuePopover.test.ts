import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { CalendarDate, Time } from '@internationalized/date'
import { getFormattedDatetime } from '@/core/datetime'

const { toastAdd, mockStore } = vi.hoisted(() => ({
    toastAdd: vi.fn(),
    mockStore: { auth: { user: null, callback: null, authView: 'login' }, report: { active: null, list: [] } },
}))

vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: toastAdd }) }))
vi.mock('@nuxt/ui/runtime/composables/useToast', () => ({ useToast: () => ({ add: toastAdd }) }))
vi.mock('@/composables/useStore', () => ({ useStore: () => mockStore }))
/** Keep the real formatter but spy on it so a malformed deadline can be shown NOT to reach Intl. */
vi.mock('@/core/datetime', async (importOriginal) => {
    const actual = await importOriginal() as typeof import('@/core/datetime')
    return { ...actual, getFormattedDatetime: vi.fn(actual.getFormattedDatetime) }
})

/**
 * The auto-imported Nuxt UI components resolve to their real SFCs (unplugin), so
 * name-stubs do not apply - they are module-mocked at their package subpaths.
 */
vi.mock('@nuxt/ui/components/Popover.vue', () => ({
    default: {
        name: 'UPopover',
        props: {
            open: { type: Boolean, default: false },
            content: { type: Object, default: undefined },
            arrow: { type: Boolean, default: false },
            dismissible: { type: Boolean, default: true },
        },
        emits: ['update:open'],
        template: '<div class="u-popover" :data-open="String(open)"><slot /><div v-if="open" class="u-popover-content"><slot name="content" /></div></div>',
    },
}))
vi.mock('@nuxt/ui/components/Tooltip.vue', () => ({
    default: { name: 'UTooltip', props: ['text', 'arrow'], template: '<span class="u-tooltip"><slot /></span>' },
}))
vi.mock('@nuxt/ui/components/Button.vue', () => ({
    default: {
        name: 'UButton',
        props: ['icon', 'label', 'size', 'variant', 'color', 'square', 'block', 'disabled', 'ariaLabel', 'ui'],
        emits: ['click'],
        template: '<button class="u-button" :data-icon="icon" :data-color="color" :disabled="disabled" :aria-label="ariaLabel" @click="$emit(\'click\', $event)"><slot />{{ label }}</button>',
    },
}))
vi.mock('@nuxt/ui/components/Separator.vue', () => ({
    default: { name: 'USeparator', template: '<hr class="u-separator" />' },
}))
vi.mock('@nuxt/ui/components/Calendar.vue', () => ({
    default: {
        name: 'UCalendar',
        props: ['modelValue', 'placeholder', 'size', 'minValue', 'yearControls'],
        emits: ['update:modelValue'],
        template: '<div class="u-calendar" />',
    },
}))
vi.mock('@nuxt/ui/components/InputTime.vue', () => ({
    default: {
        name: 'UInputTime',
        props: ['modelValue', 'size', 'hourCycle'],
        emits: ['update:modelValue'],
        template: '<div class="u-input-time" />',
    },
}))
vi.mock('@nuxt/ui/components/Select.vue', () => ({
    default: {
        name: 'USelect',
        props: ['modelValue', 'items', 'placeholder', 'size', 'open', 'content'],
        emits: ['update:modelValue', 'update:open'],
        template: '<div class="u-select" :data-value="modelValue" />',
    },
}))

import DuePopover from '@/components/shared/report/DuePopover.vue'

/**
 * Pin the suite to a zone whose offset differs from UTC unambiguously. The test
 * host runs in Europe/Ljubljana (UTC+2 on the frozen 2026-06-15 date), which would
 * let a local/UTC mistake partly cancel out against the machine default; America/
 * New_York is UTC-4 there, so local 16:00 (= 20:00Z) can never be mistaken for the
 * 16:00Z instant a setUTCHours implementation would emit. Node applies a runtime
 * TZ assignment to V8 immediately, and Vitest isolates each test file in its own
 * process, so the change is scoped to this file (restored in afterAll regardless).
 */
const ORIGINAL_TZ = process.env.TZ
process.env.TZ = 'America/New_York'
afterAll(() => {
    if (ORIGINAL_TZ === undefined) delete process.env.TZ
    else process.env.TZ = ORIGINAL_TZ
})

const NOW = new Date(2026, 5, 15, 12, 0, 0, 0)

const HOUR = 3_600_000
const DAY = 86_400_000

interface DateOption {
    label: string
    value: string
}

function isoFromNow(offsetMs: number): string {
    return new Date(NOW.getTime() + offsetMs).toISOString()
}

interface DueProps {
    reportId?: string
    dueAt?: string | null
    status?: string
    canEdit?: boolean
    placement?: 'bottom-end' | 'top-start'
    size?: 'xs' | 'sm'
}

interface Mounted {
    wrapper: VueWrapper
    api: { report: { due: ReturnType<typeof vi.fn> } }
}

function mountDue(props: DueProps = {}): Mounted {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const api = { report: { due: vi.fn() } }
    const wrapper = mount(DuePopover, {
        props,
        global: {
            plugins: [[VueQueryPlugin, { queryClient }]],
            provide: { redline: { api, config: {} } },
        },
    })
    return { wrapper, api }
}

async function settle(): Promise<void> {
    await vi.advanceTimersByTimeAsync(0)
    await nextTick()
}

async function openPopover(wrapper: VueWrapper): Promise<void> {
    wrapper.findComponent({ name: 'UPopover' }).vm.$emit('update:open', true)
    await nextTick()
}

function triggerButton(wrapper: VueWrapper) {
    return wrapper.findComponent({ name: 'UButton' })
}

function buttonByText(wrapper: VueWrapper, text: string) {
    return wrapper.findAll('button').find(button => button.text() === text)
}

function selectComponent(wrapper: VueWrapper) {
    return wrapper.findComponent({ name: 'USelect' })
}

function calendarComponent(wrapper: VueWrapper) {
    return wrapper.findComponent({ name: 'UCalendar' })
}

function inputTimeComponent(wrapper: VueWrapper) {
    return wrapper.findComponent({ name: 'UInputTime' })
}

/** Select a date option (preset key or pick entry key) via the date select. */
function pickFromSelect(wrapper: VueWrapper, value: string): void {
    selectComponent(wrapper).vm.$emit('update:modelValue', value)
}

function pickCalendarDate(wrapper: VueWrapper, date: CalendarDate): void {
    calendarComponent(wrapper).vm.$emit('update:modelValue', date)
}

function editTime(wrapper: VueWrapper, time: Time): void {
    inputTimeComponent(wrapper).vm.$emit('update:modelValue', time)
}

async function confirm(wrapper: VueWrapper): Promise<void> {
    await buttonByText(wrapper, 'Set due date')!.trigger('click')
}

function isDisabled(button: { attributes: (name: string) => string | undefined }): boolean {
    return button.attributes('disabled') !== undefined
}

function selectItems(wrapper: VueWrapper): DateOption[] {
    return selectComponent(wrapper).props('items') as DateOption[]
}

function pickLabels(wrapper: VueWrapper): string[] {
    return selectItems(wrapper).map(option => option.label)
}

function stagedDate(wrapper: VueWrapper): string {
    return String(calendarComponent(wrapper).props('modelValue'))
}

function calendarPlaceholder(wrapper: VueWrapper): string {
    return String(calendarComponent(wrapper).props('placeholder'))
}

function stagedTime(wrapper: VueWrapper): string {
    return String(inputTimeComponent(wrapper).props('modelValue'))
}

let wrapper: VueWrapper | undefined

beforeEach(() => {
    toastAdd.mockClear()
    vi.mocked(getFormattedDatetime).mockClear()
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    vi.useRealTimers()
})

describe('DuePopover trigger state', () => {
    it('renders an icon-only ghost clock trigger with no deadline', () => {
        wrapper = mountDue().wrapper
        const trigger = triggerButton(wrapper)

        expect(trigger.props('icon')).toBe('i-lucide-clock-fading')
        expect(trigger.props('color')).toBe('neutral')
        expect(trigger.props('variant')).toBe('ghost')
        expect(trigger.props('label')).toBeUndefined()
        expect(trigger.attributes('aria-label')).toBe('Set due date')
    })

    it('renders an icon-only ghost clock for a malformed deadline without formatting it', () => {
        wrapper = mountDue({ dueAt: 'not-a-date' }).wrapper
        const trigger = triggerButton(wrapper)

        expect(trigger.props('icon')).toBe('i-lucide-clock-fading')
        expect(trigger.props('color')).toBe('neutral')
        expect(trigger.props('variant')).toBe('ghost')
        expect(trigger.props('label')).toBeUndefined()
        expect(trigger.attributes('aria-label')).toBe('Set due date')
        expect(wrapper.findComponent({ name: 'UTooltip' }).props('text')).toBe('Set due date')
        expect(getFormattedDatetime).not.toHaveBeenCalled()
    })

    it('renders a neutral clock with a compact magnitude beyond the soon window', () => {
        wrapper = mountDue({ dueAt: isoFromNow(3 * DAY) }).wrapper
        const trigger = triggerButton(wrapper)

        expect(trigger.props('icon')).toBe('i-lucide-clock')
        expect(trigger.props('color')).toBe('neutral')
        expect(trigger.props('variant')).toBe('subtle')
        expect(trigger.props('label')).toBe('3d')
    })

    it('renders a warning clock when the deadline is within 24h', () => {
        wrapper = mountDue({ dueAt: isoFromNow(2 * HOUR) }).wrapper
        const trigger = triggerButton(wrapper)

        expect(trigger.props('icon')).toBe('i-lucide-clock-alert')
        expect(trigger.props('color')).toBe('warning')
        expect(trigger.props('label')).toBe('2h')
    })

    it('renders an error clock when the deadline is past', () => {
        wrapper = mountDue({ dueAt: isoFromNow(-2 * HOUR) }).wrapper
        const trigger = triggerButton(wrapper)

        expect(trigger.props('icon')).toBe('i-lucide-clock-alert')
        expect(trigger.props('color')).toBe('error')
        expect(trigger.props('label')).toBe('2h')
    })

    it('parks a stale deadline on a closed report as a neutral clock', () => {
        wrapper = mountDue({ dueAt: isoFromNow(-2 * HOUR), status: 'resolved' }).wrapper
        const trigger = triggerButton(wrapper)

        expect(trigger.props('icon')).toBe('i-lucide-clock')
        expect(trigger.props('color')).toBe('neutral')
        expect(trigger.props('label')).toBe('2h')
    })

    it('spells out the full datetime with an overdue suffix in the tooltip', () => {
        wrapper = mountDue({ dueAt: isoFromNow(-2 * HOUR) }).wrapper

        const tooltipText = wrapper.findComponent({ name: 'UTooltip' }).props('text')
        expect(tooltipText).toContain('overdue')
        expect(tooltipText).toContain(getFormattedDatetime(isoFromNow(-2 * HOUR)))

        const trigger = triggerButton(wrapper)
        expect(trigger.attributes('aria-label')).toContain('overdue')
        expect(trigger.attributes('aria-label')).toBe(tooltipText)
    })

    it('stays openable read-only when committed editing is not allowed', async () => {
        const dueAt = isoFromNow(2 * HOUR)
        const mounted = mountDue({ reportId: 'r1', canEdit: false, dueAt })
        wrapper = mounted.wrapper

        expect(triggerButton(wrapper).props('disabled')).toBeFalsy()

        await openPopover(wrapper)

        expect(buttonByText(wrapper, 'End of today')).toBeUndefined()
        expect(buttonByText(wrapper, 'Set due date')).toBeUndefined()
        expect(buttonByText(wrapper, 'Clear')).toBeUndefined()
        expect(selectComponent(wrapper).exists()).toBe(false)
        expect(wrapper.text()).toContain(getFormattedDatetime(dueAt))
        expect(wrapper.text()).toContain('Only the author or a developer')
        expect(mounted.api.report.due).not.toHaveBeenCalled()
    })
})

describe('DuePopover placement and size', () => {
    it('defaults to a bottom-end popover at extra-small size', () => {
        wrapper = mountDue().wrapper

        expect(wrapper.findComponent({ name: 'UPopover' }).props('content')).toEqual({ side: 'bottom', align: 'end' })
        expect(triggerButton(wrapper).props('size')).toBe('xs')
    })

    it('plumbs a custom placement and size through', () => {
        wrapper = mountDue({ placement: 'top-start', size: 'sm' }).wrapper

        expect(wrapper.findComponent({ name: 'UPopover' }).props('content')).toEqual({ side: 'top', align: 'start' })
        expect(triggerButton(wrapper).props('size')).toBe('sm')
    })
})

describe('DuePopover content layout', () => {
    it('renders the calendar, the 12-hour time input and the two footer actions', async () => {
        wrapper = mountDue().wrapper
        await openPopover(wrapper)

        expect(calendarComponent(wrapper).exists()).toBe(true)
        expect(inputTimeComponent(wrapper).props('hourCycle')).toBe(12)
        expect(buttonByText(wrapper, 'Clear')).toBeDefined()
        expect(buttonByText(wrapper, 'Set due date')).toBeDefined()
    })

    it('marks the popover non-dismissible while the inner date select is open', async () => {
        wrapper = mountDue().wrapper
        await openPopover(wrapper)

        const popover = wrapper.findComponent({ name: 'UPopover' })
        expect(popover.props('dismissible')).toBe(true)

        selectComponent(wrapper).vm.$emit('update:open', true)
        await nextTick()
        expect(popover.props('dismissible')).toBe(false)

        selectComponent(wrapper).vm.$emit('update:open', false)
        await nextTick()
        expect(popover.props('dismissible')).toBe(true)
    })
})

describe('DuePopover staging', () => {
    it('resolves "Set due date" to a prominent solid primary button', async () => {
        wrapper = mountDue().wrapper
        await openPopover(wrapper)

        const setButton = wrapper.findAllComponents({ name: 'UButton' })
            .find(button => button.props('label') === 'Set due date')!
        expect(setButton.props('color')).toBe('primary')
        expect(setButton.props('variant')).toBe('solid')

        const clearButton = wrapper.findAllComponents({ name: 'UButton' })
            .find(button => button.props('label') === 'Clear')!
        expect(clearButton.props('color')).toBe('neutral')
        expect(clearButton.props('variant')).toBe('ghost')
    })

    it('disables Set due date until the stage holds a new instant', async () => {
        wrapper = mountDue().wrapper
        await openPopover(wrapper)

        expect(isDisabled(buttonByText(wrapper, 'Set due date')!)).toBe(true)

        pickFromSelect(wrapper, 'preset:today')
        await nextTick()
        expect(isDisabled(buttonByText(wrapper, 'Set due date')!)).toBe(false)
    })

    it('disables Clear when there is nothing to clear', async () => {
        wrapper = mountDue().wrapper
        await openPopover(wrapper)

        expect(isDisabled(buttonByText(wrapper, 'Clear')!)).toBe(true)
    })

    it('stages a preset on the calendar and time input without committing', async () => {
        const mounted = mountDue({ reportId: 'r1', canEdit: true })
        wrapper = mounted.wrapper
        await openPopover(wrapper)

        pickFromSelect(wrapper, 'preset:today')
        await nextTick()

        expect(stagedDate(wrapper)).toBe('2026-06-15')
        expect(stagedTime(wrapper)).toBe('16:00:00')
        expect(selectComponent(wrapper).props('modelValue')).toBe('preset:today')
        expect(mounted.api.report.due).not.toHaveBeenCalled()
        expect(wrapper.findComponent({ name: 'UPopover' }).props('open')).toBe(true)
    })

    it('navigates the calendar to the "In a week" date and keeps the local clock', async () => {
        wrapper = mountDue().wrapper
        await openPopover(wrapper)

        pickFromSelect(wrapper, 'preset:week')
        await nextTick()

        expect(stagedDate(wrapper)).toBe('2026-06-22')
        expect(stagedTime(wrapper)).toBe('12:00:00')
    })

    it('drives the calendar month across a boundary when a preset stages next month', async () => {
        // Frozen on the last day of June: End of tomorrow lands in July, so the
        // calendar must be navigated to July, not left on the seeded June month.
        vi.setSystemTime(new Date(2026, 5, 30, 12, 0, 0, 0))
        wrapper = mountDue().wrapper
        await openPopover(wrapper)

        pickFromSelect(wrapper, 'preset:tomorrow')
        await nextTick()

        expect(stagedDate(wrapper)).toBe('2026-07-01')
        expect(calendarPlaceholder(wrapper)).toBe('2026-07-01')
    })

    it('drives the calendar month to a direct calendar pick in another month', async () => {
        wrapper = mountDue().wrapper
        await openPopover(wrapper)

        pickCalendarDate(wrapper, new CalendarDate(2026, 8, 5))
        await nextTick()

        expect(calendarPlaceholder(wrapper)).toBe('2026-08-05')
    })

    it('seeds a committed session with its stored local date, time and matching select entry', async () => {
        const dueAt = new Date(2026, 5, 15, 16, 0, 0, 0).toISOString()
        wrapper = mountDue({ reportId: 'r1', canEdit: true, dueAt }).wrapper
        await openPopover(wrapper)

        expect(stagedDate(wrapper)).toBe('2026-06-15')
        expect(stagedTime(wrapper)).toBe('16:00:00')
        expect(selectComponent(wrapper).props('modelValue')).toBe('2026-06-15')
        // Nothing new staged yet - confirm disabled, Clear enabled.
        expect(isDisabled(buttonByText(wrapper, 'Set due date')!)).toBe(true)
        expect(isDisabled(buttonByText(wrapper, 'Clear')!)).toBe(false)
    })

    it('starts a draft empty even when the model already carries a value', async () => {
        const mounted = mountDue({ dueAt: isoFromNow(2 * HOUR) })
        wrapper = mounted.wrapper
        await openPopover(wrapper)

        expect(calendarComponent(wrapper).props('modelValue')).toBeUndefined()
        expect(inputTimeComponent(wrapper).props('modelValue')).toBeUndefined()
        expect(selectComponent(wrapper).props('modelValue')).toBeUndefined()
        expect(isDisabled(buttonByText(wrapper, 'Set due date')!)).toBe(true)
        expect(isDisabled(buttonByText(wrapper, 'Clear')!)).toBe(false)
    })
})

describe('DuePopover accumulation', () => {
    it('lists the presets first, then this session\'s picks newest-first and deduped', async () => {
        wrapper = mountDue().wrapper
        await openPopover(wrapper)

        expect(pickLabels(wrapper)).toEqual(['End of today', 'End of tomorrow', 'In a week'])

        pickCalendarDate(wrapper, new CalendarDate(2026, 6, 30))
        await nextTick()
        expect(pickLabels(wrapper)).toEqual(['End of today', 'End of tomorrow', 'In a week', 'jun. 30'])

        pickCalendarDate(wrapper, new CalendarDate(2026, 7, 3))
        await nextTick()
        expect(pickLabels(wrapper)).toEqual(['End of today', 'End of tomorrow', 'In a week', 'jul. 3', 'jun. 30'])

        // Re-picking an earlier date moves it to the head without duplicating it.
        pickCalendarDate(wrapper, new CalendarDate(2026, 6, 30))
        await nextTick()
        expect(pickLabels(wrapper)).toEqual(['End of today', 'End of tomorrow', 'In a week', 'jun. 30', 'jul. 3'])
        expect(pickLabels(wrapper).filter(label => label === 'jun. 30')).toHaveLength(1)
    })

    it('appends the year to a pick label only when it is not the current year', async () => {
        wrapper = mountDue().wrapper
        await openPopover(wrapper)

        pickCalendarDate(wrapper, new CalendarDate(2027, 3, 2))
        await nextTick()

        expect(pickLabels(wrapper)).toContain('mar. 2, 2027')
    })

    it('resets the accumulated picks on every open', async () => {
        wrapper = mountDue().wrapper
        await openPopover(wrapper)

        pickCalendarDate(wrapper, new CalendarDate(2026, 6, 30))
        await nextTick()
        expect(pickLabels(wrapper)).toContain('jun. 30')

        wrapper.findComponent({ name: 'UPopover' }).vm.$emit('update:open', false)
        await nextTick()
        await openPopover(wrapper)

        expect(pickLabels(wrapper)).toEqual(['End of today', 'End of tomorrow', 'In a week'])
    })

    it('stages the picked date but keeps the staged time on a pick re-selection', async () => {
        wrapper = mountDue().wrapper
        await openPopover(wrapper)

        // First pick has no staged time -> 16:00 fallback.
        pickCalendarDate(wrapper, new CalendarDate(2026, 6, 30))
        await nextTick()
        expect(stagedTime(wrapper)).toBe('16:00:00')

        // Stage a different clock, then re-select the pick entry: the time is kept.
        pickFromSelect(wrapper, 'preset:week')
        await nextTick()
        expect(stagedTime(wrapper)).toBe('12:00:00')

        pickFromSelect(wrapper, '2026-06-30')
        await nextTick()
        expect(stagedDate(wrapper)).toBe('2026-06-30')
        expect(stagedTime(wrapper)).toBe('12:00:00')
    })
})

describe('DuePopover draft mode', () => {
    it('commits nothing while staging, then emits the instant once on confirm', async () => {
        const mounted = mountDue()
        wrapper = mounted.wrapper
        await openPopover(wrapper)

        pickFromSelect(wrapper, 'preset:today')
        await nextTick()
        expect(wrapper.emitted('update:dueAt')).toBeUndefined()
        expect(mounted.api.report.due).not.toHaveBeenCalled()

        await confirm(wrapper)
        await nextTick()

        const expected = new Date(2026, 5, 15, 16, 0, 0, 0).toISOString()
        expect(wrapper.emitted('update:dueAt')).toHaveLength(1)
        expect(wrapper.emitted('update:dueAt')?.at(-1)).toEqual([expected])
        expect(wrapper.findComponent({ name: 'UPopover' }).props('open')).toBe(false)
        expect(mounted.api.report.due).not.toHaveBeenCalled()
    })

    it('emits the local afternoon instant for the End of tomorrow preset confirm', async () => {
        wrapper = mountDue().wrapper
        await openPopover(wrapper)

        pickFromSelect(wrapper, 'preset:tomorrow')
        await nextTick()
        await confirm(wrapper)
        await nextTick()

        const expected = new Date(2026, 5, 16, 16, 0, 0, 0).toISOString()
        expect(wrapper.emitted('update:dueAt')?.at(-1)).toEqual([expected])
    })

    it('emits the same local instant one week out for the In a week preset confirm', async () => {
        wrapper = mountDue().wrapper
        await openPopover(wrapper)

        pickFromSelect(wrapper, 'preset:week')
        await nextTick()
        await confirm(wrapper)
        await nextTick()

        const expected = new Date(2026, 5, 22, 12, 0, 0, 0).toISOString()
        expect(wrapper.emitted('update:dueAt')?.at(-1)).toEqual([expected])
    })

    it('commits a calendar pick plus time edit on confirm', async () => {
        const mounted = mountDue()
        wrapper = mounted.wrapper
        await openPopover(wrapper)

        pickCalendarDate(wrapper, new CalendarDate(2026, 7, 3))
        editTime(wrapper, new Time(14, 30))
        await nextTick()

        await confirm(wrapper)
        await nextTick()

        const expected = new Date(2026, 6, 3, 14, 30, 0, 0).toISOString()
        expect(wrapper.emitted('update:dueAt')?.at(-1)).toEqual([expected])
        expect(mounted.api.report.due).not.toHaveBeenCalled()
    })

    it('clears a draft immediately and closes', async () => {
        const mounted = mountDue({ dueAt: isoFromNow(2 * HOUR) })
        wrapper = mounted.wrapper
        await openPopover(wrapper)

        await buttonByText(wrapper, 'Clear')!.trigger('click')
        await nextTick()

        expect(wrapper.emitted('update:dueAt')?.at(-1)).toEqual([null])
        expect(wrapper.findComponent({ name: 'UPopover' }).props('open')).toBe(false)
        expect(mounted.api.report.due).not.toHaveBeenCalled()
    })
})

describe('DuePopover committed mode', () => {
    it('patches the staged instant through the api once and closes', async () => {
        const mounted = mountDue({ reportId: 'r1', canEdit: true })
        wrapper = mounted.wrapper
        mounted.api.report.due.mockResolvedValue({
            ok: true,
            status: 200,
            data: { id: 'r1', status: 'new', created_at: '2026-01-01T00:00:00Z' },
        })
        await openPopover(wrapper)

        pickFromSelect(wrapper, 'preset:today')
        await nextTick()
        await confirm(wrapper)
        await settle()

        const expected = new Date(2026, 5, 15, 16, 0, 0, 0).toISOString()
        expect(mounted.api.report.due).toHaveBeenCalledTimes(1)
        expect(mounted.api.report.due).toHaveBeenCalledWith('r1', expected)
        expect(wrapper.findComponent({ name: 'UPopover' }).props('open')).toBe(false)
    })

    it('PATCHes a calendar pick combined with a time edit as the exact instant', async () => {
        const mounted = mountDue({ reportId: 'r1', canEdit: true })
        wrapper = mounted.wrapper
        mounted.api.report.due.mockResolvedValue({
            ok: true,
            status: 200,
            data: { id: 'r1', status: 'new', created_at: '2026-06-15T00:00:00Z', due_at: '2026-07-03T18:30:00Z' },
        })
        await openPopover(wrapper)

        pickCalendarDate(wrapper, new CalendarDate(2026, 7, 3))
        editTime(wrapper, new Time(14, 30))
        await nextTick()
        await confirm(wrapper)
        await settle()

        expect(mounted.api.report.due).toHaveBeenCalledWith('r1', new Date(2026, 6, 3, 14, 30, 0, 0).toISOString())
    })

    it('clears through the api with null immediately and closes', async () => {
        const mounted = mountDue({ reportId: 'r1', canEdit: true, dueAt: isoFromNow(2 * HOUR) })
        wrapper = mounted.wrapper
        mounted.api.report.due.mockResolvedValue({
            ok: true,
            status: 200,
            data: { id: 'r1', status: 'new', created_at: '2026-01-01T00:00:00Z', due_at: null },
        })
        await openPopover(wrapper)

        await buttonByText(wrapper, 'Clear')!.trigger('click')
        await settle()

        expect(mounted.api.report.due).toHaveBeenCalledWith('r1', null)
        expect(wrapper.findComponent({ name: 'UPopover' }).props('open')).toBe(false)
    })

    it('surfaces the server 422 message through the toast', async () => {
        const mounted = mountDue({ reportId: 'r1', canEdit: true })
        wrapper = mounted.wrapper
        mounted.api.report.due.mockResolvedValue({
            ok: false,
            status: 422,
            data: { message: 'The due at field must be a valid date.' },
        })
        await openPopover(wrapper)

        pickFromSelect(wrapper, 'preset:today')
        await nextTick()
        await confirm(wrapper)
        await settle()

        expect(toastAdd).toHaveBeenCalledWith({ title: 'The due at field must be a valid date.', color: 'error' })
    })

    it('keeps the popover open when the committed save fails', async () => {
        const mounted = mountDue({ reportId: 'r1', canEdit: true })
        wrapper = mounted.wrapper
        mounted.api.report.due.mockResolvedValue({ ok: false, status: 403, data: {} })
        await openPopover(wrapper)

        pickFromSelect(wrapper, 'preset:today')
        await nextTick()
        await confirm(wrapper)
        await settle()

        expect(toastAdd).toHaveBeenCalledWith({ title: 'You do not have permission to change the due date', color: 'error' })
        expect(wrapper.findComponent({ name: 'UPopover' }).props('open')).toBe(true)
    })
})

/**
 * The calendar's lower bound is derived from the same committed+usable test that
 * seeds the stage: a fresh stage is floored at today so a new deadline cannot be
 * created in the past, while a committed report that already holds a (possibly
 * overdue) deadline must render and navigate to that stored date, so the bound is
 * dropped. happy-dom does not run the calendar's own disabled-day rendering, so
 * the bound is asserted at the prop boundary rather than by attempting a
 * past-day click.
 */
describe('DuePopover calendar bounds', () => {
    it('floors a fresh stage at today so a new deadline cannot be created in the past', async () => {
        wrapper = mountDue().wrapper
        await openPopover(wrapper)

        expect(String(calendarComponent(wrapper).props('minValue'))).toBe('2026-06-15')
    })

    it('keeps the today floor for a draft that already carries a value', async () => {
        wrapper = mountDue({ dueAt: isoFromNow(2 * HOUR) }).wrapper
        await openPopover(wrapper)

        expect(String(calendarComponent(wrapper).props('minValue'))).toBe('2026-06-15')
    })

    it('drops the lower bound and seeds the stored overdue date and select entry', async () => {
        const mounted = mountDue({ reportId: 'r1', canEdit: true, dueAt: isoFromNow(-2 * DAY) })
        wrapper = mounted.wrapper
        await openPopover(wrapper)

        expect(calendarComponent(wrapper).props('minValue')).toBeUndefined()
        expect(stagedDate(wrapper)).toBe('2026-06-13')
        expect(selectComponent(wrapper).props('modelValue')).toBe('2026-06-13')
    })

    it('confirms a time-only edit on a seeded overdue date as the exact wire instant', async () => {
        const mounted = mountDue({ reportId: 'r1', canEdit: true, dueAt: isoFromNow(-2 * DAY) })
        wrapper = mounted.wrapper
        mounted.api.report.due.mockResolvedValue({
            ok: true,
            status: 200,
            data: { id: 'r1', status: 'new', created_at: '2026-06-15T00:00:00Z', due_at: '2026-06-13T13:30:00Z' },
        })
        await openPopover(wrapper)

        editTime(wrapper, new Time(9, 30))
        await nextTick()
        expect(isDisabled(buttonByText(wrapper, 'Set due date')!)).toBe(false)

        await confirm(wrapper)
        await settle()

        expect(mounted.api.report.due).toHaveBeenCalledWith('r1', new Date(2026, 5, 13, 9, 30, 0, 0).toISOString())
    })
})

/**
 * Offset-sensitive contract: every instant is computed in the viewer's local zone
 * and converted to UTC for the wire, and read back from UTC to the local zone for
 * state/label/tooltip. The running zone is America/New_York (UTC-4 on the frozen
 * date), so a local/UTC mix-up shifts by four hours and cannot hide.
 */
describe('DuePopover timezone contract', () => {
    it('runs under a zone whose offset is not UTC', () => {
        expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/New_York')
    })

    it('resolves the End of today preset to LOCAL wall time on confirm', async () => {
        wrapper = mountDue().wrapper
        await openPopover(wrapper)

        pickFromSelect(wrapper, 'preset:today')
        await nextTick()
        await confirm(wrapper)
        await nextTick()

        const today = emittedDueAt(wrapper)
        expect(localParts(today)).toEqual([2026, 6, 15, 16, 0])
        expect(today).toBe('2026-06-15T20:00:00.000Z')
        expect(today).not.toBe(new Date(Date.UTC(2026, 5, 15, 16, 0, 0, 0)).toISOString())
    })

    it('resolves End of tomorrow to the next day at 16:00 LOCAL', async () => {
        wrapper = mountDue().wrapper
        await openPopover(wrapper)

        pickFromSelect(wrapper, 'preset:tomorrow')
        await nextTick()
        await confirm(wrapper)
        await nextTick()

        const tomorrow = emittedDueAt(wrapper)
        expect(localParts(tomorrow)).toEqual([2026, 6, 16, 16, 0])
        expect(tomorrow).toBe('2026-06-16T20:00:00.000Z')
    })

    it('resolves In a week to the same local clock seven days out', async () => {
        wrapper = mountDue().wrapper
        await openPopover(wrapper)

        pickFromSelect(wrapper, 'preset:week')
        await nextTick()
        await confirm(wrapper)
        await nextTick()

        expect(localParts(emittedDueAt(wrapper))).toEqual([2026, 6, 22, 12, 0])
    })

    it('combines a calendar pick and time edit into the local-derived UTC instant', async () => {
        wrapper = mountDue().wrapper
        await openPopover(wrapper)

        pickCalendarDate(wrapper, new CalendarDate(2026, 7, 3))
        editTime(wrapper, new Time(14, 30))
        await nextTick()
        await confirm(wrapper)
        await nextTick()

        const emitted = emittedDueAt(wrapper)
        expect(localParts(emitted)).toEqual([2026, 7, 3, 14, 30])
        expect(emitted).toBe('2026-07-03T18:30:00.000Z')
    })

    it('reads a stored UTC instant back to the viewer local clock in the tooltip', () => {
        const stored = new Date(2026, 5, 15, 16, 0, 0, 0).toISOString()
        wrapper = mountDue({ dueAt: stored }).wrapper

        const tooltip = wrapper.findComponent({ name: 'UTooltip' }).props('text') as string
        expect(tooltip).toBe(getFormattedDatetime(stored))
        expect(tooltip).toContain('16:00')
        expect(tooltip).not.toContain('20:00')
    })

    it('PATCHes the exact local-derived UTC instant for the committed preset', async () => {
        const mounted = mountDue({ reportId: 'r1', canEdit: true })
        wrapper = mounted.wrapper
        mounted.api.report.due.mockResolvedValue({
            ok: true,
            status: 200,
            data: { id: 'r1', status: 'new', created_at: '2026-06-15T00:00:00Z', due_at: '2026-06-15T20:00:00Z' },
        })
        await openPopover(wrapper)

        pickFromSelect(wrapper, 'preset:today')
        await nextTick()
        await confirm(wrapper)
        await settle()

        expect(mounted.api.report.due).toHaveBeenCalledWith('r1', '2026-06-15T20:00:00.000Z')
    })
})

/** The last value the draft model emitted. */
function emittedDueAt(target: VueWrapper): string {
    const emitted = target.emitted('update:dueAt')?.at(-1)?.[0]
    return emitted as string
}

/** Local calendar parts of an ISO instant, for wall-clock assertions. */
function localParts(iso: string): number[] {
    const date = new Date(iso)
    return [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()]
}
