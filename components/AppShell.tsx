'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'
import { useFeedback } from './Notifications'

export function Icon({
  name,
  className = '',
}: {
  name:
    'book' | 'grid' | 'users' | 'arrow' | 'plus' | 'search' | 'logout' | 'check'
  className?: string
}) {
  const paths = {
    book: (
      <>
        <path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4z" />
        <path d="M13 7a3 3 0 0 1 3-3h4v15h-3a4 4 0 0 0-4 2" />
      </>
    ),
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v2" />
      </>
    ),
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 5 5" />
      </>
    ),
    logout: (
      <>
        <path d="M10 4H4v16h6M10 12h11m-4-4 4 4-4 4" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
  }
  return (
    <svg
      className={`ui-icon ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <span className={`brand ${light ? 'brand-light' : ''}`}>
      <span className="brand-mark">
        <Icon name="book" />
      </span>
      <span>
        Quiz App<span className="brand-period">.</span>
      </span>
    </span>
  )
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
  const feedback = useFeedback()
  const pathname = usePathname()
  const items = [
    { label: 'My quizzes', to: '/', icon: 'grid' as const },
    { label: 'Classes', to: '/classes', icon: 'users' as const },
    ...(profile.is_admin
      ? [{ label: 'People', to: '/admin/users', icon: 'users' as const }]
      : []),
  ]

  async function logout() {
    await feedback(async () => {
      const { error } = await createClient().auth.signOut()
      if (error) throw error
      router.replace('/login')
      router.refresh()
    }, 'Signed out.')
  }

  return (
    <div className="workspace">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link href="/" aria-label="Quiz App home">
          <Brand light />
        </Link>
        <div className="sidebar-label">Workspace</div>
        <nav className="workspace-nav" aria-label="Main navigation">
          {items.map((item) => {
            const active =
              item.to === '/'
                ? pathname === '/' || pathname.startsWith('/quizzes')
                : pathname.startsWith(item.to)
            return (
              <Link
                key={item.to}
                href={item.to}
                aria-current={active ? 'page' : undefined}
                className={active ? 'nav-active' : ''}
              >
                <Icon name={item.icon} />
                {item.label}
                {active && <span className="nav-dot" />}
              </Link>
            )
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="account">
            <span className="avatar">
              {(profile.name || 'U').slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>{profile.name || 'Your account'}</strong>
              <span>{profile.is_admin ? 'Administrator' : 'Quiz creator'}</span>
            </div>
          </div>
          <button className="logout" onClick={logout}>
            <Icon name="logout" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
      <div className="workspace-body">
        <div className="workspace-topbar">
          <span>
            Workspace <span className="breadcrumb-slash">/</span>{' '}
            {pathname.startsWith('/admin')
              ? 'People'
              : pathname === '/'
                ? 'My quizzes'
                : props.title}
          </span>
          <span className="topbar-account">{profile.email}</span>
        </div>
        <main id="main-content" className="workspace-content">
          <header className="page-heading">
            <div>
              <h1>{props.title}</h1>
              {props.subtitle && <p>{props.subtitle}</p>}
            </div>
            <div className="page-actions">{props.actions}</div>
          </header>
          {props.children}
          <footer className="workspace-footer">
            <span>Quiz App</span>
            <span>One question at a time.</span>
          </footer>
        </main>
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
    <section className={`surface ${props.className ?? ''}`}>
      {props.title && (
        <div className="surface-heading">
          <h2>{props.title}</h2>
          {props.subtitle && <p>{props.subtitle}</p>}
        </div>
      )}
      {props.children}
    </section>
  )
}

export function Field({
  label,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="form-field">
      {label && <span>{label}</span>}
      <input {...rest} className={`form-input ${className ?? ''}`} />
    </label>
  )
}

export function Area({
  label,
  className,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className="form-field">
      {label && <span>{label}</span>}
      <textarea {...rest} className={`form-input ${className ?? ''}`} />
    </label>
  )
}
