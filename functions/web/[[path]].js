import { getMimeType } from '../_utils.js';

function safeDecode(str) {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

const MD_EXTENSIONS = ['md', 'markdown'];

function isMarkdownFile(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  return MD_EXTENSIONS.includes(ext);
}

export async function onRequest(context) {
  const { request, env } = context;

  const url = new URL(request.url);
  const pathname = url.pathname;

  // Parse /web/api={slug}/{filePath}
  const match = pathname.match(/^\/web\/api=([a-zA-Z0-9_-]+)\/?(.*)$/);

  if (!match) {
    return new Response(generate404Page(), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const slug = match[1];
  let filePath = safeDecode(match[2]);

  // Path traversal protection
  if (filePath.includes('..')) {
    return new Response(generate404Page(), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Resolve slug to projectId
  const slugMapping = await env.CODEFILE_KV.get(`slug:${slug}`);
  let projectId;

  if (slugMapping) {
    projectId = slugMapping;
  } else {
    projectId = slug;
  }

  // Verify project exists
  const projectData = await env.CODEFILE_KV.get(`proj:${projectId}`);
  if (!projectData) {
    return new Response(generate404Page(), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Default to index.html if path is empty or ends with /
  if (!filePath || filePath.endsWith('/')) {
    filePath = filePath + 'index.html';
  }

  // Remove leading slash if any
  filePath = filePath.replace(/^\/+/, '');

  const r2Key = `${projectId}/${filePath}`;
  const object = await env.STATIC_ASSETS.get(r2Key);

  if (!object) {
    return new Response(generate404Page(), {
      status: 404,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Query params:
  //   ?download=1  → 原始文件 + Content-Disposition: attachment (适合 IDM/下载器)
  //   ?raw=1       → 原始文件 inline (浏览器直接看源码)
  const downloadMode = url.searchParams.get('download') === '1';
  const rawMode = url.searchParams.get('raw') === '1';
  const forceBinary = downloadMode || rawMode;

  // For .md/.markdown files, render as HTML preview page only when neither
  // download nor raw is requested
  if (!forceBinary && isMarkdownFile(filePath)) {
    const mdContent = await object.text();
    const filename = filePath.split('/').pop();
    return new Response(generateMarkdownPage(filename, mdContent, filePath, slug), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const filename = filePath.split('/').pop();
  const mimeType = getMimeType(filePath);

  const headers = new Headers();
  headers.set('Content-Type', mimeType);
  headers.set('Cache-Control', 'public, max-age=3600');

  if (object.httpMetadata && object.httpMetadata.contentType) {
    headers.set('Content-Type', object.httpMetadata.contentType);
  }

  if (downloadMode) {
    // Force download: IDM / browser both get the raw file named correctly
    headers.set(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
  }

  return new Response(object.body, { headers });
}

function generateMarkdownPage(filename, mdContent, filePath, slug) {
  // Escape markdown content safely into a JS string
  const escaped = JSON.stringify(mdContent);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark light">
  <title>${escapeHtml(filename)} - Codefile</title>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script>
    // Apply saved theme BEFORE page paints to prevent flash
    (function(){ try {
      var t = localStorage.getItem('cf-md-theme');
      if (t === 'light') document.documentElement.classList.add('light');
    } catch(e){} })();
  </script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; }

    /* ===== Theme variables ===== */
    :root {
      --bg: #0a0a0a;
      --bg-radial-1: rgba(255,255,255,0.04);
      --bg-radial-2: rgba(255,255,255,0.03);
      --bg-radial-3: rgba(255,255,255,0.02);

      --toolbar-bg: rgba(10,10,10,0.75);
      --toolbar-border: rgba(255,255,255,0.08);
      --toolbar-filename: rgba(255,255,255,0.5);
      --btn-bg: rgba(255,255,255,0.06);
      --btn-bg-hover: rgba(255,255,255,0.12);
      --btn-border: rgba(255,255,255,0.15);
      --btn-border-hover: rgba(255,255,255,0.3);
      --btn-color: #fff;

      --card-bg: rgba(255,255,255,0.04);
      --card-border: rgba(255,255,255,0.08);
      --card-shadow: 0 8px 32px rgba(0,0,0,0.4);

      --text: #e6e6e6;
      --text-heading: #fff;
      --text-paragraph: rgba(255,255,255,0.88);
      --text-muted: rgba(255,255,255,0.65);
      --text-em: rgba(255,255,255,0.8);

      --rule-subtle: rgba(255,255,255,0.1);
      --rule-border: rgba(255,255,255,0.08);
      --rule-divider: rgba(255,255,255,0.12);
      --rule-blockquote: rgba(255,255,255,0.25);

      --link: #7cb4ff;

      --code-inline-bg: rgba(255,255,255,0.08);
      --code-inline-color: #ffd6b5;
      --code-block-bg: rgba(0,0,0,0.45);
      --code-block-border: rgba(255,255,255,0.08);
      --code-block-color: #c9d1d9;

      --blockquote-bg: rgba(255,255,255,0.03);

      --table-border: rgba(255,255,255,0.1);
      --table-head-bg: rgba(255,255,255,0.06);
      --table-stripe-bg: rgba(255,255,255,0.02);
    }
    html.light {
      --bg: #f5f6f8;
      --bg-radial-1: rgba(100,120,200,0.07);
      --bg-radial-2: rgba(180,160,220,0.06);
      --bg-radial-3: rgba(255,255,255,0);

      --toolbar-bg: rgba(255,255,255,0.78);
      --toolbar-border: rgba(0,0,0,0.08);
      --toolbar-filename: rgba(0,0,0,0.55);
      --btn-bg: rgba(0,0,0,0.05);
      --btn-bg-hover: rgba(0,0,0,0.10);
      --btn-border: rgba(0,0,0,0.14);
      --btn-border-hover: rgba(0,0,0,0.26);
      --btn-color: #111;

      --card-bg: #ffffff;
      --card-border: rgba(0,0,0,0.08);
      --card-shadow: 0 6px 24px rgba(20,20,40,0.08);

      --text: #24292f;
      --text-heading: #0d1117;
      --text-paragraph: #2b2f36;
      --text-muted: #57606a;
      --text-em: #424a53;

      --rule-subtle: rgba(0,0,0,0.08);
      --rule-border: rgba(0,0,0,0.06);
      --rule-divider: rgba(0,0,0,0.12);
      --rule-blockquote: rgba(0,0,0,0.22);

      --link: #0969da;

      --code-inline-bg: rgba(175,184,193,0.28);
      --code-inline-color: #b23a48;
      --code-block-bg: #0d1117;
      --code-block-border: rgba(0,0,0,0.12);
      --code-block-color: #c9d1d9;

      --blockquote-bg: rgba(0,0,0,0.03);

      --table-border: rgba(0,0,0,0.10);
      --table-head-bg: rgba(0,0,0,0.04);
      --table-stripe-bg: rgba(0,0,0,0.02);
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
      font-size: 16px;
      line-height: 1.75;
      position: relative;
      min-height: 100vh;
      transition: background 0.35s ease, color 0.35s ease;
    }
    body::before {
      content: '';
      position: fixed; top: -50%; left: -50%;
      width: 200%; height: 200%;
      background:
        radial-gradient(circle at 20% 30%, var(--bg-radial-1) 0%, transparent 40%),
        radial-gradient(circle at 80% 70%, var(--bg-radial-2) 0%, transparent 40%),
        radial-gradient(circle at 50% 50%, var(--bg-radial-3) 0%, transparent 50%);
      animation: float 20s ease-in-out infinite;
      pointer-events: none; z-index: 0;
    }
    @keyframes float {
      0%, 100% { transform: translate(0,0) scale(1); }
      33% { transform: translate(-30px,20px) scale(1.05); }
      66% { transform: translate(20px,-30px) scale(0.98); }
    }

    .toolbar {
      position: sticky; top: 0; z-index: 10;
      display: flex; align-items: center; gap: 12px;
      padding: 12px 24px;
      background: var(--toolbar-bg);
      backdrop-filter: blur(20px) saturate(180%);
      border-bottom: 1px solid var(--toolbar-border);
      transition: background 0.35s ease, border-color 0.35s ease;
    }
    .toolbar .filename {
      font-size: 13px; color: var(--toolbar-filename); flex: 1;
      font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    }
    .toolbar .btn {
      padding: 6px 14px;
      border-radius: 8px; border: 1px solid var(--btn-border);
      background: var(--btn-bg); color: var(--btn-color);
      font-size: 13px; cursor: pointer; transition: all 0.2s;
      text-decoration: none; font-family: inherit;
    }
    .toolbar .btn:hover { background: var(--btn-bg-hover); border-color: var(--btn-border-hover); }
    .content {
      position: relative; z-index: 1;
      max-width: 820px; margin: 40px auto; padding: 0 24px 80px;
    }
    .markdown-body {
      background: var(--card-bg);
      backdrop-filter: blur(12px) saturate(160%);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 48px 56px;
      box-shadow: var(--card-shadow);
      transition: background 0.35s ease, border-color 0.35s ease, box-shadow 0.35s ease;
    }

    /* Markdown Typography (all theme-aware via CSS vars) */
    .markdown-body h1, .markdown-body h2, .markdown-body h3,
    .markdown-body h4, .markdown-body h5, .markdown-body h6 {
      color: var(--text-heading);
      margin-top: 1.8em; margin-bottom: 0.6em; font-weight: 600; line-height: 1.35;
    }
    .markdown-body h1 { font-size: 2em; padding-bottom: 0.3em; border-bottom: 1px solid var(--rule-subtle); }
    .markdown-body h2 { font-size: 1.5em; padding-bottom: 0.25em; border-bottom: 1px solid var(--rule-border); }
    .markdown-body h3 { font-size: 1.25em; }
    .markdown-body h4 { font-size: 1em; }
    .markdown-body p { margin: 0.6em 0; color: var(--text-paragraph); }
    .markdown-body a { color: var(--link); text-decoration: none; }
    .markdown-body a:hover { text-decoration: underline; }
    .markdown-body ul, .markdown-body ol { margin: 0.6em 0; padding-left: 1.8em; color: var(--text-paragraph); }
    .markdown-body li { margin: 0.25em 0; }
    .markdown-body blockquote {
      margin: 1em 0; padding: 0.4em 1.2em;
      border-left: 3px solid var(--rule-blockquote);
      color: var(--text-muted);
      background: var(--blockquote-bg);
      border-radius: 0 8px 8px 0;
    }
    .markdown-body code {
      background: var(--code-inline-bg);
      padding: 0.15em 0.45em; border-radius: 4px;
      font-family: ui-monospace, 'SF Mono', Menlo, monospace;
      font-size: 0.9em; color: var(--code-inline-color);
    }
    .markdown-body pre {
      background: var(--code-block-bg); border: 1px solid var(--code-block-border);
      padding: 18px 22px; border-radius: 10px; overflow-x: auto; margin: 1em 0;
    }
    .markdown-body pre code {
      background: transparent; padding: 0; color: var(--code-block-color);
      font-size: 0.9em; line-height: 1.65;
    }
    .markdown-body table {
      border-collapse: collapse; margin: 1em 0; width: 100%; font-size: 0.95em;
    }
    .markdown-body th, .markdown-body td {
      border: 1px solid var(--table-border); padding: 8px 14px; text-align: left;
      color: var(--text-paragraph);
    }
    .markdown-body th { background: var(--table-head-bg); color: var(--text-heading); font-weight: 600; }
    .markdown-body tr:nth-child(even) td { background: var(--table-stripe-bg); }
    .markdown-body hr { border: none; border-top: 1px solid var(--rule-divider); margin: 2em 0; }
    .markdown-body img { max-width: 100%; border-radius: 8px; margin: 1em 0; }
    .markdown-body strong { color: var(--text-heading); font-weight: 600; }
    .markdown-body em { color: var(--text-em); }

    /* Markdown render error fallback */
    .md-fail-msg { color: #f85149; }
    .md-fail-pre { white-space: pre-wrap; background: var(--code-block-bg); color: var(--code-block-color); padding: 12px; border-radius: 8px; overflow-x: auto; }

    @media (max-width: 600px) {
      .markdown-body { padding: 28px 20px; border-radius: 12px; }
      .content { padding: 20px 12px 60px; margin: 0; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <span class="filename">📄 ${escapeHtml(filePath)}</span>
    <a class="btn" href="?download=1" download>⬇ 下载原始文件</a>
    <a class="btn" href="?raw=1">查看源码</a>
    <button class="btn" id="theme-btn" onclick="toggleTheme()">🌓 切换主题</button>
  </div>
  <div class="content">
    <div class="markdown-body" id="md-body"></div>
  </div>
  <script>
    const mdContent = ${escaped};
    const mdBody = document.getElementById('md-body');

    function escapeHtml(s) {
      return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
    }

    function applyThemeUI() {
      var light = document.documentElement.classList.contains('light');
      try { localStorage.setItem('cf-md-theme', light ? 'light' : 'dark'); } catch(e){}
      document.getElementById('theme-btn').textContent = light ? '🌓 深色模式' : '🌓 浅色模式';
    }

    function toggleTheme() {
      document.documentElement.classList.toggle('light');
      applyThemeUI();
    }

    // Init theme button label
    applyThemeUI();

    if (typeof marked !== 'undefined') {
      marked.setOptions({ breaks: true, gfm: true });
      mdBody.innerHTML = marked.parse(mdContent);
    } else {
      mdBody.innerHTML = '<p class="md-fail-msg">Markdown 渲染器加载失败</p><pre class="md-fail-pre">' + escapeHtml(mdContent) + '</pre>';
    }
  </script>
</body>
</html>`;
}

function generate404Page() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 - Not Found</title>
  <style>
    body { display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0a0a0a; color: #fff; font-family: -apple-system, 'Segoe UI', sans-serif; }
    .container { text-align: center; }
    h1 { font-size: 72px; margin: 0; font-weight: 200; }
    p { color: rgba(255,255,255,0.6); margin-top: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>404</h1>
    <p>File not found</p>
  </div>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
}
