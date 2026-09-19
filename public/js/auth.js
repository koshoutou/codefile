const form = document.getElementById('login-form');
const errorMsg = document.getElementById('error-msg');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  if (!username || !password) {
    showError('请输入用户名和密码');
    return;
  }

  const btn = form.querySelector('button[type="submit"]');
  btn.textContent = '登录中...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (res.ok && data.success) {
      window.location.href = '/admin.html';
    } else {
      showError(data.error || '登录失败');
    }
  } catch (error) {
    showError('网络错误，请重试');
  } finally {
    btn.textContent = '登录';
    btn.disabled = false;
  }
});

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.classList.add('show');
  setTimeout(() => errorMsg.classList.remove('show'), 3000);
}
