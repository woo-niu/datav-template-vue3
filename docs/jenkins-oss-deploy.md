# Jenkins 发布到阿里云 OSS

本项目采用“不可变版本目录 + 单入口对象切换”的发布方式：

> `Jenkinsfile` 的配置项、阶段条件和变量说明见 [Jenkinsfile 配置参考](./jenkinsfile-config.md)。本文保留 Jenkins 与 OSS 的前置配置、发布操作和回滚操作说明。

```text
oss://wn-test-deploy/
├── index.html                         # 稳定入口，仅此对象会在切换时被覆盖
├── _deploy/current.json               # 当前版本审计信息
└── releases/
    ├── 20260811T083000Z-128-a1b2c3d4/
    │   ├── index.html
    │   ├── release.json
    │   ├── _READY.json
    │   └── assets/...
    └── 20260811T091500Z-129-e5f6a7b8/...
```

根 `index.html` 引用对应版本目录中的 hash 静态资源。候选版本完整上传并通过 OSS 校验后，流水线才用一次 OSS 对象复制替换根入口。因此发布不会暴露半上传状态，回滚也只需切换一个入口对象。

## 1. Jenkins 前置配置

Jenkins 需要安装以下插件：

- Pipeline / Pipeline: Declarative
- Git
- Credentials Binding

创建一个仅检出受保护 `jenkins-develop` 分支的独立 `Pipeline from SCM` 部署 Job，Script Path 使用仓库根目录的 `Jenkinsfile`。构建节点需带 `node22-ossutil` 标签；如标签不同，请同步修改 `Jenkinsfile` 中的 `label 'node22-ossutil'`。

不要让 Fork PR 或普通多分支 Job 解析部署凭据：PR CI 应使用另一个无 OSS 凭据的 Job；建议将部署 Job 单独放入 Jenkins Folder，并只在该 Folder 中创建 `aliyun-oss-deploy` 凭据。Jenkinsfile 内的分支检查只是纵深防御，不能阻止恶意分支修改 Jenkinsfile 本身。如 CI 测试分支名称不同，请同步修改 `OSS_DEPLOY_BRANCH`。

请在该 Jenkins Agent 预装并固定以下工具：Node.js 22、Corepack 管理的 pnpm 10.27.0、ossutil 2.3.0 与 Git。流水线启动时会校验 Node.js 与 pnpm 版本；工具不符合要求会直接失败。

`ci/jenkins/Dockerfile` 保留为可选的工具链参考和备用镜像定义，但当前流水线不再调用 Docker，也不需要 Docker daemon。

## 2. Jenkins 凭据

在 **Manage Jenkins → Credentials** 中创建 Username with password 凭据：

- ID：`aliyun-oss-deploy`
- Username：RAM 用户的 AccessKey ID
- Password：RAM 用户的 AccessKey Secret

AccessKey 只会在发布/回滚 stage 内绑定成 ossutil 支持的环境变量，不会写入仓库或作为命令行参数输出。生产环境更推荐让 Jenkins 运行在绑定 RAM Role 的 ECS 上，再按组织规范把流水线改成实例角色认证。

建议给 RAM 用户配置最小权限策略：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["oss:ListObjects"],
      "Resource": ["acs:oss:*:*:wn-test-deploy"]
    },
    {
      "Effect": "Allow",
      "Action": ["oss:GetObject", "oss:PutObject"],
      "Resource": ["acs:oss:*:*:wn-test-deploy/releases/*"]
    },
    {
      "Effect": "Allow",
      "Action": ["oss:GetObject", "oss:PutObject"],
      "Resource": [
        "acs:oss:*:*:wn-test-deploy/index.html",
        "acs:oss:*:*:wn-test-deploy/_deploy/current.json"
      ]
    }
  ]
}
```

流水线不删除对象，也不修改 Bucket ACL，因此不需要全桶删除或权限管理能力。

## 3. OSS 前置配置

- Bucket：`wn-test-deploy`
- Region：`cn-hangzhou`
- 上传 Endpoint：`https://oss-cn-hangzhou.aliyuncs.com`
- OSS 外网 Bucket 域名：`https://wn-test-deploy.oss-cn-hangzhou.aliyuncs.com`
- 静态网站默认首页：`index.html`

是否开放公共读应由 Bucket Policy、CDN 回源策略或组织安全规范决定，CI 不会主动放开访问权限。上线前要求开启 OSS Versioning，防止管理员或其他程序误覆盖历史 release；流水线自身使用 `--ignore-existing`，且只允许带 `_READY.json` 完成标记的版本参与切换。若组织需要更强不可变保证，可对版本前缀另行配置保留策略/WORM。

注意：阿里云 OSS 默认 Bucket 域名可能对 HTML 强制下载，不能代替正式站点域名。需要浏览器直接打开页面时，应给 Bucket 绑定已备案的自定义域名，或通过 CDN 自定义域名访问。版本资源使用同源绝对路径，自定义域名切换不需要重新构建。

参考：

- [ossutil 2.0 配置与环境变量](https://help.aliyun.com/en/oss/developer-reference/ossutil-overview/)
- [OSS 默认域名强制下载与自定义域名说明](https://help.aliyun.com/zh/oss/user-guide/access-and-network-overview)
- [OSS 静态网站托管](https://help.aliyun.com/en/oss/user-guide/hosting-static-websites)

## 4. 发布

流水线默认参数为 `ACTION=DEPLOY`。一次发布依次执行：

1. 清理复用工作区并重新检出受保护分支，随后使用 frozen lockfile 安装依赖。
2. 生成版本号 `<UTC 时间>-<Jenkins BUILD_NUMBER>-<Git SHA 前 8 位>`。
3. 以 `/releases/<版本号>/` 作为 Vite base 完成类型检查和生产构建。
4. 生成包含 Git SHA、时间及全部产物路径、大小、SHA-256 的 `release.json`。
5. 以“不覆盖已有对象”的方式上传候选版本，检查清单内所有对象存在，并下载校验首页 SHA-256。
6. 创建 `_READY.json` 完成标记；没有该标记的部分上传版本不能发布或回滚。
7. 通过一次 OSS 服务端复制替换根 `index.html`，并下载校验稳定入口 SHA-256。
8. 尝试更新 `_deploy/current.json` 便于审计。

发布版本目录使用 `Cache-Control: public,max-age=31536000,immutable`；稳定入口和当前版本清单使用 `no-cache,no-store,must-revalidate`，避免浏览器或代理缓存拖慢切换。

同一 Jenkins Job 禁止并发，较新的构建会终止旧构建。若旧构建仍在上传候选版本，稳定入口不会受影响；入口对象只有在候选版本校验成功后才会替换。根 `index.html`（其版本路径及 `release-id` 对象元数据）是线上版本的唯一权威状态；`_deploy/current.json` 是尽力更新的审计副本，构建被终止时可能暂时滞后。

## 5. 快速回滚

在 Jenkins 点击 **Build with Parameters**：

1. `ACTION` 选择 `ROLLBACK`。
2. `ROLLBACK_RELEASE` 填写目标版本，例如 `20260811T083000Z-128-a1b2c3d4`。
3. 启动构建。

回滚不安装依赖、不重新构建、不重新上传静态资源。流水线先验证 `_READY.json`、完整产物清单、首页 SHA-256 及全部产物对象，再通过 OSS 服务端对象复制替换根入口。只要带 `node22-ossutil` 标签的 Agent 已在线且工具链就绪，切换通常只需数秒；整体耗时仍取决于 Jenkins 排队和 OSS 网络。对恢复时间有严格要求时，应准备独立的轻量回滚 Job，并保证至少一个合格 Agent 常驻在线。

可通过以下对象确认版本：

```text
https://wn-test-deploy.oss-cn-hangzhou.aliyuncs.com/_deploy/current.json
https://wn-test-deploy.oss-cn-hangzhou.aliyuncs.com/releases/<版本号>/release.json
https://wn-test-deploy.oss-cn-hangzhou.aliyuncs.com/releases/<版本号>/_READY.json
```

不要对 Bucket 根目录执行 `sync --delete`。旧版本目录是回滚依据，应保持不可变。若需控制存储成本，请使用独立、受审计的清理任务，并确保当前版本和保留窗口内的版本不会被清理；本流水线有意不做自动删除。
