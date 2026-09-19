# Claude Skill：部署 Codefile 到 Cloudflare Pages

> 本文档面向 AI Agent（Claude / Trae / Cursor ...），指导将 Codefile 仓库从零部署到 Cloudflare Pages。
> 所有命令均已在 Linux + Node ≥ 18 + Cloudflare wrangler 4.x 环境下验证。

---

## 0. 前置条件检查

在动任何部署命令前，AI Agent 必须确认以下条件，缺一不可：

| 条件 | 检查命令 / 方法 | 不通过怎么办 |
|---|---|---|
| Node.js ≥ 18 | `node -v` | 用 `nvm install 20 && nvm use 20` 安装 |
| wrangler 已安装 | `npx wrangler --version` | 跑 `npm install -g wrangler` |
| Cloudflare Account ID | 用户环境变量 `CLOUDFLARE_ACCOUNT_ID` 已设置 | 让用户从 Cloudflare Dashboard → 右上角下拉 → `Account ID` 粘贴 |
| Cloudflare API Token | 用户环境变量 `CLOUDFLARE_API_TOKEN` 已设置 | Dashboard → `My Profile` → `API Tokens` → `Create Token` → 选 `Edit Cloudflare Workers` 预置模板（含 Pages/KV/R2 权限） |

安全设置（如果用户还没 export）：

```bash
export CLOUDFLARE_ACCOUNT_ID=<从 Dashboard 复制的 32 位 hex>
export CLOUDFLARE_API_TOKEN=<cfat_ 开头的长 token>
```

用以下命令验证 Token 有效：

```bash
curl -s "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print('Token valid:', d.get('result',{}).get('status') == 'active')"
```

---

## 1. 准备 Cloudflare 资源（三条命令）

必须依次执行，记录输出中的关键 ID。

### 1.1 创建 KV 命名空间

```bash
npx wrangler kv namespace create CODEFILE_KV
```

输出类似：

```
🌀 Creating namespace with title "codefile-CODEFILE_KV"
✨ Success!
Add the following to your config file to bind this namespace to your Worker:

kv_namespaces = [
  { binding = "CODEFILE_KV", id = "4e23a72a828040e3ba20dd037979839d" }
]
```

**记下** `id` 字段的值（32 位 hex）。后面要粘进 `wrangler.toml`。

### 1.2 创建 R2 存储桶

```bash
npx wrangler r2 bucket create codefile-static-assets
```

输出应该是 `Created bucket codefile-static-assets`。如果报 `Bucket name already exists`，说明用户之前创建过，直接跳过即可。

### 1.3 创建 Pages 项目

```bash
npx wrangler pages project create codefile --production-branch main
```

如果报 `A project with that name already exists`，说明已有项目，跳过即可。用下面命令确认：

```bash
npx wrangler pages project list | grep codefile
```

---

## 2. 克隆并配置项目

```bash
git clone https://github.com/koshoutou/codefile.git
cd codefile
npm install
```

### 2.1 填写 `wrangler.toml`

仓库里的 `wrangler.toml` 含有占位符，必须替换成真实值。用 `sed` 一条命令搞定：

```bash
KV_ID="<步骤 1.1 记下的 32 位 hex>"

sed -i "s/id = \"YOUR_KV_NAMESPACE_ID_HERE\"/id = \"$KV_ID\"/" wrangler.toml
```

### 2.2 修改账号密码（可选）

默认用户名 `inkcoo`、密码 `inkcoo`。想换？两步：

```bash
# 第一步：计算新密码的 SHA-256(salt + password)
node -e "
const c = require('crypto');
const salt = 'codefile_salt_2024';     # 这个值不要动
const pwd  = '你的新密码';              # 改成你想要的
console.log(c.createHash('sha256').update(salt + pwd).digest('hex'));
"

# 第二步：替换 wrangler.toml 里的 AUTH_USERNAME 和 PASSWORD_HASH
sed -i 's/AUTH_USERNAME = "inkcoo"/AUTH_USERNAME = "你的新用户名"/' wrangler.toml
sed -i 's/PASSWORD_HASH = ".*"/PASSWORD_HASH = "上面 node 输出的 hash"/' wrangler.toml
```

---

## 3. 本地测试

```bash
npx wrangler pages dev public --port 8788
```

打开新终端跑：

```bash
# 登录
curl -s -c /tmp/c.txt -X POST http://localhost:8788/api/auth \
  -H "Content-Type: application/json" \
  -d '{"username":"inkcoo","password":"inkcoo"}'

# 创建项目
curl -s -b /tmp/c.txt -X POST http://localhost:8788/api/projects \
  -H "Content-Type: application/json" -d '{"name":"hello"}'

# 拿到返回的 id 后创建文件
curl -s -b /tmp/c.txt -X PUT http://localhost:8788/api/files/<project_id>/index.html \
  -H "Content-Type: application/json" -d '{"content":"<h1>local</h1>"}'

# 公开访问
curl -s http://localhost:8788/web/api=<project_id>/
```

全部返回 200 + 预期 JSON/HTML 才算过。本地测试通过再继续。

---

## 4. 部署上线

```bash
npx wrangler pages deploy public --project-name codefile --branch main
```

输出类似：

```
✨ Uploading Functions bundle
🌎 Deploying...
✨ Deployment complete! Take a peek over at https://<hash>.codefile.pages.dev
```

**记下** 这个 `<hash>.codefile.pages.dev` 域名，打开能登录就算部署成功。

---

## 5. 绑定自定义域名（可选）

Cloudflare Dashboard → Pages → codefile → Custom Domains → `+ Connect Domain` → 填你自己的域名（比如 `codefile.yourdomain.com`）。

DNS 用 Cloudflare 管理的话自动 CNAME，否则按 Dashboard 给的提示加 DNS 记录。

---

## 6. 常见报错排查

| 报错 | 根因 | 解法 |
|---|---|---|
| `Account ID not found` | `CLOUDFLARE_ACCOUNT_ID` 没 export | 回头看 0 节 |
| `Authentication error (9109)` | Token 权限不够 | Token 加 Pages + KV + R2 的 Edit 权限 |
| `KV binding not found` | `wrangler.toml` 里 KV id 没填对 | 重跑 `wrangler kv namespace list` 找正确 id |
| `R2 bucket not found` | 桶名写错或账号不对 | 跑 `wrangler r2 bucket list` 核对 |
| `POST returns 401 未登录` | Cookie 没带上或 Token 过期 | 清浏览器 Cookie 重登录 |
| `/web/api=xxx` 返回 404 | slug 没绑定到 KV | 登录后台 → 项目设置 → 重新保存 slug |
| `.md 文件下载成 HTML` | 用的 URL 不是 `?download=1` | 改成 `.../file.md?download=1` |
| 大文件（>100MB）上传失败 | Workers 默认请求体 100MB 上限 | 用 R2 multipart 或前端分片 |

---

## 7. 重置密码（万一忘了）

```bash
node -e "
const c = require('crypto');
const hash = c.createHash('sha256').update('codefile_salt_2024' + '你的新密码').digest('hex');
console.log(hash);
"

# Cloudflare Dashboard → Pages → codefile → Settings → Environment variables
# 把 PASSWORD_HASH 换成上面的输出值，点 Save and Deploy
```

---

## 8. 项目关键路径速查

```
public/admin.html                  # 管理后台入口
public/js/admin.js                 # 所有管理逻辑（项目/文件/右键菜单）
functions/_middleware.js           # 所有 /api/* 的鉴权守门
functions/web/[[path]].js          # 公开代理 + Markdown 渲染
functions/api/files/[[route]].js    # 文件 CRUD + 移动 + 下载（PATCH 要记）
wrangler.toml                      # KV id / R2 bucket / AUTH_* 都在这里
```

AI Agent 修改代码后**必须本地 `wrangler pages dev` 验证**再 `wrangler pages deploy`。
