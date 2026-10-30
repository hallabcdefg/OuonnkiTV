// Cloudflare Pages Function: /tmdb-api/*
// 转发 TMDB API 请求到 https://api.themoviedb.org/3/*

export const onRequest: PagesFunction = async ({ request, next }) => {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/tmdb-api/, '')
  const target = `https://api.themoviedb.org/3${path}${url.search}`

  const headers = new Headers(request.headers)
  headers.delete('host')

  const response = await fetch(target, {
    method: request.method,
    headers,
  })

  const corsHeaders = {
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
