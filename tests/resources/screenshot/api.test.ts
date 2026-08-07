import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeScreenshotApi } from '@/resources/screenshot/api'
import { createClient } from '../support/harness'

/**
 * happy-dom's FormData drops the append() filename argument (blobs come back
 * named "blob"), so the multipart contract is asserted against a recording
 * stand-in: the factory's job is exactly calling append(name, blob, filename).
 */
class FakeFormData {
    calls: Array<{ name: string; value: unknown; filename?: string }> = []
    append(name: string, value: unknown, filename?: string): void {
        this.calls.push({ name, value, filename })
    }
}

afterEach(() => {
    vi.unstubAllGlobals()
})

describe('makeScreenshotApi', () => {
    it('fetches a screenshot via GET report/{reportId}/screenshot', async () => {
        const client = createClient()
        await makeScreenshotApi(client).show('r1')
        expect(client.get).toHaveBeenCalledWith('report/r1/screenshot')
    })

    it('uploads the blob as a multipart field named "screenshot" with a fixed filename', async () => {
        vi.stubGlobal('FormData', FakeFormData)
        const client = createClient()
        const blob = new Blob(['x'], { type: 'image/png' })
        await makeScreenshotApi(client).store('r1', blob)

        expect(client.post).toHaveBeenCalledWith('report/r1/screenshot', expect.any(FakeFormData), { isFormData: true })
        const formData = client.post.mock.calls[0][1] as FakeFormData
        expect(formData.calls).toHaveLength(1)
        expect(formData.calls[0]).toMatchObject({ name: 'screenshot', filename: 'screenshot.png' })
        expect(formData.calls[0].value).toBe(blob)
    })
})
