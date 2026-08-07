import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeVideoApi } from '@/resources/video/api'
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

describe('makeVideoApi', () => {
    it('fetches a video via GET report/{reportId}/video', async () => {
        const client = createClient()
        await makeVideoApi(client).show('r1')
        expect(client.get).toHaveBeenCalledWith('report/r1/video')
    })

    it('uploads an mp4 blob as "video" with a .mp4 filename', async () => {
        vi.stubGlobal('FormData', FakeFormData)
        const client = createClient()
        const blob = new Blob(['x'], { type: 'video/mp4' })
        await makeVideoApi(client).store('r1', blob)

        expect(client.post).toHaveBeenCalledWith('report/r1/video', expect.any(FakeFormData), { isFormData: true })
        const formData = client.post.mock.calls[0][1] as FakeFormData
        expect(formData.calls).toHaveLength(1)
        expect(formData.calls[0]).toMatchObject({ name: 'video', filename: 'video.mp4' })
        expect(formData.calls[0].value).toBe(blob)
    })

    it('uploads a webm blob as "video" with a .webm filename', async () => {
        vi.stubGlobal('FormData', FakeFormData)
        const client = createClient()
        const blob = new Blob(['x'], { type: 'video/webm' })
        await makeVideoApi(client).store('r1', blob)

        const formData = client.post.mock.calls[0][1] as FakeFormData
        expect(formData.calls[0]).toMatchObject({ name: 'video', filename: 'video.webm' })
    })

    it('falls back to .webm for any non-mp4 MIME type', async () => {
        vi.stubGlobal('FormData', FakeFormData)
        const client = createClient()
        await makeVideoApi(client).store('r1', new Blob(['x'], { type: 'video/ogg' }))

        const formData = client.post.mock.calls[0][1] as FakeFormData
        expect(formData.calls[0]).toMatchObject({ name: 'video', filename: 'video.webm' })
    })
})
