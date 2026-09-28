'use client'

import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Brand, Field, Icon } from '@/components/AppShell'
import { useNotify } from '@/components/Notifications'

function LoginForm() {
  const router = useRouter()
  const notify = useNotify()
  const searchParams = useSearchParams()
  const wasDisabled = searchParams.get('disabled') === '1'
  const isStudentSession = searchParams.get('student') === '1'

  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(
    wasDisabled ? 'Account disabled' : null,
  )
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const title = useMemo(
    () => (mode === 'login' ? 'Welcome back' : 'Create your account'),
    [mode],
  )

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setSubmitting(true)
    const supabase = createClient()

    try {
      if (mode === 'login') {
        const { data, error: signInError } =
          await supabase.auth.signInWithPassword({ email, password })
        if (signInError) {
          setError(signInError.message)
          notify(signInError.message, 'error')
          return
        }

        // Mirrors the Laravel disabled-account check.
        const { data: profile } = await supabase
          .from('profiles')
          .select('disabled_at, is_anonymous')
          .eq('id', data.user.id)
          .single()

        if (!profile || profile.is_anonymous || data.user.is_anonymous || profile.disabled_at) {
          await supabase.auth.signOut()
          const message = profile?.disabled_at ? 'Account disabled.' : 'A workspace account is required.'
          setError(message)
          notify(message, 'error')
          return
        }

        notify('Signed in successfully.')
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
          notify(signUpError.message, 'error')
          return
        }

        if (!data.session) {
          setInfo('Check your email to confirm your account, then log in.')
          notify('Account created. Check your email to confirm your account.')
          setMode('login')
          return
        }

        notify('Account created successfully.')
        router.replace('/')
        router.refresh()
      }
    } catch {
      const message = 'Could not connect. Please try again.'
      setError(message)
      notify(message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-layout">
      <aside className="auth-story">
        <Brand />
        <div className="auth-story-content">
          <span className="eyebrow">A space to teach & learn</span>
          <h2>
            Good learning
            <br />
            starts with
            <br />a question.
          </h2>
          <p>
            Make thoughtful quizzes. Share them with your students. See what
            sticks.
          </p>
        </div>
        <div className="auth-note">Create. Share. Understand.</div>
      </aside>
      <section className="auth-form-side">
        <div className="auth-form">
          <div className="auth-mobile-brand">
            <Brand />
          </div>
          <h1>{title}</h1>
          {isStudentSession && <p role="status" className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">You’re signed in for a student exam. The workspace requires a separate teacher account. To take another exam, open its link from your teacher.</p>}
          <p>
            {mode === 'login'
              ? 'Sign in to your teaching workspace.'
              : 'A fresh page for your next lesson.'}
          </p>
          {error && (
            <div
              role="alert"
              className="mt-5 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}
          {info && (
            <div
              role="status"
              className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"
            >
              {info}
            </div>
          )}
          <form onSubmit={onSubmit} className="space-y-5">
            {mode === 'register' && (
              <Field
                label="Full name"
                autoComplete="name"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            )}
            <Field
              label="Email address"
              autoComplete="email"
              placeholder="you@school.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
            />
            <Field
              label="Password"
              autoComplete={
                mode === 'login' ? 'current-password' : 'new-password'
              }
              placeholder={
                mode === 'login'
                  ? 'Enter your password'
                  : 'At least 6 characters'
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              minLength={6}
            />
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary w-full"
            >
              {submitting
                ? 'Please wait…'
                : mode === 'login'
                  ? 'Sign in'
                  : 'Create account'}
              <Icon name="arrow" />
            </button>
          </form>
          <button
            className="auth-switch"
            onClick={() => {
              setError(null)
              setInfo(null)
              setMode((m) => (m === 'login' ? 'register' : 'login'))
            }}
            type="button"
          >
            {mode === 'login'
              ? 'New here? Create an account'
              : 'Already have an account? Sign in'}
          </button>
          <div className="auth-student-note">
            Taking a quiz? Open the exam link from your teacher.
            <br />
            You don’t need to create an account.
          </div>
        </div>
      </section>
    </main>
  )
}

export { LoginForm }
