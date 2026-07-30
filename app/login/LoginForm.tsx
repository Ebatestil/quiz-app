'use client'

import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Field } from '@/components/AppShell'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const wasDisabled = searchParams.get('disabled') === '1'

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(wasDisabled ? 'Account disabled' : null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const title = useMemo(() => (mode === 'login' ? 'Login' : 'Create account'), [mode])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setSubmitting(true)
    const supabase = createClient()

    try {
      if (mode === 'login') {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
        if (signInError) {
          setError(signInError.message)
          return
        }

        // Mirrors the Laravel disabled-account check.
        const { data: profile } = await supabase
          .from('profiles')
          .select('disabled_at')
          .eq('id', data.user.id)
          .single()

        if (profile?.disabled_at) {
          await supabase.auth.signOut()
          setError('Account disabled')
          return
        }

        router.replace('/')
        router.refresh()
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { name } },
        })
        if (signUpError) {
          setError(signUpError.message)
          return
        }

        if (!data.session) {
          setInfo('Check your email to confirm your account, then log in.')
          setMode('login')
          return
        }

        router.replace('/')
        router.refresh()
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f6f7fb] px-6 py-12 text-slate-900">
      <div className="mx-auto flex min-h-[80vh] max-w-md items-center justify-center">
        <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mx-auto max-w-md">
            <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
              QA
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 text-sm text-slate-500">
              {mode === 'login'
                ? 'Login to continue to your dashboard.'
                : 'Create your account to start making quizzes.'}
            </p>

            {error ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
            ) : null}
            {info ? (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                {info}
              </div>
            ) : null}

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              {mode === 'register' ? (
                <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
              ) : null}

              <Field
                label="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
              />

              <Field
                label="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                required
                minLength={6}
              />

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-medium text-white hover:bg-violet-500 disabled:opacity-60"
              >
                {submitting ? 'Please wait...' : mode === 'login' ? 'Login' : 'Register'}
              </button>
            </form>

            <button
              className="mt-4 text-sm font-medium text-violet-600 hover:text-violet-700"
              onClick={() => {
                setError(null)
                setInfo(null)
                setMode((m) => (m === 'login' ? 'register' : 'login'))
              }}
              type="button"
            >
              {mode === 'login' ? 'Need an account?' : 'Have an account?'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export { LoginForm }
