<script setup lang="ts">
import { ref } from 'vue'

const overlayEl = ref<HTMLElement>()
const highlightEl = ref<HTMLElement>()
const touchConfirmEl = ref<HTMLElement>()

defineExpose({ overlayEl, highlightEl, touchConfirmEl })
</script>

<template>
    <!-- Full-screen capture overlay — PinCapture attaches pointer events here -->
    <div
        ref="overlayEl"
        data-component="pin-overlay"
        class="fixed inset-0 cursor-crosshair z-[3] pointer-events-auto"
        style="display:none"
    />

    <!-- Element highlight rect — PinCapture positions and shows/hides directly -->
    <div
        ref="highlightEl"
        class="fixed pointer-events-none z-[4] border-2 border-primary bg-primary/10 rounded-xs transition-all duration-[40ms]"
        hidden
    />

    <!-- Touch two-step confirmation popup — PinCapture positions directly -->
    <div
        ref="touchConfirmEl"
        class="fixed z-[5] flex items-center gap-2 shadow-xl pointer-events-auto rounded-xl px-3 py-2 bg-elevated border border-default"
        hidden
    >
        <span class="text-default text-xs">Pin here?</span>
        <button
            id="redline-tc-yes"
            class="px-3 py-1 rounded text-sm font-semibold cursor-pointer transition-opacity duration-150 hover:opacity-80 bg-primary text-inverted"
        >Pin</button>
        <button
            id="redline-tc-no"
            class="px-3 py-1 text-sm cursor-pointer rounded transition-opacity duration-150 hover:opacity-70 bg-muted text-muted border border-default"
        >Cancel</button>
    </div>
</template>
