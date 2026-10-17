const defaultApiUrl = import.meta.env.DEV
  ? 'http://localhost:4000'
  : 'https://queue-t-pies.onrender.com'
const apiBase = (import.meta.env.VITE_API_URL || defaultApiUrl).replace(/\/$/, '')

export async function apiRequest(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.error || 'Request failed. Please try again.')
    error.requestId = payload.requestId || payload.request_id || null
    throw error
  }
  return payload
}
