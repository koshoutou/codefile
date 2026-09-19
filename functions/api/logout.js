import { getCookie, jsonResponse } from '../_utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  const sessionToken = getCookie(request, 'session');

  if (sessionToken) {
    await env.CODEFILE_KV.delete(`session:${sessionToken}`);
  }

  return jsonResponse({ success: true }, 200, {
    'Set-Cookie': 'session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
  });
}
