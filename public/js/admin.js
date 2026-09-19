// === State ===
let currentProject = null;
let currentFile = null;
let fileTreeData = [];
let moveContext = null; // { path, isFolder }

// Expose to editor.js
window.currentProject = null;

// === Auth check ===
(async function checkAuth() {
  try {
    const res = await fetch('/api/projects', { method: 'GET' });
    if (res.status === 401) {
      window.location.href = '/index.html';
      return;
    }
    await loadProjects();
  } catch (error) {
    window.location.href = '/index.html';
  }
})();

// === API helpers ===
async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

// === Toast ===
function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast glass ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('removing');
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

// === Modal ===
function openModal(id) {
  document.getElementById(id).classList.add('show');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

function confirmDelete(title, message, callback) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  const btn = document.getElementById('confirm-btn');
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.addEventListener('click', () => {
    closeModal('modal-confirm');
    callback();
  });
  openModal('modal-confirm');
}

// === Context Menu ===
function showContextMenu(e, items) {
  e.preventDefault();
  e.stopPropagation();
  const menu = document.getElementById('context-menu');
  menu.innerHTML = items.map((item, i) => {
    if (item.divider) return '<div class="context-menu-divider"></div>';
    return `<div class="context-menu-item ${item.danger ? 'danger' : ''}" onclick="${item.action}">${item.icon ? `<span class="icon">${item.icon}</span>` : ''}${item.label}</div>`;
  }).join('');
  menu.style.display = 'block';
  menu.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
  menu.style.top = Math.min(e.clientY, window.innerHeight - 300) + 'px';
}

function hideContextMenu() {
  document.getElementById('context-menu').style.display = 'none';
}

document.addEventListener('click', hideContextMenu);
document.addEventListener('contextmenu', (e) => {
  // Only hide if right-clicking outside tree nodes
  if (!e.target.closest('.tree-node') && !e.target.closest('.project-item')) {
    hideContextMenu();
  }
});

// === Clipboard ===
function copyToClipboard(text, label) {
  navigator.clipboard.writeText(text).then(() => {
    toast((label || '路径') + '已复制', 'success');
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    toast((label || '路径') + '已复制', 'success');
  });
}

// === Projects ===
async function loadProjects() {
  const { status, data } = await api('/api/projects');
  if (status === 200 && data.projects) {
    renderProjectList(data.projects);
  } else {
    document.getElementById('project-list').innerHTML = '<div class="empty-state">加载失败</div>';
  }
}

function renderProjectList(projects) {
  const container = document.getElementById('project-list');
  if (projects.length === 0) {
    container.innerHTML = '<div class="empty-state">暂无项目<br>点击上方新建</div>';
    return;
  }
  container.innerHTML = projects.map(p => `
    <div class="project-item ${currentProject && currentProject.id === p.id ? 'active' : ''}"
         onclick="selectProject(this, '${p.id}', '${escapeAttr(p.name)}')"
         oncontextmenu="showProjectContextMenu(event, '${p.id}', '${escapeAttr(p.name)}')">
      <span class="icon">○</span>
      <span class="name">${escapeHtml(p.name)}</span>
      <span class="del-btn" onclick="event.stopPropagation();deleteProject('${p.id}','${escapeAttr(p.name)}')">×</span>
    </div>
  `).join('');
}

function showProjectContextMenu(e, id, name) {
  const items = [
    { label: '设置', icon: '⚙', action: `showProjectSettingsFor('${id}')` },
    { divider: true },
    { label: '复制访问链接', icon: '🔗', action: `copyProjectLink('${id}')` },
    { divider: true },
    { label: '删除项目', icon: '✕', danger: true, action: `deleteProject('${id}','${escapeAttr(name)}')` },
  ];
  showContextMenu(e, items);
}

function copyProjectLink(id) {
  const project = currentProject && currentProject.id === id ? currentProject : null;
  const slug = (project && project.slug) || id;
  const link = `${location.origin}/web/api=${slug}`;
  copyToClipboard(link, '访问链接');
}

function selectProject(el, id, name) {
  // Find full project data from the list
  loadProjects().then(() => {
    // Get updated project data
    api('/api/projects').then(({ data }) => {
      const proj = data.projects.find(p => p.id === id);
      currentProject = proj || { id, name };
      window.currentProject = currentProject;
      currentFile = null;
      clearEditor();

      document.getElementById('current-project-name').textContent = currentProject.name;
      document.getElementById('project-settings-btn').style.display = 'inline-flex';

      // Show public link
      const linkBar = document.getElementById('link-bar');
      linkBar.style.display = 'flex';
      const publicSlug = currentProject.slug || id;
      document.getElementById('public-link').value = `${location.origin}/web/api=${publicSlug}`;

      // Show file sections
      document.getElementById('file-tree-section').style.display = 'block';
      document.getElementById('file-actions').style.display = 'flex';

      // Update active state
      document.querySelectorAll('.project-item').forEach(item => item.classList.remove('active'));
      if (el) el.classList.add('active');

      loadFiles();
    });
  });
}

function showCreateProjectModal() {
  document.getElementById('project-name-input').value = '';
  document.getElementById('project-slug-input').value = '';
  openModal('modal-project');
  setTimeout(() => document.getElementById('project-name-input').focus(), 100);
}

async function createProject() {
  const name = document.getElementById('project-name-input').value.trim();
  const slug = document.getElementById('project-slug-input').value.trim();
  if (!name) return toast('请输入项目名称', 'error');

  closeModal('modal-project');
  const { status, data } = await api('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name, slug }),
  });

  if (status === 200 && data.project) {
    toast('项目创建成功', 'success');
    await loadProjects();
    // Select the new project
    const items = document.querySelectorAll('.project-item');
    items.forEach(item => {
      if (item.textContent.includes(name)) {
        selectProject(item, data.project.id, data.project.name);
      }
    });
  } else {
    toast(data.error || '创建失败', 'error');
  }
}

function deleteProject(id, name) {
  confirmDelete('删除项目', `确定删除项目 "${name}" 及其所有文件吗？此操作不可恢复。`, async () => {
    const { status, data } = await api(`/api/projects/${id}`, { method: 'DELETE' });
    if (status === 200) {
      toast('项目已删除', 'success');
      if (currentProject && currentProject.id === id) {
        currentProject = null;
        window.currentProject = null;
        currentFile = null;
        clearEditor();
        document.getElementById('current-project-name').textContent = '未选择项目';
        document.getElementById('link-bar').style.display = 'none';
        document.getElementById('project-settings-btn').style.display = 'none';
        document.getElementById('file-tree-section').style.display = 'none';
        document.getElementById('file-actions').style.display = 'none';
      }
      await loadProjects();
    } else {
      toast(data.error || '删除失败', 'error');
    }
  });
}

// === Project Settings ===
function showProjectSettings() {
  if (!currentProject) return;
  showProjectSettingsFor(currentProject.id);
}

async function showProjectSettingsFor(id) {
  // Fetch latest project data
  const { status, data } = await api('/api/projects');
  if (status === 200 && data.projects) {
    const proj = data.projects.find(p => p.id === id);
    if (proj) {
      currentProject = proj;
      window.currentProject = currentProject;
      document.getElementById('settings-name').value = proj.name || '';
      document.getElementById('settings-slug').value = proj.slug || '';
      openModal('modal-settings');
      return;
    }
  }
  toast('加载项目信息失败', 'error');
}

async function saveProjectSettings() {
  if (!currentProject) return;

  const name = document.getElementById('settings-name').value.trim();
  const slug = document.getElementById('settings-slug').value.trim();

  if (!name) return toast('项目名不能为空', 'error');

  closeModal('modal-settings');

  const { status, data } = await api(`/api/projects/${currentProject.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name, slug }),
  });

  if (status === 200 && data.project) {
    currentProject = data.project;
    window.currentProject = currentProject;
    toast('设置已保存', 'success');

    // Update UI
    document.getElementById('current-project-name').textContent = currentProject.name;
    const publicSlug = currentProject.slug || currentProject.id;
    document.getElementById('public-link').value = `${location.origin}/web/api=${publicSlug}`;

    await loadProjects();
  } else {
    toast(data.error || '保存失败', 'error');
  }
}

// === Files ===
async function loadFiles() {
  if (!currentProject) return;
  const { status, data } = await api(`/api/files/${currentProject.id}`);
  if (status === 200 && data.files) {
    fileTreeData = data.files;
    renderFileTree(data.files);
  } else {
    document.getElementById('file-tree').innerHTML = '<div class="empty-state">加载失败</div>';
  }
}

function renderFileTree(files) {
  const tree = buildTree(files);
  const container = document.getElementById('file-tree');
  if (files.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding: 12px;">暂无文件</div>';
    return;
  }
  container.innerHTML = renderTreeNodes(tree, 0);
}

function buildTree(files) {
  const tree = {};
  for (const file of files) {
    const parts = file.path.split('/');
    let current = tree;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        current[part] = { type: 'file', ...file };
      } else {
        if (!current[part]) {
          current[part] = { type: 'dir', children: {} };
        }
        current = current[part].children;
      }
    }
  }
  return tree;
}

// Track folder paths for context menu
function renderTreeNodes(tree, depth, parentPath) {
  parentPath = parentPath || '';
  let html = '';
  const entries = Object.entries(tree).sort((a, b) => {
    if (a[1].type === 'dir' && b[1].type !== 'dir') return -1;
    if (a[1].type !== 'dir' && b[1].type === 'dir') return 1;
    return a[0].localeCompare(b[0]);
  });

  for (const [name, node] of entries) {
    if (node.type === 'dir') {
      const fullPath = parentPath ? `${parentPath}/${name}` : name;
      html += `<li>
        <div class="tree-node" style="margin-left:${depth * 16}px"
             onclick="toggleFolder(this)"
             oncontextmenu="showFileContextMenu(event, '${escapeAttr(fullPath)}', true)">
          <span class="icon">▸</span>
          <span class="label">${escapeHtml(name)}</span>
        </div>
        <ul style="display:none;">${renderTreeNodes(node.children, depth + 1, fullPath)}</ul>
      </li>`;
    } else {
      const isActive = currentFile === node.path;
      html += `<li>
        <div class="tree-node file ${isActive ? 'active' : ''}" style="margin-left:${depth * 16}px"
             onclick="selectFile(this, '${escapeAttr(node.path)}')"
             oncontextmenu="showFileContextMenu(event, '${escapeAttr(node.path)}', false)">
          <span class="icon">–</span>
          <span class="label">${escapeHtml(name)}</span>
          <span class="del-btn" onclick="event.stopPropagation();confirmDeleteFile('${escapeAttr(node.path)}')">×</span>
        </div>
      </li>`;
    }
  }
  return html;
}

function showFileContextMenu(e, path, isFolder) {
  const items = [
    { label: isFolder ? '重命名文件夹' : '重命名文件', icon: '✎', action: `showMoveModal('${escapeAttr(path)}', ${isFolder})` },
    { label: '移动', icon: '→', action: `showMoveModal('${escapeAttr(path)}', ${isFolder})` },
    { divider: true },
    { label: '复制路径', icon: '⎘', action: `copyToClipboard('${escapeAttr(path)}', '文件路径')` },
    { label: '复制公开链接', icon: '🔗', action: `copyFilePublicLink('${escapeAttr(path)}')` },
  ];

  if (!isFolder) {
    items.push({ divider: true });
    items.push({ label: '下载', icon: '↓', action: `downloadFile('${escapeAttr(path)}')` });
  }

  items.push({ divider: true });
  items.push({ label: '删除', icon: '✕', danger: true, action: `confirmDeleteFile('${escapeAttr(path)}')` });

  showContextMenu(e, items);
}

function copyFilePublicLink(path) {
  if (!currentProject) return;
  const slug = currentProject.slug || currentProject.id;
  const link = `${location.origin}/web/api=${slug}/${encodeFilePath(path)}`;
  copyToClipboard(link, '公开链接');
}

function toggleFolder(el) {
  const ul = el.nextElementSibling;
  if (ul) {
    const isHidden = ul.style.display === 'none';
    ul.style.display = isHidden ? 'block' : 'none';
    el.querySelector('.icon').textContent = isHidden ? '▾' : '▸';
  }
}

async function selectFile(el, path) {
  currentFile = path;
  const { status, data } = await api(`/api/files/${currentProject.id}/${encodeFilePath(path)}`);

  // Update active state
  document.querySelectorAll('.tree-node.file').forEach(node => node.classList.remove('active'));
  if (el) el.classList.add('active');

  if (status === 200) {
    if (data.type === 'text') {
      setEditorContent(path, data.content);
    } else {
      // Check if it's an image
      const ext = path.split('.').pop().toLowerCase();
      const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'];
      if (imageExts.includes(ext)) {
        showImagePreview(path, currentProject.id, data.size);
      } else {
        showBinaryFile(path, data);
      }
    }
  } else {
    toast(data.error || '文件加载失败', 'error');
  }
}

function showCreateFileModal() {
  document.getElementById('file-path-input').value = '';
  openModal('modal-file');
  setTimeout(() => document.getElementById('file-path-input').focus(), 100);
}

async function createFile() {
  const path = document.getElementById('file-path-input').value.trim();
  if (!path) return toast('请输入文件路径', 'error');

  closeModal('modal-file');

  const { status, data } = await api(`/api/files/${currentProject.id}/${encodeFilePath(path)}`, {
    method: 'PUT',
    body: JSON.stringify({ content: '' }),
  });

  if (status === 200) {
    toast('文件创建成功', 'success');
    await loadFiles();
    selectFileByName(path);
  } else {
    toast(data.error || '创建失败', 'error');
  }
}

function selectFileByName(path) {
  currentFile = path;
  setEditorContent(path, '');
}

async function saveFile() {
  if (!currentProject || !currentFile || !codeEditor) return;

  const content = codeEditor.getValue();
  const { status, data } = await api(`/api/files/${currentProject.id}/${encodeFilePath(currentFile)}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });

  if (status === 200) {
    toast('保存成功', 'success');
    const sizeBytes = new Blob([content]).size;
    const sizeStr = sizeBytes < 1024 ? sizeBytes + ' B' : (sizeBytes / 1024).toFixed(1) + ' KB';
    document.getElementById('file-size-info').textContent = '大小: ' + sizeStr;
  } else {
    toast(data.error || '保存失败', 'error');
  }
}

// === Move/Rename ===
function showMoveModal(path, isFolder) {
  moveContext = { path, isFolder };
  document.getElementById('move-title').textContent = isFolder ? '移动/重命名文件夹' : '移动/重命名文件';
  document.getElementById('move-current').textContent = '当前路径: ' + path;
  document.getElementById('move-new-path').value = path;
  openModal('modal-move');
  setTimeout(() => {
    const input = document.getElementById('move-new-path');
    input.focus();
    // Select the filename part for easy rename
    const lastSlash = path.lastIndexOf('/');
    if (lastSlash >= 0) {
      input.setSelectionRange(lastSlash + 1, path.length);
    } else {
      input.select();
    }
  }, 100);
}

async function executeMove() {
  if (!moveContext) return;
  const newPath = document.getElementById('move-new-path').value.trim();
  if (!newPath) return toast('新路径不能为空', 'error');
  if (newPath === moveContext.path) {
    closeModal('modal-move');
    return;
  }

  closeModal('modal-move');

  const { status, data } = await api(`/api/files/${currentProject.id}/${encodeFilePath(moveContext.path)}`, {
    method: 'PATCH',
    body: JSON.stringify({ newPath }),
  });

  if (status === 200) {
    toast(moveContext.isFolder ? '文件夹已移动' : '文件已移动', 'success');
    if (currentFile && currentFile.startsWith(moveContext.path)) {
      currentFile = null;
      clearEditor();
    }
    await loadFiles();
  } else {
    toast(data.error || '移动失败', 'error');
  }
  moveContext = null;
}

// === Download ===
function downloadFile(path) {
  if (!currentProject) return;
  const link = document.createElement('a');
  link.href = `/api/files/${currentProject.id}/${encodeFilePath(path)}?download=1`;
  link.download = path.split('/').pop();
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function downloadCurrentFile() {
  if (currentFile) downloadFile(currentFile);
}

// === Delete ===
function confirmDeleteFile(path) {
  confirmDelete('删除文件', `确定删除 "${path}" 吗？`, async () => {
    const { status, data } = await api(`/api/files/${currentProject.id}/${encodeFilePath(path)}`, {
      method: 'DELETE',
    });
    if (status === 200) {
      toast('文件已删除', 'success');
      if (currentFile === path || (currentFile && currentFile.startsWith(path + '/'))) {
        currentFile = null;
        clearEditor();
      }
      await loadFiles();
    } else {
      toast(data.error || '删除失败', 'error');
    }
  });
}

function deleteFile() {
  if (currentFile) confirmDeleteFile(currentFile);
}

// === Upload ===
function showUploadModal() {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.onchange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const progress = document.getElementById('upload-progress');
    const fill = document.getElementById('upload-fill');
    progress.classList.add('show');

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      fill.style.width = ((i / files.length) * 100) + '%';

      const formData = new FormData();
      formData.append('file', file);

      const { status, data } = await api(`/api/files/${currentProject.id}`, {
        method: 'POST',
        body: formData,
      });

      if (status !== 200) {
        toast(`上传失败: ${file.name}`, 'error');
      }
    }

    fill.style.width = '100%';
    setTimeout(() => {
      progress.classList.remove('show');
      fill.style.width = '0%';
    }, 500);

    toast(`已上传 ${files.length} 个文件`, 'success');
    await loadFiles();
  };
  input.click();
}

// === Link ===
function copyLink() {
  const input = document.getElementById('public-link');
  copyToClipboard(input.value, '访问链接');
}

// === Logout ===
async function logout() {
  await api('/api/logout', { method: 'POST' });
  window.location.href = '/index.html';
}

// === Utils ===
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Encode file path for use in URL - encodes each segment separately
function encodeFilePath(path) {
  return path.split('/').map(s => encodeURIComponent(s)).join('/');
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('show');
  });
});

// ESC key closes image preview
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeImagePreview();
    hideContextMenu();
  }
});
