import { useStore, type SharedStore } from '@/composables/useStore'
import { useToast } from '@nuxt/ui/composables/useToast'
import { roleFlags } from '@/domain/role'
import { extractMentionUserIds } from '@/core/text'
import { memberMutationError, useAddMembersMutation, type ReportStoreLike } from '@/resources/report/mutations'
import type { Member } from '@/resources/report/model'

/** The bits of a store report entry the mention sync reads. */
interface MentionedReport {
    members?: Member[]
    author?: { id?: string }
}

export interface MentionSyncInput {
    reportId: string
    html: string
}

/**
 * Add every user mentioned in a freshly submitted body to the report's members.
 *
 * Runs after the body/comment mutation succeeds (never on pick - abandoned drafts
 * must not mutate membership). Silent no-op when the actor may not edit members
 * (author or developer/admin only, mirroring the backend gate), when the report is
 * not in the store, or when everyone mentioned is already a member. The full body
 * is rescanned on every submit, so re-edits self-heal and duplicates dedupe.
 */
export function useMentionMemberSync() {
    const store = useStore<SharedStore & ReportStoreLike>()
    const toast = useToast()
    const addMembers = useAddMembersMutation()

    function findReport(reportId: string): MentionedReport | undefined {
        const entry = store.report.active?.id === reportId
            ? store.report.active
            : store.report.list.find((row) => row.id === reportId)
        return entry as MentionedReport | undefined
    }

    function mayEditMembers(report: MentionedReport): boolean {
        const user = store.auth.user
        if (!user) return false
        return roleFlags(String(user.role)).isDeveloper || user.id === report.author?.id
    }

    function missingMemberIds(report: MentionedReport, mentionIds: string[]): string[] {
        const memberIds = new Set((report.members ?? []).map((member) => member.id))
        return mentionIds.filter((id) => !memberIds.has(id))
    }

    async function sync({ reportId, html }: MentionSyncInput): Promise<void> {
        const mentionIds = extractMentionUserIds(html)
        if (!mentionIds.length) return

        const report = findReport(reportId)
        if (!report || !mayEditMembers(report)) return

        const missing = missingMemberIds(report, mentionIds)
        if (!missing.length) return

        try {
            await addMembers.mutateAsync({ id: reportId, userIds: missing })
        } catch (error) {
            toast.add({ title: memberMutationError(error), color: 'error' })
        }
    }

    return { sync }
}

/**
 * Assign the members picked in a draft composer (and everyone mentioned in the
 * submitted body) to a freshly created report. Runs after the create mutation
 * resolves, since member ids need a real report; the union dedupes so a picked
 * mention is assigned once. Assignment is non-fatal - the report is already
 * saved, so a failure warns instead of failing the submit.
 */
export function useAssignCreatedReportMembers() {
    const toast = useToast()
    const addMembers = useAddMembersMutation()

    async function assign(reportId: string, html: string, pickedIds: string[] = []): Promise<void> {
        const userIds = [...new Set([...pickedIds, ...extractMentionUserIds(html)])]
        if (!userIds.length) return
        try {
            await addMembers.mutateAsync({ id: reportId, userIds })
        } catch (error) {
            toast.add({
                title: memberMutationError(error, 'Report saved, but members could not be assigned'),
                color: 'error',
            })
        }
    }

    return { assign }
}
