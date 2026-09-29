'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AttemptPayload } from '@/lib/types'

export function AttemptTimer({
  attempt,
  onDeadline,
  onComplete,
}: {
  attempt: AttemptPayload
  onDeadline: () => void
  onComplete: (result: AttemptPayload) => void
}) {
  const [seconds, setSeconds] = useState<number | null>(null)
  const [error, setError] = useState(false)
  const callbacks = useRef({ onDeadline, onComplete })
  useEffect(() => {
    callbacks.current = { onDeadline, onComplete }
  }, [onDeadline, onComplete])

  useEffect(() => {
    if (!attempt.expires_at || attempt.completed_at) return
    const duration = Math.max(
      0,
      Date.parse(attempt.expires_at) - Date.parse(attempt.server_now),
    )
    const deadline = Date.now() + duration
    let cancelled = false
    let pending = false
    let nextRetry = 0
    async function tick() {
      if (cancelled) return
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
      setSeconds(remaining)
      if (remaining > 0) return
      callbacks.current.onDeadline()
      if (pending || Date.now() < nextRetry) return
      pending = true
      try {
        // The server decides when the deadline has passed, even if the device clock changes.
        const { data, error } = await createClient().rpc('get_attempt', {
          p_attempt_id: attempt.id,
        })
        if (cancelled) return
        if (error) throw error
        if (data?.completed_at) {
          cancelled = true
          callbacks.current.onComplete(data as AttemptPayload)
        }
        setError(false)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        pending = false
        nextRetry = Date.now() + 5000
      }
    }
    void tick()
    const interval = window.setInterval(() => {
      void tick()
    }, 1000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [attempt.id, attempt.expires_at, attempt.completed_at, attempt.server_now])

  if (!attempt.expires_at || attempt.completed_at) return null
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
      <span
        role="timer"
        aria-label="Time remaining"
        className="font-semibold tabular-nums"
      >
        {seconds === null
          ? 'Loading timer…'
          : `Time left: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}
      </span>
      {seconds === 0 && (
        <p role="status" className="mt-1">
          Time is up. Submitting saved answers…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-red-600">
          Unable to confirm submission. Reconnect to the internet; we’ll retry
          automatically. Answers are locked.
        </p>
      )}
    </div>
  )
}
