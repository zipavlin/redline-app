import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VideoCapture } from '@/core/capture/video'

const videoMock = vi.hoisted(() => {
    class FakeMediaStreamTrack {
        listeners: Record<string, Array<() => void>> = {}
        stopped = false
        addEventListener(type: string, fn: () => void) {
            (this.listeners[type] ||= []).push(fn)
        }
        fire(type: string) {
            this.listeners[type]?.forEach(fn => fn())
        }
        stop() {
            this.stopped = true
        }
    }

    class FakeMediaStream {
        track: FakeMediaStreamTrack
        constructor() {
            this.track = new FakeMediaStreamTrack()
        }
        getTracks() {
            return [this.track]
        }
        getVideoTracks() {
            return [this.track]
        }
    }

    class FakeMediaRecorder {
        static isTypeSupported = vi.fn((_mime: string) => true)
        static instances: FakeMediaRecorder[] = []
        state: 'inactive' | 'recording' | 'paused' = 'inactive'
        ondataavailable: ((e: { data: Blob }) => void) | null = null
        onstop: (() => void) | null = null
        stream: FakeMediaStream
        options?: MediaRecorderOptions
        constructor(stream: FakeMediaStream, opts?: MediaRecorderOptions) {
            this.stream = stream
            this.options = opts
            FakeMediaRecorder.instances.push(this)
        }
        start() {
            this.state = 'recording'
        }
        stop() {
            this.state = 'inactive'
            this.onstop?.()
        }
        pause() {
            this.state = 'paused'
        }
        resume() {
            this.state = 'recording'
        }
    }

    return { FakeMediaRecorder, FakeMediaStream, FakeMediaStreamTrack }
})

function recorder(): InstanceType<typeof videoMock.FakeMediaRecorder> {
    const rec = videoMock.FakeMediaRecorder.instances[videoMock.FakeMediaRecorder.instances.length - 1]
    if (!rec) throw new Error('no MediaRecorder instance was created')
    return rec
}

function stubSecureContext(value: boolean) {
    Object.defineProperty(window, 'isSecureContext', { value, configurable: true })
}

function feedChunk(rec: InstanceType<typeof videoMock.FakeMediaRecorder>) {
    rec.ondataavailable?.({ data: new Blob(['frame'], { type: 'video/webm' }) })
}

beforeEach(() => {
    vi.useFakeTimers()
    videoMock.FakeMediaRecorder.instances = []
    videoMock.FakeMediaRecorder.isTypeSupported.mockReturnValue(true)
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.clearAllMocks()
    delete (window as unknown as Record<string, unknown>).isSecureContext
})

describe('VideoCapture start() guards', () => {
    it('rejects with NOT_SUPPORTED when getDisplayMedia is unavailable', async () => {
        vi.stubGlobal('navigator', { mediaDevices: {} })
        stubSecureContext(true)
        const vc = new VideoCapture()
        await expect(vc.start()).rejects.toMatchObject({ code: 'NOT_SUPPORTED' })
    })

    it('rejects with NOT_SECURE outside a secure context', async () => {
        vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: vi.fn() } })
        stubSecureContext(false)
        const vc = new VideoCapture()
        await expect(vc.start()).rejects.toMatchObject({ code: 'NOT_SECURE' })
    })

    it('maps a NotAllowedError rejection to DENIED', async () => {
        vi.stubGlobal('navigator', {
            mediaDevices: {
                getDisplayMedia: vi.fn().mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' })),
            },
        })
        stubSecureContext(true)
        const vc = new VideoCapture()
        await expect(vc.start()).rejects.toMatchObject({ code: 'DENIED' })
    })

    it('maps any other rejection to FAILED', async () => {
        vi.stubGlobal('navigator', {
            mediaDevices: {
                getDisplayMedia: vi.fn().mockRejectedValue(new Error('boom')),
            },
        })
        stubSecureContext(true)
        const vc = new VideoCapture()
        await expect(vc.start()).rejects.toMatchObject({ code: 'FAILED' })
    })
})

describe('VideoCapture recording', () => {
    beforeEach(() => {
        const stream = new videoMock.FakeMediaStream()
        vi.stubGlobal('navigator', {
            mediaDevices: { getDisplayMedia: vi.fn().mockResolvedValue(stream) },
        })
        vi.stubGlobal('MediaRecorder', videoMock.FakeMediaRecorder)
        vi.stubGlobal('MediaStream', videoMock.FakeMediaStream)
        stubSecureContext(true)
    })

    it('starts the recorder with the best supported mime type', async () => {
        videoMock.FakeMediaRecorder.isTypeSupported
            .mockImplementation(mime => mime === 'video/webm')
        const vc = new VideoCapture()
        await vc.start()

        const rec = recorder()
        expect(rec.options).toEqual({ mimeType: 'video/webm' })
        expect(rec.state).toBe('recording')
        expect(vc.isRecording).toBe(true)
        expect(vc.isPaused).toBe(false)
    })

    it('starts the recorder without mime options when none are supported', async () => {
        videoMock.FakeMediaRecorder.isTypeSupported.mockReturnValue(false)
        const vc = new VideoCapture()
        await vc.start()

        expect(recorder().options).toEqual({})
    })

    it('emits ticks every second with formatted time and warns at 15s remaining', async () => {
        const vc = new VideoCapture()
        const onTick = vi.fn()
        const onWarn = vi.fn()
        vc.onTick = onTick
        vc.onWarn = onWarn
        await vc.start()

        vi.advanceTimersByTime(3000)
        expect(onTick).toHaveBeenNthCalledWith(1, 1, '00:01')
        expect(onTick).toHaveBeenNthCalledWith(3, 3, '00:03')
        expect(onWarn).not.toHaveBeenCalled()

        vi.advanceTimersByTime(102_000) // Total 105s.
        expect(onWarn).toHaveBeenCalledWith(15)
    })

    it('auto-stops at 120s and fires onReady with the recorded blob', async () => {
        const vc = new VideoCapture()
        const onReady = vi.fn()
        vc.onReady = onReady
        await vc.start()

        feedChunk(recorder())
        vi.advanceTimersByTime(120_000)

        expect(vc.isRecording).toBe(false)
        expect(onReady).toHaveBeenCalledTimes(1)
        const blob = onReady.mock.calls[0][0] as Blob
        expect(blob).toBeInstanceOf(Blob)
        expect(blob.type).toBe('video/webm')
    })

    it('stop() stops tracks and fires onReady with the blob', async () => {
        const vc = new VideoCapture()
        const onReady = vi.fn()
        vc.onReady = onReady
        await vc.start()

        vi.advanceTimersByTime(2500)
        feedChunk(recorder())
        const stream = recorder().stream
        vc.stop()

        expect(stream.track.stopped).toBe(true)
        expect(onReady).toHaveBeenCalledTimes(1)
        expect((onReady.mock.calls[0][0] as Blob).type).toBe('video/webm')
        expect(vc.isRecording).toBe(false)
    })

    it('cancel() stops without firing onReady', async () => {
        const vc = new VideoCapture()
        const onReady = vi.fn()
        vc.onReady = onReady
        await vc.start()

        feedChunk(recorder())
        vc.cancel()

        expect(recorder().stream.track.stopped).toBe(true)
        expect(onReady).not.toHaveBeenCalled()
    })

    it('stops automatically when the video track ends', async () => {
        const vc = new VideoCapture()
        const onReady = vi.fn()
        vc.onReady = onReady
        await vc.start()

        feedChunk(recorder())
        recorder().stream.track.fire('ended')

        expect(onReady).toHaveBeenCalledTimes(1)
    })

    it('pause() halts ticks and resume() restarts them', async () => {
        const vc = new VideoCapture()
        const onTick = vi.fn()
        vc.onTick = onTick
        await vc.start()

        vi.advanceTimersByTime(2000)
        vc.pause()
        expect(vc.isPaused).toBe(true)

        vi.advanceTimersByTime(5000)
        expect(onTick).toHaveBeenCalledTimes(2)

        vc.resume()
        vi.advanceTimersByTime(1000)
        expect(onTick).toHaveBeenCalledTimes(3)
        expect(onTick).toHaveBeenLastCalledWith(3, '00:03')
        expect(vc.isPaused).toBe(false)
    })

    it('pause()/resume() are no-ops in the wrong state', async () => {
        const vc = new VideoCapture()
        vc.pause()
        expect(vc.isPaused).toBe(false)
        await vc.start()

        vc.resume() // Recording, not paused.
        expect(vc.isRecording).toBe(true)
    })

    it('retake() resets state so start() can be used again', async () => {
        const vc = new VideoCapture()
        const onTick = vi.fn()
        vc.onTick = onTick
        await vc.start()

        vi.advanceTimersByTime(3000)
        vc.retake()

        await vc.start()
        vi.advanceTimersByTime(1000)
        expect(onTick).toHaveBeenLastCalledWith(1, '00:01')
    })
})
