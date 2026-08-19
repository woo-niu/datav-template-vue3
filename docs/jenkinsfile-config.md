# Jenkinsfile 配置参考

本文说明仓库根目录 [`Jenkinsfile`](../Jenkinsfile) 中的声明式 Pipeline 配置及其修改影响，面向维护流水线的开发者。

Jenkins Job 的创建、Agent 工具准备、凭据、RAM 权限、OSS 对象结构以及发布和回滚的操作步骤，请参阅 [Jenkins 发布到阿里云 OSS](./jenkins-oss-deploy.md)。这些内容不在本文重复。

## 配置总览

```text
Checkout → Initialize → Install* → Build* → Publish*
                       └──────────────→ Rollback*

* DEPLOY 执行 Install、Build、Publish；ROLLBACK 只执行 Rollback。
```

`Initialize` 是两条路径共同的保护关卡：它解析 Git 信息、限制来源分支、校验回滚版本号、设置构建显示名称，并验证本次执行所需的工具链与发布流程测试。

## 顶层配置

| Jenkinsfile 配置 | 含义与修改影响 |
| --- | --- |
| `agent { label 'node22-ossutil' }` | 指定执行节点标签。修改标签时，确保目标 Agent 具备 Node.js 22、pnpm 10.27.0、Git 和 ossutil。 |
| `disableConcurrentBuilds(abortPrevious: true)` | 同一 Job 同时只允许一个构建；新构建会中止旧构建，防止并发切换稳定入口。除非发布脚本改为具备可靠的分布式锁，否则不要移除。 |
| `buildDiscarder(logRotator(...))` | 保留 30 次构建记录和 10 份归档产物。调整时需平衡审计追溯需求与 Jenkins 存储容量。 |
| `timeout(time: 30, unit: 'MINUTES')` | 限制整条流水线的最长执行时间。网络较慢或产物较大时，可在确认不中断正常发布的前提下提高该值。 |
| `timestamps()` | 为控制台输出增加时间戳；不影响构建结果。 |
| `skipStagesAfterUnstable()` | 任一步骤产生 `UNSTABLE` 结果后跳过后续 stage，避免带风险状态继续发布。 |

## 构建参数

| 参数 | 可选值 / 格式 | 行为 |
| --- | --- | --- |
| `ACTION` | `DEPLOY`、`ROLLBACK` | 控制执行路径。首个选项 `DEPLOY` 为 Jenkins 的默认选择。 |
| `ROLLBACK_RELEASE` | 1–128 个字符；首字符为字母或数字，后续仅允许字母、数字、`.`、`_`、`-` | 仅在 `ACTION=ROLLBACK` 时使用，作为目标 `RELEASE_ID`。该格式限制避免将不安全的路径片段传入发布脚本。 |

## 环境变量

下表变量在 `environment` 块中定义，后续 Groovy、Shell 与 Node.js 发布脚本均可读取。

| 变量 | 当前值 | 用途与注意事项 |
| --- | --- | --- |
| `CI` | `true` | 标识 CI 执行环境，供构建与测试工具识别。 |
| `OSS_BUCKET` | `wn-test-deploy` | 目标 Bucket 名。更换环境时应与凭据权限和发布脚本配置同步核对。 |
| `OSS_ENDPOINT` | `https://oss-cn-hangzhou.aliyuncs.com` | OSS API Endpoint，应与 Bucket 区域匹配。 |
| `OSS_REGION` | `cn-hangzhou` | Bucket 所在区域代码。 |
| `OSS_PUBLIC_ORIGIN` | `https://wn-test-deploy.oss-cn-hangzhou.aliyuncs.com` | 构建成功日志中展示的公开访问根地址；它不是上传 API Endpoint。 |
| `OSS_RELEASE_PREFIX` | `releases` | 不可变版本目录的前缀。修改会同时改变 `VITE_BASE_PATH` 与发布脚本的目标路径；已有版本不会自动迁移。 |
| `OSS_DEPLOY_BRANCH` | `jenkins-develop` | 允许触发发布、回滚的唯一分支。改名时必须与受保护分支和 Jenkins Job 的检出分支保持一致。 |

## 阶段与关键语句

| 阶段 | 关键配置 | 作用 |
| --- | --- | --- |
| `Checkout` | `deleteDir()` | 清理复用工作区，避免上次构建的文件参与本次发布。 |
| `Checkout` | `checkout scm`、`CHECKED_OUT_BRANCH` | 检出 Job 配置的源码，并保存检出分支作为来源分支的备用信息。 |
| `Initialize` | `git rev-parse HEAD` | 获取完整 Git 提交 SHA，写入 `GIT_COMMIT`。 |
| `Initialize` | `BRANCH_NAME ?: CHECKED_OUT_BRANCH ?: GIT_BRANCH` | 按可靠性顺序解析当前来源分支，并移除可选的 `origin/` 前缀。 |
| `Initialize` | `CHANGE_ID \|\| sourceBranch != OSS_DEPLOY_BRANCH` | 拒绝 PR 和非目标分支。该检查是运行时保护，不能替代仓库保护规则与 Jenkins 凭据隔离。 |
| `Initialize` | `RELEASE_ID` | 部署时使用 `<UTC 时间>-<BUILD_NUMBER>-<提交短 SHA>` 自动生成；回滚时使用经过格式校验的参数值。 |
| `Initialize` | `VITE_BASE_PATH` | 仅部署时设为 `/<OSS_RELEASE_PREFIX>/<RELEASE_ID>/`，让 Vite 产物引用版本目录中的静态资源。 |
| `Initialize` | `currentBuild.displayName` / `description` | 在 Jenkins 界面显示操作类型和版本号，不影响发布内容。 |
| `Initialize` | `Verify toolchain` | 要求 Node.js 匹配 `v22.*`、pnpm 精确为 `10.27.0`，并确认 ossutil 可运行。 |
| `Initialize` | `pnpm test:ci` | 在任何可能访问 OSS 凭据的 stage 前执行 CI 测试。 |
| `Install` | `when { ACTION == 'DEPLOY' }` | 仅部署时按 lockfile 安装依赖；`--frozen-lockfile` 使依赖声明不一致时立即失败。 |
| `Build` | `when { ACTION == 'DEPLOY' }` | 仅部署时运行 `pnpm build`、写入 `dist/release.json`，并归档 `dist` 产物及其指纹。 |
| `Publish` | `when { ACTION == 'DEPLOY' }` | 仅部署时临时绑定 `aliyun-oss-deploy` 凭据，并最多尝试两次 `oss-release.mjs deploy`。 |
| `Rollback` | `when { ACTION == 'ROLLBACK' }` | 仅回滚时临时绑定同一凭据，并最多尝试两次 `oss-release.mjs rollback`。不执行安装或构建阶段。 |
| `post` | `success` / `failure` | 成功时打印目标站点及版本；失败时提示稳定入口只会在候选版本完成校验后切换。 |

## 修改前检查

- 修改 `OSS_*` 变量时，同时核对 `ci/jenkins/oss-release.mjs`、Jenkins 凭据权限与目标环境是否匹配。
- 修改 `VITE_BASE_PATH` 或 `OSS_RELEASE_PREFIX` 时，先验证 Vite 产物中的资源 URL 和目标站点访问路径。
- 修改分支限制时，同时调整受保护分支、部署 Job 的 SCM 配置和代码审查规则。
- 修改 Node.js、pnpm 版本要求时，同步更新 Agent 镜像或工具安装方式，并确认 lockfile 与构建工具兼容。
- 修改发布或回滚脚本调用前，先在非生产 Bucket 完成一次端到端验证。
