<script setup lang="ts">
import { computed, inject, onMounted, ref } from 'vue'
import { useStore } from '@/composables/useStore'
import type { WidgetStore } from '@/store/widget'
import { identity } from '@/core/storage'
import Position from '@/components/shared/ui/icons/Position.vue'
import type { RedlineContext } from '@/composables/useApi'
import { APPEARANCES, FILTERS, POSITIONS } from '@/components/widget/toolbar/presentation'
import { useToast } from '@nuxt/ui/composables/useToast'
import { defineShortcuts } from '@nuxt/ui/composables/defineShortcuts'

const redline = inject<RedlineContext>('redline') as RedlineContext
const store = useStore<WidgetStore>()
const toast = useToast()

const open = ref(false)
/**
 * In-panel navigation. A non-modal UPopover (unlike a modal DropdownMenu) does not
 * lock host-page scroll, and plain buttons click reliably inside the widget's Shadow
 * DOM - so "sub-menus" are rendered as swapped views within the one popover.
 */
const view = ref<'main' | 'position' | 'appearance' | 'filter'>('main')

const side = computed<'left' | 'right'>(() => (store.settings.position.endsWith('-left') ? 'right' : 'left'))

const ui = {
    base: 'justify-start',
    trailingIcon: 'ms-auto text-dimmed',
    label: 'text-default',
} as const

function selectFilter(key: string) {
    store.loadReports(key)
}

function setAppearance(value: string) {
    store.settings.theme = value
}

async function logout() {
    open.value = false
    try {
        const result = await redline.api.auth.logout()
        if (result.ok) {
            identity.clearUser()
            identity.clearTokenVerified()
            store.auth.user = null
            // Drop every listed report so no pins linger after the session ends.
            store.unloadReports()
            store.unresolvedCount = 0
        } else {
            /**
             * Server refused the logout (401/403/419/500…). Keep the session intact
             * and tell the user instead of silently dropping the authenticated UI.
             */
            toast.add({ title: 'Could not log out', color: 'error' })
        }
    } catch {
        // Network-level failure - logout never reached the server.
        toast.add({ title: 'Could not log out - check your connection', color: 'error' })
    }
}

/**
 * Registered in onMounted (mirrors Widget.ce.vue). Note the key alias is `escape`, not
 * `esc` - the event's key is "Escape", so `esc` never matched (the original bug).
 */
onMounted(() => {
    defineShortcuts({
        alt_m: () => { open.value = !open.value },
        escape: { usingInput: false, handler: () => { if (open.value) open.value = false } },
    })
})
</script>

<template>
    <UPopover
        v-model:open="open"
        :content="{ side, align: 'center', sideOffset: 10 }"
        :ui="{ content: 'w-56 p-1' }"
        arrow
        @update:open="view = 'main'"
    >
        <UTooltip text="Open settings" :kbds="['ALT', 'M']" :content="{ side, sideOffset: 10 }" :ui="{ content: 'p-2' }" arrow>
            <UButton
                size="lg"
                icon="i-lucide-settings"
                square
                color="neutral"
                variant="ghost"
                aria-label="Account"
                class="rounded-full"
            />
        </UTooltip>

        <template #content>
            <!-- Main -->
            <div v-if="view === 'main'" class="flex flex-col gap-1">
                <UUser
                    :name="store.auth.user?.name"
                    :description="store.auth.user?.role"
                    :avatar="{alt: store.auth.user?.name}"
                    size="lg"
                    class="p-1"
                ></UUser>

                <USeparator />

                <UButton
                    block
                    color="neutral"
                    variant="link"
                    icon="i-lucide-layout-dashboard"
                    label="Dashboard"
                    trailing-icon="i-lucide-external-link"
                    :ui="ui"
                    :to="redline.config.dashboard as string"
                    target="_blank"
                />

                <USeparator />

                <UButton
                    block
                    color="neutral"
                    variant="link"
                    label="Position"
                    trailing-icon="i-lucide-chevron-right"
                    :ui="ui"
                    @click="view = 'position'"
                >
                    <template #leading>
                        <Position :position="store.settings.position" />
                    </template>
                </UButton>
                <UButton
                    block
                    color="neutral"
                    variant="link"
                    :icon="store.settings.theme === 'dark' ? 'i-lucide-moon' : 'i-lucide-sun'"
                    label="Appearance"
                    trailing-icon="i-lucide-chevron-right"
                    :ui="ui"
                    @click="view = 'appearance'"
                />
                <UButton
                    block
                    color="neutral"
                    variant="link"
                    icon="i-lucide-list-filter"
                    label="Filter"
                    trailing-icon="i-lucide-chevron-right"
                    :ui="ui"
                    @click="view = 'filter'"
                />

                <USeparator />

                <UButton
                    block
                    color="error"
                    variant="ghost"
                    icon="i-lucide-log-out"
                    label="Log out"
                    :ui="{ base: 'justify-start' }"
                    @click="logout"
                />
            </div>

            <!-- Position -->
            <div v-else-if="view === 'position'" class="flex flex-col gap-1">
                <UButton
                    block
                    color="neutral"
                    variant="link"
                    icon="i-lucide-chevron-left"
                    label="Position"
                    :ui="ui"
                    @click="view = 'main'"
                />
                <USeparator />
                <UButton
                    v-for="item in POSITIONS" :key="item.key"
                    block
                    variant="link"
                    color="neutral"
                    :trailing="store.settings.position === item.key"
                    trailing-icon="i-lucide-check"
                    :label="item.label"
                    :ui="{...ui, trailingIcon: 'text-default'}"
                    @click="store.settings.position = item.key"
                >
                    <template #leading>
                        <Position :position="item.key" size="18" />
                    </template>
                </UButton>
            </div>

            <!-- Appearance -->
            <div v-else-if="view === 'appearance'" class="flex flex-col gap-1">
                <UButton
                    block
                    color="neutral"
                    variant="link"
                    icon="i-lucide-chevron-left"
                    label="Appearance"
                    :ui="ui"
                    @click="view = 'main'"
                />
                <USeparator />
                <UButton
                    v-for="item in APPEARANCES" :key="item.key"
                    block
                    variant="link"
                    color="neutral"
                    :trailing="store.settings.theme === item.key"
                    trailing-icon="i-lucide-check"
                    :leading-icon="item.icon"
                    :label="item.label"
                    :ui="{...ui, trailingIcon: 'text-default'}"
                    @click="setAppearance(item.key)"
                />
            </div>

            <!-- Filter -->
            <div v-else class="flex flex-col gap-1">
                <UButton
                    block
                    color="neutral"
                    variant="link"
                    icon="i-lucide-chevron-left"
                    label="Filter"
                    :ui="ui"
                    @click="view = 'main'"
                />
                <USeparator />
                <UButton
                    v-for="item in FILTERS" :key="item.key"
                    block
                    variant="link"
                    color="neutral"
                    :leading-icon="item.icon"
                    :trailing="store.report.loaded && store.filter.type === item.key"
                    trailing-icon="i-lucide-check"
                    :label="item.label"
                    :ui="{...ui, trailingIcon: 'text-default'}"
                    @click="selectFilter(item.key)"
                />
            </div>
        </template>
    </UPopover>
</template>
