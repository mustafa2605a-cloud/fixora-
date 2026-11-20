// Only allow same-site relative paths as post-login destinations (no open redirects).
export function safeNextPath(value: string | null | undefined, fallback: string) {
  const v = (value ?? '').trim()
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\') || v.startsWith('/api/')) return fallback
  if (/[\r\n]/.test(v) || v.length > 300) return fallback
  return v
}
