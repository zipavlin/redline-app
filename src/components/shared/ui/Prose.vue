<script setup lang="ts">
/**
 * Renders sanitized rich-text HTML (report/comment bodies). The backend
 * sanitizes on write, so this mirrors the previous Html.vue behavior.
 * Styling comes from the global `.redline-prose` class (see _base.css) so it
 * works both in the dashboard and inside the widget's shadow root.
 */
defineProps<{ html?: string | null }>()
</script>

<template>
    <div class="redline-prose" v-html="html ?? ''" />
</template>
