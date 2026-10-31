/**
 * 请求配置
 */
export interface RequestConfig {
  /** 超时时间（毫秒） */
  timeout?: number
  /** 重试次数 */
  retry?: number
  /** 请求头 */
  headers?: Record<string, string>
  /** 中止信号 */
  signal?: AbortSignal
}

/**
 * 请求适配器接口
 */
export interface RequestAdapter {
  /**
   * 发起请求
   * @param url 请求URL
   * @param config 请求配置
   */
  fetch(url: string, config?: RequestConfig): Promise<Response>
}

/**
 * 代理策略接口
 */
export interface ProxyStrategy {
  /**
   * 应用代理到URL
   * @param url 原始URL
   * @returns 代理后的完整请求 URL（可为 Promise，用于异步签名）
   */
  applyProxy(url: string): string | Promise<string>

  /**
   * 判断是否需要代理
   * @param url URL
   */
  shouldProxy(url: string): boolean
}

/**
 * 默认代理策略：总是代理
 */
export function createDefaultProxyStrategy(proxyUrl: string): ProxyStrategy {
  return {
    applyProxy(url: string): string {
      return proxyUrl + encodeURIComponent(url)
    },
    shouldProxy(): boolean {
      return true
    },
  }
}

/**
 * 无代理策略
 */
export function createNoProxyStrategy(): ProxyStrategy {
  return {
    applyProxy(url: string): string {
      return url
    },
    shouldProxy(): boolean {
      return false
    },
  }
}
