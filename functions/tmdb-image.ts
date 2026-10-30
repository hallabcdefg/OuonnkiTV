// Cloudflare Pages Function: /tmdb-image/*
// 转发 TMDB 图片请求到 https://image.tmdb.org/t/p/*

export const onRequest: PagesFunction = async ({ request }) => {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/tmdb-image/, '')
  const target = `https://image.tmdb.org/t/p${path}`

  const response = await fetch(target, { method: 'GET' })

  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') || 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
