import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const authToken = request.cookies.get('auth-token')?.value
  const isLoginPage = request.nextUrl.pathname.startsWith('/login')

  const isValidToken = authToken === process.env.AUTH_SECRET

  // If not logged in and not on login page, redirect to login
  if (!isValidToken && !isLoginPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // If logged in and trying to access login page, redirect to home
  if (isValidToken && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - logo.png (your custom logo)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|logo.png).*)',
  ],
}