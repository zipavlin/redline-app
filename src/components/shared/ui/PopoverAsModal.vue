<script setup lang="ts">
const slots = defineSlots<{
    default(): unknown
    header?(): unknown
    'header-actions'(): unknown
    tag?(): unknown
    divider?(): unknown
    'before-body'?(): unknown
    body?(): unknown
    'after-body'(): unknown
    footer?(): unknown
    'footer-actions'?(): unknown
    details?(): unknown
}>()

const props = defineProps<{
    scrollable: boolean
}>()
</script>

<template>
    <template v-if="slots.header">
        <div class="flex items-start justify-between gap-2 p-3" :class="{'border-b border-default': !slots.tag && !slots.divider}">
            <slot name="header" />

            <template v-if="slots['header-actions']">
                <div class="flex items-center gap-1 -mr-1">
                    <slot name="header-actions" />
                </div>
            </template>
        </div>
    </template>

    <template v-if="slots.divider">
        <slot name="divider" />
    </template>
    <template v-else-if="slots.tag">
        <USeparator position="end" class="pr-3 -mt-3 -mb-2">
            <slot name="tag" />
        </USeparator>
    </template>


    <template v-if="slots.body">
        <div class="flex flex-col gap-3 p-3 pb-4" :class="{'overflow-y-auto': props.scrollable}">
            <slot name="body" />
        </div>
    </template>

    <template v-if="slots.footer">
        <div class="flex items-center justify-between border-t border-default gap-1 p-2 bg-elevated">
            <template v-if="slots['footer-actions']">
                <div class="flex items-center gap-1">
                    <slot name="footer-actions" />
                </div>
            </template>
            <slot name="footer" />
        </div>
    </template>

    <template v-if="slots.details">
        <div class="border-t border-default p-2 overflow-y-auto bg-elevated">
            <slot name="details" />
        </div>
    </template>
</template>
