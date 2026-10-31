import type { Handler, HandlerEvent } from '@netlify/functions'
import {
  getProxyTimeoutMs,
  handleProxyRequest,
  parseProxyError,
  verifyProxySignature,
} from '../../src/shared/lib/proxy'

const UNAUTHORIZED_BODY = JSON.stringify({
  error: 'Unauthorized',
  message: 'Invalid or expired proxy signature',
})

const handler: Handler = async (event: HandlerEvent) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    }
  }

  const { url, t, sig } = event.queryStringParameters || {}

  if (!url) {
    return {
      statusCode: 400,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'URL parameter is required' }),
    }
  }

  // 签名校验（空密钥降级）
  const secret = process.env.OKI_PROXY_SECRET ?? ''
  if (secret) {
    const { ok } = await verifyProxySignature({
      targetUrl: url,
      t: t ?? null,
      sig: sig ?? null,
      secret,
      windowMs: Number(process.env.PROXY_SIGN_WINDOW_MS) || 300000,
    })
    if (!ok) {
      return {
        statusCode: 401,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: UNAUTHORIZED_BODY,
      }
    }
  }

  try {
    const response = await handleProxyRequest(url)
    const text = await response.text()
    const contentType = response.headers.get('content-type') || 'application/json'

    return {
      statusCode: response.status,
      headers: {
        ...headers,
        'Content-Type': contentType,
      },
      body: text,
    }
  } catch (error) {
    const { message, cause } = parseProxyError(error)
    const timeoutMs = getProxyTimeoutMs()
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Proxy request failed', message, cause, timeoutMs }),
    }
  }
}

export { handler }
