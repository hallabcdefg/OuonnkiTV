/**
 * 统一代理核心逻辑（供 Vercel/Netlify/本地中间件复用）
 * 使用 JS 文件确保 Serverless 运行时可直接解析，不依赖 TS 源文件转译。
 */
const DEFAULT_PROXY_TIMEOUT_MS = 15000
const MIN_PROXY_TIMEOUT_MS = 1000
const MAX_PROXY_TIMEOUT_MS = 120000

/**
 * 解析代理超时配置（毫秒）
 */
export function getProxyTimeoutMs(rawTimeout = process.env.PROXY_TIMEOUT_MS) {
  const parsed = Number(rawTimeout)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_PROXY_TIMEOUT_MS
  }
  return Math.min(MAX_PROXY_TIMEOUT_MS, Math.max(MIN_PROXY_TIMEOUT_MS, Math.floor(parsed)))
}

/**
 * 解析 fetch 异常，尽量透传底层 cause 信息
 */
export function parseProxyError(error) {
  const payload = {
    message: error instanceof Error ? error.message : 'Unknown error',
  }

  if (!(error instanceof Error) || !error.cause || typeof error.cause !== 'object') {
    return payload
  }

  const cause = error.cause
  const parsedCause = {}

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

export async function handleProxyRequest(targetUrl) {
  try {
    new URL(targetUrl)
  } catch {
    throw new Error('Invalid URL format')
  }

  const timeoutMs = getProxyTimeoutMs()
  return fetch(targetUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
    },
    signal: AbortSignal.timeout(timeoutMs),
  })
}

export function getTargetUrl(url) {
  const urlObj = new URL(url, 'http://localhost')
  const targetUrl = urlObj.searchParams.get('url')

  if (!targetUrl) {
    throw new Error('URL parameter is required')
  }

  return decodeURIComponent(targetUrl)
}

/**
 * HMAC-SHA256（Web Crypto），输出 hex 小写。
 * 同时兼容浏览器 / Cloudflare Workers / Node18+ 的全局 crypto。
 */
async function hmacSha256Hex(secret, message) {
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
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * 常量时间字符串比较（防时序侧信道）。长度不同直接判否。
 */
function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false
  }
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/**
 * 解析签名时间窗口（毫秒），缺省 300000（5 分钟）。
 */
export function getProxyWindowMs(raw) {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return 300000
  return Math.floor(parsed)
}

/**
 * 校验代理请求签名。
 * 待签名串： `${t}\n${targetUrl}`（targetUrl 为解码后的原始目标地址）。
 * 空密钥视为降级：跳过校验，直接放行。
 *
 * @returns {{ ok: boolean, reason?: string }}
 */
export async function verifyProxySignature({
  targetUrl,
  t,
  sig,
  secret,
  windowMs = 300000,
  now = Date.now(),
}) {
  if (!secret) return { ok: true }

  if (!t || !sig) return { ok: false, reason: 'missing_params' }

  const tNum = Number(t)
  if (!Number.isInteger(tNum)) return { ok: false, reason: 'bad_timestamp' }

  if (Math.abs(now - tNum) > windowMs) return { ok: false, reason: 'expired' }

  const expected = await hmacSha256Hex(secret, `${tNum}\n${targetUrl}`)
  if (!constantTimeEqual(expected, sig)) return { ok: false, reason: 'signature_mismatch' }

  return { ok: true }
}
