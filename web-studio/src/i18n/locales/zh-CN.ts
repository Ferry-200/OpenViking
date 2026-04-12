const zhCN = {
  appShell: {
    footer: {
      connection: '连接与身份',
    },
    header: {
      defaultTitle: 'OpenViking Studio',
    },
    navigation: {
      home: {
        title: '首页',
      },
      addResource: {
        title: '添加资源',
      },
      operations: {
        title: '运维',
      },
      resources: {
        title: '资源',
      },
      sessions: {
        title: '会话',
      },
    },
    sidebar: {
      workspaceGroupLabel: '工作区',
    },
  },
  common: {
    action: {
      cancel: '取消',
      saveConnection: '保存连接',
      showAdvancedIdentityFields: '显示高级身份字段',
    },
    errorBoundary: {
      description: '路由渲染过程中出现未处理异常。可以先重试一次；如果问题持续，查看下方错误信息继续排查。',
      reload: '刷新页面',
      retry: '重试',
      title: '页面发生错误',
    },
    language: {
      current: '当前',
      label: '语言',
    },
    serverMode: {
      checking: '检测中',
      devImplicit: '开发模式',
      explicitAuth: '显式鉴权',
      offline: '未连接',
    },
  },
  connection: {
    devMode: {
      description: '当前服务使用隐式身份，通常不需要填写 account、user 和 API key。',
      title: '已检测到开发模式',
    },
    dialog: {
      title: '连接与身份',
    },
    identitySummary: {
      devImplicit: '服务端隐式身份',
      named: '{{identity}}',
      unset: '未设置身份',
    },
    fields: {
      accountId: {
        label: 'Account',
        placeholder: 'default',
      },
      apiKey: {
        label: 'API Key',
        placeholder: '输入 X-API-Key 或 Bearer token',
      },
      baseUrl: {
        label: '服务地址',
        placeholder: 'http://127.0.0.1:1933',
      },
      credentials: {
        title: '身份与凭证',
      },
      userId: {
        label: 'User',
        placeholder: 'default',
      },
    },
  },
  operations: {
    page: {
      placeholder: '运维面板能力尚未接入。',
    },
  },
  addResource: {
    title: '添加资源',
    description: '上传本地文件到服务器，文件类型通过 magic bytes 自动检测。',
    dropzone: {
      title: '拖拽文件到此处，或点击选择文件',
      hint: '支持任意文件类型，每次只能上传一个文件。',
      supportedFormats: '支持 PDF、Word、PPT、Excel、Markdown、代码文件、图片等',
    },
    fileInfo: {
      name: '文件',
      size: '大小',
      type: '类型',
      unknown: '未知类型',
      remove: '移除',
    },
    parentUri: '父级 URI',
    'parentUri.hint': '如无特殊需要，保持默认值 viking://resources/ 即可。',
    'parentUri.browse': '浏览',
    advancedOptions: '高级选项',
    upload: '上传文件',
    'upload.progress': '正在上传... {{progress}}%',
    'upload.processing': '文件已上传，正在处理中...',
    uploading: '上传中…',
    result: {
      success: '上传完成！',
      skippedFiles: '{{count}} 个文件被跳过（不支持的格式）',
    },
    continueUpload: '继续上传',
    success: '资源添加成功',
    error: '请求失败',
    latestResult: {
      title: '最新结果',
      description: '临时上传和添加资源请求的原始响应。',
      idle: '空闲',
      noRequests: '暂无请求记录。',
    },
    dirPicker: {
      title: '选择目录',
      select: '选择',
      cancel: '取消',
      empty: '空目录',
      error: '加载目录失败',
      selected: '已选择：',
    },
    mode: {
      upload: '上传文件',
      remote: '远程资源',
    },
    remoteUrl: '远程资源地址',
    'remoteUrl.placeholder': 'https://github.com/org/repo',
    'remoteUrl.hint': 'HTTP(S) 链接、Git 仓库地址或其他远程资源地址。',
    submit: '添加资源',
    directlyUploadMedia: '直接上传媒体文件',
    'directlyUploadMedia.hint': '开启时，媒体文件（图片、音频、视频）原样存储。关闭后，媒体文件会先通过 AI 视觉/音频管道提取内容再存储。',
    reason: '添加原因',
    'reason.placeholder': '为什么要添加这个资源？',
    instruction: '处理指令',
    'instruction.placeholder': '针对该资源的特殊处理指令。',
  },
  resources: {
    page: {
      placeholder: '资源工作区能力尚未接入。',
    },
  },
  sessions: {
    page: {
      placeholder: '会话与 Bot 工作区能力尚未接入。',
    },
  },
} as const

export default zhCN