<script setup lang="ts">
import { computed, ref } from 'vue'
import { useConfirm } from '@/composables/useConfirm'
import { isHtmlEmpty } from '@/core/text'
import Editor from '@/components/shared/ui/Editor.vue'

const props = withDefaults(defineProps<{ submitting?: boolean }>(), { submitting: false })
const emit = defineEmits<{ submit: [body: string]; back: []; cancel: [] }>()

const { confirm } = useConfirm()
const open = ref(true)
const body = ref('')

const isBodyFilled = computed(() => !isHtmlEmpty(body.value))

function onSubmit() {
    if (!isBodyFilled.value || props.submitting) return
    emit('submit', body.value)
}

async function onClose() {
    if (await confirm('Discard report', 'All progress will be lost.')) emit('cancel')
    else open.value = true
}
</script>

<template>
    <UModal
        v-model:open="open"
        title="Describe the recording"
        description="Step 3 of 3 — Describe"
        :ui="{ content: 'max-w-[min(360px,calc(100vw-32px))]' }"
        @update:open="(v: boolean) => !v && onClose()"
    >
        <template #header>
            <UUser
                size="sm"
                name="Describe screenshot"
                description="Step 3 — 3"
                :avatar="{icon: 'i-lucide-text-align-start'}"
            />
            <UButton
                size="sm"
                square
                icon="i-lucide-x"
                @click="onClose"
            />
        </template>
        <template #body>
            <div class="min-h-20 px-3 py-2 border border-default rounded-lg bg-default cursor-text text-default">
                <Editor
                    v-model="body"
                    :loading="submitting"
                    placeholder="Describe what you recorded …"
                    @submit="onSubmit"
                />
            </div>
        </template>
        <template #footer>
            <UButton
                variant="soft"
                @click="emit('back')"
                label="Back"
            />
            <UButton
                variant="solid"
                color="success"
                icon="i-lucide-send"
                :loading="submitting"
                :disabled="submitting || !isBodyFilled"
                @click="onSubmit"
                label="Submit"
            />
        </template>
    </UModal>
</template>
