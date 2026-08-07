<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useStore } from '@/composables/useStore'
import { useConfirm } from '@/composables/useConfirm'
import { statusColor, type Status } from '@/domain/status'
import type { DashboardStore } from '@/store/dashboard'
import { useComments } from '@/resources/comment/queries'
import { useAddCommentMutation } from '@/resources/comment/mutations'
import { useUpdateReportBodyMutation, useDeleteReportMutation, useReportStatusMutation } from '@/resources/report/mutations'
import CommentForm from '@/components/shared/comment/CommentForm.vue'
import CommentList from '@/components/shared/comment/CommentList.vue'
import Prose from '@/components/shared/ui/Prose.vue'
import InlineEditor from '@/components/shared/ui/InlineEditor.vue'
import PopoverMenu from '@/components/shared/ui/PopoverMenu.vue'
import StatusChanger from '@/components/shared/ui/StatusChanger.vue'
import ReportDetailsBrowser from '@/components/widget/report/ReportDetailsBrowser.vue'
import ReportDetailsScreenshot from '@/components/widget/report/ReportDetailsScreenshot.vue'
import ReportDetailsVideo from '@/components/widget/report/ReportDetailsVideo.vue'
import { useToast } from '@nuxt/ui/composables/useToast'

const store = useStore<DashboardStore>()
const { confirm } = useConfirm()
const toast = useToast()

// State
const isEditing = ref(false)
type DetailsPanel = 'browser' | 'screenshot' | 'video' | null
const detailsPanel = ref<DetailsPanel>(store.auth.user?.isDeveloper ? 'browser' : null)
const draft = ref('')

const addComment = useAddCommentMutation()
const { data: commentsData } = useComments(() => store.report.active?.id ?? '')
const updateBody = useUpdateReportBodyMutation()
const deleteReport = useDeleteReportMutation()
const statusMutation = useReportStatusMutation()

// Computed
// Auth context for comment actions + report body edit/delete gates.
const user = computed(() => {
    const u = store.auth.user
    return u ? { id: u.id, isAdmin: u.isAdmin, isDeveloper: u.isDeveloper } : null
})
const activeAuthorId = computed(() => store.report.active?.author?.id ?? null)
const isAuthor = computed(() => !!store.auth.user && store.auth.user.id === activeAuthorId.value)
// Body editing is author-only; delete is author OR admin (mirror backend policy).
const canEdit = computed(() => isAuthor.value)
const canDelete = computed(() => !!store.auth.user && (store.auth.user.isAdmin || isAuthor.value))
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
        items.push({ label: 'Delete', icon: 'i-lucide-trash-2', color: 'error', onClick: deleteReportAction })
    }
    return items
})
const comments = computed(() => commentsData.value ?? [])

// Watchers
// Clear the comment draft and exit body-edit mode whenever the active report changes.
watch(() => store.report.active?.id, () => { draft.value = ''; isEditing.value = false })

// Functions
/**
 * No-op when an edit is already in progress - the menu stays mounted while
 * editing, so a mid-edit 'Edit' click must not discard the in-progress draft.
 */
function startEdit() {
    if (isEditing.value) return
    isEditing.value = true
}

async function saveBody(html: string) {
    const id = store.report.active?.id
    if (updateBody.isPending.value || !id) return
    try {
        await updateBody.mutateAsync({ id, body: html })
        isEditing.value = false
        toast.add({ title: 'Report updated', color: 'success' })
    } catch {
        toast.add({ title: 'Could not update report', color: 'error' })
    }
}

async function deleteReportAction() {
    const id = store.report.active?.id
    if (!id) return
    const ok = await confirm(
        'Delete report',
        'Are you sure? This cannot be undone.',
        { confirmLabel: 'Delete', color: 'error' },
    )
    if (!ok) return
    try {
        await deleteReport.mutateAsync(id)
        store.report.active = null
        toast.add({ title: 'Report deleted', color: 'success' })
    } catch {
        toast.add({ title: 'Could not delete report', color: 'error' })
    }
}

async function submitComment(body: string) {
    const id = store.report.active?.id
    if (!id) return
    try {
        await addComment.mutateAsync({ reportId: id, body })
        draft.value = ''
    } catch {
        toast.add({ title: 'Could not add comment', color: 'error' })
    }
}

async function setStatus(status: string) {
    if (!store.report.active) return
    try {
        await statusMutation.mutateAsync({ id: store.report.active.id, status })
        if (status === 'resolved') toast.add({ title: 'Marked as resolved', color: 'success' })
    } catch {
        toast.add({ title: 'Could not update status', color: 'error' })
    }
}

function isPanel(panel?: string): boolean {
    return detailsPanel.value === panel
}

function openDetails(panel: DetailsPanel) {
    detailsPanel.value = detailsPanel.value === panel ? null : panel
}
</script>

<template>
    <UDashboardPanel
        id="reports-details"
        :default-size="20"
        :ui="{ body: 'sm:p-4', root: 'bg-default' }"
        v-if="store.report.active"
    >
        <template #header>
            <div class="p-4 pb-0">
                <div class="flex items-start justify-between gap-2">
                    <UUser
                        class="min-w-0 flex-1"
                        :ui="{ wrapper: 'min-w-0', name: 'truncate', description: 'truncate' }"
                        :name="store.report.active.author?.name ?? 'Unknown'"
                        :avatar="{alt: store.report.active.author?.name}"
                        :description="store.report.active.author?.email"
                    />
                    <UDashboardSidebarToggle size="xs" class="-mt-1 shrink-0" />
                    <PopoverMenu
                        v-if="canEdit || canDelete"
                        placement="bottom"
                        :trigger="{ icon: 'i-lucide-ellipsis', size: 'xs', variant: 'ghost' }"
                        :items="optionsItems"
                    />
                    <UButton
                        icon="i-lucide-x"
                        size="xs"
                        class="-mt-1 shrink-0"
                        aria-label="Close report"
                        @click="store.report.active = null"
                    />
                </div>

                <USeparator position="end">
                    <UBadge :color="statusColor(store.report.active.status as Status)" variant="subtle" size="sm">
                        {{ store.report.active.status }}
                    </UBadge>
                </USeparator>
            </div>
        </template>
        <template #body>
            <InlineEditor
                v-if="isEditing"
                :initial="store.report.active.body ?? ''"
                :loading="updateBody.isPending.value"
                @save="saveBody"
                @cancel="isEditing = false"
            />
            <Prose v-else :html="store.report.active.body" class="text-md" />
            <CommentList :comments="comments" :report-id="store.report.active.id" :user="user" />
        </template>
        <template #footer>
            <div class="flex flex-col gap-2 p-4">
                <CommentForm
                    v-model="draft"
                    @submit="submitComment"
                />

                <UPageCard variant="subtle" :ui="{ container: 'p-0 sm:p-0', header: 'w-full p-1 mb-0', body: 'w-full p-2 border-t border-default' }">
                    <template #header>
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-1">
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
                            </div>
                            <UButton
                                variant="ghost"
                                size="sm"
                                v-if="detailsPanel"
                                icon="i-lucide-chevron-up"
                                @click="detailsPanel = null"
                            />
                        </div>
                    </template>
                    <template #body v-if="detailsPanel">
                        <ReportDetailsBrowser v-if="isPanel('browser')" :report="store.report.active" />
                        <ReportDetailsScreenshot v-else-if="isPanel('screenshot')" :report="store.report.active" />
                        <ReportDetailsVideo v-else-if="isPanel('video')" :report="store.report.active" />
                    </template>
                </UPageCard>

                <USeparator position="start" class="mt-4" label="Actions" />

                <div class="flex flex-wrap items-center justify-between gap-2">
                    <UTooltip text="Open report on page" arrow>
                        <UButton
                            size="sm"
                            variant="subtle"
                            icon="i-lucide-square-arrow-out-up-right"
                            :to="store.getUrlWithQuery(store.report.active.url, { 'redline-report': store.report.active.id })"
                            target="_blank"
                        />
                    </UTooltip>
                    <StatusChanger
                        :status="store.report.active.status"
                        :role="store.auth.user?.role ?? null"
                        :loading="statusMutation.isPending.value"
                        @change="setStatus"
                    />
                </div>
            </div>
        </template>
    </UDashboardPanel>
</template>
