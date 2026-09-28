import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/login', '/exam']

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + '/'))

  function redirectTo(pathname: string, reason?: string) {
    const url = request.nextUrl.clone()
    url.pathname = pathname
    url.search = ''
    if (reason) url.searchParams.set(reason, '1')
    const redirect = NextResponse.redirect(url)
    response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie))
    return redirect
  }

  // An exam session is authenticated with Supabase, but is not a teacher account.
  // Keep it alive for exams without granting access to the workspace or APIs.
  if (user?.is_anonymous) {
    if (isPublic) return response
    if (path.startsWith('/api/')) {
      return NextResponse.json({ message: 'A workspace account is required.' }, { status: 403 })
    }
    return redirectTo('/login', 'student')
  }

  if (!user && !isPublic) {
    return redirectTo('/login')
  }

  if (user && (!isPublic || path === '/login')) {
    // Mirrors the Laravel "notDisabled" middleware: a disabled account is
    // signed out and bounced to login with an explanatory message.
    const { data: profile } = await supabase
      .from('profiles')
      .select('disabled_at, is_admin, is_anonymous')
      .eq('id', user.id)
      .single()

    if (!profile || profile.is_anonymous) {
      if (path === '/login') return response
      return redirectTo('/login', 'student')
    }

    if (profile.disabled_at) {
      await supabase.auth.signOut()
      return redirectTo('/login', 'disabled')
    }

    if (path.startsWith('/admin') && !profile?.is_admin) {
      return redirectTo('/')
    }
  }

  if (user && path === '/login') {
    return redirectTo('/')
  }

  return response
}
