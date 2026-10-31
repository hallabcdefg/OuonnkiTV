import type { Plugin } from 'vite'
import {
  handleProxyRequest,
  getProxyTimeoutMs,
  getTargetUrl,
  parseProxyError,
  verifyProxySignature,
} from '../shared/lib/proxy'

export function proxyMiddleware(): Plugin {
  return {
    name: 'proxy-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/proxy')) {
          return next()
        }

        try {
          const targetUrl = getTargetUrl(req.url)

          // 签名校验（空密钥降级，本地未配置 OKI_PROXY_SECRET 时跳过）
          const secret = process.env.OKI_PROXY_SECRET ?? ''
          if (secret) {
            const parsed = new URL(req.url, 'http://localhost')
            const { ok } = await verifyProxySignature({
              targetUrl,
              t: parsed.searchParams.get('t'),
              sig: parsed.searchParams.get('sig'),
              secret,
              windowMs: Number(process.env.PROXY_SIGN_WINDOW_MS) || 300000,
            })
            if (!ok) {
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.writeHead(401, { 'Content-Type': 'application/json' })
              res.end(
                JSON.stringify({
                  error: 'Unauthorized',
                  message: 'Invalid or expired proxy signature',
                }),
              )
              return
            }
          }

          const response = await handleProxyRequest(targetUrl)
          const text = await response.text()
          const contentType = response.headers.get('content-type') || 'application/json'

          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Content-Type', contentType)
          res.writeHead(response.status)
          res.end(text)
        } catch (error) {
          const { message, cause } = parseProxyError(error)
          const timeoutMs = getProxyTimeoutMs()
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Proxy request failed', message, cause, timeoutMs }))
        }
      })
    },
  }
}
