<template>
    <div>
        <Eye :size="size" v-if="filter === 'all'" />
        <EyeClosed :size="size" v-else-if="filter === 'hidden'" />
        <div v-else class="relative">
            <EyeDashed :size="size" :style="style" />

            <CircleDot v-if="filter === 'unresolved'" :size="numericSize / 1.5" class="absolute top-0 right-0" />
            <CircleStar v-else-if="filter === 'new'" :size="numericSize / 1.5" class="absolute top-0 right-0" />
            <CircleUserRound v-else-if="filter === 'mine'" :size="numericSize / 1.5" class="absolute top-0 right-0" />
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue'
import { CircleDot, CircleStar, CircleUserRound, Eye, EyeClosed, EyeDashed } from '@lucide/vue'

const props = defineProps({
    filter: { type: String, default: 'all' }, // All, unresolved, mine, new, hidden
    size: { type: String, default: '18' },
})

const numericSize = parseInt(props.size)
const maskRadius = (numericSize / 1.5) / 2
const style = computed(() =>
    `mask-image: radial-gradient(circle ${maskRadius}px at ${numericSize - maskRadius}px ${maskRadius}px, transparent 100%, black 100%)`,
)
</script>
