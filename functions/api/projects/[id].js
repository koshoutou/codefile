import { jsonResponse } from '../../_utils.js';

// PATCH /api/projects/:id - 更新项目（名称/自定义路径）
export async function onRequestPatch(context) {
  const { request, env, params } = context;

  const projectId = params.id;
  if (!projectId) {
    return jsonResponse({ error: '项目ID不能为空' }, 400);
  }

  const projectData = await env.CODEFILE_KV.get(`proj:${projectId}`);
  if (!projectData) {
    return jsonResponse({ error: '项目不存在' }, 404);
  }

  const project = JSON.parse(projectData);

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: '请求格式错误' }, 400);
  }

  // Update name
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      return jsonResponse({ error: '项目名不能为空' }, 400);
    }
    project.name = name;
  }

  // Update slug
  if (body.slug !== undefined) {
    const newSlug = body.slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');

    // If clearing slug
    if (!newSlug) {
      if (project.slug) {
        await env.CODEFILE_KV.delete(`slug:${project.slug}`);
        delete project.slug;
      }
    } else {
      // Check if slug is taken by another project
      const existingProjectId = await env.CODEFILE_KV.get(`slug:${newSlug}`);
      if (existingProjectId && existingProjectId !== projectId) {
        return jsonResponse({ error: '该自定义路径已被其他项目使用' }, 400);
      }
      // Remove old slug mapping if exists
      if (project.slug && project.slug !== newSlug) {
        await env.CODEFILE_KV.delete(`slug:${project.slug}`);
      }
      project.slug = newSlug;
      await env.CODEFILE_KV.put(`slug:${newSlug}`, projectId);
    }
  }

  await env.CODEFILE_KV.put(`proj:${projectId}`, JSON.stringify(project));

  const publicSlug = project.slug || projectId;
  return jsonResponse({
    success: true,
    project,
    public_url: `/web/api=${publicSlug}`,
  });
}

// DELETE /api/projects/:id - 删除项目
export async function onRequestDelete(context) {
  const { env, params } = context;

  const projectId = params.id;

  if (!projectId) {
    return jsonResponse({ error: '项目ID不能为空' }, 400);
  }

  // Verify project exists
  const projectData = await env.CODEFILE_KV.get(`proj:${projectId}`);
  if (!projectData) {
    return jsonResponse({ error: '项目不存在' }, 404);
  }

  const project = JSON.parse(projectData);

  // Delete slug mapping if exists
  if (project.slug) {
    await env.CODEFILE_KV.delete(`slug:${project.slug}`);
  }

  // Delete project from KV
  await env.CODEFILE_KV.delete(`proj:${projectId}`);

  // Delete all files from R2
  let listResult = await env.STATIC_ASSETS.list({ prefix: `${projectId}/` });
  for (const object of listResult.objects) {
    await env.STATIC_ASSETS.delete(object.key);
  }

  // Handle pagination
  while (listResult.truncated) {
    listResult = await env.STATIC_ASSETS.list({
      prefix: `${projectId}/`,
      cursor: listResult.cursor,
    });
    for (const object of listResult.objects) {
      await env.STATIC_ASSETS.delete(object.key);
    }
  }

  return jsonResponse({ success: true });
}
