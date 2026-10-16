const apiBase = (import.meta.env.VITE_API_URL || 'https://queue-t-pies.onrender.com').replace(/\/$/, '')

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
  if (!response.ok) throw new Error(payload.error || 'Request failed. Please try again.')
  return payload
}
