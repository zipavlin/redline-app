<script setup lang="ts">
/**
 * Shared rich-text editor - the common TipTap setup used by the comment composer
 * and every report-body composer (report / annotation / video).
 *
 * Owns the parts that are identical everywhere: the `/` suggestion menu, bubble
 * toolbar, link popover, Ctrl/⌘+Enter submit, autofocus, and the in-shadow portal
 * resolution that keeps the suggestion menu from being clipped by overflow.
 *
 * The model is an HTML string. The host owns the outer wrapper (UChatPrompt / UModal)
 * and the submit button; this component only emits `submit` (on Ctrl/⌘+Enter) and
 * exposes an in-editor slot for a floating action button.
 */
import { computed, ref } from 'vue'
import type { FocusPosition } from '@tiptap/vue-3'
import type { EditorProps } from '@tiptap/pm/view'
import type { EditorSuggestionMenuItem, EditorToolbarItem, EditorCustomHandlers } from '@nuxt/ui'
import { isHtmlEmpty } from '@/core/text'
import { pickPastedImage } from '@/core/capture/paste'
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
}>(), {
    placeholder: '',
    loading: false,
    autofocus: 'end',
    suggestionItems: () => [listsSuggestionItems, insertsSuggestionItems, commandsSuggestionItems],
    toolbarItems: () => [marksToolbarItems, linkToolbarItems],
})

const emit = defineEmits<{ submit: [] }>()

// State
const body = defineModel<string>({ default: '' })
const rootEl = ref<HTMLElement | null>(null)

// Computed
const isEmpty = computed(() => isHtmlEmpty(body.value))

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
