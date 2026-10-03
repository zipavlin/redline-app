import { describe, it, expect, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { TooltipProvider } from 'reka-ui'

vi.mock('@nuxt/ui/composables/useToast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('@nuxt/ui/runtime/composables/useToast', () => ({ useToast: () => ({ add: vi.fn() }) }))
vi.mock('@/composables/useConfirm', () => ({
    useConfirm: () => ({ confirm: vi.fn().mockResolvedValue(true), respond: vi.fn(), pending: null }),
}))

import CommentList from '@/components/shared/comment/CommentList.vue'
import type { Comment } from '@/resources/comment/model'
import type { CommentAuthContext } from '@/components/shared/comment/CommentList.vue'

const comment: Comment = {
    id: 'c1',
    body: '<p>Original</p>',
    created_at: '2024-01-01T10:00:00Z',
    author: { id: 'u1', name: 'Ada' },
}

/**
 * Stubs - only explicitly-imported components can be stubbed by name in this env;
 * auto-imported Nuxt UI components (UTimeline/UTooltip) render for real, so the
 * mount is wrapped in TooltipProvider (same pattern as Donut.test.ts) and the
 * assertions target the scoped-slot content, not UTimeline's own DOM.
 */
const PopoverMenuStub = defineComponent({
    name: 'PopoverMenu',
    props: ['items', 'trigger', 'placement', 'tooltip'],
    emits: ['update:open'],
    template: `
        <div class="popover-menu">
            <button class="pm-trigger">⋯</button>
            <div class="pm-items">
                <button
                    v-for="item in items"
                    :key="item.label"
                    class="pm-item"
                    :data-action="item.label"
                    @click="item.onClick && item.onClick($event)"
                >{{ item.label }}</button>
            </div>
        </div>`,
})

const ProseStub = { name: 'Prose', props: ['html'], template: '<div class="prose">{{ html }}</div>' }

const InlineEditorStub = defineComponent({
    name: 'InlineEditor',
    props: ['initial', 'loading', 'placeholder'],
    emits: ['save', 'cancel'],
    template: `
        <div class="inline-editor">
            <span class="ie-initial">{{ initial }}</span>
            <button class="ie-save" :disabled="loading" @click="$emit('save', initial + ' EDITED')">Save</button>
            <button class="ie-cancel" @click="$emit('cancel')">Cancel</button>
        </div>`,
})

function mountList(user: CommentAuthContext | null, apiOverrides: { update?: () => unknown; destroy?: () => unknown } = {}) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const api = {
        comment: {
            update: vi.fn(apiOverrides.update ?? (() => ({ ok: true, data: { ...comment } }))),
            destroy: vi.fn(apiOverrides.destroy ?? (() => ({ ok: true, data: null }))),
        },
    }
    const wrapper = mount(
        {
            components: { CommentList, TooltipProvider },
            props: ['comments', 'reportId', 'user'],
            template:
                '<TooltipProvider><CommentList :comments="comments" :report-id="reportId" :user="user" /></TooltipProvider>',
        },
        {
            props: { comments: [comment], reportId: 'r1', user },
            global: {
                plugins: [[VueQueryPlugin, { queryClient }]],
                provide: {
                    redline: { api, config: {} },
                    store: {
                        auth: { user: null, callback: null, authView: 'login' },
                        activateSession: () => {},
                        report: { active: null, list: [] },
                    },
                },
                stubs: {
                    PopoverMenu: PopoverMenuStub,
                    Prose: ProseStub,
                    InlineEditor: InlineEditorStub,
                },
            },
        },
    )
    return { wrapper, api }
}

const editItems = (wrapper: ReturnType<typeof mountList>['wrapper']) => wrapper.findAll('.pm-item[data-action="Edit"]')
const deleteItems = (wrapper: ReturnType<typeof mountList>['wrapper']) => wrapper.findAll('.pm-item[data-action="Delete"]')

const author = { id: 'u1', isAdmin: false, isDeveloper: false }
const adminOther = { id: 'u2', isAdmin: true, isDeveloper: true }
const developerOther = { id: 'u2', isAdmin: false, isDeveloper: true }

describe('CommentList auth gating', () => {
    it('shows Edit + Delete for the author', () => {
        const { wrapper } = mountList(author)
        expect(editItems(wrapper)).toHaveLength(1)
        expect(deleteItems(wrapper)).toHaveLength(1)
    })

    it('shows Delete but NOT Edit for an admin who is not the author', () => {
        const { wrapper } = mountList(adminOther)
        expect(editItems(wrapper)).toHaveLength(0)
        expect(deleteItems(wrapper)).toHaveLength(1)
    })

    it('hides everything for a developer who is not the author', () => {
        const { wrapper } = mountList(developerOther)
        expect(wrapper.find('.popover-menu').exists()).toBe(false)
    })

    it('hides everything for guests (no user)', () => {
        const { wrapper } = mountList(null)
        expect(wrapper.find('.popover-menu').exists()).toBe(false)
    })
})

describe('CommentList inline edit', () => {
    it('swaps the Prose body for the editor with the comment body prefilled', async () => {
        const { wrapper } = mountList(author)
        expect(wrapper.find('.prose').text()).toContain('Original')

        await editItems(wrapper)[0].trigger('click')

        expect(wrapper.find('.inline-editor').exists()).toBe(true)
        expect(wrapper.find('.ie-initial').text()).toBe('<p>Original</p>')
        expect(wrapper.find('.prose').exists()).toBe(false)
    })

    it('cancel restores the Prose body without saving', async () => {
        const { wrapper, api } = mountList(author)
        await editItems(wrapper)[0].trigger('click')
        await wrapper.find('.ie-cancel').trigger('click')

        expect(wrapper.find('.inline-editor').exists()).toBe(false)
        expect(wrapper.find('.prose').text()).toContain('Original')
        expect(api.comment.update).not.toHaveBeenCalled()
    })

    it('save calls the update mutation and closes the editor on success', async () => {
        const { wrapper, api } = mountList(author)
        await editItems(wrapper)[0].trigger('click')
        await wrapper.find('.ie-save').trigger('click')
        await flushPromises()

        expect(api.comment.update).toHaveBeenCalledWith('r1', 'c1', '<p>Original</p> EDITED')
        expect(wrapper.find('.inline-editor').exists()).toBe(false)
        expect(wrapper.find('.prose').text()).toContain('Original')
    })
})

describe('CommentList delete', () => {
    it('delete calls the destroy mutation for the comment', async () => {
        const { wrapper, api } = mountList(adminOther)
        await deleteItems(wrapper)[0].trigger('click')
        await flushPromises()

        expect(api.comment.destroy).toHaveBeenCalledWith('r1', 'c1')
    })

    it('does not offer delete to a developer who is not the author', async () => {
        const { api } = mountList(developerOther)
        await flushPromises()
        expect(api.comment.destroy).not.toHaveBeenCalled()
    })
})
