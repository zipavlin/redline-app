<script setup lang="ts">
/**
 * Report panel - an existing report opened anchored to its pin marker.
 *
 * Anchoring uses UPopover's `reference` prop (the pin marker element, or a virtual
 * element built from the pin's page coordinates) plus the "cover-least side" math
 * (kept from the old useFloatingPosition) fed into the popover's `side`.
 */
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useStore } from '@/composables/useStore'
import { usePinAnchor } from '@/composables/usePinAnchor'
import { getFormattedDatetime, getRelativeTime } from '@/core/datetime'
import {type Status} from '@/domain/status'
import { useReportPriorityMutation, useUpdateReportBodyMutation } from '@/resources/report/mutations'
import { useMentionMemberSync } from '@/resources/report/mentions'
import type { SelectedReport } from '@/store/widget/selection'
import type { WidgetStore } from '@/store/widget'
import StatusChanger from '@/components/shared/ui/StatusChanger.vue'
import PriorityBadge from '@/components/shared/report/PriorityBadge.vue'
import Prose from '@/components/shared/ui/Prose.vue'
import InlineEditor from '@/components/shared/ui/InlineEditor.vue'
import ReportDetailsBrowser from '@/components/widget/report/ReportDetailsBrowser.vue'
import ReportDetailsScreenshot from '@/components/widget/report/ReportDetailsScreenshot.vue'
import ReportDetailsVideo from '@/components/widget/report/ReportDetailsVideo.vue'
import ReportDetailsPagination from '@/components/widget/report/ReportDetailsPagination.vue'
import ReportDetailsComments from '@/components/widget/report/ReportDetailsComments.vue'
import MemberPopover from '@/components/shared/report/MemberPopover.vue'
import PopoverAsModal from '@/components/shared/ui/PopoverAsModal.vue'
import PopoverMenu from '@/components/shared/ui/PopoverMenu.vue'
import { useToast } from '@nuxt/ui/composables/useToast'
import { defineShortcuts } from '@nuxt/ui/composables/defineShortcuts'
import {Priority} from "@/domain/priority";

const store = useStore<WidgetStore>()
const toast = useToast()

type DetailsPanel = 'browser' | 'screenshot' | 'video' | 'pagination' | 'comments' | null

// State
const detailsPanel = ref<DetailsPanel>(null)
const isElementBorderActive = ref(false)
const elementBorderRect = ref<DOMRect | null>(null)
const isStatusLoading = ref(false)
const isDeleteConfirmOpen = ref(false)
const isDeleteLoading = ref(false)
const isMenuOpen = ref(false)
const isMembersOpen = ref(false)
// The panel closes on an outside pointerdown, which fires before the priority
// option's click - keep it non-dismissible while that nested popover is open.
const isPriorityOpen = ref(false)
// Inline body editing - locked (non-dismissible) so the draft can't be lost.
const isEditing = ref(false)
const isBodySaving = ref(false)
const updateBody = useUpdateReportBodyMutation()
const priorityMutation = useReportPriorityMutation()
const { sync: syncMentions } = useMentionMemberSync()

/**
 * Close button, so we can land focus on it when the popover opens instead of
 * letting Reka auto-focus the first focusable child (the Options trigger).
 */
const closeButton = useTemplateRef<{ $el?: HTMLElement }>('closeButton')

// UPopover anchor: the pin element, or a virtual element from the pin's page coords.
// Cover-least side: open toward whichever half of the annotated element the pin sits in.
const { reference, side } = usePinAnchor({
    element: () => store.report.activeEl,
    coords: () => {
        const a = store.report.active
        return a && a._pageX != null && a._pageY != null ? { pageX: a._pageX, pageY: a._pageY } : null
    },
    side: () => {
        const cover = store.report.active?.element
        const refEl = store.report.activeEl
        if (cover instanceof Element && refEl) {
            const c = cover.getBoundingClientRect()
            const r = refEl.getBoundingClientRect()
            return r.left - c.left > c.width / 2 ? 'right' : 'left'
        }
        return 'left'
    },
})

// Computed
const open = computed({
    get: () => !!store.report.active,
    set: (v: boolean) => { if (!v) close() },
})
const activeAuthorId = computed(() => store.report.active?.author?.id ?? null)
const isAuthor = computed(() => !!store.auth.user && store.auth.user.id === activeAuthorId.value)
// Body editing is author-only; delete is author OR admin (mirror backend policy).
const canEdit = computed(() => isAuthor.value)
const canDelete = computed(() => !!store.auth.user && (store.auth.user.isAdmin || isAuthor.value))
// Status change permission is unchanged: author OR developer.
const canChangeStatus = computed(() => !!store.auth.user && (store.auth.user.isDeveloper || isAuthor.value))
// Priority change mirrors the status gate: author OR developer/admin.
const canChangePriority = computed(() => !!store.auth.user && (store.auth.user.isDeveloper || isAuthor.value))
// Member editing permission mirrors the backend UPDATE gate: author OR developer/admin.
const canEditMembers = computed(() => !!store.auth.user && (store.auth.user.isDeveloper || isAuthor.value))
const hasElement = computed(() => store.report.active?.element instanceof Element)

/**
 * Panel is non-dismissible while editing (draft protection), while the options
 * menu is open, while the members or priority popover is open, or while the
 * comments panel is showing its composer. The nested popovers need this: their
 * option click arrives after Reka's outside pointerdown, so an unlocked panel
 * would close before the pick commits.
 */
const dismissible = computed(() =>
    !isEditing.value
    && !isMenuOpen.value
    && !isMembersOpen.value
    && !isPriorityOpen.value
    && detailsPanel.value !== 'comments',
)

const optionsItems = computed(() => {
    const items: {
        label: string
        icon: string
        color?: 'error'
        onClick: () => void
    }[] = []
    if (canEdit.value) {
        items.push({ label: 'Edit', icon: 'i-lucide-pencil', onClick: startEdit })
    }
    if (canDelete.value) {
        items.push({
            label: 'Delete',
            icon: 'i-lucide-trash-2',
            color: 'error',
            onClick: () => { isDeleteConfirmOpen.value = true },
        })
    }
    return items
})

// Watchers
watch(() => store.report.active, (report) => {
    if (!report) {
        detailsPanel.value = null
        isMenuOpen.value = false
        isMembersOpen.value = false
        isPriorityOpen.value = false
        isEditing.value = false
        isElementBorderActive.value = false
        elementBorderRect.value = null
    }
})

// Functions
/**
 * Reka's default openAutoFocus focuses the first focusable element in the
 * content. Cancel that and put focus on the close button instead.
 */
function focusClose(event: Event) {
    event.preventDefault()
    nextTick(() => closeButton.value?.$el?.focus())
}

function startEdit() {
    /**
     * The options menu now stays mounted while editing, so clicking "Edit" fires
     * PopoverMenu's close-on-select (`close()` runs before the item handler) →
     * `update:open=false` → `isMenuOpen = false` lands before this runs. Keep the
     * explicit clear anyway: it's idempotent and guarantees `dismissible` can't be
     * left locked by a swallowed or late-arriving close event (the original
     * regression). Re-entry guard: an "Edit" click mid-edit is a no-op, so the
     * in-progress draft is never discarded.
     */
    isMenuOpen.value = false
    if (isEditing.value) return
    isEditing.value = true
}

function cancelEdit() {
    isEditing.value = false
}

async function saveBody(html: string) {
    if (isBodySaving.value || !store.report.active) return
    isBodySaving.value = true
    const id = store.report.active.id
    try {
        await updateBody.mutateAsync({ id, body: html })
        void syncMentions({ reportId: id, html })
        isEditing.value = false
        toast.add({ title: 'Report updated', color: 'success' })
    } catch {
        toast.add({ title: 'Could not update report', color: 'error' })
    } finally {
        isBodySaving.value = false
    }
}

function paginateToReport(targetReport: SelectedReport) {
    isElementBorderActive.value = false
    elementBorderRect.value = null
    store.closeReport()
    nextTick(() => store.focusReport(targetReport.id))
}

function toggleElementBorder() {
    if (isElementBorderActive.value) {
        isElementBorderActive.value = false
        elementBorderRect.value = null
        return
    }
    const el = store.report.active?.element
    if (!(el instanceof Element)) return
    elementBorderRect.value = el.getBoundingClientRect()
    isElementBorderActive.value = true
}

function openDetails(panel: DetailsPanel) {
    detailsPanel.value = detailsPanel.value === panel ? null : panel
    /**
     * Outside-dismiss is handled by the `dismissible` computed (locked while
     * editing, menu open, or the comments composer is showing).
     */
}

function close() {
    store.closeReport()
}

async function deleteReport() {
    if (isDeleteLoading.value || !store.report.active) return
    isDeleteLoading.value = true
    const id = store.report.active.id
    try {
        if (await store.deleteReport(id)) {
            isDeleteConfirmOpen.value = false
            toast.add({ title: 'Report deleted', color: 'success' })
        }
    } catch {
        toast.add({ title: 'Could not delete report', color: 'error' })
    } finally {
        isDeleteLoading.value = false
    }
}

async function setPriority(priority: string) {
    if (priorityMutation.isPending.value || !store.report.active) return
    try {
        await priorityMutation.mutateAsync({ id: store.report.active.id, priority })
    } catch {
        toast.add({ title: 'Could not update priority', color: 'error' })
    }
}

async function changeStatus(status: string) {
    if (isStatusLoading.value || !store.report.active) return
    isStatusLoading.value = true
    const id = store.report.active.id
    try {
        if (await store.changeStatus(id, status as Status) && status === 'resolved') {
            toast.add({ title: 'Marked as resolved', color: 'success' })
            close()
        }
    } catch {
        toast.add({ title: 'Could not update status', color: 'error' })
    } finally {
        isStatusLoading.value = false
    }
}

function isPanel(panel?: string): boolean {
    return detailsPanel.value === panel
}

/**
 * Move focus to the previous/next report in on-page order (top → bottom), matching
 * ReportDetailsPagination. Developer-only, keyboard-driven sibling navigation.
 */
function paginateBy(dir: -1 | 1) {
    if (!store.auth.user?.isDeveloper || !store.report.active || store.report.list.length < 2) return
    store.sortReports('_pageY')
    const idx = store.report.list.findIndex((r: SelectedReport) => r.id === store.report.active!.id)
    const target = store.report.list[idx + dir]
    if (target) paginateToReport(target)
}

onMounted(() => {
    defineShortcuts({
        /**
         * Escape cancels an in-progress body edit before falling back to closing the
         * report popover (UPopover is non-modal, so it does not bind Escape itself).
         * The widget's global Escape handler ignores open reports.
         */
        escape: {
            usingInput: false,
            handler: () => {
                if (!store.report.active) return
                if (isEditing.value) cancelEdit()
                else close()
            },
        },
        alt_arrowleft: () => paginateBy(-1),
        alt_arrowright: () => paginateBy(1),
    })
})
</script>

<template>
    <UPopover
        v-if="store.report.active"
        v-model:open="open"
        :dismissible="dismissible"
        :reference="reference"
        :content="{ side, align: 'center', sideOffset: 12, onOpenAutoFocus: focusClose }"
        :ui="{ content: 'w-80 max-h-[70vh] flex flex-col overflow-hidden shadow-xl' }"
        data-component="report"
    >
        <template #content>
            <PopoverAsModal
                :scrollable="true"

            >
                <template #header>
                    <UUser
                        size="sm"
                        :name="store.report.active.author?.name ?? 'Unknown'"
                        :description="getRelativeTime(store.report.active.created_at)"
                        :avatar="{alt: store.report.active.author?.name}"
                    >
                        <template #description>
                            <UTooltip :text="getFormattedDatetime(store.report.active.created_at)" arrow>
                                <span>{{ getRelativeTime(store.report.active.created_at) }}</span>
                            </UTooltip>
                        </template>
                    </UUser>
                </template>
                <template #header-actions>
                    <MemberPopover
                        :report-id="store.report.active.id"
                        :members="store.report.active.members ?? []"
                        :can-edit="canEditMembers"
                        @update:open="(membersOpen: boolean) => isMembersOpen = membersOpen"
                    />
                    <!-- edit/delete -->
                    <PopoverMenu
                        v-if="canEdit || canDelete"
                        placement="bottom"
                        tooltip="Options"
                        :trigger="{
                            icon: 'i-lucide-ellipsis',
                            size: 'xs'
                        }"
                        :items="optionsItems"
                        @update:open="(menuOpen: boolean) => isMenuOpen = menuOpen"
                    />
                    <!-- close -->
                    <UButton
                        size="xs"
                        variant="ghost"
                        ref="closeButton"
                        square
                        icon="i-lucide-x"
                        @click="open = false"
                    />
                </template>
                <template #divider>
                    <ProgressStatusDivider
                        :status="store.report.active.status as Status"
                        :priority="store.report.active.priority as Priority"
                        class="pr-3 -mt-3 -mb-2"
                    >
                        <template #tag>
                            <PriorityBadge
                                v-model:open="isPriorityOpen"
                                :priority="store.report.active.priority"
                                :editable="canChangePriority"
                                :loading="priorityMutation.isPending.value"
                                @change="setPriority"
                            />
                        </template>
                    </ProgressStatusDivider>
                </template>
                <template #body>
                    <InlineEditor
                        v-if="isEditing"
                        :initial="store.report.active.body ?? ''"
                        :loading="isBodySaving"
                        @save="saveBody"
                        @cancel="cancelEdit"
                    />
                    <Prose v-else :html="store.report.active.body" class="text-default" />
                </template>
                <template #footer-actions>
                    <UTooltip text="Element border" arrow>
                        <UButton
                            v-if="hasElement && store.auth.user?.isDeveloper"
                            size="sm"
                            :variant="isElementBorderActive ? 'subtle' : 'soft'"
                            square
                            icon="i-lucide-scan-line"
                            aria-label="Element border"
                            :color="isElementBorderActive ? 'primary' : 'neutral'"
                            @click="toggleElementBorder"
                        />
                    </UTooltip>
                    <UTooltip text="Browser info" arrow>
                        <UButton
                            v-if="store.auth.user?.isDeveloper"
                            size="sm"
                            :variant="isPanel('browser') ? 'subtle' : 'soft'"
                            square
                            icon="i-lucide-square-terminal"
                            aria-label="Browser info"
                            :color="isPanel('browser') ? 'primary' : 'neutral'"
                            @click="openDetails('browser')"
                        />
                    </UTooltip>
                    <UTooltip text="Screenshot" arrow>
                        <UButton
                            v-if="store.report.active.screenshot"
                            size="sm"
                            :variant="isPanel('screenshot') ? 'subtle' : 'soft'"
                            square
                            icon="i-lucide-image"
                            aria-label="Screenshot"
                            :color="isPanel('screenshot') ? 'primary' : 'neutral'"
                            @click="openDetails('screenshot')"
                        />
                    </UTooltip>
                    <UTooltip text="Video" arrow>
                        <UButton
                            v-if="store.report.active.video"
                            size="sm"
                            :variant="isPanel('video') ? 'subtle' : 'soft'"
                            square
                            icon="i-lucide-square-play"
                            aria-label="Video"
                            :color="isPanel('video') ? 'primary' : 'neutral'"
                            @click="openDetails('video')"
                        />
                    </UTooltip>
                    <UTooltip text="Pagination" arrow>
                        <UButton
                            v-if="store.auth.user?.isDeveloper && store.report.list.length > 1"
                            size="sm"
                            :variant="isPanel('pagination') ? 'subtle' : 'soft'"
                            square
                            icon="i-lucide-arrow-left-right"
                            aria-label="Pagination"
                            :color="isPanel('pagination') ? 'primary' : 'neutral'"
                            @click="openDetails('pagination')"
                        />
                    </UTooltip>
                    <UTooltip text="Comments" arrow>
                        <UChip
                            :show="!!store.report.active.comments?.length"
                            color="warning"
                            inset
                            size="sm"
                        >
                            <UButton
                                v-if="store.feature('comments')"
                                size="sm"
                                :variant="isPanel('comments') ? 'subtle' : 'soft'"
                                square
                                icon="i-lucide-messages-square"
                                aria-label="Pagination"
                                :color="isPanel('comments') ? 'primary' : 'neutral'"
                                @click="openDetails('comments')"
                            />
                        </UChip>
                    </UTooltip>
                </template>
                <template #footer>
                    <StatusChanger
                        v-if="canChangeStatus"
                        :status="store.report.active.status"
                        :role="store.auth.user?.role ?? null"
                        :loading="isStatusLoading"
                        @change="changeStatus"
                    />
                </template>
                <template #details v-if="detailsPanel">
                    <ReportDetailsBrowser v-if="isPanel('browser')" :report="store.report.active" />
                    <ReportDetailsScreenshot v-else-if="isPanel('screenshot')" :report="store.report.active" />
                    <ReportDetailsVideo v-else-if="isPanel('video')" :report="store.report.active" />
                    <ReportDetailsPagination v-else-if="isPanel('pagination')" :report="store.report.active" @navigate="paginateToReport" />
                    <ReportDetailsComments v-else-if="isPanel('comments')" :report="store.report.active" />
                </template>
            </PopoverAsModal>
        </template>
    </UPopover>

    <!-- Delete confirmation -->
    <UModal
        v-model:open="isDeleteConfirmOpen"
        title="Delete report"
        description="This action cannot be undone."
        :ui="{ overlay: 'z-[70]', content: 'z-[70]' }"
    >
        <template #footer>
            <div class="flex justify-end gap-2 w-full">
                <UButton color="neutral" variant="ghost" @click="isDeleteConfirmOpen = false">Cancel</UButton>
                <UButton color="error" :loading="isDeleteLoading" @click="deleteReport">Delete</UButton>
            </div>
        </template>
    </UModal>

    <!-- Element border highlight (fixed; rendered inside the shadow wrapper) -->
    <div
        v-if="isElementBorderActive && elementBorderRect"
        class="fixed pointer-events-none rounded-xs outline-2 -outline-offset-2 outline-primary bg-primary/10 z-7"
        :style="{
            top: elementBorderRect.top + 'px',
            left: elementBorderRect.left + 'px',
            width: elementBorderRect.width + 'px',
            height: elementBorderRect.height + 'px',
        }"
    />
</template>
