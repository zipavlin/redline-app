<script setup lang="ts">
import { useStore } from '@/composables/useStore'
import type { WidgetStore } from '@/store/widget'
import Logo from '@/components/shared/ui/Logo.vue'

const store = useStore<WidgetStore>()
</script>

<template>
    <div
        data-component="toolbar"
        class="fixed z-6 flex flex-col items-center gap-2 pointer-events-auto select-none touch-none"
        :class="{
                'bottom-4 right-4': store.settings.position === 'bottom-right',
                'bottom-4 left-4': store.settings.position === 'bottom-left',
                'top-4 right-4': store.settings.position === 'top-right',
                'top-4 left-4': store.settings.position === 'top-left',
        }"
    >
        <UButton
            size="lg"
            square
            class="rounded-full shadow-lg group"
            color="neutral"
            variant="soft"
            aria-label="Log in to Redline"
            @click="store.auth.callback = () => {}"
            :ui="{ base: 'bg-default text-default p-2.5' }"
        >
            <Logo :size="24" />
        </UButton>
    </div>
</template>
