import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  getProxyTimeoutMs,
  handleProxyRequest,
  parseProxyError,
  verifyProxySignature,
} from '../shared/proxy-core.js'

const UNAUTHORIZED_BODY = { error: 'Unauthorized', message: 'Invalid or expired proxy signature' }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    const { url } = req.query

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL parameter is required' })
    }

    const targetUrl = decodeURIComponent(url)

    // 签名校验（空密钥降级）
    const secret = process.env.OKI_PROXY_SECRET ?? ''
    if (secret) {
      const { ok } = await verifyProxySignature({
        targetUrl,
        t: typeof req.query.t === 'string' ? req.query.t : null,
        sig: typeof req.query.sig === 'string' ? req.query.sig : null,
        secret,
        windowMs: Number(process.env.PROXY_SIGN_WINDOW_MS) || 300000,
      })
      if (!ok) {
        return res.status(401).json(UNAUTHORIZED_BODY)
      }
    }

    const response = await handleProxyRequest(targetUrl)
    const text = await response.text()
    const contentType = response.headers.get('content-type') || 'application/json'

    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=60')
    res.status(response.status).send(text)
  } catch (error) {
    const { message, cause } = parseProxyError(error)
    const timeoutMs = getProxyTimeoutMs()
    res.status(500).json({ error: 'Proxy request failed', message, cause, timeoutMs })
  }
}
