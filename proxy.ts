import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@insforge/sdk/ssr/middleware'

// Keeps the InsForge session fresh for admin pages (Server Components read
// the refreshed cookie). Public pages are not touched.
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request })
  await updateSession({
    baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL,
    anonKey: process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY,
    requestCookies: request.cookies,
    responseCookies: response.cookies,
  })
  return response
}

export const config = {
  matcher: ['/admin/:path*'],
}
