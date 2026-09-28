'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'

type Notice = { id: number; message: string; tone: 'success' | 'error' }
type Notify = (message: string, tone?: Notice['tone']) => void
const NotificationContext = createContext<Notify>(() => {})

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [notice, setNotice] = useState<Notice | null>(null)
  const nextId = useRef(0)
  const notify = useCallback<Notify>((message, tone = 'success') => {
    setNotice({ id: ++nextId.current, message, tone })
  }, [])

  useEffect(() => {
    if (!notice || notice.tone === 'error') return
    const timer = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(timer)
  }, [notice])

  return (
    <NotificationContext.Provider value={notify}>
      {children}
      {notice && (
        <div
          key={notice.id}
          className={`notification notification-${notice.tone}`}
        >
          <span aria-hidden="true">
            {notice.tone === 'success' ? '✓' : '!'}
          </span>
          <div role={notice.tone === 'error' ? 'alert' : 'status'}>
            {notice.message}
          </div>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => setNotice(null)}
          >
            ×
          </button>
        </div>
      )}
    </NotificationContext.Provider>
  )
}

export const useNotify = () => useContext(NotificationContext)

// Only announce success after the operation resolves. A rejected database or
// network request keeps the current screen and announces the failure instead.
export function useFeedback() {
  const notify = useNotify()
  return useCallback(
    async (operation: () => Promise<void>, success?: string) => {
      try {
        await operation()
        if (success) notify(success)
        return true
      } catch (error) {
        const message =
          error && typeof error === 'object' && 'message' in error
            ? String(error.message)
            : 'Something went wrong. Please try again.'
        notify(message, 'error')
        return false
      }
    },
    [notify],
  )
}
