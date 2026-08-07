<script setup lang="ts">
    interface PopoverMenuItem {
        slot?: string | undefined
        icon: string
        label?: string | undefined
        color?: string | number | symbol | undefined
        onClick: ((event: MouseEvent) => void) | ((event: MouseEvent) => void)[] | undefined
    }

    interface PopoverMenuTrigger {
        label?: string | undefined
        icon?: string | undefined
        variant?: string | undefined
        size?: string | undefined
        color?: string | number | symbol | undefined
        onClick?: ((event: MouseEvent) => void) | ((event: MouseEvent) => void)[] | undefined
        rounded?: boolean | undefined
    }

    defineProps<{
        placement?: string | undefined
        items: PopoverMenuItem[],
        tooltip?: string | undefined,
        trigger?: PopoverMenuTrigger | undefined,
    }>()

    /**
     * Close the popover when a default-rendered item is selected, then run the
     * item's handler(s). UPopover exposes `close` on its #content slot (Reka's
     * PopoverRoot slot prop); calling it also emits `update:open=false`, so
     * parents tracking open state (e.g. Report.vue's isMenuOpen) stay in sync.
     * Slot-rendered items (#item / per-item named slots) keep their own click
     * handling and are deliberately NOT auto-closed.
     */
    function selectItem(item: PopoverMenuItem, event: MouseEvent, close: () => void) {
        close()
        const handlers = item.onClick
        if (!handlers) return
        if (Array.isArray(handlers)) {
            handlers.forEach(handler => handler(event))
        } else {
            handlers(event)
        }
    }

    // Scoped-slot props are an OBJECT, not the item directly.
    defineSlots<{
        default: () => any
        // generic per-item slot: <template #item="{ item }">
        item?: (props: { item: PopoverMenuItem }) => any
        trigger?: () => any
        // dynamic per-item named slots: <template #[someName]="{ item }">
        [name: string]: ((props: { item: PopoverMenuItem }) => any) | undefined
    }>()
</script>

<template>
    <UPopover arrow :placement="placement" :ui="{ content: 'z-[60]' }">
        <template v-if="$slots.default">
            <slot name="default" />
        </template>
        <template v-else-if="tooltip">
            <UTooltip :text="tooltip" :placement="placement" arrow>
                <template v-if="$slots.trigger">
                    <slot name="trigger" />
                </template>
                <UButton
                    v-else-if="trigger"
                    :icon="trigger.icon"
                    :size="trigger.size"
                    :label="!trigger.icon && trigger.label ? trigger.label : undefined"
                    :aria-label="trigger.label ?? tooltip"
                    :color="trigger.color"
                    :class="trigger.rounded ? 'rounded-full' : undefined"
                    :variant="trigger.variant"
                    :onClick="trigger.onClick"
                />
            </UTooltip>
        </template>
        <template v-else>
            <template v-if="$slots.trigger">
                <slot name="trigger" />
            </template>
            <UButton
                v-else-if="trigger"
                :icon="trigger.icon"
                :size="trigger.size"
                :label="!trigger.icon && trigger.label ? trigger.label : undefined"
                :aria-label="trigger.label"
                :color="trigger.color"
                :class="trigger.rounded ? 'rounded-full' : undefined"
                :variant="trigger.variant"
                :onClick="trigger.onClick"
            />
        </template>

        <template #content="{ close }">
            <div class="flex flex-col gap-1 p-1">
                <template v-for="item in items" :key="item.label ?? item.icon">
                    <!-- 1. Per-item named slot, if this item requests one and the parent provided it -->
                    <slot v-if="item.slot && $slots[item.slot]" :name="item.slot" :item="item" />

                    <!-- 2. Generic `item` slot, if the parent provided it -->
                    <slot v-else-if="$slots.item" name="item" :item="item" />

                    <!-- 3. Default rendering - close the popover on select, then run the handler(s) -->
                    <UButton
                        v-else
                        size="sm"
                        variant="ghost"
                        :icon="item.icon"
                        :label="item.label"
                        :color="item.color"
                        @click="(event: MouseEvent) => selectItem(item, event, close)"
                    />
                </template>
            </div>
        </template>
    </UPopover>
</template>
