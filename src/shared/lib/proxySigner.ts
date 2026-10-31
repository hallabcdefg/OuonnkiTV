import { getPublicEnv } from '@/shared/config/runtimeEnv'

/**
 * 前端代理签名工具（方案一：时间戳 HMAC-SHA256）
 *
 * 设计要点：
 * - 密钥来自构建期环境变量 `OKI_PROXY_SECRET`（经 getPublicEnv 注入到静态产物）；
 * - 密钥为空字符串 / 未配置时返回空签名，调用方不附加 `t`/`sig`（降级，兼容本地开发与未启用校验）；
 * - 待签名串固定为 `${t}\n${targetUrl}`（换行分隔，targetUrl 为解码后的原始目标地址）；
 * - 统一使用浏览器标准 Web Crypto `crypto.subtle`，禁止自实现哈希；
 * - 本工具不感知代理前缀格式，只产出 `t`、`sig` 两个参数。
 */

export interface ProxySignature {
  /** Unix 毫秒时间戳（13 位整数） */
  t: string
  /** HMAC-SHA256 hex 小写 */
  sig: string
}

const EMPTY_SIGNATURE: ProxySignature = { t: '', sig: '' }

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

/**
 * 为单个代理目标地址生成时间戳签名。
 * 密钥缺失时返回空签名（降级）。
 */
export async function signProxyUrl(targetUrl: string): Promise<ProxySignature> {
  const secret = getPublicEnv('OKI_PROXY_SECRET')
  if (!secret) return EMPTY_SIGNATURE

  const t = String(Date.now())
  const sig = await hmacSha256Hex(secret, `${t}\n${targetUrl}`)
  return { t, sig }
}

/** 是否已启用代理签名（密钥存在） */
export function isProxySigningEnabled(): boolean {
  return Boolean(getPublicEnv('OKI_PROXY_SECRET'))
}
