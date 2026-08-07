<script setup lang="ts">
/**
 * Comment composer built on Nuxt UI ChatPrompt with the shared rich-text Editor.
 * Presentational: owns the draft (`v-model`) and emits `submit(body)`; the
 * parent runs the mutation and clears the model on success.
 */
import { computed } from 'vue'
import { isHtmlEmpty } from '@/core/text'
import Editor from '@/components/shared/ui/Editor.vue'

const props = withDefaults(defineProps<{
    placeholder?: string
    loading?: boolean
}>(), {
    placeholder: 'Write your thoughts …',
    loading: false,
})

const emit = defineEmits<{ submit: [body: string] }>()

const body = defineModel<string>({ default: '' })

const isEmpty = computed(() => isHtmlEmpty(body.value))

function onSubmit() {
    if (props.loading || isEmpty.value) return
    emit('submit', body.value)
}
</script>

<template>
    <UChatPrompt
        :loading="loading"
        variant="outline"
        :rows="1"
        :max-rows="4"
        @submit="onSubmit"
    >
        <template #body>
            <Editor
                v-model="body"
                :placeholder="placeholder"
                :loading="loading"
                @submit="onSubmit"
            >
                <!-- Floating send button, anchored bottom-right so it stays put as the editor grows. -->
                <UButton
                    class="absolute -bottom-1 -right-1"
                    icon="i-lucide-send"
                    size="sm"
                    :loading="loading"
                    :disabled="isEmpty"
                    aria-label="Send comment"
                    @click="onSubmit"
                />
            </Editor>
        </template>
    </UChatPrompt>
</template>
