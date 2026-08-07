<script setup lang="ts">
import { watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { useStore } from '@/composables/useStore'
import type { DashboardStore } from '@/store/dashboard'
import AppSidebar from '@/components/dashboard/AppSidebar.vue'
import AuthLogin from '@/components/shared/auth/AuthLogin.vue'
import AuthRegister from '@/components/shared/auth/AuthRegister.vue'
import ConfirmDialog from '@/components/shared/ui/ConfirmDialog.vue'

const store = useStore<DashboardStore>()
const route = useRoute()

watch(() => store.settings.theme, (theme) => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
}, { immediate: true })

watch(() => store.auth.user, (user) => {
    if (!route.meta.standalone && !user) {
        store.auth.authView = 'login'
        store.auth.callback = () => {}
    }
}, { immediate: true })
</script>

<template>
    <UApp>
        <RouterView v-if="route.meta.standalone" />

        <template v-else>
            <UDashboardGroup v-if="store.auth.user" unit="rem" class="text-sm">
                <AppSidebar />
                <RouterView />
            </UDashboardGroup>

            <div v-else class="h-screen bg-default" />

            <AuthLogin :dismissible="false" />
            <AuthRegister :dismissible="false" />
            <ConfirmDialog />
        </template>
    </UApp>
</template>
