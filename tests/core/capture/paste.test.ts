import { describe, expect, it } from 'vitest'
import { pickPastedImage } from '@/core/capture/paste'

function imageFile(name = 'shot.png'): File {
    return new File(['png-bytes'], name, { type: 'image/png' })
}

/** Plain-object item - used for edge cases happy-dom's DataTransfer cannot express. */
function makeItem(kind: string, type: string, file: File | null = null): DataTransferItem {
    return { kind, type, getAsFile: () => file } as unknown as DataTransferItem
}

describe('pickPastedImage', () => {
    it('returns the first image file from a DataTransferItemList', () => {
        const dt = new DataTransfer()
        dt.items.add('plain text', 'text/plain')
        const png = imageFile()
        dt.items.add(png)
        dt.items.add(imageFile('second.png'))

        expect(pickPastedImage(dt.items)).toBe(png)
    })

    it('skips non-image items and returns the first image file from a plain array', () => {
        const dt = new DataTransfer()
        dt.items.add('plain text', 'text/plain')
        dt.items.add(new File(['pdf-bytes'], 'doc.pdf', { type: 'application/pdf' }))
        dt.items.add(imageFile())
        dt.items.add(imageFile('second.png'))

        const items: readonly DataTransferItem[] = Array.from(dt.items)
        expect(pickPastedImage(items)).toBe(items[2].getAsFile())
    })

    it('returns null when the clipboard holds no image file', () => {
        expect(pickPastedImage([])).toBeNull()

        const dt = new DataTransfer()
        dt.items.add('plain text', 'text/plain')
        dt.items.add(new File(['pdf-bytes'], 'doc.pdf', { type: 'application/pdf' }))
        expect(pickPastedImage(dt.items)).toBeNull()
    })

    it('returns null when getAsFile() returns null for the image item', () => {
        expect(pickPastedImage([makeItem('file', 'image/png')])).toBeNull()
    })

    it('ignores null items', () => {
        const png = imageFile()
        const items = [null, makeItem('file', 'image/png', png)] as unknown as readonly DataTransferItem[]
        expect(pickPastedImage(items)).toBe(png)
    })

    it('skips image-prefixed items that are not files', () => {
        const png = imageFile()
        const dt = new DataTransfer()
        dt.items.add('image/png as text', 'image/png')
        dt.items.add(png)
        expect(pickPastedImage(dt.items)).toBe(png)
    })
})
