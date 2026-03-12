# MicroPlastics Data Entry System - 开发者手册

## 1. 项目概述

**项目名称**: MicroPlastics Data Entry System (mp-data-entry-nodejs)  
**版本**: 1.0.0  
**描述**: 微塑料数据录入 Web 应用，用于收集和管理微塑料采样数据。该系统从 PHP 重构为 Node.js，支持多步骤表单数据录入、地图可视化、用户认证、文件上传等功能。

### 技术栈

| 组件 | 技术 | 版本 |
|------|------|------|
| 运行时 | Node.js | LTS |
| 后端框架 | Express.js | 4.18.2 |
| 模板引擎 | EJS | 3.1.10 |
| 数据库 | MariaDB/MySQL (mysql2) | 3.6.0 |
| 密码加密 | bcryptjs | 2.4.3 |
| 会话管理 | express-session | 1.17.3 |
| 图像处理 | @napi-rs/canvas | 0.1.71 |
| 邮件服务 | Nodemailer | 7.0.3 |
| 安全中间件 | Helmet | 7.0.0 |
| 跨域 | CORS | 2.8.5 |
| 表单验证 | express-validator | 7.0.1 |
| 文件上传 | Multer | 1.4.5-lts.1 |
| 日志 | Morgan | 1.10.0 |
| 环境变量 | dotenv | 16.3.1 |
| 开发热重载 | nodemon | 3.0.1 |

---

## 2. 项目架构

### 目录结构

```
Refactoring/
├── app.js                          # 应用主入口，中间件配置与服务器启动
├── package.json                    # 项目依赖与脚本配置
├── Dockerfile                      # Docker 镜像构建文件
├── docker-compose.yml              # Docker Compose 编排文件
├── database_init.sql               # 数据库初始化 SQL
│
├── config/                         # 配置文件
│   ├── database.js                 # 数据库连接池配置
│   └── session.js                  # Session 配置
│
├── middleware/                     # 中间件
│   └── auth.js                     # 认证与会话超时中间件
│
├── routes/                         # 路由
│   ├── auth.js                     # 认证路由 (登录/注册/密码重置/验证码)
│   ├── pages.js                    # 页面路由 (所有 EJS 页面渲染)
│   └── api.js                      # API 路由 (数据保存/查询/文件上传)
│
├── services/                       # 业务服务
│   └── emailService.js             # 邮件发送服务 (密码重置/联系表单)
│
├── views/                          # EJS 模板
│   ├── layout.ejs                  # 主布局模板
│   ├── home.ejs                    # 首页
│   ├── login.ejs                   # 登录页
│   ├── signup.ejs                  # 注册页
│   ├── about.ejs                   # 关于页
│   ├── documentation.ejs           # 文档页
│   ├── review.ejs                  # 数据审核页
│   ├── contact.ejs                 # 联系我们页
│   ├── enter_and_edit_data.ejs     # 数据录入/编辑入口页
│   ├── enter_data_by_form.ejs      # 表单录入页
│   ├── enter_data_by_file.ejs      # 文件上传录入页
│   ├── my_locations.ejs            # 我的位置管理页
│   ├── my_locations_view.ejs       # 位置查看页
│   ├── my_samples.ejs              # 我的样本页
│   ├── my_profile.ejs              # 个人资料页
│   ├── admin-contact.ejs           # 管理员联系表单管理页
│   ├── reset_password.ejs          # 密码重置页
│   ├── reset_password_expired.ejs  # 重置链接过期页
│   ├── error.ejs                   # 错误页
│   ├── captcha_test.ejs            # 验证码测试页
│   │
│   ├── partials/                   # 公共模板片段
│   │   ├── header.ejs              # 页头导航
│   │   ├── sidebar.ejs             # 侧边栏菜单
│   │   ├── footer.ejs              # 页脚
│   │   └── timeout_modal.ejs       # 会话超时提示弹窗
│   │
│   └── data_forms/                 # 多步骤数据录入表单
│       ├── formpage1.ejs           # 步骤1: 选择采样位置
│       ├── formpage2.ejs           # 步骤2: 采样事件信息
│       ├── formpage3.ejs           # 步骤3: 样品详情
│       ├── formpage4.ejs           # 步骤4: 塑料计数统计
│       ├── formpage5.ejs           # 步骤5: 详细分析数据
│       └── formpage6.ejs           # 步骤6: 审核并提交
│
├── public/                         # 静态资源
│   ├── css/
│   │   ├── mp_style.css            # 主应用样式
│   │   ├── style.css               # 通用样式
│   │   ├── auth.css                # 认证页面样式
│   │   ├── auth-pages.css          # 认证页面附加样式
│   │   └── fancy-modal.css         # 弹窗组件样式
│   │
│   ├── js/
│   │   ├── common.js               # 通用工具函数
│   │   ├── app.js                  # 前端应用入口
│   │   ├── main.js                 # 主脚本
│   │   ├── auth.js                 # 登录/注册表单处理
│   │   ├── form-handler.js         # 数据录入表单核心处理器
│   │   ├── form-loader.js          # 表单加载器
│   │   ├── form-validation.js      # 表单验证逻辑
│   │   ├── multi-form-handler.js   # 多表单处理器
│   │   ├── map-home.js             # 首页地图
│   │   ├── map-review.js           # 数据审核地图
│   │   ├── map-data-entry.js       # 数据录入地图
│   │   ├── map-handler.js          # 地图通用处理
│   │   ├── enter-and-edit-map.js   # 录入编辑地图
│   │   ├── my-locations.js         # 位置管理功能
│   │   ├── session-timeout.js      # 会话超时检测
│   │   ├── file-upload.js          # 文件上传处理
│   │   ├── dashboard.js            # 仪表板功能
│   │   ├── fancy-modal.js          # 弹窗组件
│   │   └── stagewise-toolbar.js    # 阶段工具栏
│   │
│   └── assets/                     # 图片、图标等静态资源
│
├── scripts/                        # 数据库管理脚本
│   ├── init-database.js            # 数据库初始化
│   ├── check-database.js           # 数据库状态检查
│   ├── update-database.js          # 数据库结构更新
│   └── create-sample-table.js      # 样本表创建
│
├── db/                             # 数据库备份
│   └── sweetl23_partner_demo_*.sql # 完整数据库导出
│
├── uploads/                        # 用户上传文件目录
├── logs/                           # 应用日志目录
└── docs/                           # 项目文档
    ├── DEVELOPER_MANUAL.md         # 开发者手册 (本文件)
    ├── DEVELOPER_MANUAL_EN.md      # 开发者手册 (英文版)
    ├── QUICKSTART.md               # 快速入门指南
    ├── QUICKSTART_EN.md            # 快速入门指南 (英文版)
    └── env.template.txt            # 环境变量模板
```

### 架构总览

```
浏览器 (Browser)
    │
    ▼
┌───────────────┐
│   Express.js  │  ← app.js 入口
├───────────────┤
│  中间件链      │  ← Helmet / CORS / Morgan / Session / Body Parser
├───────────────┤
│  路由层        │
│  ├── /auth/*  │  ← 认证 (登录/注册/密码重置)
│  ├── /api/*   │  ← REST API (数据增删改查)
│  └── /*       │  ← 页面渲染 (EJS 模板)
├───────────────┤
│  服务层        │  ← emailService (邮件发送)
├───────────────┤
│  数据层        │  ← mysql2 连接池 → MariaDB
└───────────────┘
```

---

## 3. 环境配置

### 3.1 环境变量

在项目根目录创建 `.env` 文件（根据 `docs/env.template.txt` 模板）：

```bash
cp docs/env.template.txt .env
```

必要配置项：

```bash
# ---- 应用配置 ----
NODE_ENV=development
PORT=3001

# ---- 数据库配置 ----
DB_HOST=104.247.77.90
DB_USER=your_database_username
DB_PASS=your_database_password
DB_NAME=sweetl23_partner_demo

# ---- Session 配置 ----
SESSION_SECRET=your_secure_random_session_secret_key_here
SESSION_TIMEOUT=1800          # 超时时间 (秒)，默认30分钟
COOKIE_HTTP_ONLY=true

# ---- SMTP 邮件配置 ----
SMTP_HOST=smtp.your-provider.com
SMTP_PORT=587
SMTP_USER=your_email@domain.com
SMTP_PASS=your_email_password

# ---- 管理员邮箱 (联系表单通知) ----
ADMIN_EMAIL_1=admin1@domain.com
ADMIN_EMAIL_2=admin2@domain.com
ADMIN_EMAIL_3=admin3@domain.com

# ---- 生产环境 CORS ----
# ALLOWED_ORIGINS=https://your-production-domain.com,https://www.your-domain.com
```

### 3.2 本地开发

```bash
# 安装依赖
npm install

# 开发模式 (nodemon 热重载)
npm run dev

# 生产模式
npm start
```

> **注意**: 本地开发默认使用端口 `3001`，以避免与远程 Docker 容器（占用 3000 端口）冲突。

### 3.3 数据库

项目使用远程 MariaDB 数据库：

- **远程服务器**: CentOS 7, IP `104.247.77.90`
- **数据库名**: `sweetl23_partner_demo`
- **连接方式**: `mysql2/promise` 连接池，最大连接数 10
- **字符集**: `utf8mb4`

数据库管理脚本：

```bash
# 初始化数据库（根据 database/schema.sql 创建表结构）
npm run init-db

# 检查数据库状态（列出表和记录数）
node scripts/check-database.js

# 更新数据库结构
node scripts/update-database.js
```

---

## 4. 核心模块详解

### 4.1 应用入口 (`app.js`)

`app.js` 是应用主入口，负责以下工作：

1. **中间件配置**: Helmet (安全头)、CORS (跨域)、Morgan (日志)、Body Parser、Cookie Parser、Session
2. **视图引擎**: 设置 EJS 模板引擎，开发模式禁用视图缓存
3. **路由挂载**: `/auth/*` → 认证路由，`/api/*` → API 路由，`/*` → 页面路由
4. **旧版兼容**: API 路由同时挂载到 `/` 根路径，兼容旧版 PHP 端点（如 `/php/get_map_data.php`）
5. **错误处理**: 全局错误处理中间件与 404 处理
6. **启动流程**: 测试数据库连接 → 启动 HTTP 服务 → 动态检测网络 IP

关键行为说明：
- **开发环境**: 完全禁用 Helmet 安全头（方便调试），CORS 允许任何来源
- **生产环境**: 启用 CSP 等安全策略，CORS 仅允许 `ALLOWED_ORIGINS` 中的域名
- **日志过滤**: 自动跳过 `GET /api/check-session` 的日志输出（减少噪音）

### 4.2 认证系统

#### 认证路由 (`routes/auth.js`)

| 端点 | 方法 | 描述 | 认证 |
|------|------|------|------|
| `/auth/captcha` | GET | 生成验证码图片 (使用 @napi-rs/canvas) | 否 |
| `/auth/login` | POST | 用户登录 | 否 |
| `/auth/signup` | POST | 用户注册 | 否 |
| `/auth/logout` | POST | 用户登出 | 否 |
| `/auth/check-session` | GET | 检查会话状态 | 否 |
| `/auth/reset-password-request` | POST | 请求密码重置邮件 | 否 |
| `/auth/reset-password` | GET | 密码重置页面 (验证 Token) | 否 |
| `/auth/reset-password` | POST | 提交新密码 | 否 |

**登录流程**:
```
1. 前端提交用户名/邮箱 + 密码 + 验证码
2. 验证码校验 (对比 session 中存储的值)
3. 数据库查询用户 (支持用户名或邮箱)
4. bcrypt 密码验证
5. 创建 Session (存储 user_id, username, email 等)
6. 如选择"记住我"，设置 Cookie (30天有效)
7. 重定向到首页或之前请求的页面
```

**注册流程**:
```
1. 前端提交用户名、邮箱、密码等信息 + 验证码
2. 验证码校验
3. 检查用户名和邮箱唯一性
4. bcrypt 密码加密 (12轮)
5. 插入用户记录到数据库
6. 自动登录并重定向
```

**密码重置流程**:
```
1. 用户提交邮箱 → 生成随机 Token (32字节 hex)
2. Token 存入 password_reset_tokens 表 (1小时有效)
3. 发送重置邮件 (含重置链接)
4. 用户点击链接 → 验证 Token 有效性
5. 提交新密码 → 更新密码并标记 Token 已使用
6. 发送确认邮件
```

#### 认证中间件 (`middleware/auth.js`)

| 中间件 | 用途 |
|--------|------|
| `requireAuth` | 保护需要登录的路由。未认证的 API 请求返回 401 JSON，页面请求重定向到登录页 |
| `redirectIfLoggedIn` | 已登录用户访问登录/注册页时重定向到首页 |
| `checkSessionTimeout` | 全局中间件，检查会话是否超时 (基于 `SESSION_TIMEOUT` 配置) |

### 4.3 数据录入 API (`routes/api.js`)

#### 完整 API 端点列表

**健康检查与测试**

| 端点 | 方法 | 描述 | 认证 |
|------|------|------|------|
| `/api/health` | GET | 健康检查 | 否 |
| `/api/cors-test` | GET | CORS 连通性测试 | 否 |
| `/api/test-save` | POST | 数据保存测试 | 否 |

**地图数据**

| 端点 | 方法 | 描述 | 认证 |
|------|------|------|------|
| `/api/map-data` | GET | 获取地图标记数据 | 否 |
| `/php/get_map_data.php` | GET | 兼容旧版 PHP 端点 | 否 |

**表单数据提交**

| 端点 | 方法 | 描述 | 认证 |
|------|------|------|------|
| `/api/save-form-data` | POST | 保存多步骤表单数据 | 是 |
| `/api/upload-file-data` | POST | 上传 Excel 数据文件 | 是 |

**参考数据**

| 端点 | 方法 | 描述 | 认证 |
|------|------|------|------|
| `/api/references` | GET | 获取参考数据 (聚合物类型、用途分类等) | 否 |

**位置管理**

| 端点 | 方法 | 描述 | 认证 |
|------|------|------|------|
| `/api/locations` | GET | 获取位置列表 (登录用户可按用户过滤) | 否 |
| `/api/locations` | POST | 创建新位置 | 是 |
| `/api/my-locations` | GET | 获取当前用户的位置 | 是 |
| `/api/check-location-exists` | GET | 检查位置名称是否已存在 | 否 |

**用户数据**

| 端点 | 方法 | 描述 | 认证 |
|------|------|------|------|
| `/api/my-samples` | GET | 获取当前用户的样本 (分页) | 是 |
| `/api/check-session` | GET | 检查会话状态 | 否 |

**联系表单**

| 端点 | 方法 | 描述 | 认证 |
|------|------|------|------|
| `/api/contact` | POST | 提交联系表单 | 否 |
| `/api/admin/contact-submissions` | GET | 获取联系表单提交列表 | 是 |
| `/api/admin/contact-submissions/:id/status` | PUT | 更新提交状态 | 是 |

**模板下载**

| 端点 | 方法 | 描述 | 认证 |
|------|------|------|------|
| `/api/download-template` | GET | 下载数据模板文件 | 是 |

**测试数据**

| 端点 | 方法 | 描述 | 认证 |
|------|------|------|------|
| `/api/add-test-location-data` | POST | 添加测试位置数据 | 是 |

#### 表单数据保存流程 (`POST /api/save-form-data`)

这是系统最核心的 API，在一个数据库事务中完成多表插入：

```
1. 接收前端提交的完整表单数据
2. 百分比字段验证 (各组必须合计 100%)
3. 包装层级计数验证
4. 开启数据库事务 (BEGIN)
5. 插入 SamplingEvent (采样事件)
6. 插入 SampleDetails (样品详情)
7. 插入 MicroplasticsInSample (微塑料数据，如有)
8. 插入 FragmentsInSample (碎片数据，如有)
9. 逐条插入 PackagesInSample (包装数据，如有)
10. 插入 RamanDetails (拉曼光谱数据，如有)
11. 提交事务 (COMMIT)
12. 事务失败则回滚 (ROLLBACK)
```

### 4.4 页面路由 (`routes/pages.js`)

| 路径 | 描述 | 需要认证 |
|------|------|----------|
| `/` | 重定向到 `/home` | 否 |
| `/home` | 首页 (地图展示) | 否 |
| `/login` | 登录页 | 否 (已登录则重定向) |
| `/signup` | 注册页 | 否 (已登录则重定向) |
| `/about` | 关于页面 | 否 |
| `/documentation` | 文档说明页 | 否 |
| `/review` | 数据审核页 | 否 |
| `/contact` | 联系我们页 | 否 |
| `/enter_and_edit_data` | 数据录入/编辑入口 | 是 |
| `/enter_data_by_form` | 表单数据录入 | 是 |
| `/enter_data_by_file` | 文件上传录入 | 是 |
| `/my-locations` | 我的位置管理 | 是 |
| `/my-locations-view` | 位置查看 | 是 |
| `/my-samples` | 我的样本 | 是 |
| `/my-profile` | 个人资料 (GET/POST) | 是 |
| `/admin/contact` | 管理员联系表单管理 | 是 |
| `/reset-password-expired` | 密码重置链接过期 | 否 |
| `/logout` | 登出 (GET) | 否 |
| `/captcha_test` | 验证码测试 | 否 |

### 4.5 邮件服务 (`services/emailService.js`)

基于 Nodemailer 实现，提供以下功能：

| 函数 | 用途 |
|------|------|
| `sendPasswordResetEmail(to, resetLink, username)` | 发送密码重置邮件 |
| `sendPasswordResetConfirmationEmail(to, username)` | 发送密码重置成功确认邮件 |
| `sendContactFormEmail(contactData)` | 将联系表单内容发送给管理员 |
| `sendContactConfirmationEmail(contactData)` | 向用户发送联系表单提交确认 |

配置依赖的环境变量：`SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`ADMIN_EMAIL_1/2/3`

### 4.6 数据库配置 (`config/database.js`)

```javascript
// 连接池配置
{
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || 'mysql',
    database: process.env.DB_NAME || 'sweetl23_partner_demo',
    charset: 'utf8mb4',
    connectionLimit: 10
}
```

导出：
- `pool` — mysql2/promise 连接池实例，所有数据库操作使用
- `testConnection()` — 启动时测试数据库连通性

### 4.7 Session 配置 (`config/session.js`)

```javascript
{
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,                    // 开发环境支持 HTTP
        httpOnly: true,                   // 默认开启
        maxAge: SESSION_TIMEOUT * 1000,   // 默认 30 分钟
        sameSite: 'lax' | 'strict'        // 开发 lax / 生产 strict
    },
    name: 'sessionId'
}
```

---

## 5. 数据库结构

### 核心业务表

#### users (用户表)

| 字段 | 类型 | 说明 |
|------|------|------|
| User_UniqueID | INT AUTO_INCREMENT PK | 用户唯一 ID |
| username | VARCHAR(50) UNIQUE | 用户名 |
| email | VARCHAR(100) UNIQUE | 邮箱 |
| password | VARCHAR(255) | bcrypt 哈希密码 |
| full_name | VARCHAR(100) | 全名 |
| institution | VARCHAR(150) | 所属机构 |
| cell_phone | VARCHAR(20) | 手机号 |
| sample_confidentiality | ENUM('public','restricted','private') | 数据公开级别 |
| sample_storage_location | INT | 样本存储位置 |
| created_at | TIMESTAMP | 创建时间 |
| updated_at | TIMESTAMP | 更新时间 |

#### Location (位置表)

| 字段 | 类型 | 说明 |
|------|------|------|
| Loc_UniqueID | INT PK | 位置唯一 ID |
| UserLocID_txt | TEXT | 用户自定义位置 ID |
| LocationName | VARCHAR(255) UNIQUE | 位置名称 |
| Location_Desc | TEXT | 位置描述 |
| Env-Indoor_SelectID | INT | 环境类型 (室内/室外) |
| Lat-DecimalDegree | DECIMAL(10,6) | 纬度 |
| Long-DecimalDegree | DECIMAL(10,6) | 经度 |
| StreetAddress | TEXT | 街道地址 |
| City | TEXT | 城市 |
| State | TEXT | 州/省 |
| Country | TEXT | 国家 |
| ZipCode | INT | 邮编 |
| UserCreated | TEXT | 创建者 |
| DateCreated | DATETIME | 创建日期 |

#### SamplingEvent (采样事件表)

| 字段 | 类型 | 说明 |
|------|------|------|
| SamplingEventUniqueID | INT UNIQUE | 采样事件 ID |
| LocationID_Num | INT | 关联位置 ID |
| SamplingDate | DATE | 采样日期 |
| UserSamplingID | TEXT | 用户采样 ID |
| AirTemp-C | DECIMAL(10,0) | 气温 (°C) |
| Weather-Current | INT | 当前天气 |
| Weather-Precedent24 | INT | 前24小时天气 |
| Rainfall-cm-Precedent24 | DECIMAL(10,0) | 前24小时降雨量 (cm) |
| SamplerNames | TEXT | 采样人员 |
| DeviceInstallationPeriod | ENUM('no','yes') | 是否安装设备采集 |
| DeviceStartDate | DATE | 设备开始日期 |
| DeviceEndDate | DATE | 设备结束日期 |
| SampleTime | TIME | 采样时间 |
| AdditionalNotes | TEXT | 备注 |

#### SampleDetails (样品详情表)

| 字段 | 类型 | 说明 |
|------|------|------|
| SampleUniqueID | INT UNIQUE | 样品 ID |
| SamplingEvent_Num | INT | 关联采样事件 ID |
| MediaType_SelectID | INT | 媒介类型 |
| WholePkg_Count | INT | 完整包装计数 |
| FragLargerThan5mm_Count | INT | >5mm 碎片计数 |
| Micro5mmAndSmaller_Count | INT | ≤5mm 微塑料计数 |
| WaterEnvType_SelectID | INT | 水环境类型 |
| SoilMoisture% | INT | 土壤湿度 (%) |
| StorageLocation | INT | 存储位置 |
| MediaSubType | VARCHAR(100) | 媒介子类型 |
| VolumeSampled | DECIMAL(10,3) | 采样体积 |
| WaterDepth | DECIMAL(10,2) | 水深 |
| FlowVelocity | DECIMAL(10,2) | 流速 |

#### MicroplasticsInSample (微塑料分析表)

| 字段 | 类型 | 说明 |
|------|------|------|
| Micro_UniqueID | INT PK | 微塑料记录 ID |
| SampleDetails_Num | INT | 关联样品 ID |
| PercentSize_<1um | INT | <1μm 尺寸占比 (%) |
| PercentSize_1-20um | INT | 1-20μm 占比 |
| PercentSize_20-100um | INT | 20-100μm 占比 |
| PercentSize_100um-1mm | INT | 100μm-1mm 占比 |
| PercentSize_1-5mm | INT | 1-5mm 占比 |
| PercentForm_fiber | INT | 纤维形态占比 |
| PercentForm_Pellet | INT | 颗粒形态占比 |
| PercentForm_Fragment | INT | 碎片形态占比 |
| PercentColor_Clear | INT | 透明颜色占比 |
| PercentColor_OpaqueLight | INT | 不透明浅色占比 |
| PercentColor_OpaqueDark | INT | 不透明深色占比 |
| PercentColor_Mixed | INT | 混合颜色占比 |
| Method_Desc | TEXT | 分析方法描述 |

#### FragmentsInSample (碎片分析表)

| 字段 | 类型 | 说明 |
|------|------|------|
| Fragment_UniqueID | INT PK | 碎片记录 ID |
| SampleDetails_Num | INT | 关联样品 ID |
| PercentColor_Clear | INT | 透明占比 |
| PercentColor_Op-Color | INT | 不透明彩色占比 |
| PercentColor_Op-Dk | INT | 不透明深色占比 |
| PercentColor_Mixed | INT | 混合占比 |
| PercentForm_Fiber | INT | 纤维占比 |
| PercentForm_Pellet | INT | 颗粒占比 |
| PercentForm_Film | INT | 薄膜占比 |
| PercentForm_Foam | INT | 泡沫占比 |
| PercentForm_HardPlastic | INT | 硬塑料占比 |

#### PackagesInSample (包装记录表)

| 字段 | 类型 | 说明 |
|------|------|------|
| PackageDetailsUniqueID | INT UNIQUE | 包装记录 ID |
| SampleDetails_Num | INT | 关联样品 ID |
| Form_SelectID | INT | 形态分类 |
| Purpose_SelectID | INT | 用途分类 |
| PackagingPurpose | VARCHAR(200) | 包装用途描述 |
| RecycleCode | VARCHAR(20) | 回收标识码 |
| ColorOpacity | VARCHAR(50) | 颜色透明度 |
| Color | VARCHAR(50) | 颜色 |
| UserPieceID | VARCHAR(100) | 用户编号 |

#### password_reset_tokens (密码重置令牌表)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT AUTO_INCREMENT PK | 记录 ID |
| user_id | INT | 关联用户 ID |
| token | VARCHAR(255) | 重置令牌 |
| expires_at | DATETIME | 过期时间 (1小时) |
| used | TINYINT(1) | 是否已使用 |
| created_at | TIMESTAMP | 创建时间 |

#### contact_submissions (联系表单提交表)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT AUTO_INCREMENT PK | 记录 ID |
| name | VARCHAR(100) | 提交者姓名 |
| email | VARCHAR(100) | 提交者邮箱 |
| subject | VARCHAR(200) | 主题 |
| message | TEXT | 消息内容 |
| status | ENUM | 处理状态 |
| created_at | TIMESTAMP | 创建时间 |

### 参考数据表 (Reference Tables)

| 表名 | 说明 |
|------|------|
| MediaType_WithinLitterWaterSoil_Ref | 媒介类型参考 (垃圾/水/土壤) |
| WaterEnvType_Ref | 水环境类型参考 |
| WeatherType_Ref | 天气类型参考 |
| StorageLoc_Ref | 存储位置参考 |
| Wavelength_Ref | 波长范围参考 |
| LocType_Env-Indoor_Ref | 位置环境类型参考 |
| PolymerType_Ref | 聚合物类型参考 |
| Purpose_Ref | 包装用途参考 |
| Form_Ref | 包装形态参考 |
| ColorType_Ref | 颜色类型参考 |

---

## 6. 前端架构

### 多步骤表单系统

数据录入采用6步向导式表单，由 `form-handler.js` 统一管理：

```
步骤 1: 选择采样位置 (formpage1.ejs)
    ├── 地图选择已有位置
    └── 创建新位置（输入坐标、地址等）
        ↓
步骤 2: 采样事件信息 (formpage2.ejs)
    ├── 日期、时间、天气
    ├── 温度、降雨量
    └── 采样人员、设备信息
        ↓
步骤 3: 样品详情 (formpage3.ejs)
    ├── 媒介类型 (水/土壤/垃圾)
    ├── 各类别计数
    └── 环境参数
        ↓
步骤 4: 塑料计数统计 (formpage4.ejs)
    ├── 完整包装计数分类
    ├── 碎片计数分类
    └── 微塑料计数分类
        ↓
步骤 5: 详细分析数据 (formpage5.ejs)
    ├── 尺寸分布百分比
    ├── 形态分布百分比
    ├── 颜色分布百分比
    ├── 聚合物分布百分比
    └── 拉曼光谱数据（可选）
        ↓
步骤 6: 审核并提交 (formpage6.ejs)
    ├── 数据概览确认
    └── 最终提交
```

### 地图功能

项目在多个页面使用了 Leaflet 地图：

| 文件 | 页面 | 功能 |
|------|------|------|
| `map-home.js` | 首页 | 展示所有采样点位标记 |
| `map-review.js` | 审核页 | 带筛选的采样数据地图展示 |
| `map-data-entry.js` | 表单步骤1 | 选择位置或在地图上新建位置 |
| `map-handler.js` | 通用 | 地图初始化与通用操作 |
| `enter-and-edit-map.js` | 录入编辑页 | 录入编辑页面地图 |

### 前端通用组件

| 文件 | 功能 |
|------|------|
| `common.js` | 通用工具函数、全局变量 |
| `session-timeout.js` | 会话超时检测与提示弹窗 |
| `fancy-modal.js` | 自定义弹窗组件 |
| `auth.js` | 登录/注册页面表单处理 |
| `file-upload.js` | Excel 文件上传处理 |

### CSS 文件

| 文件 | 用途 |
|------|------|
| `mp_style.css` | 应用主样式 |
| `style.css` | 通用基础样式 |
| `auth.css` | 认证页面样式 |
| `auth-pages.css` | 认证页面附加样式 |
| `fancy-modal.css` | 弹窗组件样式 |

---

## 7. 部署指南

### Docker 部署

```bash
# 构建镜像
docker build -t mp-data-entry .

# 使用 Docker Compose 启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止
docker-compose down
```

**Dockerfile 说明**:
- 基础镜像: `node:lts-slim`
- 安装 Canvas 系统依赖 (`libcairo2-dev` 等)
- 以非 root 用户 (`nodejs`) 运行，提升安全性
- 健康检查: `curl -f http://localhost:3000/api/health`
- 暴露端口: `3000`

**docker-compose.yml 说明**:
- 端口映射: `3000:3000`
- 网络模式: `host`（用于连接宿主机数据库）
- 挂载卷: 源代码 (只读)、`uploads/`、`logs/`、`.env` (只读)
- 自动重启策略

### 生产环境部署清单

- [ ] 设置 `NODE_ENV=production`
- [ ] 配置正确的数据库连接凭据
- [ ] 配置 SMTP 邮件服务
- [ ] 设置强 Session 密钥 (至少 32 字符随机字符串)
- [ ] 配置 `ALLOWED_ORIGINS` CORS 允许域名
- [ ] 配置反向代理 (推荐 Nginx)
- [ ] 启用 HTTPS (SSL/TLS 证书)
- [ ] 设置日志轮转
- [ ] 确保 `uploads/` 和 `logs/` 目录存在且有写入权限
- [ ] 设置进程管理器 (PM2 或使用 Docker)

### Nginx 反向代理参考配置

```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 8. 开发规范

### API 响应格式

所有 API 统一使用以下 JSON 响应格式：

```javascript
// 成功响应
{
    success: true,
    message: "Operation successful",
    data: { ... }
}

// 错误响应
{
    success: false,
    message: "Error description",
    errors: [ ... ]  // 验证错误详情 (可选)
}
```

### 数据验证规则

**百分比字段组** — 每组必须合计 100%：
- 微塑料尺寸分布百分比 (<1μm + 1-20μm + 20-100μm + 100μm-1mm + 1-5mm = 100%)
- 微塑料颜色分布百分比
- 微塑料形态分布百分比
- 微塑料聚合物分布百分比
- 碎片形态分布百分比
- 碎片聚合物分布百分比

**包装层级验证**:
- 各分类计数之和 = 总计数
- 各分类回收代码计数 = 该分类计数

### 代码风格

| 规则 | 说明 |
|------|------|
| 文件命名 | 使用 kebab-case (如 `form-handler.js`) |
| 路由命名 | RESTful 风格 |
| 数据库字段 | 保持原有命名风格 (含连字符，如 `AirTemp-C`) |
| 错误处理 | 统一 JSON 响应格式 |
| 异步操作 | 使用 async/await |
| 数据库操作 | 使用参数化查询防止 SQL 注入 |

---

## 9. 扩展开发指南

### 添加新页面

1. 在 `routes/pages.js` 添加路由:

```javascript
router.get('/new-page', requireAuth, (req, res) => {
    res.render('new_page', {
        title: 'New Page',
        currentPage: 'new-page',
        user: {
            id: req.session.user_id,
            username: req.session.username,
            full_name: req.session.full_name
        }
    });
});
```

2. 创建视图文件 `views/new_page.ejs`

3. 在 `views/partials/sidebar.ejs` 添加导航项

### 添加新 API

在 `routes/api.js` 中添加:

```javascript
router.post('/new-endpoint',
    requireAuth,
    [
        body('field_name').notEmpty().withMessage('Field is required'),
        // 更多验证规则...
    ],
    async (req, res) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.json({ success: false, errors: errors.array() });
            }
            // 业务逻辑...
            res.json({ success: true, data: result });
        } catch (error) {
            console.error('Error:', error);
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }
);
```

### 数据库变更

1. 编写 SQL 迁移脚本（放置于 `db/` 或 `scripts/`）
2. 在对应路由文件中添加新字段支持
3. 使用 `node scripts/update-database.js` 执行迁移（或手动执行 SQL）

---

## 10. 已知问题与注意事项

### Canvas 模块

项目使用 `@napi-rs/canvas` 而非 `canvas`。如果遇到导入错误，请确认代码中使用的是：

```javascript
const { createCanvas } = require('@napi-rs/canvas');
// 而非: const canvas = require('canvas');
```

### MySQL2 配置

`mysql2` 连接池不支持以下选项（已移除）：

```javascript
// 以下选项会导致警告或错误，不要添加：
// acquireTimeout: 60000
// timeout: 60000
// reconnect: true
```

### 端口冲突

本地开发使用 `PORT=3001`，远程 Docker 容器使用 `3000`。如果仍有冲突，可在 `.env` 中修改为其他端口。

### 数据库字段命名

由于是从旧系统迁移，数据库字段名包含连字符（如 `AirTemp-C`、`Lat-DecimalDegree`）。在 SQL 查询中需要使用反引号包裹：

```sql
SELECT `AirTemp-C`, `Lat-DecimalDegree` FROM SamplingEvent;
```

---

## 11. 常用命令

```bash
# ---- 开发 ----
npm install              # 安装依赖
npm run dev              # 启动开发服务器 (nodemon)
npm start                # 启动生产服务器
npm run init-db          # 初始化数据库

# ---- 数据库脚本 ----
node scripts/check-database.js    # 检查数据库状态
node scripts/update-database.js   # 更新数据库结构

# ---- Docker ----
docker build -t mp-data-entry .   # 构建镜像
docker-compose up -d              # 启动容器
docker-compose logs -f            # 查看日志
docker-compose down               # 停止容器
docker-compose restart             # 重启容器

# ---- 数据库命令行 ----
mysql -h 104.247.77.90 -u <user> -p sweetl23_partner_demo
```

---

## 12. 联系与支持

- **项目维护**: Wayne State University
- **问题反馈**: 使用应用内联系表单 (`/contact`)
- **邮件服务**: 通过 SMTP 配置

---

## 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0.0 | 2025-01 | PHP → Node.js 重构完成，核心功能上线 |

---

*文档最后更新: 2026-02-13*
