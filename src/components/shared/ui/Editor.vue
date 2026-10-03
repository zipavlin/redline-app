<script setup lang="ts">
/**
 * Shared rich-text editor - the common TipTap setup used by the comment composer
 * and every report-body composer (report / annotation / video).
 *
 * Owns the parts that are identical everywhere: the `/` suggestion menu, the `@`
 * mention autocomplete, bubble toolbar, link popover, Ctrl/⌘+Enter submit,
 * autofocus, and the in-shadow portal resolution that keeps the menus from being
 * clipped by overflow.
 *
 * The model is an HTML string. The host owns the outer wrapper (UChatPrompt / UModal)
 * and the submit button; this component only emits `submit` (on Ctrl/⌘+Enter) and
 * exposes an in-editor slot for a floating action button.
 */
import { computed, ref, watch } from 'vue'
import type { FocusPosition } from '@tiptap/vue-3'
import type { EditorProps } from '@tiptap/pm/view'
import type { EditorMentionMenuItem, EditorSuggestionMenuItem, EditorToolbarItem, EditorCustomHandlers } from '@nuxt/ui'
import { isHtmlEmpty } from '@/core/text'
import { pickPastedImage } from '@/core/capture/paste'
import { useStore } from '@/composables/useStore'
import { useUserMentionSearch } from '@/resources/user/queries'
import EditorLinkPopover from '@/components/shared/ui/EditorLinkPopover.vue'
import {
    commandsSuggestionItems,
    insertsSuggestionItems,
    linkToolbarItems,
    listsSuggestionItems,
    marksToolbarItems,
} from '@/components/shared/ui/editor'

const props = withDefaults(defineProps<{
    placeholder?: string
    loading?: boolean
    autofocus?: FocusPosition
    suggestionItems?: EditorSuggestionMenuItem[][]
    toolbarItems?: EditorToolbarItem[][]
    handlers?: EditorCustomHandlers
    /**
     * Optional clipboard-image hook: when the user pastes an image file, the file is
     * handed here instead of ProseMirror's default handling. Return `false` to let
     * the default paste behaviour run (text/other content still lands in the editor).
     * With no handler passed, pasted images behave exactly as before (default PM
     * handling, no images inserted - the `image` extension is disabled).
     */
    handleImagePaste?: (file: File) => boolean | void
    /**
     * Enable the `@` mention autocomplete (server-searched). Guests never get the
     * menu - `GET /user` requires auth - but the TipTap mention extension stays
     * inert, so bodies already containing mention nodes still render.
     */
    mention?: boolean
}>(), {
    placeholder: '',
    loading: false,
    autofocus: 'end',
    suggestionItems: () => [listsSuggestionItems, insertsSuggestionItems, commandsSuggestionItems],
    toolbarItems: () => [marksToolbarItems, linkToolbarItems],
    mention: true,
})

const emit = defineEmits<{ submit: [] }>()

// State
const body = defineModel<string>({ default: '' })
const rootEl = ref<HTMLElement | null>(null)
const store = useStore()
const searchMentions = useUserMentionSearch()
const mentionItems = ref<EditorMentionMenuItem[]>([])
// The term of the latest issued search - guards against out-of-order responses.
let latestMentionTerm = ''

// Computed
const isEmpty = computed(() => isHtmlEmpty(body.value))
const showMentionMenu = computed(() => props.mention && !!store.auth.user)

defineExpose({ isEmpty })

// Functions
/**
 * The `/` suggestion menu appends to the editor's parent by default, which the
 * report/comment panels clip via `overflow`. Render it in the widget's in-shadow
 * portal target instead (styled + unclipped, same place UApp teleports overlays),
 * resolved from the editor's own root node so it also works in the dashboard SPA:
 * no shadow root there means `getRootNode()` returns `document` and we fall back to
 * <body>. Appending to `document.body` in the widget would escape the shadow root
 * and lose all Tailwind styling.
 */
function resolveSuggestionContainer(): HTMLElement {
    const root = rootEl.value?.getRootNode() as ParentNode | undefined
    const portal = root?.querySelector?.('[data-redline-portal]') as HTMLElement | null
    return portal ?? document.body
}

/**
 * Feed the debounced server search into the mention menu. Results are ignored
 * when a newer term has been requested since (the composable also drops stale
 * responses) - the menu reopens automatically on the next non-empty result.
 * Keeping the previous items on screen until the new term settles is deliberate:
 * UEditorMentionMenu runs with `ignore-filter`, so an emptied list would close the
 * dropdown mid-typing and let Enter insert a newline instead of a mention.
 */
async function onMentionSearch(term: string): Promise<void> {
    latestMentionTerm = term
    const rows = await searchMentions(term)
    if (term !== latestMentionTerm) return
    mentionItems.value = rows.map((row) => ({
        id: row.id,
        label: row.name ?? row.id,
        avatar: { alt: row.name ?? '' },
    }))
}

/**
 * Seed the bare-`@` candidate list as soon as the menu is available. With a
 * prefilled list the menu opens on the first `@` even before a search settles,
 * so Enter selects a candidate rather than reaching ProseMirror as a newline.
 */
watch(showMentionMenu, (show) => {
    if (show && mentionItems.value.length === 0) void onMentionSearch('')
}, { immediate: true })

/**
 * The editor swallows key events before they reach any host wrapper, so wire the
 * submit shortcut (Ctrl/⌘+Enter) directly into ProseMirror. Enter keeps its default
 * behaviour (newline / list handling). Guard emptiness + loading here so every host
 * gets the same rule.
 */
const editorProps: EditorProps = {
    handleKeyDown(_view, event) {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault()
            if (!props.loading && !isEmpty.value) emit('submit')
            return true
        }
        return false
    },
    /**
     * Pasted images must not reach ProseMirror (the `image` extension is off), so
     * intercept the paste event and hand any image file to the host. `false` lets the
     * default behaviour run: plain-text paste is untouched, and consumers without a
     * handleImagePaste prop behave exactly as before.
     */
    handlePaste(_view, event) {
        const file = pickPastedImage(event.clipboardData?.items ?? [])
        if (!file || !props.handleImagePaste) return false
        return props.handleImagePaste(file) !== false
    },
}
</script>

<template>
    <div ref="rootEl" class="relative w-full">
        <UEditor
            v-model="body"
            v-slot="{ editor }"
            :autofocus="autofocus"
            :placeholder="placeholder"
            :image="false"
            :editor-props="editorProps"
            :handlers="handlers"
            :starter-kit="{
                heading: false,
                dropcursor: {
                    color: 'var(--ui-primary)',
                    width: 2
                },
                link: {
                    openOnClick: false
                }
            }"
            class="w-full text-sm leading-1 text-(--ui-text)"
            :class="{'pr-8': !isEmpty}"
        >
            <UEditorSuggestionMenu :editor="editor" :items="suggestionItems" :append-to="resolveSuggestionContainer" />
            <UEditorMentionMenu
                v-if="showMentionMenu"
                :editor="editor"
                :items="mentionItems"
                :ignore-filter="true"
                :limit="8"
                :append-to="resolveSuggestionContainer"
                plugin-key="mentionMenu"
                @update:search-term="onMentionSearch"
            />
            <UEditorToolbar layout="bubble" :editor="editor" :items="toolbarItems">
                <template #link>
                    <EditorLinkPopover :editor="editor" />
                </template>
            </UEditorToolbar>
        </UEditor>

        <!-- In-editor overlay area for a floating action (e.g. the comment send button). -->
        <slot :is-empty="isEmpty" />
    </div>
</template>
