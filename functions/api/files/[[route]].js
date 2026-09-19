import { jsonResponse, getMimeType, isTextFile } from '../../_utils.js';

function safeDecode(str) {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const route = (params.route || []).map(s => safeDecode(s));

  // route[0] = projectId, route[1..] = file path segments
  if (!route || route.length === 0) {
    return jsonResponse({ error: '项目ID不能为空' }, 400);
  }

  const projectId = route[0];
  const filePathParts = route.slice(1);
  const filePath = filePathParts.join('/');

  // Check if project exists
  const projectData = await env.CODEFILE_KV.get(`proj:${projectId}`);
  if (!projectData) {
    return jsonResponse({ error: '项目不存在' }, 404);
  }

  const method = request.method;
  const url = new URL(request.url);

  // PATCH: move/rename file or folder
  if (method === 'PATCH') {
    return handleMoveOrRename(request, env, projectId, filePath);
  }

  // GET: list files, get file content, or download
  if (method === 'GET') {
    // Check for download query param
    if (url.searchParams.get('download') === '1' && filePath) {
      return handleDownload(env, projectId, filePath);
    }

    // List files if no file path
    if (!filePath) {
      const allFiles = [];
      let listResult = await env.STATIC_ASSETS.list({ prefix: `${projectId}/` });

      for (const obj of listResult.objects) {
        const relativePath = obj.key.substring(projectId.length + 1);
        if (relativePath) {
          allFiles.push({
            path: relativePath,
            size: obj.size,
            uploaded: obj.uploaded,
          });
        }
      }

      // Handle pagination
      while (listResult.truncated) {
        listResult = await env.STATIC_ASSETS.list({
          prefix: `${projectId}/`,
          cursor: listResult.cursor,
        });
        for (const obj of listResult.objects) {
          const relativePath = obj.key.substring(projectId.length + 1);
          if (relativePath) {
            allFiles.push({
              path: relativePath,
              size: obj.size,
              uploaded: obj.uploaded,
            });
          }
        }
      }

      return jsonResponse({ files: allFiles });
    }

    // Get file content
    const r2Key = `${projectId}/${filePath}`;
    const object = await env.STATIC_ASSETS.get(r2Key);

    if (!object) {
      return jsonResponse({ error: '文件不存在' }, 404);
    }

    if (isTextFile(filePath)) {
      const content = await object.text();
      return jsonResponse({
        content,
        path: filePath,
        size: object.size,
        type: 'text',
      });
    } else {
      return jsonResponse({
        path: filePath,
        size: object.size,
        type: 'binary',
        mime: getMimeType(filePath),
      });
    }
  }

  // PUT: create or edit file
  if (method === 'PUT') {
    if (!filePath) {
      return jsonResponse({ error: '文件路径不能为空' }, 400);
    }

    // Path traversal protection
    if (filePath.includes('..')) {
      return jsonResponse({ error: '非法路径' }, 400);
    }

    try {
      const { content } = await request.json();
      const r2Key = `${projectId}/${filePath}`;
      const contentType = getMimeType(filePath);

      await env.STATIC_ASSETS.put(r2Key, content, {
        httpMetadata: { contentType },
      });

      return jsonResponse({ success: true, path: filePath });
    } catch (error) {
      return jsonResponse({ error: '请求格式错误' }, 400);
    }
  }

  // POST: upload file (multipart/form-data)
  if (method === 'POST') {
    try {
      const formData = await request.formData();
      const file = formData.get('file');

      if (!file) {
        return jsonResponse({ error: '未找到文件' }, 400);
      }

      let uploadPath = formData.get('path') || '';
      // Decode filename in case browser encoded it
      const fileName = safeDecode(file.name);
      // If path ends with / or is empty, append filename
      if (uploadPath.endsWith('/') || !uploadPath) {
        uploadPath = uploadPath + fileName;
      }

      // Path traversal protection
      if (uploadPath.includes('..')) {
        return jsonResponse({ error: '非法路径' }, 400);
      }

      const r2Key = `${projectId}/${uploadPath}`;
      const contentType = getMimeType(uploadPath);

      await env.STATIC_ASSETS.put(r2Key, file.stream(), {
        httpMetadata: { contentType },
      });

      return jsonResponse({ success: true, path: uploadPath });
    } catch (error) {
      return jsonResponse({ error: '上传失败: ' + error.message }, 500);
    }
  }

  // DELETE: delete file or folder
  if (method === 'DELETE') {
    if (!filePath) {
      return jsonResponse({ error: '文件路径不能为空' }, 400);
    }

    // Path traversal protection
    if (filePath.includes('..')) {
      return jsonResponse({ error: '非法路径' }, 400);
    }

    // Try deleting as single file first
    const r2Key = `${projectId}/${filePath}`;
    const obj = await env.STATIC_ASSETS.get(r2Key);
    if (obj) {
      await env.STATIC_ASSETS.delete(r2Key);
      return jsonResponse({ success: true });
    }

    // Try deleting as folder (prefix match)
    const folderPrefix = `${projectId}/${filePath}/`;
    let listResult = await env.STATIC_ASSETS.list({ prefix: folderPrefix });
    let deletedCount = 0;
    for (const object of listResult.objects) {
      await env.STATIC_ASSETS.delete(object.key);
      deletedCount++;
    }
    while (listResult.truncated) {
      listResult = await env.STATIC_ASSETS.list({
        prefix: folderPrefix,
        cursor: listResult.cursor,
      });
      for (const object of listResult.objects) {
        await env.STATIC_ASSETS.delete(object.key);
        deletedCount++;
      }
    }

    if (deletedCount === 0) {
      return jsonResponse({ error: '文件不存在' }, 404);
    }

    return jsonResponse({ success: true, deleted: deletedCount });
  }

  return jsonResponse({ error: '不支持的请求方法' }, 405);
}

// Handle move/rename via PATCH
async function handleMoveOrRename(request, env, projectId, filePath) {
  if (!filePath) {
    return jsonResponse({ error: '源路径不能为空' }, 400);
  }

  // Path traversal protection
  if (filePath.includes('..')) {
    return jsonResponse({ error: '非法路径' }, 400);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: '请求格式错误' }, 400);
  }

  const { newPath } = body;
  if (!newPath || !newPath.trim()) {
    return jsonResponse({ error: '目标路径不能为空' }, 400);
  }

  if (newPath.includes('..')) {
    return jsonResponse({ error: '非法目标路径' }, 400);
  }

  const srcKey = `${projectId}/${filePath}`;
  const dstKey = `${projectId}/${newPath}`;

  // Check if source is a file
  const srcObject = await env.STATIC_ASSETS.get(srcKey);

  if (srcObject) {
    // It's a file - copy then delete
    const contentType = srcObject.httpMetadata?.contentType || getMimeType(filePath);
    const content = await srcObject.text();
    await env.STATIC_ASSETS.put(dstKey, content, {
      httpMetadata: { contentType },
    });
    await env.STATIC_ASSETS.delete(srcKey);
    return jsonResponse({ success: true, oldPath: filePath, newPath });
  }

  // Check if source is a folder (prefix match)
  const folderPrefix = `${projectId}/${filePath}/`;
  let listResult = await env.STATIC_ASSETS.list({ prefix: folderPrefix });
  let movedCount = 0;

  if (listResult.objects.length === 0 && !listResult.truncated) {
    return jsonResponse({ error: '源文件或文件夹不存在' }, 404);
  }

  for (const obj of listResult.objects) {
    const relativePath = obj.key.substring(folderPrefix.length);
    const newKey = `${projectId}/${newPath}/${relativePath}`;
    const r2Obj = await env.STATIC_ASSETS.get(obj.key);
    if (r2Obj) {
      const contentType = r2Obj.httpMetadata?.contentType || getMimeType(obj.key);
      const content = await r2Obj.text();
      await env.STATIC_ASSETS.put(newKey, content, {
        httpMetadata: { contentType },
      });
      await env.STATIC_ASSETS.delete(obj.key);
      movedCount++;
    }
  }

  // Handle pagination
  while (listResult.truncated) {
    listResult = await env.STATIC_ASSETS.list({
      prefix: folderPrefix,
      cursor: listResult.cursor,
    });
    for (const obj of listResult.objects) {
      const relativePath = obj.key.substring(folderPrefix.length);
      const newKey = `${projectId}/${newPath}/${relativePath}`;
      const r2Obj = await env.STATIC_ASSETS.get(obj.key);
      if (r2Obj) {
        const contentType = r2Obj.httpMetadata?.contentType || getMimeType(obj.key);
        const content = await r2Obj.text();
        await env.STATIC_ASSETS.put(newKey, content, {
          httpMetadata: { contentType },
        });
        await env.STATIC_ASSETS.delete(obj.key);
        movedCount++;
      }
    }
  }

  return jsonResponse({ success: true, oldPath: filePath, newPath, moved: movedCount });
}

// Handle file download
async function handleDownload(env, projectId, filePath) {
  const r2Key = `${projectId}/${filePath}`;
  const object = await env.STATIC_ASSETS.get(r2Key);

  if (!object) {
    return jsonResponse({ error: '文件不存在' }, 404);
  }

  const mimeType = getMimeType(filePath);
  const filename = filePath.split('/').pop();

  const headers = new Headers();
  headers.set('Content-Type', mimeType);
  headers.set('Content-Disposition', `attachment; filename="${filename}"`);

  return new Response(object.body, { headers });
}
