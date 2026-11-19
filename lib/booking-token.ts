// The guest's private booking token is the only key to their booking. It is
// kept in the URL fragment (never sent to servers or analytics) and in this
// browser's localStorage so the Stripe return page can find it again.
const KEY = (reference: string) => `fixora:booking:${reference.toUpperCase()}`

export function rememberBookingToken(reference: string, token: string) {
  try {
    localStorage.setItem(KEY(reference), token)
  } catch {
    /* storage unavailable */
  }
}

export function recallBookingToken(reference: string): string | null {
  try {
    return localStorage.getItem(KEY(reference))
  } catch {
    return null
  }
}
