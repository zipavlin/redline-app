<script setup lang="ts">
/**
 * Inline body editor - the shared edit chrome around the pure Editor input.
 *
 * Composes the shared rich-text Editor (a pure v-model input) with the edit
 * affordances: a cancel + save action row under the editor (no header), where
 * Save is disabled while the editor is empty or a save is in flight. Used to
 * edit report/comment bodies in place (author-only) on both surfaces.
 *
 * The model is internal: the component is seeded from `initial` on mount and
 * reports the result via `save(html)` - the host owns the mutation.
 */
import { computed, ref } from 'vue'
import Editor from '@/components/shared/ui/Editor.vue'

const props = withDefaults(defineProps<{
    /** Initial HTML content - seeds the editor on mount (not reactive). */
    initial?: string
    /** True while the save mutation is in flight - disables cancel + save. */
    loading?: boolean
    placeholder?: string
}>(), {
    initial: '',
    loading: false,
    placeholder: 'Edit…',
})

const emit = defineEmits<{ save: [html: string]; cancel: [] }>()

const body = ref(props.initial)

/**
 * Empty check via the editor's exposed `isEmpty` so Save disables reactively
 * with the exact same source the Ctrl/⌘+Enter submit guard uses.
 */
const editorEl = ref<{ isEmpty: boolean } | null>(null)
const isEmpty = computed(() => editorEl.value?.isEmpty ?? true)

function onSave() {
    if (props.loading || isEmpty.value) return
    emit('save', body.value)
}

function onCancel() {
    if (props.loading) return
    emit('cancel')
}
</script>

<template>
    <UChatPrompt
        :loading="loading"
        variant="outline"
        :rows="1"
        :max-rows="4"
        @submit="onSave"
        :ui="{ root: 'pb-1 gap-1' }"
    >
        <template #body>
            <Editor
                ref="editorEl"
                v-model="body"
                :placeholder="placeholder"
                :loading="loading"
                @submit="onSave"
            />
            <USeparator />
            <div class="flex justify-between gap-2 -mx-1.5">
                <UButton
                    size="xs"
                    variant="ghost"
                    icon="i-lucide-x"
                    label="Cancel"
                    aria-label="Cancel editing"
                    :disabled="loading"
                    :ui="{ base: 'rounded-md' }"
                    @click="onCancel"
                />
                <UButton
                    size="xs"
                    icon="i-lucide-save"
                    :loading="loading"
                    :disabled="isEmpty"
                    label="Save"
                    aria-label="Save changes"
                    :ui="{ base: 'rounded-md' }"
                    @click="onSave"
                />
            </div>
        </template>
    </UChatPrompt>
</template>
