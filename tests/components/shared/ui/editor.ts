import type { EditorSuggestionMenuItem, EditorToolbarItem } from '@nuxt/ui'

export const listsSuggestionItems = [
    {
        type: 'label',
        label: 'Lists',
    },
    {
        kind: 'bulletList',
        label: 'Bullet List',
        icon: 'i-lucide-list',
    },
    {
        kind: 'orderedList',
        label: 'Numbered List',
        icon: 'i-lucide-list-ordered',
    },
    {
        kind: 'taskList',
        label: 'Task List',
        icon: 'i-lucide-list-todo',
    },
] satisfies EditorSuggestionMenuItem[]

export const insertsSuggestionItems = [
    {
        type: 'label',
        label: 'Insert',
    },
    {
        kind: 'blockquote',
        label: 'Blockquote',
        icon: 'i-lucide-text-quote',
    },
    {
        kind: 'codeBlock',
        label: 'Code Block',
        icon: 'i-lucide-square-code',
    },
] satisfies EditorSuggestionMenuItem[]

export const commandsSuggestionItems = [
    {
        type: 'label',
        label: 'Edit',
    },
    {
        kind: 'undo',
        label: 'Undo',
        icon: 'i-lucide-undo',
    },
    {
        kind: 'redo',
        label: 'Redo',
        icon: 'i-lucide-redo',
    },
    {
        kind: 'clearFormatting',
        label: 'Clear formatting',
        icon: 'i-lucide-eraser',
    },
] satisfies EditorSuggestionMenuItem[]

export const marksToolbarItems = [
    {
        kind: 'mark',
        mark: 'bold',
        icon: 'i-lucide-bold',
        tooltip: { text: 'Bold' },
    },
    {
        kind: 'mark',
        mark: 'italic',
        icon: 'i-lucide-italic',
        tooltip: { text: 'Italic' },
    },
    {
        kind: 'mark',
        mark: 'underline',
        icon: 'i-lucide-underline',
        tooltip: { text: 'Underline' },
    },
    {
        kind: 'mark',
        mark: 'strike',
        icon: 'i-lucide-strikethrough',
        tooltip: { text: 'Strikethrough' },
    },
    {
        kind: 'mark',
        mark: 'code',
        icon: 'i-lucide-code',
        tooltip: { text: 'Code' },
    },
] satisfies EditorToolbarItem[]

export const linkToolbarItems = [
    {
        slot: 'link' as const,
    },
] satisfies EditorToolbarItem[]
