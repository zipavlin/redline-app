<script setup lang="ts">

import {Priority, priorityColor} from "@/domain/priority";
import {Status, statusProgress} from "@/domain/status";
import {computed} from "vue";

const slots = defineSlots<{
    tag?(): unknown
}>()

const props = defineProps<{
    status?: Status
    priority?: Priority
}>()

const statusBarProgress = computed<number>(() => statusProgress(props.status as Status))
</script>

<template>
    <UTooltip
        :text="`Status: ${status}`"
        arrow
        :content="{
          align: 'center',
          side: 'bottom',
          sideOffset: -2
        }">
        <div :class="['flex items-center gap-2', $attrs.class]">
            <UProgress
                :color="priority ? priorityColor(priority) : 'neutral'"
                size="2xs"
                :model-value="statusBarProgress"
            />
            <slot name="tag" />
        </div>
    </UTooltip>
</template>
