# Jenkinsfile 配置参考

[`Jenkinsfile`](../Jenkinsfile) 用于将 ECS 作为网站入口、将 OSS 作为不可变静态资源仓库。详细的 Nginx、CORS、权限和回滚操作见 [Jenkins 发布：ECS 首页 + 阿里云 OSS 静态资源](./jenkins-oss-deploy.md)。

## 执行路径

```text
Checkout → Initialize → Install* → Build* → Publish*
                       └──────────────→ Rollback*

* DEPLOY 执行 Install、Build、Publish；ROLLBACK 只执行 Rollback。
```

`Initialize` 会限制受信任分支、生成或校验 `RELEASE_ID`、设置资源 URL、检查工具链，并在接触发布凭据前执行测试。

## 重要变量

| 变量 | 用途 |
| --- | --- |
| `OSS_BUCKET` / `OSS_ENDPOINT` / `OSS_REGION` | OSS API 目标。三者必须属于同一个 Bucket 区域。 |
| `OSS_STATIC_ORIGIN` | 浏览器直接加载静态资源的 OSS HTTPS 根地址；构建时会拼接 `/<OSS_RELEASE_PREFIX>/<RELEASE_ID>/`。 |
| `OSS_RELEASE_PREFIX` | 不可变版本目录前缀。修改后不会迁移已有版本。 |
| `ECS_SSH_CREDENTIALS_ID` | Jenkins SSH Agent 插件使用的 SSH 私钥凭据 ID。 |
| `ECS_DEPLOY_HOST` / `ECS_DEPLOY_PORT` / `ECS_DEPLOY_USER` | Jenkins Agent 连接 ECS 的地址与部署账号。 |
| `ECS_DEPLOY_ROOT` | ECS 上保存稳定 `index.html` 的目录；发布脚本原子更新该目录下的首页。 |
| `ECS_SITE_ORIGIN` | 对用户显示的站点入口，例如 `http://<ECS 公网 IP>`。它必须与 OSS CORS 允许的来源匹配。 |
| `OSS_DEPLOY_BRANCH` | 唯一可执行发布或回滚的受保护分支；当前配置为 `nginx-oss-deploy`。 |

部署前必须将 `ECS_DEPLOY_HOST` 与 `ECS_SITE_ORIGIN` 的占位符替换为真实值；不要将这些主机信息、SSH 私钥或 OSS AccessKey 写入前端环境文件。

## 阶段行为

| 阶段 | 行为 |
| --- | --- |
| `Initialize` | 生成版本号，部署时把 `VITE_BASE_PATH` 设为完整 OSS 资源 URL；检查 Node、pnpm、ossutil、ssh、scp。 |
| `Build` | 类型检查、构建、生成带 SHA-256 的 `dist/release.json`，并归档产物。 |
| `Publish` | 上传并校验 OSS 候选版本，写入完成标记，然后经 SSH 原子切换 ECS 首页。 |
| `Rollback` | 不重新构建；验证指定的 OSS 完整版本后，将其中的首页原子切换到 ECS。 |
| `post` | 成功时输出 ECS 站点入口与版本号。 |

同一 Job 禁止并发，新构建会终止旧构建。稳定首页只有在候选 OSS 版本完成校验后才会被替换；ECS 上的 SHA-256 校验失败时，发布会失败且不会更新审计记录。

## 修改前检查

- 修改 `OSS_STATIC_ORIGIN` 时，同时更新 OSS CORS，确认其 HTTPS 证书与 Bucket 区域正确。
- 修改 `ECS_DEPLOY_*` 时，确认 Jenkins Agent 到 ECS 的 SSH 网络、`known_hosts`、部署用户权限和 Nginx `root` 一致。
- 修改 `VITE_BASE_PATH` 或 `OSS_RELEASE_PREFIX` 前，先检查构建后的 `index.html` 中资源 URL。
- 修改分支限制时，同步调整受保护分支、Jenkins SCM 配置和凭据隔离策略。
- 生产切换前，先在测试 Bucket 与测试 ECS 上执行一次部署和回滚演练。