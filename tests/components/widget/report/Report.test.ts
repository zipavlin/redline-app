import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'

const { toastAdd, mockStore } = vi.hoisted(() => {
    const report = {
        id: 'r1',
        status: 'progress',
        priority: 'normal',
        body: '<p>hi</p>',
        created_at: '2026-01-01T00:00:00Z',
        author: { id: 'a1', name: 'Amy Author', email: 'amy@example.com' },
        members: [] as { id: string; name: string; initials: string }[],
    }
    const store = {
        auth: {
            user: { id: 'dev1', name: 'Dev D', email: 'dev@example.com', role: 'developer', isDeveloper: true, isAdmin: false },
            callback: null,
            authView: 'login',
        },
        report: { active: report, list: [report], activeEl: null },
        closeReport: vi.fn(),
        deleteReport: vi.fn(),
        changeStatus: vi.fn(),
        focusReport: vi.fn(),
        sortReports: vi.fn(),
        feature: vi.fn(() => false),
    }
    return { toastAdd: vi.fn(), mockStore: store }
})

vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: toastAdd }) }))
vi.mock('@nuxt/ui/runtime/composables/useToast', () => ({ useToast: () => ({ add: toastAdd }) }))
vi.mock('@nuxt/ui/composables/defineShortcuts', () => ({ defineShortcuts: vi.fn() }))
vi.mock('@/composables/useStore', () => ({ useStore: () => mockStore }))
// The real pin-anchor builds a virtual element + matchMedia; the panel only needs
// a side to hand to the (stubbed) popover.
vi.mock('@/composables/usePinAnchor', () => ({
    usePinAnchor: () => ({ reference: { ref: null }, side: 'left' }),
}))
vi.mock('@/resources/report/mutations', () => ({
    useReportPriorityMutation: () => ({ mutateAsync: vi.fn(), isPending: { value: false } }),
    useUpdateReportBodyMutation: () => ({ mutateAsync: vi.fn(), isPending: { value: false } }),
    useReportDueMutation: () => ({ mutateAsync: vi.fn(), isPending: { value: false } }),
}))
vi.mock('@/resources/report/mentions', () => ({ useMentionMemberSync: () => ({ sync: vi.fn() }) }))

/**
 * Auto-imported Nuxt UI components resolve to their real SFCs (unplugin), so they
 * are module-mocked at their package subpaths instead of name-stubbed - same
 * convention as tests/components/widget/create/CreateReport.test.ts.
 */
vi.mock('@nuxt/ui/components/Popover.vue', () => ({
    default: {
        name: 'UPopoverStub',
        props: ['open', 'dismissible', 'reference', 'content', 'ui'],
        emits: ['update:open'],
        template: '<div class="popover-stub" :data-dismissible="String(dismissible)"><slot name="content" /></div>',
    },
}))
vi.mock('@nuxt/ui/components/Tooltip.vue', () => ({
    default: { name: 'UTooltipStub', props: ['text', 'arrow'], template: '<span class="u-tooltip-stub"><slot /></span>' },
}))
vi.mock('@nuxt/ui/components/Button.vue', () => ({
    default: {
        name: 'UButtonStub',
        props: ['icon', 'label', 'size', 'variant', 'color', 'square', 'loading', 'ariaLabel', 'ui'],
        emits: ['click'],
        template: '<button class="u-button-stub" @click="$emit(\'click\', $event)"><slot />{{ label }}</button>',
    },
}))
vi.mock('@nuxt/ui/components/User.vue', () => ({
    default: {
        name: 'UUserStub',
        props: ['name', 'description', 'size', 'avatar'],
        template: '<div class="u-user-stub">{{ name }}<slot name="description" /></div>',
    },
}))
vi.mock('@nuxt/ui/components/Chip.vue', () => ({
    default: { name: 'UChipStub', props: ['show', 'color', 'inset', 'size'], template: '<span class="u-chip-stub"><slot /></span>' },
}))
vi.mock('@nuxt/ui/components/Modal.vue', () => ({
    default: {
        name: 'UModalStub',
        props: ['open', 'title', 'description', 'ui'],
        emits: ['update:open'],
        template: '<div v-if="open" class="u-modal-stub"><slot name="footer" /></div>',
    },
}))
vi.mock('@nuxt/ui/components/Progress.vue', () => ({
    default: { name: 'UProgressStub', props: ['color', 'size', 'modelValue'], template: '<div class="u-progress-stub" />' },
}))

/** Explicitly imported child components - replace with minimal recording stubs. */
vi.mock('@/components/shared/ui/StatusChanger.vue', () => ({
    default: {
        name: 'StatusChangerStub',
        props: ['status', 'role', 'loading', 'open'],
        emits: ['change', 'update:open'],
        template: '<div class="status-changer-stub" :data-open="String(open)" />',
    },
}))
vi.mock('@/components/shared/report/PriorityBadge.vue', () => ({
    default: {
        name: 'PriorityBadgeStub',
        props: ['priority', 'editable', 'loading', 'open'],
        emits: ['change', 'update:open'],
        template: '<div class="priority-badge-stub" />',
    },
}))
vi.mock('@/components/shared/ui/Prose.vue', () => ({
    default: { name: 'ProseStub', props: ['html'], template: '<div class="prose-stub" />' },
}))
vi.mock('@/components/shared/ui/InlineEditor.vue', () => ({
    default: { name: 'InlineEditorStub', props: ['initial', 'loading'], emits: ['save', 'cancel'], template: '<div class="inline-editor-stub" />' },
}))
vi.mock('@/components/shared/ui/PopoverAsModal.vue', () => ({
    default: {
        name: 'PopoverAsModalStub',
        props: ['scrollable'],
        template: `<div class="popover-as-modal-stub">
            <slot name="header" />
            <slot name="header-actions" />
            <slot name="divider" />
            <slot name="body" />
            <slot name="footer-actions" />
            <slot name="footer" />
            <slot name="details" />
        </div>`,
    },
}))
vi.mock('@/components/shared/ui/PopoverMenu.vue', () => ({
    default: {
        name: 'PopoverMenuStub',
        props: ['placement', 'tooltip', 'trigger', 'items'],
        emits: ['update:open'],
        template: '<div class="popover-menu-stub" />',
    },
}))
vi.mock('@/components/shared/report/MemberPopover.vue', () => ({
    default: {
        name: 'MemberPopoverStub',
        props: ['reportId', 'members', 'canEdit', 'authorId'],
        emits: ['update:open'],
        template: '<div class="member-popover-stub" :data-author-id="authorId" />',
    },
}))
vi.mock('@/components/shared/report/DuePopover.vue', () => ({
    default: {
        name: 'DuePopoverStub',
        props: ['reportId', 'dueAt', 'status', 'canEdit', 'placement', 'size'],
        emits: ['update:open', 'update:dueAt'],
        template: '<div class="due-popover-stub" :data-can-edit="String(canEdit)" />',
    },
}))
vi.mock('@/components/widget/report/ReportDetailsBrowser.vue', () => ({ default: { name: 'ReportDetailsBrowserStub', template: '<div />' } }))
vi.mock('@/components/widget/report/ReportDetailsScreenshot.vue', () => ({ default: { name: 'ReportDetailsScreenshotStub', template: '<div />' } }))
vi.mock('@/components/widget/report/ReportDetailsVideo.vue', () => ({ default: { name: 'ReportDetailsVideoStub', template: '<div />' } }))
vi.mock('@/components/widget/report/ReportDetailsPagination.vue', () => ({ default: { name: 'ReportDetailsPaginationStub', props: ['report'], emits: ['navigate'], template: '<div />' } }))
vi.mock('@/components/widget/report/ReportDetailsComments.vue', () => ({ default: { name: 'ReportDetailsCommentsStub', props: ['report'], template: '<div />' } }))

import Report from '@/components/widget/report/Report.vue'

let wrapper: VueWrapper | undefined

beforeEach(() => {
    toastAdd.mockClear()
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    document.body.innerHTML = ''
})

function mountPanel(): VueWrapper {
    return mount(Report, {
        global: { provide: { redline: { api: {}, config: {} } } },
    })
}

function panelDismissible(w: VueWrapper): string | undefined {
    return w.find('[data-component="report"]').attributes('data-dismissible')
}

describe('widget Report panel', () => {
    it('passes the report status/role to the status changer', () => {
        wrapper = mountPanel()

        const status = wrapper.findComponent({ name: 'StatusChangerStub' })
        expect(status.exists()).toBe(true)
        expect(status.props('status')).toBe('progress')
        expect(status.props('role')).toBe('developer')
    })

    it('passes the report author id to the members control', () => {
        wrapper = mountPanel()

        expect(wrapper.findComponent({ name: 'MemberPopoverStub' }).props('authorId')).toBe('a1')
    })

    it('passes the active report id, status and editable gate to the due control', () => {
        wrapper = mountPanel()

        const due = wrapper.findComponent({ name: 'DuePopoverStub' })
        expect(due.exists()).toBe(true)
        expect(due.props('reportId')).toBe('r1')
        expect(due.props('status')).toBe('progress')
        expect(due.props('canEdit')).toBe(true)
    })

    it('passes canEdit=false to the due control for a non-author non-developer', () => {
        const original = mockStore.auth.user
        mockStore.auth.user = { id: 'u2', name: 'Ursula', email: 'ursula@example.com', role: 'user', isDeveloper: false, isAdmin: false }
        try {
            wrapper = mountPanel()

            expect(wrapper.findComponent({ name: 'DuePopoverStub' }).props('canEdit')).toBe(false)
        } finally {
            mockStore.auth.user = original
        }
    })
})

/**
 * Regression guard: the status popover opens INSIDE the report panel popover.
 * Reka's outside-pointerdown cannot see the nested layer across the widget's
 * shadow DOM, so the panel must become non-dismissible while the status dropdown
 * is open, or the option click never commits. happy-dom cannot reproduce the
 * shadow layer detection, so the fix is pinned by asserting the dismissible wiring.
 */
describe('widget Report status popover dismissal wiring', () => {
    it('locks panel dismissal while the status popover is open, then unlocks it', async () => {
        wrapper = mountPanel()

        expect(panelDismissible(wrapper)).toBe('true')

        const status = wrapper.findComponent({ name: 'StatusChangerStub' })
        status.vm.$emit('update:open', true)
        await nextTick()
        expect(panelDismissible(wrapper)).toBe('false')

        status.vm.$emit('update:open', false)
        await nextTick()
        expect(panelDismissible(wrapper)).toBe('true')
    })

    it('locks panel dismissal while the due popover is open, then unlocks it', async () => {
        wrapper = mountPanel()

        expect(panelDismissible(wrapper)).toBe('true')

        const due = wrapper.findComponent({ name: 'DuePopoverStub' })
        due.vm.$emit('update:open', true)
        await nextTick()
        expect(panelDismissible(wrapper)).toBe('false')

        due.vm.$emit('update:open', false)
        await nextTick()
        expect(panelDismissible(wrapper)).toBe('true')
    })
})
