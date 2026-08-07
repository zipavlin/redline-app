/**
 * Programmatic confirm dialog - a reactive singleton consumed by <ConfirmDialog>
 * (rendered once at the widget root). `confirm()` returns a promise that resolves
 * true/false when the user responds.
 */
import { ref } from 'vue'

export interface ConfirmRequest {
    title: string
    message: string
    confirmLabel?: string
    color?: 'primary' | 'error' | 'success' | 'warning'
    resolve: (value: boolean) => void
}

const pending = ref<ConfirmRequest | null>(null)

export function useConfirm() {
    function confirm(
        title: string,
        message: string,
        opts: { confirmLabel?: string; color?: ConfirmRequest['color'] } = {},
    ): Promise<boolean> {
        return new Promise<boolean>((resolve) => {
            pending.value = { title, message, resolve, ...opts }
        })
    }

    function respond(result: boolean) {
        pending.value?.resolve(result)
        pending.value = null
    }

    return { pending, confirm, respond }
}
