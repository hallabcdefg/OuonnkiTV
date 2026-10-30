// Cloudflare Pages Function: /img/* (catch-all)
// 转发 TMDB 图片到 https://image.tmdb.org/* (一对一转发, 避免路径重复拼接)
// 必须返回 CORS 头, 否则浏览器 crossorigin <img> 会被跨域策略拦截
interface PagesContext { request: Request }
export const onRequest = async ({ request }: PagesContext) => {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/img/, '')
  const target = `https://image.tmdb.org${path}`
  const response = await fetch(target, { method: 'GET' })
  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
