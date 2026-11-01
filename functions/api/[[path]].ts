// Cloudflare Pages Function: /api/* (catch-all)
// 转发 TMDB API 到 https://api.themoviedb.org/* (透传 Authorization 等请求头)
// 并在出口统一清洗 TMDB 被 vandalize 的垃圾内容（片名/人名/简介的色情、赌博、推广字）

interface PagesContext {
  request: Request
}

// ---------- 垃圾内容识别 ----------
// 推广域名 / 网址特征（含 www. 前缀、全角点、带空格的点，整段域名一次吃干净）
const SPAM_URL_RE =
  /https?:\/\/|(?:www\s*[．.]\s*)?[a-z0-9一-龥]{2,}\s*[．.]\s*(?:com|net|org|tv|cc|cn|xyz|top|vip|me|info|live|site|fun|app|online|shop|mobi|ee|pw|su|ws|io|be|la|gg|pro|club|work|sbs|xin|ren|wang)\b/i

// 高确定性色情 / 赌博 / 引流黑名单（只列不会出现在正经片名/人名/简介里的词，避免误伤）
const SPAM_WORDS = [
  '色情', '淫片', '黄片', '黄涩', '福利', '麻豆', '三级', '情色',
  '性爱', '裸聊', '裸舞', '巨乳', '肛交', '性交', '手淫', '强奸', '春药',
  '约炮', '援交', '一丝不挂', '走光', '肉欲', '禁片', '抢鲜', '破解版',
  '会员专享', '现金网', '博彩', '葡京', '网络赌博', '赌博',
  '在线观看', '免费观看', '免费看', '手机观看', '在线看片',
  '加微信', '微信', '扫码', '网盘群', '资源群', '最新网址', '备用网址',
  '永久发布', '抢先版', '无码', '有码',
  'Porn', 'porn', 'XXX', 'xxx', 'Adult', 'adult', 'Hentai', 'hentai', 'Sex', 'sex',
]

function isSpam(value: string): boolean {
  if (!value) return false
  return SPAM_URL_RE.test(value) || SPAM_WORDS.some((w) => value.includes(w))
}

// 文本字段：剥离垃圾片段（保留其余可读内容）
function stripSpam(value: string): string {
  let out = value.replace(SPAM_URL_RE, ' ')
  out = out.replace(new RegExp(SPAM_WORDS.join('|'), 'gi'), ' ')
  out = out.replace(/\s{2,}/g, ' ').trim()
  return out
}

// 需要整体判定的「标签」字段（片名/人名）
const LABEL_FIELDS = ['title', 'name', 'original_title', 'original_name']
// 需要局部剥离的「文本」字段（简介/传记等）
const TEXT_FIELDS = ['overview', 'biography', 'tagline', 'description', 'bio']

// 一个对象（电影/演员等）若其标签字段是垃圾，则整条剔除
function isItemSpam(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  return LABEL_FIELDS.some((f) => typeof o[f] === 'string' && isSpam(o[f] as string))
}

// 递归清洗 TMDB 返回结构
function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) {
    // 先剔除整条垃圾条目，再递归清洗其余
    return value.filter((v) => !isItemSpam(v)).map((v) => sanitize(v))
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      if (LABEL_FIELDS.includes(k) && typeof v === 'string') {
        // 标签字段：垃圾则清空（非数组内顶层条目，无法整条剔除）
        out[k] = isSpam(v) ? '' : v
      } else if (TEXT_FIELDS.includes(k) && typeof v === 'string') {
        out[k] = stripSpam(v)
      } else {
        out[k] = sanitize(v)
      }
    }
    return out
  }
  return value
}

export const onRequest = async ({ request }: PagesContext) => {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/api/, '')
  const target = `https://api.themoviedb.org${path}${url.search}`
  const headers = new Headers(request.headers)
  headers.delete('host')

  const response = await fetch(target, { method: request.method, headers })
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const contentType = response.headers.get('content-type') || ''
  // 仅对 JSON 响应做清洗；非 JSON（理论上没有）原样透传
  if (contentType.includes('application/json')) {
    try {
      const data = await response.json()
      const cleaned = sanitize(data)
      return new Response(JSON.stringify(cleaned), {
        status: response.status,
        statusText: response.statusText,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      })
    } catch {
      // 解析失败则退回原样透传
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      ...corsHeaders,
      'Content-Type': contentType || 'application/json',
    },
  })
}
