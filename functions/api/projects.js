import { generateId, jsonResponse } from '../_utils.js';

// GET /api/projects - 列出所有项目
export async function onRequestGet(context) {
  const { env } = context;

  const list = await env.CODEFILE_KV.list({ prefix: 'proj:' });
  const projects = [];

  for (const key of list.keys) {
    const data = await env.CODEFILE_KV.get(key.name);
    if (data) {
      projects.push(JSON.parse(data));
    }
  }

  // Sort by created_at descending
  projects.sort((a, b) => b.created_at - a.created_at);

  return jsonResponse({ projects });
}

// POST /api/projects - 创建项目
export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const { name, slug } = await request.json();

    if (!name || !name.trim()) {
      return jsonResponse({ error: '项目名不能为空' }, 400);
    }

    const projectId = generateId(8);
    const project = {
      id: projectId,
      name: name.trim(),
      created_at: Date.now(),
    };

    // If custom slug provided, validate and set it
    if (slug && slug.trim()) {
      const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
      if (!cleanSlug) {
        return jsonResponse({ error: '自定义路径只能包含字母、数字、下划线和短横线' }, 400);
      }
      // Check if slug already taken
      const existing = await env.CODEFILE_KV.get(`slug:${cleanSlug}`);
      if (existing) {
        return jsonResponse({ error: '该自定义路径已被使用' }, 400);
      }
      project.slug = cleanSlug;
      await env.CODEFILE_KV.put(`slug:${cleanSlug}`, projectId);
    }

    await env.CODEFILE_KV.put(`proj:${projectId}`, JSON.stringify(project));

    const publicSlug = project.slug || projectId;
    return jsonResponse({
      project,
      public_url: `/web/api=${publicSlug}`,
    });
  } catch (error) {
    return jsonResponse({ error: '请求格式错误' }, 400);
  }
}
