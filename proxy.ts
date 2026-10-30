import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  const allowed = path === '/demo' || /^\/q\/[^/]+$/.test(path) || path.startsWith('/api/demo/')
  const response = allowed ? NextResponse.next() : path.startsWith('/api/')
    ? NextResponse.json({ message: 'Unavailable in this demo.' }, { status: 404 })
    : NextResponse.redirect(new URL('/demo', request.url))
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Content-Security-Policy', "connect-src 'self'; form-action 'self'; frame-ancestors 'none'")
  response.headers.set('Referrer-Policy', 'same-origin')
  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static, _next/image (static/image optimization files)
     * - favicon.ico
     * - public assets (svg, png, jpg, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
