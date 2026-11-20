import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@insforge/sdk/ssr/middleware'

// Keeps the InsForge session fresh (admin pages and signed-in customers).
// Only talks to InsForge when the access token is missing/expiring and a
// refresh cookie exists, so guest visitors pay no extra cost.
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
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|gif|txt|xml)$).*)'],
}
