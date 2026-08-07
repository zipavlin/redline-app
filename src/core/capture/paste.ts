/**
 * Clipboard-image helpers for the `paste` event path. Unlike `navigator.clipboard`
 * reads, reading `event.clipboardData` inside a paste handler needs no clipboard
 * permissions - the browser already granted access by delivering the event.
 */

/**
 * Pick the first pasted image file from a clipboard item list.
 *
 * Returns the FIRST item whose `kind === 'file'` and whose `type` starts with
 * `image/`, resolved via `getAsFile()`; `null` when the clipboard holds no image
 * file. Null items and null `getAsFile()` results are guarded.
 */
export function pickPastedImage(items: DataTransferItemList | readonly DataTransferItem[]): File | null {
    for (const item of items) {
        if (!item || item.kind !== 'file' || !item.type.startsWith('image/')) continue
        return item.getAsFile() ?? null
    }
    return null
}
