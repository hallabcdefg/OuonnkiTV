// Cloudflare Pages Function: /tmdb-api/*
// 转发 TMDB API 请求到 https://api.themoviedb.org/*
// 按原路径一对一转发(不硬编码 /3),避免与前端拼接的 /3 重复

interface PagesContext {
  request: Request
}

export const onRequest = async ({ request }: PagesContext) => {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/tmdb-api/, '')
  const target = `https://api.themoviedb.org${path}${url.search}`

  const headers = new Headers(request.headers)
  headers.delete('host')

  const response = await fetch(target, { method: request.method, headers })

  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      ...corsHeaders,
      'Content-Type': response.headers.get('content-type') || 'application/json',
    },
  })
}
