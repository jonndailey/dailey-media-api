const DEFAULT_HEADERS = {
  'Accept': 'application/json'
}

export class HttpError extends Error {
  constructor(message, { status, statusText, body } = {}) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.statusText = statusText
    this.body = body
  }
}

export class HttpClient {
  constructor({ baseUrl, apiKey, getAccessToken, fetchImpl } = {}) {
    if (!baseUrl) {
      throw new Error('HttpClient requires a baseUrl')
    }

    this.baseUrl = baseUrl.replace(/\/$/, '')
    this.apiKey = apiKey || null
    this.getAccessToken = typeof getAccessToken === 'function' ? getAccessToken : null
    this.fetchImpl = fetchImpl || globalThis.fetch?.bind(globalThis)

    if (!this.fetchImpl) {
      throw new Error('Fetch implementation not available. Provide fetchImpl explicitly.')
    }
  }

  async request(path, { method = 'GET', headers = {}, query, body, formData } = {}) {
    const url = this.buildUrl(path, query)
    const requestHeaders = { ...DEFAULT_HEADERS, ...headers }

    let requestBody = body

    if (formData) {
      requestBody = formData
      delete requestHeaders['Content-Type']
    } else if (body && typeof body === 'object' && !(body instanceof ArrayBuffer)) {
      requestBody = JSON.stringify(body)
      requestHeaders['Content-Type'] = requestHeaders['Content-Type'] || 'application/json'
    }

    const authHeaders = await this.buildAuthHeaders()

    const response = await this.fetchImpl(url, {
      method,
      headers: {
        ...requestHeaders,
        ...authHeaders
      },
      body: ['GET', 'HEAD'].includes(method.toUpperCase()) ? undefined : requestBody
    })

    const contentType = response.headers.get('content-type') || ''
    let responseBody = null

    if (contentType.includes('application/json')) {
      responseBody = await response.json().catch(() => ({}))
    } else if (contentType.startsWith('text/')) {
      responseBody = await response.text().catch(() => null)
    }

    if (!response.ok) {
      throw new HttpError(responseBody?.error || response.statusText, {
        status: response.status,
        statusText: response.statusText,
        body: responseBody
      })
    }

    return responseBody
  }

  buildUrl(path, query) {
    const url = new URL(path, this.baseUrl)

    if (query && typeof query === 'object') {
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null) return
        if (Array.isArray(value)) {
          value.forEach((item) => url.searchParams.append(key, item))
        } else {
          url.searchParams.append(key, value)
        }
      })
    }

    return url.toString()
  }

  async buildAuthHeaders() {
    const headers = {}

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
      return headers
    }

    if (this.getAccessToken) {
      const token = await this.getAccessToken()
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
    }

    return headers
  }
}
