type FullscreenDoc = Document & {
  webkitFullscreenEnabled?: boolean
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void>
}

export function fullscreenAvailability(): 'available' | 'unsupported' | 'blocked' {
  const target = document.documentElement as FullscreenEl
  const doc = document as FullscreenDoc
  const standard = typeof target.requestFullscreen === 'function'
  if (!standard && typeof target.webkitRequestFullscreen !== 'function') return 'unsupported'
  const enabled = standard ? doc.fullscreenEnabled : doc.webkitFullscreenEnabled
  return enabled === false ? 'blocked' : 'available'
}
type FullscreenEl = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>
}

export async function requestFullscreen(el: HTMLElement = document.documentElement) {
  const target = el as FullscreenEl
  if (target.requestFullscreen) {
    await target.requestFullscreen()
  } else if (target.webkitRequestFullscreen) {
    await target.webkitRequestFullscreen()
  } else {
    throw new Error('Fullscreen not supported')
  }
}

export function isFullscreen(): boolean {
  const doc = document as FullscreenDoc
  return !!(document.fullscreenElement || doc.webkitFullscreenElement)
}

export async function exitFullscreen() {
  const doc = document as FullscreenDoc
  try {
    if (document.fullscreenElement && document.exitFullscreen) {
      await document.exitFullscreen()
    } else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) {
      await doc.webkitExitFullscreen()
    }
  } catch {
    // Ignore — nothing more we can do if the browser refuses.
  }
}
