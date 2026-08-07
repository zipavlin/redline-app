<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useStore } from '@/composables/useStore'
import type { WidgetStore } from '@/store/widget'

const store = useStore<WidgetStore>()

const props = withDefaults(defineProps<{
    recTime?: string
    recSeconds?: number
    paused?: boolean
}>(), { recTime: '00:00', recSeconds: 0, paused: false })

const emit = defineEmits<{ save: []; pause: []; resume: []; exit: [] }>()

const isWarning = computed(() => props.recSeconds >= 105)
const placementClass = computed(() => (store.settings.position.startsWith('top-') ? 'top-4' : 'bottom-4'))

onMounted(() => document.addEventListener('keydown', _onKeyDown))
onUnmounted(() => document.removeEventListener('keydown', _onKeyDown))

function _onKeyDown(e: KeyboardEvent) {
    if (e.code !== 'Space') return
    const t = e.target as HTMLElement
    if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return
    e.preventDefault()
    props.paused ? emit('resume') : emit('pause')
}
</script>

<template>
    <div
        data-component="video-record"
        :class="['fixed left-1/2 -translate-x-1/2 flex items-center gap-2 p-1 bg-default rounded-xl shadow-lg border border-default pointer-events-auto', placementClass]"
    >
        <!-- Annotation tools -->
        <div class="bg-elevated rounded-full flex gap-1 py-0.5 pl-2">
            <div class="flex items-center gap-2">
                <UIcon
                    v-if="!paused"
                    name="i-lucide-video"
                    class="size-[18px] text-primary shrink-0 animate-[redline-rec-pulse_1s_ease-in-out_infinite]"
                />
                <UIcon v-else name="i-lucide-video-off" class="size-[18px] text-muted shrink-0" />
                <span class="font-mono tabular-nums text-sm font-semibold" :class="isWarning ? 'text-primary' : 'text-default'">
                    {{ recTime }}
                </span>
            </div>

            <UTooltip :text="paused ? 'Resume' : 'Pause'" placement="bottom" arrow>
                <UButton
                    size="sm"
                    square
                    variant="soft"
                    class="rounded-full"
                    :icon="paused ? 'i-lucide-play' : 'i-lucide-pause'"
                    :aria-label="paused ? 'Resume' : 'Pause'"
                    @click="paused ? emit('resume') : emit('pause')"
                />
            </UTooltip>
        </div>

        <div class="flex items-center gap-1">
            <UTooltip text="Exit" placement="bottom" arrow>
                <UButton
                    color="neutral"
                    icon="i-lucide-x"
                    aria-label="Exit"
                    @click="emit('exit')"
                />
            </UTooltip>
            <UButton
                variant="subtle"
                color="success"
                trailing-icon="i-lucide-arrow-right"
                label="Save"
                @click="emit('save')"
            />
        </div>
    </div>
</template>
