'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'

type NavItem = {
  label: string
  to: string
}

export function AppShell(props: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  profile: Profile
  children: React.ReactNode
}) {
  const { profile } = props
  const router = useRouter()
  const pathname = usePathname()

  const items: NavItem[] = profile.is_admin
    ? [
        { label: 'Dashboard', to: '/' },
        { label: 'Users', to: '/admin/users' },
      ]
    : [{ label: 'Dashboard', to: '/' }]

  async function logout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#f6f7fb] text-slate-900">
      <div className="flex min-h-screen w-full">
        <aside className="hidden w-64 border-r border-slate-200 bg-white px-5 py-6 lg:block">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-sm font-bold text-white">
              QA
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Quiz App</div>
              <div className="text-xs text-slate-500">{profile.is_admin ? 'Admin panel' : ''}</div>
            </div>
          </div>

          <nav className="mt-8 flex flex-col gap-2">
            {items.map((item) => {
              const active = pathname === item.to
              return (
                <Link
                  key={item.label}
                  href={item.to}
                  className={[
                    'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition',
                    active
                      ? 'bg-violet-50 text-violet-700'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                  ].join(' ')}
                >
                  <span className="h-2 w-2 rounded-full bg-current" />
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Signed in</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">{profile.name}</div>
            <div className="text-xs text-slate-500">{profile.email}</div>
          </div>

          <button
            onClick={logout}
            className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Logout
          </button>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="border-b border-slate-200 bg-white px-5 py-4 sm:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-600">
                  {profile.is_admin ? 'Admin view' : 'User dashboard'}
                </div>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{props.title}</h1>
                {props.subtitle ? <p className="mt-1 text-sm text-slate-500">{props.subtitle}</p> : null}
              </div>
              <div className="flex flex-wrap items-center gap-3">{props.actions}</div>
            </div>
          </header>

          <main className="flex-1 px-5 py-6 sm:px-8">{props.children}</main>
        </div>
      </div>
    </div>
  )
}

export function Surface(props: {
  title?: string
  subtitle?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={['rounded-3xl border border-slate-200 bg-white p-5 shadow-sm', props.className ?? ''].join(' ')}>
      {props.title ? (
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-900">{props.title}</h2>
          {props.subtitle ? <p className="mt-1 text-sm text-slate-500">{props.subtitle}</p> : null}
        </div>
      ) : null}
      {props.children}
    </section>
  )
}

export function Field(props: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  const { label, className, ...rest } = props
  return (
    <label className="flex flex-col gap-1.5">
      {label ? <span className="text-sm font-medium text-slate-700">{label}</span> : null}
      <input
        {...rest}
        className={[
          'rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-500',
          className ?? '',
        ].join(' ')}
      />
    </label>
  )
}

export function Area(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  const { label, className, ...rest } = props
  return (
    <label className="flex flex-col gap-1.5">
      {label ? <span className="text-sm font-medium text-slate-700">{label}</span> : null}
      <textarea
        {...rest}
        className={[
          'rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-500',
          className ?? '',
        ].join(' ')}
      />
    </label>
  )
}
