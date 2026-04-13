# Web Studio：Find ↔ FileManager 双向跳转设计

> 日期：2026-04-12

## 背景

`/data/find`（语义搜索）和 `/data/filesystem`（文件管理器）共享同一套 `viking://` URI 体系，但前端完全割裂：

- 搜索结果的 `uri` 字段是纯文本，无法点击跳转
- 文件管理器没有搜索入口
- `FindPage` 用 `normalizeFindRows()` 将后端返回的 `{memories, resources, skills}` 三组结果拍平成单一表格，丢失分组结构

## 功能实现现状速查

### 文件管理模块

| 功能 | 后端 API | 前端 UI | 状态 |
|------|---------|---------|------|
| 文件树 | ✅ `GET /api/v1/fs/tree` | ✅ `FileTree.tsx` | 完整 |
| 目录列表 | ✅ `GET /api/v1/fs/ls` | ✅ `FileList.tsx` | 完整 |
| 详情面板 | ✅ `GET /api/v1/content/read` | ✅ `FilePreview.tsx` (Markdown/代码高亮/图片) | 完整 |
| 文本阅读 | ✅ offset/limit 分页 | ✅ 自动类型识别，2MB 限制 | 完整 |
| L0/L1 摘要 | ✅ `/content/abstract` `/content/overview` | ❌ 无专用 UI | 仅后端 |
| 下载 | ✅ `/content/download` | ⚠️ 仅用于图片渲染，无下载按钮 | 部分 |
| 编辑写入 | ✅ `/content/write` replace/append + 锁机制 + 语义重嵌入 | ❌ 无编辑器 UI | 仅后端 |
| 重建索引 | ✅ `/content/reindex` 同步/异步，可 regenerate L0/L1 | ❌ 无 UI 按钮 | 仅后端 |

### 搜索模块

| 功能 | 后端 API | 前端 UI | 状态 |
|------|---------|---------|------|
| 语义搜索 find | ✅ `HierarchicalRetriever` 向量+rerank | ✅ `FindPage` | 完整 |
| 带 session 的 search | ✅ `IntentAnalyzer` + 并发 `asyncio.gather` | ❌ 无 UI | 仅后端 |
| Grep | ✅ `POST /search/grep` | ❌ 无 UI | 仅后端 |
| Glob | ✅ `POST /search/glob` | ❌ 无 UI | 仅后端 |
| 筛选器 DSL | ✅ `{op, field, conds}` 结构 | ❌ 无 UI | 仅后端 |
| Tags | ✅ 搜索过滤 + 资源标记 | ⚠️ FileList 显示 Badge，搜索页无过滤输入 | 部分 |
| 结果 provenance | ✅ `ThinkingTrace` 追踪搜索路径 | ❌ 无展示 UI | 仅后端 |
| 结果跳转资源详情 | ⚠️ URI 路由基础设施存在 | ❌ 未实现 | 未实现 |

## 搜索架构

### 向量检索

- 单一物理集合 `"context"`，通过 `context_type` 字段区分三类结果

| `context_type` | URI 命名空间 | 含义 |
|---------------|-------------|------|
| `memory` | `viking://user/{space}/memories` | 用户/Agent 记忆 |
| `resource` | `viking://resources` | 文件、文档、外部知识 |
| `skill` | `viking://agent/{space}/skills` | 可复用 Agent 技能 |

### 分层层级索引

| Level | 文件 | 含义 |
|-------|------|------|
| L0 | `.abstract.md` | 目录一段话摘要 |
| L1 | `.overview.md` | 目录详细概述 |
| L2 | 实际文件 | 叶子内容 |

检索流程：全局 ANN 搜索 → Rerank L0/L1 → 优先队列递归下探 → 热度融合
分数传播：`score = 0.5 × child + 0.5 × parent`
热度融合：`final = 0.8 × semantic + 0.2 × hotness`

### find vs search

| | `find` | `search` |
|--|--------|----------|
| Session | 无 | 有（可选 `session_id`） |
| LLM 意图分析 | 无 | 有（`IntentAnalyzer` → `QueryPlan`） |
| 查询分解 | 单个 `TypedQuery` | 多个，每 context_type 一个 |
| 并发 | 否 | `asyncio.gather` |

## 双向跳转设计方案

### 设计决策

1. **不合并，做跳转** — 两者心智模型不同（"知道在哪去找它" vs "不知道在哪帮我找"）
2. **只有 resource URI 可跳转** — memory/skill URI 是概念实体，不是可浏览文件路径
3. **文件 vs 目录 URI** — 文件 URI 提取父目录 + `?file=` 预选文件
4. **Find 页支持深链** — 新增 `?q=` 和 `?target_uri=` URL 参数

### 改动文件清单（6 个文件）

```
web-studio/src/
├── lib/legacy/data-utils.ts          # 新增 GroupedFindResult 类型和 parseGroupedFindResult()
├── routes/data/find.tsx              # 新增 validateSearch，接收 ?q= 和 ?target_uri=
├── routes/data/filesystem.tsx        # FileSystemSearch 新增 file?: string
├── components/viking-fm/
│   └── VikingFileManager.tsx         # 新增 initialFile prop + 自动选中 effect + 搜索按钮
└── components/data/
    └── find-page.tsx                 # 重写：分组展示 + resource URI 可点击跳转
```

### 跳转逻辑

**搜索 → 文件管理器**（仅 resource）：
```
目录 URI → navigate({ to: '/data/filesystem', search: { uri } })
文件 URI → navigate({ to: '/data/filesystem', search: { uri: parentUri(uri), file: uri } })
```

**文件管理器 → 搜索**：
```
工具栏按钮 → navigate({ to: '/data/find', search: { target_uri: currentUri } })
```

### 边缘 Case

| Case | 处理方式 |
|------|---------|
| URI 是文件不是目录 | `parentUri()` 提取父目录 + `?file=` 预选文件 |
| URI 不存在（已删除/移动） | 文件管理器显示空目录，`initialFile` 不匹配则不选中 |
| memory/skill URI | 显示为不可点击纯文本 |
| 部分结果组为空 | `FindResultGroup` 空组返回 `null` 不渲染 |
| URI 含特殊字符 | TanStack Router search params 自动 URL encode |
| 从文件管理器反复跳转 | `useEffect` 监听 props 变化同步 state |
