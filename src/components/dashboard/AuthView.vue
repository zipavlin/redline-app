<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useRedline } from '@/composables/useApi'
import { useStore } from '@/composables/useStore'
import type { DashboardStore } from '@/store/dashboard'

import AuthLogin from '@/components/shared/auth/AuthLogin.vue'
import AuthRegister from '@/components/shared/auth/AuthRegister.vue'

const { config } = useRedline()
const store = useStore<DashboardStore>()
const router = useRouter()

/**
 * This page owns the auth modals as a standalone surface: prime the store so the
 * modals render, and pick the initial view from the bootstrap config.
 */
store.auth.callback = () => {}
store.auth.authView = (config as { canRegister?: boolean }).canRegister ? 'register' : 'login'

/**
 * Cached identity, async session init, and post-login/register activation all
 * surface as `auth.user` becoming truthy → leave the page for the dashboard.
 */
watch(
    () => store.auth.user,
    u => {
        if (u) router.replace('/')
    },
    { immediate: true },
)

/**
 * Closing either modal (callback → null) leaves the page. Setup already set the
 * callback non-null, so this never fires on mount.
 */
watch(() => store.auth.callback, cb => {
    if (cb === null && !store.auth.user) router.replace('/')
})

onBeforeUnmount(() => {
    store.auth.authView = 'login'
    /**
     * Non-authed visitors who close the modal land on `/` with the dashboard's
     * login modal open (its normal gate); authed users leave nothing behind.
     */
    store.auth.callback = store.auth.user ? null : () => {}
})
</script>

<template>
    <div class="flex min-h-screen items-center justify-center bg-default p-4">
        <AuthLogin />
        <AuthRegister />
    </div>
</template>
