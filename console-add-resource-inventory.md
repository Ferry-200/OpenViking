# 旧版 Console `Add Resource` 功能盘点

本文档盘点旧版控制台 [`openviking/console`](d:\AI\OpenViking\openviking\console) 中 `Add Resource` 的实际行为，用于新 `web-studio` 重构时做迁移和功能核对。

## 代码来源

- UI 结构：[`openviking/console/static/index.html`](d:\AI\OpenViking\openviking\console\static\index.html)
- UI 逻辑：[`openviking/console/static/app.js`](d:\AI\OpenViking\openviking\console\static\app.js)
- Console 代理路由：[`openviking/console/app.py`](d:\AI\OpenViking\openviking\console\app.py)
- 运行时能力配置：[`openviking/console/config.py`](d:\AI\OpenViking\openviking\console\config.py)
- 后端 API 定义：[`openviking/server/routers/resources.py`](d:\AI\OpenViking\openviking\server\routers\resources.py)

## 总览

旧版 console 将 `Add Resource` 放在 `Data` 分组下的独立面板里，与 `FileSystem` 分离。

它的职责是：

- 接收"服务端路径"或"本地上传文件"两类输入
- 组装 add-resource 请求体
- 调用 console 代理 API
- 将后端原始返回展示到公共 `Result` 面板

它不负责：

- 提供更细的上传进度展示（只会显示简单文本状态）
- 轮询后台任务
- 暴露较新的 API 字段（例如 `parent`、`to`、`source_name`、`preserve_structure`、`watch_interval`、`tags`）
- 动态刷新或自动联动刷新 `FileSystem`

## UI 结构

这个面板有两种输入模式：

- `Path`
- `Upload`

默认模式是 `Path`。这一点在 [`app.js`](d:\AI\OpenViking\openviking\console\static\app.js) 里通过 `state.addResourceMode = "path"` 初始化。

### 表单字段

旧版 UI 中可见的字段包括：

| 元素 ID | 类型 | 标签 | 默认值 | 说明 |
|---------|------|------|--------|------|
| `addResourcePath` | text | Path on OpenViking server | 空 | Path 模式必填 |
| `addResourceFile` | file | Upload file for temp path | 空 | Upload 模式必填 |
| `addResourceTarget` | text | Target URI | `viking://resources/` | 可选 |
| `addResourceWait` | checkbox | wait | 未勾选 | |
| `addResourceStrict` | checkbox | strict | **已勾选** | |
| `addResourceUploadMedia` | checkbox | directly_upload_media | **已勾选** | |
| `addResourceTimeout` | number | Timeout seconds | 空 | min=0, step=0.1 |
| `addResourceIgnoreDirs` | text | ignore_dirs | 空 | 逗号分隔 |
| `addResourceInclude` | text | include pattern | 空 | |
| `addResourceExclude` | text | exclude pattern | 空 | |
| `addResourceReason` | textarea | Reason | 空 | |
| `addResourceInstruction` | textarea | Instruction | 空 | |
| — | button | Add Resource | — | 提交按钮 |

### 默认值

- 模式：`path`
- `wait`：未勾选
- `strict`：已勾选
- `directly_upload_media`：已勾选
- 其他字段：空

## 请求模式

### 1. Path 模式

用户在 `addResourcePath` 中输入一个路径字符串。

提交行为：

- 要求 `write_enabled = true`
- 要求 `path` 非空
- 发起一次 JSON `POST` 请求到 `/console/api/v1/ov/resources`

UI 组装出来的请求体结构如下：

```json
{
  "path": "<用户输入>",
  "target": "<目标 URI>",
  "reason": "<原因>",
  "instruction": "<处理指令>",
  "wait": false,
  "strict": true,
  "directly_upload_media": true,
  "timeout": 30,
  "ignore_dirs": ".git,node_modules",
  "include": "*.md",
  "exclude": "*.log"
}
```

说明：

- 可选字段仅在非空时才会写入
- `timeout` 只有在能解析为正数时才会写入
- 旧版字段名是 `target`，不是 `to` 或 `parent`

### 2. Upload 模式

用户选择一个本地文件。

提交行为：

- 要求 `write_enabled = true`
- 要求必须选择文件
- 先发起一次 `multipart/form-data` `POST` 到 `/console/api/v1/ov/resources/temp_upload`
- 再从返回中读取 `result.temp_file_id`
- 然后再发起一次 JSON `POST` 到 `/console/api/v1/ov/resources`

上传请求体包含：

- `file`
- `telemetry = true`

随后 add-resource 请求体大致如下：

```json
{
  "temp_file_id": "<返回的 temp file id>",
  "target": "<目标 URI>",
  "reason": "<原因>",
  "instruction": "<处理指令>",
  "wait": false,
  "strict": true,
  "directly_upload_media": true,
  "timeout": 30,
  "ignore_dirs": ".git,node_modules",
  "include": "*.md",
  "exclude": "*.log"
}
```

最终展示给用户的是一个拼接后的结果对象：

```json
{
  "status": "ok",
  "result": {
    "upload": "...",
    "add_resource": "..."
  },
  "telemetry": {
    "upload": "...",
    "add_resource": "..."
  }
}
```

## 使用到的 Console 代理接口

旧版 UI 不直接访问上游服务，而是统一通过 console 代理层。

`Add Resource` 实际涉及的接口有：

- `POST /console/api/v1/ov/resources`
- `POST /console/api/v1/ov/resources/temp_upload`
- `GET /console/api/v1/runtime/capabilities`

代理实现位于 [`openviking/console/app.py`](d:\AI\OpenViking\openviking\console\app.py)。

代理行为是纯透传：`_forward_request()` 直接将请求体原样转发到上游 `/api/v1/resources` 和 `/api/v1/resources/temp_upload`，不做字段重映射。

## 运行时部禁与权限控制

`Add Resource` 会先检运行时能力接口控制：

- UI 启动时拉 `/runtime/capabilities`
- 读取 `result.write_enabled`
- 更新右上角状态为 `Write Enabled` 或 `Readonly`
- 当能力关闭时，禁用 `Add Resource` 提交按钮

如果用户仍触发了提交逻辑，前端会直接提示：

```text
Write mode is disabled on the server.
```

服务端也会再次校验。如果 console 服务启动时没有带 `--write-enabled`，则会返回 `WRITE_DISABLED`。

## 请求体组装规则

旧版 `buildAddResourcePayload()` 采用以下规则：

- 始终包含：
  - `target`
  - `reason`
  - `instruction`
  - `wait`
  - `strict`
  - `directly_upload_media`
- 条件包含：
  - `timeout`：正的有限数值时写入
  - `ignore_dirs`：非空时写入
  - `include`：非空时写入
  - `exclude`：非空时写入

几个重要的旧版细节：

- 即使 `target` 为空字符串，也会被放进请求体
- `reason` 和 `instruction` 即使为空，也会被放进请求体
- UI 不校验 URI 格式
- UI 不校验 include/exclude pattern 语法

## 错误处理

旧版 `Add Resource` 只使用公共 `Result` 面板显示结果，没有页面内更细的错误状态。

已处理的情况：

- `Path` 模式下路径为空
- `Upload` 模式下未选择文件
- 上传成功但没有返回 `temp_file_id`
- 通用请求异常
- 能力关闭

未提供的能力：

- 字段级校验提示
- 重试 UI
- 上传进度条
- 成功 toast
- 自动跳转到新资源

## 结果展示

所有输出都进入全局共享的 `Result` 面板。

行为如下：

- 上传开始先显示：`Uploading <file.name> ...`
- 成功时显示原始 payload 或拼接后的 payload
- 失败时只显示 `error.message`

这意味着 `Add Resource` 自己没有独立的结果展示区。

---

## 后端 API 实际能力

以下信息来自对 [`resources.py`](d:\AI\OpenViking\openviking\server\routers\resources.py) 和相关解析器代码的调研。

### AddResourceRequest 完整字段

后端 `AddResourceRequest` 模型（Pydantic `BaseModel`，`extra="forbid"`）定义如下：

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `path` | `Optional[str]` | `None` | 远程资源路径/URL，与 `temp_file_id` 二选一 |
| `temp_file_id` | `Optional[str]` | `None` | 临时上传 ID，与 `path` 二选一 |
| `to` | `Optional[str]` | `None` | 目标 URI，与 `parent` 互斥 |
| `parent` | `Optional[str]` | `None` | 父级 URI，与 `to` 互斥 |
| `reason` | `str` | `""` | 添加原因 |
| `instruction` | `str` | `""` | 处理指令 |
| `wait` | `bool` | `False` | 是否等待处理完成 |
| `timeout` | `Optional[float]` | `None` | wait=True 时的超时秒数 |
| `strict` | `bool` | `False` | 严格模式（注：代码默认 False，文档注释说 True，以代码为准） |
| `source_name` | `Optional[str]` | `None` | 原始文件名 |
| `ignore_dirs` | `Optional[str]` | `None` | 忽略的目录，逗号分隔 |
| `include` | `Optional[str]` | `None` | 包含的 glob 模式 |
| `exclude` | `Optional[str]` | `None` | 排除的 glob 模式 |
| `directly_upload_media` | `bool` | `True` | 是否直接上传媒体文件 |
| `preserve_structure` | `Optional[bool]` | `None` | 是否保留目录结构 |
| `telemetry` | `TelemetryRequest` | `False` | 遥测配置 |
| `watch_interval` | `float` | `0` | 自动监控间隔（分钟），>0 创建监控任务 |
| `tags` | `Optional[str]` | `None` | 标签 |

验证规则：`path` 和 `temp_file_id` 必须至少提供一个。

### temp_upload 响应格式

```json
{ "status": "ok", "result": { "temp_file_id": "upload_<uuid>.<ext>" } }
```

返回字段名为 `temp_file_id`（不是 `temp_path`）。

### 支持的文件类型

上传端点 `/api/v1/resources/temp_upload` **无任何文件类型限制**，接受任意文件。上传大小限制默认 **10 MB**。

后端通过 Parser Registry 按扩展名路由到对应处理器：

| 类别 | 格式 | 处理器 | 状态 |
|------|------|--------|------|
| 文档 | PDF, DOCX, DOC, PPTX, XLSX/XLS, HTML, Markdown, TXT, EPUB | 各自独立 Parser | 已实现 |
| 代码 | 70+ 语言扩展名 (.py, .js, .ts, .go, .rs 等) | 作为文本处理 | 已实现 |
| 配置/数据 | JSON, YAML, XML, CSV, TOML, INI 等 | 作为文本处理 | 已实现 |
| 图片 | PNG, JPG, GIF, BMP, WebP, SVG | `ImageParser`（VLM + OCR） | 已实现 |
| 音频 | MP3, WAV, OGG, FLAC, AAC, M4A, OPUS | `AudioParser` | 已规划 |
| 视频 | MP4, AVI, MOV, MKV, WebM, FLV, WMV | `VideoParser` | 已规划 |
| 压缩包 | ZIP | `ZipParser`（解压递归处理） | 已实现 |

`directly_upload_media` 参数：默认 `true`，媒体文件直接上传到 VikingFS 保留原格式；设为 `false` 时走 VLM 管道做语义理解。

被忽略的格式（目录扫描时跳过）：二进制编译产物 (.exe, .dll, .pyc, .so)、数据库 (.db, .sqlite)、非 ZIP 压缩包 (.tar, .gz, .rar, .7z)。

---

## 旧版前端与后端 API 之间的已知差异

### 字段名不匹配：`target` vs `to`/`parent`

| 层 | 字段名 | 说明 |
|----|--------|------|
| 旧版前端 (app.js) | `target` | `buildAddResourcePayload()` 组装 |
| 后端 API (resources.py) | `to` 或 `parent` | Pydantic 模型，`extra="forbid"` |
| Console 代理 (app.py) | 原样透传 | 不做字段重映射 |

后端模型设置了 `extra="forbid"`，理论上发送 `target` 字段会导致验证错误。旧版前端存在此兼容问题。

### 默认值不一致

| 字段 | 旧版前端默认 | 后端代码默认 | 后端文档注释 |
|------|-------------|-------------|-------------|
| `strict` | `true`（已勾选） | `False` | "Default is True" |
| `wait` | `false` | `False` | 一致 |
| `directly_upload_media` | `true` | `True` | 一致 |

`strict` 存在三方不一致：前端默认 true，后端代码默认 False，后端文档注释说 True。

### 旧版前端未暴露的后端字段

以下字段在后端 API 中存在，但旧版前端从未提供 UI：

- `parent`（与 `to` 互斥的替代方案）
- `source_name`（原始文件名）
- `preserve_structure`（保留目录结构）
- `watch_interval`（自动监控间隔）
- `tags`（标签）

---

## 功能核对清单

下面这份清单可以直接作为迁移时的功能对照基线。

- 导航中存在独立的 `Add Resource` 入口
- 面板支持两种模式：`Path` 和 `Upload`
- 默认模式是 `Path`
- 支持通过服务端路径提交
- 支持本地文件经 temp upload 后再添加
- 支持目标 URI 字段（旧版用 `target`，新版应改为 `to` 或 `parent`）
- 支持 `wait`
- 支持 `strict`
- 支持 `directly_upload_media`
- 支持可选的 timeout
- 支持可选的 `ignore_dirs`
- 支持可选的 `include`
- 支持可选的 `exclude`
- 支持可选的 reason
- 支持可选的 instruction
- 只读模式下会阻止写操作
- 能展示后端原始结果
- 上传模式下会将 upload 结果和 add-resource 结果拼接展示

## 迁移时值得重新审视的旧语义

下面这些属于旧版行为，但不一定应该在新前端中完全照搬：

- 使用的是 `target`，而不是新接口里的 `to / parent`（**且存在 extra=forbid 兼容问题**）
- 暴露了 `Path on OpenViking server`，但这可能与现在 HTTP 层对本地路径的限制冲突
- 旧版 UI 默认 `strict = true`，但后端代码默认 `False`
- 不支持 console 编写之后新增的 API 字段（`parent`、`source_name`、`preserve_structure`、`watch_interval`、`tags`）
- 结果展示是全局原始输出，而不是页面内局部结果区

## 建议的对比方式

在 `web-studio` 中重建时，建议从三个层面来对比：

1. 输入面
   - 旧字段保留了哪些
   - 哪些字段被有意移除或改名
   - 哪些新后端字段需要新增暴露

2. 提交链路
   - Path 模式是否仍是一段式
   - Upload 模式是否仍是两段式 `temp_file_id`
   - 只读部禁是否仍然生效

3. 用户反馈
   - 提交后用户看到什么
   - 上传中用户看到什么
   - 成功和失败的返回展示什么样
