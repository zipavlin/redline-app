<script setup lang="ts">
/**
 * Annotation toolbar - a single fixed top bar (tools + color + actions) shown
 * while drawing on the page. Drives the framework-agnostic AnnotationCapture.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useConfirm } from '@/composables/useConfirm'
import { useStore } from '@/composables/useStore'
import type { WidgetStore } from '@/store/widget'
import { type Color, COLORS } from '@/domain/color'
import PopoverMenu from '@/components/shared/ui/PopoverMenu.vue'

const props = defineProps<{ overlay: { setTool: (t: string | null) => void; setColor: (c: string) => void; undo: () => void; isEmpty: () => boolean; hasSelection?: boolean; deleteSelected: () => void } | null }>()
const emit = defineEmits<{ continue: []; cancel: [] }>()

const { confirm } = useConfirm()
const store = useStore<WidgetStore>()

// State
/**
 * Scroll lock is owned by the parent (CreateAnnotation, via useScrollLock) so it can
 * persist through the crop/describe steps after this toolbar unmounts; the toggle here
 * just drives that shared value.
 */
const scrollLocked = defineModel<boolean>('scrollLocked', { default: true })
const activeTool = ref<string | null>(null)
const activeColor = ref<string | null>(null)

// Computed
// Place the toolbar on the same vertical edge as the widget toolbar (mirrors Toolbar.vue).
const placementClass = computed(() => (store.settings.position.startsWith('top-') ? 'top-4' : 'bottom-4'))

onMounted(() => _enter())
onUnmounted(() => _exit())

// Functions

function _enter() {
    setColor(COLORS[0])
    document.addEventListener('keydown', _onKeyDown)
}

function _exit() {
    document.removeEventListener('keydown', _onKeyDown)
}

function setTool(tool: string | null) {
    activeTool.value = activeTool.value === tool ? null : tool
    props.overlay?.setTool(activeTool.value)
}

function setColor(color: Color) {
    activeColor.value = color.value
    props.overlay?.setColor(color.value)
}

function onSubmit() {
    emit('continue')
}

async function onClose() {
    if (!props.overlay?.isEmpty()) {
        if (!(await confirm('Discard annotations', 'All drawn annotations will be lost.'))) return
    }
    emit('cancel')
}

function _onKeyDown(e: KeyboardEvent) {
    if ((e.key === 'Delete' || e.key === 'Backspace') && activeTool.value === 'select') {
        if (props.overlay?.hasSelection) {
            e.preventDefault()
            props.overlay.deleteSelected()
        }
        return
    }
    if (e.key === 'Escape') {
        const isDrawingTool = activeTool.value && activeTool.value !== 'select'
        if (isDrawingTool) {
            if (props.overlay?.isEmpty()) emit('cancel')
            else setTool('select')
        } else if (props.overlay?.isEmpty()) {
            emit('cancel')
        }
        return
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        props.overlay?.undo()
    }
}
</script>

<template>
    <div
        ref="toolbarRef"
        data-component="annotation-toolbar"
        :class="['fixed left-1/2 -translate-x-1/2 flex flex-wrap items-center gap-2 p-1 bg-default rounded-xl shadow-lg border border-default pointer-events-auto', placementClass]"
    >
        <div class="flex items-center">
            <!-- Select / Erase -->
            <div class="flex items-center gap-1">
                <UTooltip text="Select" placement="bottom" arrow>
                    <UButton
                        square
                        icon="i-lucide-mouse-pointer-2"
                        aria-label="Select"
                        :color="activeTool === 'select' ? 'primary' : 'neutral'"
                        @click="setTool('select')"
                    />
                </UTooltip>
                <UTooltip text="Erase" placement="bottom" arrow>
                    <UButton
                        square
                        icon="i-lucide-eraser"
                        aria-label="Erase"
                        :color="activeTool === 'erase' ? 'primary' : 'neutral'"
                        @click="setTool('erase')"
                    />
                </UTooltip>
            </div>

            <!-- Annotation tools -->
            <div class="bg-elevated rounded-full flex gap-1">
                <!-- Draw group -->
                <PopoverMenu
                    placement="bottom"
                    tooltip="Freehand / highlight"
                    :trigger="{
                    rounded: true,
                    variant: 'soft',
                    icon: activeTool === 'highlighter' ? 'i-lucide-highlighter' : 'i-lucide-pencil',
                    color: ['freehand', 'highlighter'].includes(activeTool ?? '') ? 'primary' : 'neutral',
                    onClick: () => setTool(activeTool === 'freehand' ? 'select' : 'freehand')
                }"
                    :items="[
                {
                    icon: 'i-lucide-pencil',
                    label: 'Freehand',
                    color: activeTool === 'freehand' ? 'primary' : 'neutral',
                    onClick: () => setTool('freehand')
                },
                {
                    icon: 'i-lucide-highlighter',
                    label: 'Highlighter',
                    color: activeTool === 'highlighter' ? 'primary' : 'neutral',
                    onClick: () => setTool('highlighter')
                },
            ]" />

                <!-- Arrow/Line group -->
                <PopoverMenu
                    placement="bottom"
                    tooltip="Arrow / line"
                    :trigger="{
                    rounded: true,
                    variant: 'soft',
                    icon: activeTool === 'line' ? 'i-lucide-minus' : 'i-lucide-move-up-right',
                    color: ['arrow', 'line'].includes(activeTool ?? '') ? 'primary' : 'neutral',
                    onClick: () => setTool(activeTool === 'arrow' ? 'select' : 'arrow')
                }"
                    :items="[
                {
                    icon: 'i-lucide-move-up-right',
                    label: 'Arrow',
                    color: activeTool === 'arrow' ? 'primary' : 'neutral',
                    onClick: () => setTool('arrow')
                },
                {
                    icon: 'i-lucide-minus',
                    label: 'Line',
                    color: activeTool === 'line' ? 'primary' : 'neutral',
                    onClick: () => setTool('line')
                },
            ]"/>

                <!-- Text -->
                <UTooltip text="Text" placement="bottom" arrow>
                    <UButton
                        square
                        variant="soft"
                        class="rounded-full"
                        icon="i-lucide-type"
                        aria-label="Text"
                        :color="activeTool === 'text' ? 'primary' : 'neutral'"
                        @click="setTool('text')"
                    />
                </UTooltip>

                <!-- Shape group -->
                <PopoverMenu
                    placement="bottom"
                    tooltip="Rect / circle"
                    :trigger="{
                    rounded: true,
                    variant: 'soft',
                    icon: activeTool === 'circle' ? 'i-lucide-circle' : 'i-lucide-square',
                    color: ['rect', 'circle'].includes(activeTool ?? '') ? 'primary' : 'neutral',
                    onClick: () => setTool(activeTool === 'rect' ? 'select' : 'rect')
                }"
                    :items="[
                {
                    icon: 'i-lucide-square',
                    label: 'Rectangle',
                    color: activeTool === 'rect' ? 'primary' : 'neutral',
                    onClick: () => setTool('rect')
                },
                {
                    icon: 'i-lucide-circle',
                    label: 'Circle',
                    color: activeTool === 'circle' ? 'primary' : 'neutral',
                    onClick: () => setTool('circle')
                },
            ]"/>
            </div>
        </div>

        <div class="flex items-center">
            <!-- Color & Actions -->
            <div class="flex items-center gap-1">
                <!-- Color -->
                <PopoverMenu placement="bottom" :items="COLORS.map((color) => {
                return {
                    icon: color.value,
                    label: color.label,
                    color: activeTool === color.value ? 'primary' : 'neutral',
                    onClick: () => setTool(color.value)
                }
            })">
                    <UTooltip text="Color" placement="bottom" arrow>
                        <UButton
                            square
                            color="neutral"
                            aria-label="Color"
                        >
                            <span class="size-4 rounded-full border border-default" :style="{ background: `${activeColor}` }" />
                        </UButton>
                    </UTooltip>
                    <template #item="{ item }">
                        <UButton
                            :key="item.icon"
                            size="sm"
                            :label="item.label"
                            :color="item.color"
                            @click="item.onClick">
                            <template #leading>
                                <span class="size-4 rounded-full border border-default" :style="{ background: `${item.icon}` }" />
                            </template>
                        </UButton>
                    </template>
                </PopoverMenu>

                <!-- Actions -->
                <UTooltip text="Undo" placement="bottom" arrow>
                    <UButton
                        square
                        icon="i-lucide-undo-2"
                        aria-label="Undo"
                        @click="props.overlay?.undo()"
                    />
                </UTooltip>
                <UTooltip :text="scrollLocked ? 'Unlock scroll' : 'Lock scroll'" placement="bottom" arrow>
                    <UButton
                        square
                        :icon="scrollLocked ? 'i-lucide-lock' : 'i-lucide-lock-open'"
                        :aria-label="scrollLocked ? 'Unlock scroll' : 'Lock scroll'"
                        @click="scrollLocked = !scrollLocked"
                    />
                </UTooltip>
            </div>

            <USeparator orientation="vertical" class="h-6" />

            <div class="flex items-center gap-1">
                <UTooltip text="Exit" placement="bottom" arrow>
                    <UButton
                        color="neutral"
                        icon="i-lucide-x"
                        aria-label="Exit"
                        @click="onClose"
                    />
                </UTooltip>
                <UButton
                    variant="subtle"
                    color="success"
                    trailing-icon="i-lucide-arrow-right"
                    label="Save"
                    @click="onSubmit"
                />
            </div>
        </div>
    </div>
</template>
