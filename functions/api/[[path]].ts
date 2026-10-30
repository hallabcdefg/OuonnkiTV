// Cloudflare Pages Function: /api/* (catch-all)
// 转发 TMDB API 到 https://api.themoviedb.org/* (透传 Authorization 等请求头)
interface PagesContext { request: Request }
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
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: {
      ...corsHeaders,
      'Content-Type': response.headers.get('content-type') || 'application/json',
    },
  })
}
