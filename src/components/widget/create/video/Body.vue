<script setup lang="ts">
import { computed, ref } from 'vue'
import { useConfirm } from '@/composables/useConfirm'
import { useStore, type SharedStore } from '@/composables/useStore'
import { isHtmlEmpty } from '@/core/text'
import type { Priority } from '@/domain/priority'
import Editor from '@/components/shared/ui/Editor.vue'
import MemberPopover from '@/components/shared/report/MemberPopover.vue'
import PriorityPopover from '@/components/shared/report/PriorityPopover.vue'

const props = withDefaults(defineProps<{ submitting?: boolean }>(), { submitting: false })
const emit = defineEmits<{ submit: [body: string, priority: Priority, memberIds: string[]]; back: []; cancel: [] }>()

const store = useStore<SharedStore>()
const { confirm } = useConfirm()
const open = ref(true)
const body = ref('')
const priority = ref<Priority>('normal')
// Draft member selection - assigned to the report after the create call lands.
const selectedMemberIds = ref<string[]>([])
const isMembersOpen = ref(false)
// Closing the modal on an outside pointerdown would discard the priority pick,
// which fires its click after that pointerdown - lock dismissal while a nested popover is open.
const isPriorityOpen = ref(false)

const isBodyFilled = computed(() => !isHtmlEmpty(body.value))
const showMembers = computed(() => !!store.auth.user)

function onSubmit() {
    if (!isBodyFilled.value || props.submitting) return
    emit('submit', body.value, priority.value, selectedMemberIds.value)
}

async function onClose() {
    if (await confirm('Discard report', 'All progress will be lost.')) emit('cancel')
    else open.value = true
}
</script>

<template>
    <UModal
        v-model:open="open"
        title="Describe the recording"
        description="Step 3 of 3 - Describe"
        :ui="{ content: 'max-w-[min(360px,calc(100vw-32px))]' }"
        :dismissible="!isPriorityOpen && !isMembersOpen"
        @update:open="(v: boolean) => !v && onClose()"
    >
        <template #header>
            <UUser
                size="sm"
                name="Describe annotation"
                description="Step 3 - 3"
                :avatar="{icon: 'i-lucide-text-align-start'}"
            />
            <UButton
                size="sm"
                square
                icon="i-lucide-x"
                @click="onClose"
            />
        </template>
        <template #body>
            <div class="min-h-20 px-3 py-2 border border-default rounded-lg bg-default cursor-text text-default">
                <Editor
                    v-model="body"
                    :loading="submitting"
                    placeholder="Describe what you recorded …"
                    @submit="onSubmit"
                />
            </div>
        </template>
        <template #footer>
            <div class="flex items-center w-full justify-start gap-1">
                <UButton
                    variant="soft"
                    @click="emit('back')"
                    label="Back"
                />
                <MemberPopover
                    v-if="showMembers"
                    v-model:member-ids="selectedMemberIds"
                    v-model:open="isMembersOpen"
                    placement="top-start"
                    size="sm"
                />
                <PriorityPopover v-model="priority" v-model:open="isPriorityOpen" />
                <UButton
                    variant="solid"
                    color="success"
                    icon="i-lucide-send"
                    class="ml-auto"
                    :loading="submitting"
                    :disabled="submitting || !isBodyFilled"
                    @click="onSubmit"
                    label="Submit"
                />
            </div>
        </template>
    </UModal>
</template>
