import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const protectedPaths = ['/dashboard', '/onboarding']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Check if the path is protected
  const isProtected = protectedPaths.some((path) =>
    pathname.startsWith(path)
  )

  if (!isProtected) {
    return NextResponse.next()
  }

  // Check for auth token
  const authToken = request.cookies.get('auth_token')?.value

  if (!authToken) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding'],
}
