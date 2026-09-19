let codeEditor = null;

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'];

function isImageFile(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

function initEditor() {
  const container = document.getElementById('editor-container');
  container.innerHTML = '<textarea id="code-textarea"></textarea>';

  codeEditor = CodeMirror.fromTextArea(document.getElementById('code-textarea'), {
    theme: 'material-darker',
    lineNumbers: true,
    lineWrapping: true,
    autoCloseTags: true,
    autoCloseBrackets: true,
    tabSize: 2,
    indentUnit: 2,
    indentWithTabs: false,
  });

  codeEditor.setOption('mode', 'text/plain');

  // Ctrl+S to save
  codeEditor.setOption('extraKeys', {
    'Ctrl-S': function(cm) {
      saveFile();
    },
    'Cmd-S': function(cm) {
      saveFile();
    },
  });

  // Update editor size on resize
  window.addEventListener('resize', () => {
    if (codeEditor) codeEditor.refresh();
  });
}

function getEditorMode(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const modes = {
    'html': 'htmlmixed',
    'htm': 'htmlmixed',
    'css': 'css',
    'js': 'javascript',
    'mjs': 'javascript',
    'json': { name: 'javascript', json: true },
    'xml': 'xml',
    'svg': 'xml',
    'md': 'markdown',
    'markdown': 'markdown',
    'txt': 'text/plain',
  };
  return modes[ext] || 'text/plain';
}

function setEditorContent(filename, content) {
  if (!codeEditor) initEditor();

  const toolbar = document.getElementById('editor-toolbar');
  const statusbar = document.getElementById('editor-statusbar');
  const placeholder = container_placeholder();

  if (placeholder) {
    placeholder.style.display = 'none';
  }

  toolbar.style.display = 'flex';
  statusbar.style.display = 'flex';

  // Show/hide download button based on file type
  document.getElementById('download-btn').style.display = 'inline-flex';

  document.getElementById('current-file-path').textContent = filename;

  const mode = getEditorMode(filename);
  codeEditor.setOption('mode', mode);
  codeEditor.setValue(content);
  codeEditor.refresh();

  // Update status bar
  const sizeBytes = new Blob([content]).size;
  const sizeStr = sizeBytes < 1024 ? sizeBytes + ' B' : (sizeBytes / 1024).toFixed(1) + ' KB';
  document.getElementById('file-size-info').textContent = '大小: ' + sizeStr;
  document.getElementById('file-type-info').textContent = '类型: ' + (typeof mode === 'string' ? mode : mode.name);
}

function showImagePreview(path, projectId, size) {
  const container = document.getElementById('editor-container');
  const toolbar = document.getElementById('editor-toolbar');
  const statusbar = document.getElementById('editor-statusbar');

  // Hide save button for images, show download
  toolbar.style.display = 'flex';
  statusbar.style.display = 'flex';
  document.getElementById('current-file-path').textContent = path;
  document.getElementById('download-btn').style.display = 'inline-flex';

  const sizeStr = size < 1024 ? size + ' B' : (size / 1024).toFixed(1) + ' KB';
  document.getElementById('file-size-info').textContent = '大小: ' + sizeStr;
  document.getElementById('file-type-info').textContent = '类型: 图片';

  // Build the public URL for the image
  const publicSlug = (window.currentProject && window.currentProject.slug) || projectId;
  const imgUrl = `${location.origin}/web/api=${publicSlug}/${path.split('/').map(s => encodeURIComponent(s)).join('/')}`;

  container.innerHTML = `
    <div class="editor-placeholder" style="flex-direction:column; gap:16px;">
      <img src="${escapeAttr(imgUrl)}" alt="${escapeAttr(path)}" 
           style="max-width:90%; max-height:60vh; border-radius:8px; box-shadow:0 8px 32px rgba(0,0,0,0.4); cursor:pointer;"
           onclick="openFullImage('${escapeAttr(imgUrl)}', '${escapeAttr(path)}')">
      <p style="color:var(--text-muted); font-size:12px;">点击图片查看大图</p>
    </div>
  `;
  codeEditor = null;
}

function openFullImage(url, name) {
  document.getElementById('image-preview-img').src = url;
  document.getElementById('image-preview-info').textContent = name;
  document.getElementById('image-preview').style.display = 'flex';
}

function closeImagePreview() {
  document.getElementById('image-preview').style.display = 'none';
  document.getElementById('image-preview-img').src = '';
}

function showBinaryFile(path, data) {
  const container = document.getElementById('editor-container');
  document.getElementById('editor-toolbar').style.display = 'flex';
  document.getElementById('editor-statusbar').style.display = 'flex';
  document.getElementById('current-file-path').textContent = path;
  document.getElementById('download-btn').style.display = 'inline-flex';
  const sizeStr = data.size < 1024 ? data.size + ' B' : (data.size / 1024).toFixed(1) + ' KB';
  document.getElementById('file-size-info').textContent = '大小: ' + sizeStr;
  document.getElementById('file-type-info').textContent = '类型: ' + (data.mime || 'binary');
  container.innerHTML = '<div class="editor-placeholder">此文件为二进制文件，无法编辑<br>大小: ' + sizeStr + '</div>';
  codeEditor = null;
}

function clearEditor() {
  if (codeEditor) {
    codeEditor.setValue('');
  }
  document.getElementById('editor-toolbar').style.display = 'none';
  document.getElementById('editor-statusbar').style.display = 'none';
  const container = document.getElementById('editor-container');
  container.innerHTML = '<div class="editor-placeholder">选择或创建一个文件开始编辑</div>';
  codeEditor = null;
}

function container_placeholder() {
  return document.querySelector('.editor-placeholder');
}

function escapeAttr(str) {
  return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
