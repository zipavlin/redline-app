<script setup lang="ts">
import { ref } from 'vue'
import { useConfirm } from '@/composables/useConfirm'

defineProps<{ videoUrl?: string }>()
const emit = defineEmits<{ retake: []; next: []; cancel: [] }>()

const { confirm } = useConfirm()
const open = ref(true)

async function onClose() {
    if (await confirm('Discard recording', 'The recorded video will be lost.')) emit('cancel')
    else open.value = true
}

async function onRetake() {
    if (await confirm('Discard recording', 'The recorded video will be lost.')) emit('retake')
}
</script>

<template>
    <UModal
        v-model:open="open"
        title="Review recording"
        description="Step 2 of 3 - Review"
        :ui="{ content: 'max-w-[min(560px,calc(100vw-32px))]' }"
        @update:open="(v: boolean) => !v && onClose()"
    >
        <template #header>
            <UUser
                size="sm"
                name="Review recording"
                description="Step 2 - 3"
                :avatar="{icon: 'i-lucide-crop'}"
            />
            <UButton
                size="sm"
                square
                icon="i-lucide-x"
                @click="onClose"
            />
        </template>
        <template #body>
            <video
                v-if="videoUrl"
                :src="videoUrl"
                controls
                class="relative block bg-black border-default rounded-lg w-full h-auto max-h-[55vh]"
            />
        </template>
        <template #footer>
            <UButton
                variant="soft"
                @click="onRetake"
                label="Retake"
            />
            <UButton
                color="success"
                variant="subtle"
                trailing-icon="i-lucide-arrow-right"
                @click="emit('next')"
                label="Continue"
            />
        </template>
    </UModal>
</template>
