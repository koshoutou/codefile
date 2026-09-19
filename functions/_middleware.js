import { getCookie, jsonResponse } from './_utils.js';

export async function onRequest(context) {
  const { request, env } = context;

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const url = new URL(request.url);
  const path = url.pathname;

  // Public routes that don't need auth
  const publicPaths = ['/api/auth', '/api/logout'];
  const isPublic = publicPaths.some(p => path === p);

  // Check auth for /api/ routes (except public ones)
  if (path.startsWith('/api/') && !isPublic) {
    const sessionToken = getCookie(request, 'session');

    if (!sessionToken) {
      return jsonResponse({ error: '未登录' }, 401);
    }

    const sessionData = await env.CODEFILE_KV.get(`session:${sessionToken}`);

    if (!sessionData) {
      return jsonResponse({ error: '会话已过期' }, 401);
    }

    // Attach auth info to context
    context.data = context.data || {};
    context.data.authenticated = true;
    context.data.sessionToken = sessionToken;
  }

  // Continue to next handler
  return context.next();
}
