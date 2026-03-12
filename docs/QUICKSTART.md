# 快速入门指南

## 5分钟快速开始

### 1. 克隆项目并安装依赖

```bash
cd /path/to/Refactoring
npm install
```

### 2. 配置环境变量

复制环境变量模板并编辑：

```bash
cp docs/env.template.txt .env
```

编辑 `.env` 文件，配置以下必要项：

```bash
# 开发环境端口
PORT=3001

# 数据库连接 (远程服务器)
DB_HOST=104.247.77.90
DB_USER=your_username
DB_PASS=your_password
DB_NAME=sweetl23_partner_demo

# Session 配置
SESSION_SECRET=your_random_secret_key
SESSION_TIMEOUT=1800
```

> 提示：完整环境变量说明请参阅 `docs/env.template.txt`

### 3. 启动开发服务器

```bash
npm run dev
```

服务器启动后会显示：

```
Database connected successfully
Server running on port 3001
Environment: development
Local access: http://localhost:3001
Network access: http://192.168.x.x:3001
```

### 4. 访问应用

打开浏览器访问：`http://localhost:3001`

---

## 常用开发任务

| 任务 | 操作 |
|------|------|
| 修改页面样式 | 编辑 `public/css/mp_style.css` |
| 修改前端交互逻辑 | 编辑 `public/js/` 下对应的 JS 文件 |
| 修改页面模板 | 编辑 `views/` 下对应的 `.ejs` 文件 |
| 添加/修改 API 接口 | 编辑 `routes/api.js` |
| 修改认证逻辑 | 编辑 `routes/auth.js` 或 `middleware/auth.js` |
| 添加新页面路由 | 编辑 `routes/pages.js` 并创建对应 `.ejs` 文件 |
| 修改数据库配置 | 编辑 `config/database.js` |
| 修改邮件服务 | 编辑 `services/emailService.js` |

---

## 项目结构速查

```
核心文件:
├── app.js                 ← 应用主入口
├── config/database.js     ← 数据库连接配置
├── config/session.js      ← Session 配置
├── middleware/auth.js      ← 认证中间件
├── routes/
│   ├── api.js             ← API 接口 (数据保存/查询)
│   ├── auth.js            ← 认证 (登录/注册/密码重置)
│   └── pages.js           ← 页面路由 (渲染 EJS)
├── services/
│   └── emailService.js    ← 邮件发送服务
├── views/                 ← EJS 页面模板
│   ├── data_forms/        ← 6步数据录入表单
│   └── partials/          ← 公共模板片段 (header/sidebar/footer)
├── public/
│   ├── css/               ← 样式文件
│   └── js/                ← 前端脚本
└── docs/                  ← 项目文档
```

---

## NPM 脚本

```bash
npm run dev        # 开发模式 (nodemon 热重载)
npm start          # 生产模式
npm run init-db    # 初始化数据库
```

---

## Docker 快速启动

如果需要使用 Docker 部署：

```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止
docker-compose down
```

---

## 常见问题

### Q: 数据库连接失败？
A: 检查 `.env` 中的数据库配置是否正确，确认远程服务器 (`104.247.77.90`) 可访问。可尝试手动连接测试：
```bash
mysql -h 104.247.77.90 -u <your_user> -p sweetl23_partner_demo
```

### Q: 端口被占用？
A: 修改 `.env` 中的 `PORT` 为其他端口（如 3002）。默认使用 3001 以避免与 Docker 容器冲突。

### Q: Canvas 报错？
A: 确保使用 `@napi-rs/canvas` 而非 `canvas`。Docker 环境中需要安装 `libcairo2-dev` 等系统依赖（Dockerfile 已包含）。

### Q: 启动后页面样式不更新？
A: 开发模式下已禁用视图缓存。如果仍有缓存，请清除浏览器缓存或使用强制刷新 (Ctrl+Shift+R)。

### Q: 邮件发送失败？
A: 检查 `.env` 中的 SMTP 配置，确保 `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS` 配置正确。

---

详细文档请参阅：[开发者手册 (中文)](./DEVELOPER_MANUAL.md) | [Developer Manual (English)](./DEVELOPER_MANUAL_EN.md)

---

*文档最后更新: 2026-02-13*
