export interface Browser {
    name: string
    version: string
    os: string
    viewport_width: number
    viewport_height: number
    device_pixel_ratio?: number
    user_agent?: string
}

// Detects browser name+version and OS from the user-agent string.
export function getBrowserDetails() {
    const ua = navigator.userAgent
    let name = 'Unknown'
    let version = ''
    if (/Edg\/(\d+)/.test(ua)) {
        name = 'Edge'
        version = RegExp.$1
    } else if (/Chrome\/(\d+)/.test(ua) && !/Chromium/.test(ua)) {
        name = 'Chrome'
        version = RegExp.$1
    } else if (/Firefox\/(\d+)/.test(ua)) {
        name = 'Firefox'
        version = RegExp.$1
    } else if (/Version\/(\d+).*Safari/.test(ua) && !/Chrome/.test(ua)) {
        name = 'Safari'
        version = RegExp.$1
    }
    let os = 'Unknown'
    if      (/Windows/.test(ua))            os = 'Windows'
    else if (/Macintosh|Mac OS X/.test(ua)) os = 'macOS'
    else if (/Android/.test(ua))            os = 'Android'
    else if (/iPhone|iPad|iPod/.test(ua))   os = 'iOS'
    else if (/Linux/.test(ua))              os = 'Linux'
    return { name, version, os }
}

/**
 * Capture current browser environment for report submission.
 */
export function getBrowserInfo(): Browser {
    const browserDetails = getBrowserDetails()
    return {
        name:               browserDetails.name,
        version:            browserDetails.version,
        os:                 browserDetails.os,
        viewport_width:     window.innerWidth,
        viewport_height:    window.innerHeight,
        device_pixel_ratio: window.devicePixelRatio || 1,
        user_agent:         navigator.userAgent,
    }
}

/**
 * True when getDisplayMedia is available (secure context + API support).
 * Mobile devices typically lack this API.
 */
export function canCapture(): boolean {
    return !!navigator.mediaDevices?.getDisplayMedia
}
