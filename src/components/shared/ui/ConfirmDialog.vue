<script setup lang="ts">
// Renders the pending confirm request (see useConfirm) as a Nuxt UI modal.
import { computed } from 'vue'
import { useConfirm } from '@/composables/useConfirm'

const { pending, respond } = useConfirm()

const open = computed({
    get: () => pending.value !== null,
    set: (v: boolean) => { if (!v) respond(false) },
})
</script>

<template>
    <UModal
        v-model:open="open"
        :title="pending?.title"
        :description="pending?.message"
        :ui="{ overlay: 'z-[70]', content: 'z-[70]' }"
        data-component="confirm-dialog"
    >
        <template #footer>
            <UButton
                variant="soft"
                @click="respond(false)"
            >
                Cancel
            </UButton>
            <UButton
                :color="pending?.color ?? 'neutral'"
                variant="solid"
                @click="respond(true)"
            >
                {{ pending?.confirmLabel ?? 'Confirm' }}
            </UButton>
        </template>
    </UModal>
</template>
