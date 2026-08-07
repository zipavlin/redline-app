import { getFormattedSeconds } from '@/core/datetime'

/**
 * VideoCapture - screen recording up to 120 seconds.
 *
 * Usage:
 *   const vc = new VideoCapture()
 *   vc.onTick  = (seconds, formattedTime) => ...   // called every second
 *   vc.onReady = (blob) => ...                     // called when recording stops
 *   await vc.start()
 *   vc.stop()         // stop and fire onReady
 *   vc.cancel()       // stop without firing onReady
 *   vc.retake()       // reset, allows another start()
 */
export class VideoCapture {
    #mediaRecorder: MediaRecorder | null       = null
    #chunks: Blob[]                            = []
    #seconds                                  = 0
    #timerId: ReturnType<typeof setInterval> | null = null
    #mimeType                                 = 'video/webm'

    onTick:  ((seconds: number, formattedTime: string) => void) | null = null  // (seconds, formattedTime) => void
    onWarn:  ((secondsRemaining: number) => void) | null               = null  // (secondsRemaining) => void - fires at 15s remaining
    onReady: ((blob: Blob) => void) | null                             = null  // (blob) => void

    get isRecording(): boolean {
        return this.#mediaRecorder?.state === 'recording'
    }

    async start(): Promise<void> {
        if (!navigator.mediaDevices?.getDisplayMedia) {
            throw Object.assign(new Error('Screen capture unavailable'), { code: 'NOT_SUPPORTED' })
        }
        if (!window.isSecureContext) {
            throw Object.assign(new Error('Screen capture requires HTTPS'), { code: 'NOT_SECURE' })
        }

        let stream: MediaStream
        try {
            stream = await navigator.mediaDevices.getDisplayMedia({
                video: { displaySurface: 'browser' },
                audio: false,
                preferCurrentTab: true,
            } as DisplayMediaStreamOptions)
        } catch (err) {
            throw Object.assign(err as Error, { code: (err as Error).name === 'NotAllowedError' ? 'DENIED' : 'FAILED' })
        }

        // Pick best supported MIME type
        const candidateMimeTypes = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4']
        this.#mimeType = candidateMimeTypes.find(mime => MediaRecorder.isTypeSupported(mime)) || ''

        this.#chunks  = []
        this.#seconds = 0

        const opts: MediaRecorderOptions = this.#mimeType ? { mimeType: this.#mimeType } : {}
        this.#mediaRecorder = new MediaRecorder(stream, opts)
        this.#mediaRecorder.ondataavailable = e => { if (e.data?.size) this.#chunks.push(e.data) }

        this.#startTimer()

        this.#mediaRecorder.start(1000)
        stream.getVideoTracks()[0]?.addEventListener('ended', () => this.stop(), { once: true })
    }

    stop(): void {
        this.#finish(false)
    }

    cancel(): void {
        this.#finish(true)
    }

    pause(): void {
        if (this.#mediaRecorder?.state !== 'recording') return
        if (this.#timerId !== null) clearInterval(this.#timerId)
        this.#timerId = null
        this.#mediaRecorder.pause()
    }

    resume(): void {
        if (this.#mediaRecorder?.state !== 'paused') return
        this.#mediaRecorder.resume()
        this.#startTimer()
    }

    retake(): void {
        this.cancel()
        this.#chunks  = []
        this.#seconds = 0
    }

    get isPaused(): boolean {
        return this.#mediaRecorder?.state === 'paused'
    }

    // Private
    #startTimer(): void {
        this.#timerId = setInterval(() => {
            this.#seconds++
            this.onTick?.(this.#seconds, getFormattedSeconds(this.#seconds))
            if (this.#seconds === 105) this.onWarn?.(15)
            if (this.#seconds >= 120)  this.stop()
        }, 1000)
    }

    #finish(cancelled: boolean): void {
        if (!this.#mediaRecorder) return
        if (this.#timerId !== null) clearInterval(this.#timerId)
        this.#timerId = null
        this.#mediaRecorder.stream.getTracks().forEach(t => t.stop())
        this.#mediaRecorder.onstop = () => {
            if (!cancelled && this.#chunks.length) {
                const type = (this.#mimeType || 'video/webm').split(';')[0]
                const blob = new Blob(this.#chunks, { type })
                this.onReady?.(blob)
            }
            this.#mediaRecorder = null
            this.#chunks        = []
        }
        if (this.#mediaRecorder.state !== 'inactive') this.#mediaRecorder.stop()
    }
}
