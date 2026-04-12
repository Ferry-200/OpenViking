# AddResource 上传页面改造方案

## 1. 原有功能描述

### 1.1 Strict（严格模式）

后端 `AddResourceRequest` 的 `strict` 参数，控制文件处理时遇到不支持的格式或解析警告的行为：

- **strict=true**：遇到不支持的文件格式或解析错误时，直接中断并报错
- **strict=false**：遇到问题仅记录警告，跳过该文件继续处理其余内容

典型场景：上传一个文件夹，其中包含部分不支持的文件格式（如 .exe、.dll），strict 开启时整个上传中断，关闭时跳过这些文件。

相关后端代码：
- `openviking/parse/directory_scan.py:287` — 目录扫描时校验不支持的文件
- `openviking/utils/resource_processor.py:165` — 资源处理时记录解析警告

### 1.2 Wait For Processing（等待处理完成）

后端 `AddResourceRequest` 的 `wait` 参数，控制 API 的响应时机：

- **wait=true**：API 请求阻塞，直到文件解析、向量化等全部完成后才返回结果（结果中包含 warnings 信息）
- **wait=false**（默认）：API 立即返回，文件处理在后台异步执行（不包含 warnings 信息）

### 1.3 当前前端暴露方式

两个参数均作为 Checkbox 直接展示在上传表单中（现已移入"高级选项"折叠区），用户需要理解其含义才能正确使用。

## 2. 改造方案

### 2.1 Strict 和 Wait 的策略调整

从前端 UI 中移除 `strict` 和 `wait` 两个 Checkbox，不再让用户手动选择，而是作为内部实现细节：

- **`strict` 固定为 `false`** — 始终自动跳过不支持的文件，不中断上传流程
- **`wait` 固定为 `true`** — 等待后端处理完成，以获取被跳过文件的 warnings 列表

高级选项区域仅保留 `Parent URI`（上传目标路径）。

### 2.2 增加支持格式提示

在上传区域（Dropzone）下方添加小字提示，告知用户支持的文件类型：

> 支持 PDF、Word、PPT、Excel、Markdown、代码文件、图片等

后端内置的支持类型（固定，由 parser 注册表决定）：

| 类别 | 格式 |
|---|---|
| 文档 | PDF (.pdf)、Word (.docx)、PPT (.pptx)、Excel (.xlsx/.xls)、EPUB (.epub) |
| 文本 | Markdown (.md)、TXT (.txt)、HTML (.html)、JSON、YAML、CSV 等 |
| 代码 | .py、.js、.ts、.go、.rs、.java、.cpp 等 80+ 种语言 |
| 媒体 | 图片、音频、视频（需后端配置 VLM） |
| 压缩包 | ZIP（自动解压处理） |

不支持的类型主要为：二进制文件（.exe、.dll、.so）、数据库文件（.db）、镜像文件（.iso、.img）等。

### 2.3 两阶段上传体验

将上传过程分为两个阶段，分别给用户不同的视觉反馈：

**阶段 1 — 文件传输**：通过 Axios `onUploadProgress` 展示真实的字节级上传进度条

**阶段 2 — 后端处理**：上传完成后切换为"处理中..."的 loading 状态，等待后端解析、向量化完成（`wait=true`）

### 2.4 处理结果展示（含跳过文件列表）

后端处理完成后，展示结构化的结果信息：

- 成功处理的文件数量
- 被跳过的文件列表（从 response 中的 warnings 提取），以可折叠列表展示

预期效果：

```
拖入文件夹 → [████████░░ 70%] → [处理中...] → 完成！
                                                ✓ 已处理 28 个文件
                                                ⚠ 3 个文件被跳过（不支持的格式）
                                                  ├ build/app.exe
                                                  ├ data/cache.db
                                                  └ assets/icon.ico
```

## 3. 改造原因

### 3.1 为什么将 Strict 固定为 false

- 原有 `strict=true` 在文件夹/仓库上传场景下体验极差：只要包含一个不支持的文件就整体中断，用户需要反复排查并删除不支持的文件后重试
- `strict=false` 自动跳过不支持的文件，配合跳过文件列表展示，用户既不被中断，又能清楚知道哪些文件没有被处理
- 单文件上传场景下，如果文件本身不支持，`strict=false` 同样会返回错误（因为没有可处理的内容），行为与 `strict=true` 一致
- 对用户来说，"跳过并告知"比"中断并报错"更友好

### 3.2 为什么将 Wait 固定为 true

- 原有设计中 `wait` 是面向 API/脚本调用的参数，但在前端场景下需要重新考虑
- `wait=true` 是获取被跳过文件列表（warnings）的唯一途径 — `wait=false` 时后端立即返回，response 中不包含 warnings
- 用户体验问题通过两阶段 UI 解决：阶段 1 的上传进度条提供实时反馈，阶段 2 的"处理中"状态避免用户以为页面卡死
- 对于大文件/文件夹，处理时间较长是预期行为，用户需要知道处理结果而非盲目等待

### 3.3 为什么增加格式提示

- 用户无法事先知道哪些格式被支持，上传不支持的文件后才报错体验差
- 支持的格式数量多且固定（由后端 parser 注册表决定），适合在 UI 中预先告知
- 小字提示不占用额外空间，不影响核心上传流程

## 4. 实现细节

### 4.1 前端代码修改

**文件**：`web-studio/src/components/data/add-resource-page.tsx`

#### 4.1.1 移除 State 和 UI

```diff
- const [strict, setStrict] = useState(true)
- const [wait, setWait] = useState(false)
```

移除高级选项中 strict 和 wait 的 Checkbox 组件。

#### 4.1.2 硬编码参数值

在 `postResources` 调用中直接使用固定值：

```typescript
const addResourceResult = await getOvResult(
  postResources({
    body: {
      temp_file_id: tempFileId,
      parent: parentUri.trim() || undefined,
      source_name: selectedFile.name,
      strict: false,   // 自动跳过不支持的文件
      telemetry: true,
      wait: true,      // 等待处理完成以获取 warnings
    },
  }),
)
```

#### 4.1.3 两阶段状态管理

```typescript
type UploadPhase = 'idle' | 'uploading' | 'processing' | 'done'

const [phase, setPhase] = useState<UploadPhase>('idle')
const [uploadProgress, setUploadProgress] = useState(0)
const [skippedFiles, setSkippedFiles] = useState<string[]>([])

// 阶段 1：文件传输
setPhase('uploading')
const uploadResult = await getOvResult(
  postResourcesTempUpload({
    body: { file: selectedFile, telemetry: true },
    onUploadProgress: (event) => {
      if (event.total) {
        setUploadProgress(Math.round((event.loaded / event.total) * 100))
      }
    },
  }),
)

// 阶段 2：后端处理
setPhase('processing')
const addResourceResult = await getOvResult(
  postResources({
    body: {
      temp_file_id: tempFileId,
      source_name: selectedFile.name,
      strict: false,
      wait: true,
    },
  }),
)

// 完成：提取 warnings 中的跳过文件
setPhase('done')
if (isRecord(addResourceResult) && Array.isArray(addResourceResult.warnings)) {
  setSkippedFiles(addResourceResult.warnings)
}
```

#### 4.1.4 上传进度条 UI

使用 shadcn/ui 的 Progress 组件，根据 phase 展示不同状态：

```tsx
{phase === 'uploading' && (
  <div className="space-y-2">
    <Progress value={uploadProgress} />
    <p className="text-sm text-muted-foreground">
      {t('addResource.upload.uploading', { progress: uploadProgress })}
    </p>
  </div>
)}

{phase === 'processing' && (
  <div className="flex items-center gap-2">
    <Loader2 className="size-4 animate-spin" />
    <p className="text-sm text-muted-foreground">
      {t('addResource.upload.processing')}
    </p>
  </div>
)}
```

#### 4.1.5 跳过文件列表 UI

处理完成后，如果有被跳过的文件，展示可折叠列表：

```tsx
{phase === 'done' && skippedFiles.length > 0 && (
  <Collapsible>
    <CollapsibleTrigger className="flex items-center gap-1 text-sm text-amber-600">
      <AlertTriangle className="size-4" />
      {t('addResource.result.skippedFiles', { count: skippedFiles.length })}
    </CollapsibleTrigger>
    <CollapsibleContent>
      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
        {skippedFiles.map((file) => (
          <li key={file} className="truncate">• {file}</li>
        ))}
      </ul>
    </CollapsibleContent>
  </Collapsible>
)}
```

#### 4.1.6 Dropzone 格式提示

在 Dropzone 区域的 hint 文案中增加支持格式说明：

```tsx
<p className="text-xs text-muted-foreground">
  {t('addResource.dropzone.supportedFormats')}
</p>
```

### 4.2 i18n 文案

需要新增的 i18n key：

```json
{
  "addResource.dropzone.supportedFormats": "支持 PDF、Word、PPT、Excel、Markdown、代码文件、图片等",
  "addResource.upload.uploading": "正在上传... {{progress}}%",
  "addResource.upload.processing": "文件已上传，正在处理中...",
  "addResource.result.skippedFiles": "{{count}} 个文件被跳过（不支持的格式）"
}
```

### 4.3 注意事项

- `onUploadProgress` 的传入方式取决于生成的 SDK 客户端是否支持透传 Axios 配置，如不支持可能需要在 `ovClient` 适配层中扩展
- 跳过文件列表的具体格式取决于后端 `warnings` 字段的返回结构，实现时需要确认并适配
- `wait=true` 在大文件/大仓库场景下可能耗时较长，需关注后端是否有超时限制（`AddSkillRequest` 中有 `timeout` 参数）

### 4.4 不涉及的改动

- 后端 API 不做任何修改，`strict` 和 `wait` 参数保留，供 API/CLI 用户使用
- 不修改后端 parser 注册表或支持格式列表
