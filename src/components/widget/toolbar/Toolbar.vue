<script setup lang="ts">
import { computed, inject } from 'vue'
import { useStore } from '@/composables/useStore'
import type { WidgetStore } from '@/store/widget'
import type { ModeControls } from '@/composables/useModeManager'
import type { RedlineContext } from '@/composables/useApi'
import Logo from '@/components/shared/ui/Logo.vue'
import ToolbarMenu from '@/components/widget/toolbar/ToolbarMenu.vue'

const { activatePin, activateAnnotation, activateVideo } = inject<ModeControls>('modeManager')!
const redline = inject<RedlineContext>('redline') as RedlineContext
const store = useStore<WidgetStore>()

// For top positions the logo sits at the top and the actions below it, so the
// button stack always grows away from the logo/screen corner.
const placement = computed(() => (store.settings.position.startsWith('top-') ? 'top' : 'bottom'))
// Flyouts (tooltips/menus) open toward the screen centre, away from the edge.
const side = computed<'left' | 'right'>(() => (store.settings.position.endsWith('-left') ? 'right' : 'left'))

async function toggleFilter() {
    await store.loadReports(store.filter.type === 'all' ? 'unresolved' : 'all')
}

function toggleToolbar() {
    store.closeReport()
    if (!store.auth.user && !redline.config.guest) {
        store.auth.callback = () => {}
        return
    }
    store.settings.expanded = !store.settings.expanded
}
</script>

<template>
    <div
        v-show="!store.capturing"
        data-component="toolbar"
        class="fixed z-6 flex flex-col items-center gap-2 pointer-events-auto select-none touch-none"
        :class="[
            placement === 'top' ? 'flex-col-reverse' : 'flex-col',
            {
                'bottom-4 right-4': store.settings.position === 'bottom-right',
                'bottom-4 left-4': store.settings.position === 'bottom-left',
                'top-4 right-4': store.settings.position === 'top-right',
                'top-4 left-4': store.settings.position === 'top-left',
            },
        ]"
    >
        <Transition name="rl-hint">
            <div v-if="store.settings.expanded" class="flex flex-col items-center gap-2 rounded-full p-1 bg-default shadow-lg border border-default">
                <!-- Action buttons -->
                <div class="bg-elevated rounded-full flex flex-col gap-1">
                    <UTooltip text="Comment" :kbds="['ALT', 'C']" :content="{ side, sideOffset: 10 }" :ui="{ content: 'px-1' }" arrow>
                        <UButton
                            size="lg"
                            :color="store.mode === 'pin' ? 'primary' : 'neutral'"
                            variant="soft"
                            class="rounded-full"
                            icon="i-lucide-message-square-text"
                            aria-label="Pin a comment"
                            @click="activatePin"
                        />
                    </UTooltip>
                    <UTooltip v-if="store.feature('screenshots')" text="Annotate" :kbds="['ALT', 'S']" :content="{ side, sideOffset: 10 }" :ui="{ content: 'px-1' }" arrow>
                        <UButton
                            size="lg"
                            :color="store.mode === 'annotation' ? 'primary' : 'neutral'"
                            variant="soft"
                            class="rounded-full"
                            icon="i-lucide-square-pen"
                            aria-label="Annotate"
                            @click="activateAnnotation"
                        />
                    </UTooltip>
                    <UTooltip v-if="store.capabilities.capture && store.feature('videos')" text="Record video" :kbds="['ALT', 'V']" :content="{ side, sideOffset: 10 }" :ui="{ content: 'px-1' }" arrow>
                        <UButton
                            size="lg"
                            :color="store.mode === 'video' ? 'primary' : 'neutral'"
                            variant="soft"
                            class="rounded-full"
                            icon="i-lucide-clapperboard"
                            aria-label="Record video"
                            @click="activateVideo"
                        />
                    </UTooltip>
                </div>

                <!-- Filter & Menu -->
                <div class="flex flex-col items-center gap-1">
                    <!-- Filter -->
                    <UTooltip :text="store.filter.type === 'all' ? 'Show unresolved only' : 'Show all reports'" :content="{ side, sideOffset: 10 }" :ui="{ content: 'px-1' }" arrow>
                        <UButton
                            size="lg"
                            color="neutral"
                            variant="ghost"
                            square
                            class="rounded-full"
                            :icon="store.filter.type === 'all' ? 'i-lucide-eye' : 'i-lucide-eye-off'"
                            :aria-label="store.filter.type === 'all' ? 'Show unresolved only' : 'Show all reports'"
                            @click="toggleFilter"
                        />
                    </UTooltip>

                    <!-- Menu -->
                    <ToolbarMenu />
                </div>
            </div>
        </Transition>

        <UChip
            :text="store.unresolvedCount"
            :show="!store.settings.expanded && store.unresolvedCount > 0"
            color="primary"
            size="3xl"
            inset
        >
            <UButton
                size="lg"
                square
                class="rounded-full shadow-lg group"
                color="neutral"
                variant="soft"
                :aria-label="store.settings.expanded ? 'Collapse toolbar' : 'Expand toolbar'"
                @click="toggleToolbar"
                :ui="{ base: 'bg-default text-default p-2.5' }"
            >
                <Logo :size="24" :active="store.settings.expanded" />
            </UButton>
        </UChip>
    </div>
</template>
