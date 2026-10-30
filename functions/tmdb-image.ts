// Cloudflare Pages Function: /tmdb-image/*
// 转发 TMDB 图片请求到 https://image.tmdb.org/*
// 按原路径一对一转发(不硬编码 /t/p),避免与前端拼接的 /t/p/ 重复

interface PagesContext {
  request: Request
}

export const onRequest = async ({ request }: PagesContext) => {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/tmdb-image/, '')
  const target = `https://image.tmdb.org${path}`

  const response = await fetch(target, { method: 'GET' })

  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
