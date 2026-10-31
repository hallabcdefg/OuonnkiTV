// Cloudflare Pages Function
// 部署到 Cloudflare Pages 时，此文件会自动处理 /proxy 路由
// 注意：Cloudflare Workers 环境不支持直接导入 src 模块，需要内联核心逻辑（含签名校验）

interface Context {
  request: Request
  env: unknown
  params: unknown
}

const DEFAULT_PROXY_TIMEOUT_MS = 15000
const MIN_PROXY_TIMEOUT_MS = 1000
const MAX_PROXY_TIMEOUT_MS = 120000

function getProxyTimeoutMs(env: unknown): number {
  const envObj = env && typeof env === 'object' ? (env as Record<string, unknown>) : {}
  const rawTimeout = envObj.PROXY_TIMEOUT_MS
  const parsed = Number(rawTimeout)

  if (!Number.isFinite(parsed)) {
    return DEFAULT_PROXY_TIMEOUT_MS
  }
  return Math.min(MAX_PROXY_TIMEOUT_MS, Math.max(MIN_PROXY_TIMEOUT_MS, Math.floor(parsed)))
}

function getProxyWindowMs(env: unknown): number {
  const envObj = env && typeof env === 'object' ? (env as Record<string, unknown>) : {}
  const parsed = Number(envObj.PROXY_SIGN_WINDOW_MS)
  if (!Number.isFinite(parsed)) return 300000
  return Math.floor(parsed)
}

function getEnvSecret(env: unknown): string {
  const envObj = env && typeof env === 'object' ? (env as Record<string, unknown>) : {}
  const v = envObj.OKI_PROXY_SECRET
  return typeof v === 'string' && v.length > 0 ? v : ''
}

function parseProxyError(error: unknown): {
  message: string
  cause?: { name?: string; code?: string; message?: string }
} {
  const typedError = error as Error & { cause?: unknown }
  const payload: {
    message: string
    cause?: { name?: string; code?: string; message?: string }
  } = {
    message: typedError instanceof Error ? typedError.message : 'Unknown error',
  }

  if (!(typedError instanceof Error) || !typedError.cause || typeof typedError.cause !== 'object') {
    return payload
  }

  const cause = typedError.cause as { name?: unknown; code?: unknown; message?: unknown }
  const parsedCause: { name?: string; code?: string; message?: string } = {}

  if (typeof cause.name === 'string') {
    parsedCause.name = cause.name
  }
  if (typeof cause.code === 'string' || typeof cause.code === 'number') {
    parsedCause.code = String(cause.code)
  }
  if (typeof cause.message === 'string') {
    parsedCause.message = cause.message
  }

  if (Object.keys(parsedCause).length > 0) {
    payload.cause = parsedCause
  }
  return payload
}

/** HMAC-SHA256（Web Crypto），输出 hex 小写 */
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/** 常量时间比较（防时序侧信道） */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * 校验代理请求签名（与前端算法一致）。
 * 待签名串：`${t}\n${targetUrl}`；空密钥视为降级，跳过校验。
 */
async function verifySignature(params: {
  targetUrl: string
  t: string | null
  sig: string | null
  secret: string
  windowMs: number
}): Promise<{ ok: boolean; reason?: string }> {
  const { targetUrl, t, sig, secret, windowMs } = params
  if (!secret) return { ok: true }
  if (!t || !sig) return { ok: false, reason: 'missing_params' }
  const tNum = Number(t)
  if (!Number.isInteger(tNum)) return { ok: false, reason: 'bad_timestamp' }
  if (Math.abs(Date.now() - tNum) > windowMs) return { ok: false, reason: 'expired' }
  const expected = await hmacSha256Hex(secret, `${tNum}\n${targetUrl}`)
  if (!constantTimeEqual(expected, sig)) return { ok: false, reason: 'signature_mismatch' }
  return { ok: true }
}

// 内联核心代理逻辑（Cloudflare Workers 环境限制）
async function handleProxyRequest(targetUrl: string, timeoutMs: number): Promise<Response> {
  try {
    new URL(targetUrl)
  } catch {
    throw new Error('Invalid URL format')
  }

  const response = await fetch(targetUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
    },
    signal: AbortSignal.timeout(timeoutMs),
  })

  return response
}

const UNAUTHORIZED_BODY = JSON.stringify({
  error: 'Unauthorized',
  message: 'Invalid or expired proxy signature',
})

export const onRequest = async (context: Context) => {
  const url = new URL(context.request.url)
  const targetUrlRaw = url.searchParams.get('url')

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    })
  }

  if (!targetUrlRaw) {
    return new Response(JSON.stringify({ error: 'URL parameter is required' }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    })
  }

  // 签名校验（空密钥降级）
  const secret = getEnvSecret(context.env)
  if (secret) {
    // searchParams.get 已对值做一次解码，得到的即原始目标地址
    const targetUrl = targetUrlRaw
    const t = url.searchParams.get('t')
    const sig = url.searchParams.get('sig')
    const result = await verifySignature({
      targetUrl,
      t,
      sig,
      secret,
      windowMs: getProxyWindowMs(context.env),
    })
    if (!result.ok) {
      return new Response(UNAUTHORIZED_BODY, {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      })
    }
  }

  try {
    const timeoutMs = getProxyTimeoutMs(context.env)
    const response = await handleProxyRequest(targetUrlRaw, timeoutMs)

    // Create a new response with the body from the fetch
    const newResponse = new Response(response.body, response)

    // Add CORS headers
    Object.entries(corsHeaders).forEach(([key, value]) => {
      newResponse.headers.set(key, value)
    })

    return newResponse
  } catch (error) {
    const timeoutMs = getProxyTimeoutMs(context.env)
    const { message, cause } = parseProxyError(error)
    return new Response(JSON.stringify({ error: 'Proxy request failed', message, cause, timeoutMs }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    })
  }
}
