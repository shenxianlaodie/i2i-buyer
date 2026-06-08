# i2i Studio — AI 创意工作室

面向电商服装行业的 AI 创意工作室，帮助用户利用 AI 生成服装展示图片和视频。核心场景是将设计稿/印花融合到服装上，以及生成多姿势模特展示图。

---

## 技术架构

| 层级 | 技术栈 |
|------|--------|
| **前端框架** | Next.js 16 (App Router) + React 19 + TypeScript |
| **样式** | Tailwind CSS + shadcn/ui 组件库 |
| **状态管理** | Zustand（本地状态）+ TanStack React Query（服务端状态） |
| **API 层** | tRPC v11（端到端类型安全 RPC） |
| **认证** | NextAuth.js v5（Auth.js），支持钉钉扫码登录 + 管理员账号密码 |
| **数据库** | PostgreSQL + Prisma ORM |
| **AI 网关** | 自研统一网关，聚合多个 AI 供应商 |
| **任务队列** | 内存队列（图片并发 5，视频并发 2） |
| **后台任务** | Inngest |
| **文件存储** | Vercel Blob |
| **缓存/限流** | Upstash Redis |

---

## 功能模块

### 🎨 画板（Studio） — `/studio`
核心创意空间，采用无限画布（Canvas）模式（基于 Fabric.js）。用户可以拖拽排列已生成的图片/视频，选中素材进行以图生图或以图生视频，通过浮动提示词栏输入 prompt 进行 AI 生成。

### 🔄 融合图（Fusion） — `/fusion`
电商服装印花融合的核心功能。将印花图案自然融合到服装底版上，保持底版的版型、姿势与光照。支持表格化批量操作、多版本管理。

### 🧍 多姿势（Pose） — `/pose`
上传一张服装图，利用 AI 生成 4 种标准电商姿势的模特展示图：
- `front_full` — 正面全身图
- `back_full` — 背面全身图
- `right_upper` — 右侧上身图
- `front_upper` — 正面上身图

支持批量操作、版本管理，以及自动生成商品标题和描述文案。

### 🖼️ 素材库（Assets） — `/assets`
管理所有已生成的图片/视频素材，支持收藏、按类型筛选、集合（Collection）管理。

### 🤖 AI 助手（Agent） — `/agent`
创意 AI 助手，帮助用户头脑风暴、创建分镜、推荐提示词、保持角色在全作品中的一致性。

### ⚙️ 设置（Settings）
个人账号管理、API 密钥管理。

### 🔐 管理后台（Workflows） — `/workflows`
管理员功能：用户管理、积分管理、Prompt 模板配置、默认模型配置、用户使用量统计。

---

## AI 集成

### 统一 AI 网关

用户请求 → tRPC → 生成记录写入 DB → 入队 → Worker → AI Gateway → 供应商 API

### 支持的 AI 供应商

| 供应商 | 能力 |
|--------|------|
| **ePhone AI**（主要） | 图片生成/编辑、视频生成（兼容 OpenAI API） |
| **Replicate** | FLUX.1、SDXL 等图片模型 |
| **Fal.ai** | FLUX.1 图片模型 |
| **OpenAI** | DALL-E 3 |
| **Runway** | Gen-4 视频生成 |
| **Pika** | Pika 2.0 视频生成 |
| **Kling（快影）** | Kling 2.6 视频生成 |

### 积分成本模型

每个 AI 模型有对应的积分消耗，新用户默认赠送 100 积分。

---

## 数据库核心模型

| 模型 | 说明 |
|------|------|
| `User` | 用户（支持 role=ADMIN/USER，积分系统） |
| `Generation` | 生成记录（图片/视频），关联供应商和模型 |
| `Asset` | 素材资产（图片/视频） |
| `Collection` | 素材收藏集 |
| `Project` | 项目分组 |
| `Workflow` / `WorkflowStep` | 自动化工作流 |
| `FusionBatch` / `FusionRow` / `FusionVersion` | 融合图批量任务 |
| `PoseBatch` / `PoseRow` / `PoseOutput` / `PoseOutputVersion` | 多姿势批量任务 |
| `CreditTransaction` | 积分交易流水 |
| `TrashedCanvasItem` | 画板回收站 |
| `ApiKey` | 用户 API 密钥 |
| `SystemSetting` | 系统配置 |
| `PromptCache` | 提示词缓存 |

---

## 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入必要的 API 密钥和数据库连接

# 初始化数据库
npx prisma migrate dev

# 启动开发服务器
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 即可访问。
