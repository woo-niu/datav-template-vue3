# Jenkins 发布：ECS 首页 + 阿里云 OSS 静态资源

本项目的生产入口由 ECS Nginx 提供，只有 `index.html` 位于 ECS；打包生成的 JS、CSS、字体和图片等带 hash 的版本资源保存在 OSS。构建时 Vite 会收到完整的 OSS 资源地址，因此浏览器直接从 OSS 加载静态资源，不经过 ECS 转发。

```text
浏览器 → http://<ECS 公网 IP>/ → Nginx 本地 index.html
                              └→ https://<bucket>.<endpoint>/releases/<release-id>/assets/...
```

这种方式避开了 OSS 默认 Bucket 域名打开 HTML 时可能出现的强制下载问题。OSS 中的每个版本仍保存一份 `index.html`，但它仅用于发布校验与回滚；对外稳定入口只存在于 ECS。

## 1. Jenkins Agent 与凭据

部署节点需要 Node.js 22、Corepack 管理的 pnpm 10.27.0、Git、ossutil 2.3.0、OpenSSH 的 `ssh`/`scp`，以及 Jenkins 的 **SSH Agent** 插件。

配置两个 Jenkins 凭据：

- `aliyun-ecs-oss`：OSS 的 AccessKey。该账号至少需要读取、写入 `oss://<bucket>/releases/*` 以及更新 `oss://<bucket>/_deploy/current.json` 的权限。
- `aliyun-ecs-static-deploy`：ECS 上 `deploy` 用户的 SSH 私钥。公钥写入该用户的 `~/.ssh/authorized_keys`；Agent 应预先保存 ECS 主机指纹，避免关闭 SSH 主机校验。

`Jenkinsfile` 中的 `ECS_*` 默认值为占位符。运行生产发布前必须替换为实际 ECS 信息：

```groovy
ECS_DEPLOY_HOST = '你的 ECS 可达 IP 或主机名'
ECS_DEPLOY_PORT = '22'
ECS_DEPLOY_USER = 'deploy'
ECS_DEPLOY_ROOT = '/srv/datav'
ECS_SITE_ORIGIN = 'http://你的 ECS 公网 IP'
```

`ECS_DEPLOY_USER` 必须拥有创建目录、写入临时首页及重命名 `/srv/datav/index.html` 的权限。

## 2. ECS 与 Nginx 配置

在 ECS 上准备首页目录，并将其交给部署用户：

```bash
sudo install -d -m 0755 -o deploy -g deploy /srv/datav
```

新增 Nginx 虚拟主机，例如 `/etc/nginx/conf.d/datav.conf`：

```nginx
server {
    listen 80 default_server;
    server_name _;

    root /srv/datav;
    index index.html;
    charset utf-8;

    # 首页随发布/回滚切换，不能长期缓存。
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # 支持 Vue Router history 模式刷新。
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

执行 `nginx -t && sudo systemctl reload nginx`，并在 ECS 安全组放行 TCP 80。IP 访问通常只能使用 HTTP；若需要 HTTPS、CDN 或更严格的同源策略，应绑定已备案域名后将 `ECS_SITE_ORIGIN` 改为该 HTTPS 域名。

## 3. OSS CORS 与访问控制

由于 `index.html` 与静态资源跨源，OSS Bucket 必须为版本资源配置 CORS。至少添加一条规则：

| 配置项 | 值 |
| --- | --- |
| 来源 | `http://<ECS 公网 IP>`（使用域名/HTTPS 时同步替换） |
| 方法 | `GET`、`HEAD` |
| Allowed Headers | `*` |
| Expose Headers | `ETag`、`Content-Type` |

Vite 的 JS 使用 ES Module；缺少 `Access-Control-Allow-Origin` 时浏览器会拒绝加载模块。发布所用的 Bucket 还必须允许匿名读取 `releases/*`，或者改由 CDN 提供等价的公开资源访问能力。不要把 AccessKey 放到 ECS 或前端代码中。

## 4. 发布流程

`ACTION=DEPLOY` 的执行顺序：

1. 生成 `RELEASE_ID`，并将 `VITE_BASE_PATH` 设为 `${OSS_STATIC_ORIGIN}/releases/<release-id>/`。
2. Vite 构建产物中的资源 URL 指向 OSS 的不可变版本目录。
3. 上传候选版本到 `oss://<bucket>/releases/<release-id>/`，并校验清单、资源对象和首页 SHA-256。
4. 写入 `_READY.json` 完成标记。
5. 从已验证的候选版本下载入口文件，通过 SSH 上传到 ECS 临时路径，然后以同一文件系统内的 `mv` 原子替换 `/srv/datav/index.html`。
6. 从 ECS 读取首页 SHA-256 并与候选版本核对；成功后才更新 `_deploy/current.json` 审计记录。

静态资源具有不可变版本号且可使用一年缓存；首页为 `no-cache,no-store,must-revalidate`。即使新资源正在上传，旧首页也只会继续引用已存在的旧版本资源。

## 5. 回滚

在 Jenkins 选择：

```text
ACTION=ROLLBACK
ROLLBACK_RELEASE=<要恢复的 release-id>
```

回滚不安装依赖、不重新构建、不上传静态资源。脚本会验证该版本的 `_READY.json`、产物清单和所有 OSS 对象，随后将该版本的入口文件原子切换到 ECS，并再次核对 SHA-256。若候选版本不完整或 ECS 写入/校验失败，现有首页保持不变。

## 6. 验证与排障

- 构建后检查 `dist/index.html`：资源 URL 应以 `OSS_STATIC_ORIGIN/releases/<release-id>/` 开头。
- 浏览器 Network 面板中，文档请求应来自 ECS IP，JS/CSS/图片应来自 OSS。
- 若模块加载被浏览器拦截，先检查 OSS CORS 的来源是否精确匹配 `ECS_SITE_ORIGIN`。
- 若 SSH 发布失败，确认 Jenkins SSH Agent 凭据、ECS 主机指纹、部署用户目录权限与 `ssh`/`scp` 客户端均已就绪。

本仓库的 `pnpm test:ci` 覆盖版本不可变、ECS 首页原子切换以及不完整版本不得回滚的场景。