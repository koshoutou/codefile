import { hashPassword, generateUUID, jsonResponse } from '../_utils.js';

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return jsonResponse({ error: '用户名和密码不能为空' }, 400);
    }

    if (username !== env.AUTH_USERNAME) {
      return jsonResponse({ error: '用户名或密码错误' }, 401);
    }

    const hashedPassword = await hashPassword(password, env.PASSWORD_SALT);

    if (hashedPassword !== env.PASSWORD_HASH) {
      return jsonResponse({ error: '用户名或密码错误' }, 401);
    }

    // Generate session token
    const sessionToken = generateUUID();
    const ttl = parseInt(env.SESSION_TTL || '604800');

    // Store session in KV with TTL
    await env.CODEFILE_KV.put(`session:${sessionToken}`, JSON.stringify({
      username,
      created_at: Date.now(),
    }), { expirationTtl: ttl });

    return jsonResponse({ success: true, username }, 200, {
      'Set-Cookie': `session=${sessionToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${ttl}`,
    });
  } catch (error) {
    return jsonResponse({ error: '请求格式错误' }, 400);
  }
}
