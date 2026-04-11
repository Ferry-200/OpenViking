# Parallel Dev Environment

基于 Git Worktree + Docker 的多 Agent 并行开发环境。每个 Agent 拥有独立的分支、前后端服务和数据，互不干扰。

## 架构

```
┌─ build（一次性）──────────────────────────────┐
│  Docker 内编译 Go+Rust+C+++Python             │
│  产物存入共享 named volume:                    │
│    ov-dev-venv → Python .venv                 │
│    ov-dev-bin  → agfs-server, ov 二进制        │
└───────────────────────────────────────────────┘
         │ readonly 挂载
         ▼
┌─ create（秒级）──────────────────────────────┐
│  git worktree → 独立分支 + 工作目录            │
│  复制 ~/.openviking/ov.conf + 数据             │
│  docker compose up:                           │
│    backend  → 挂载 worktree(rw) + 产物(ro)    │
│    frontend → Vite dev server + HMR           │
│  端口自动分配，无冲突                           │
└───────────────────────────────────────────────┘
```

## 快速开始

```bash
# 1. 首次编译（仅需一次，产物缓存在 Docker volume）
./parallel-dev/agent-env.sh build

# 2. 创建环境
./parallel-dev/agent-env.sh create feature-auth main
./parallel-dev/agent-env.sh create file-tabs feat/file-tabs

# 3. 查看所有环境
./parallel-dev/agent-env.sh list

# 4. 销毁环境
./parallel-dev/agent-env.sh destroy feature-auth
```

## 命令参考

| 命令 | 说明 |
|------|------|
| `agent-env.sh build` | 在 Docker 内编译所有依赖，输出到共享 volume |
| `agent-env.sh create <name> [branch]` | 创建 worktree + 启动前后端容器 |
| `agent-env.sh destroy <name>` | 停止容器 + 删除 worktree |
| `agent-env.sh list` | 列出所有环境及端口和运行状态 |

## 端口分配

脚本自动扫描空闲端口，规则如下：

| 服务 | 范围 | 默认 |
|------|------|------|
| Backend API | 1933-1953 | 1933 |
| Console | backend + 6087 | 8020 |
| Frontend | 3000-3020 | 3000 |

## 开发工作流

| 改动类型 | 操作 |
|---------|------|
| Python 业务代码 | 重启 backend 容器: `docker compose -p ov-<name> restart backend` |
| 前端代码 | 无需操作，Vite HMR 自动更新 |
| Go / Rust / C++ 底层 | 重新运行 `agent-env.sh build` |
| Python 依赖变更 | 重新运行 `agent-env.sh build` |

## 前置条件

- Docker Desktop (启用)
- Git
- `~/.openviking/ov.conf` (可选，没有则使用 examples/ov.conf.example)

## 文件说明

```
parallel-dev/
├── agent-env.sh              # 管理脚本
├── docker-compose.dev.yml    # backend + frontend 服务编排
├── Dockerfile.dev            # 多阶段镜像 (builder + runtime)
└── README.md                 # 本文件
```
