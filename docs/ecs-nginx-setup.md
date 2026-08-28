# ECS Nginx 配置教程：本地首页 + OSS 静态资源

本项目的访问链路如下：Nginx 只返回 ECS 本地的 `index.html`；页面中的 JS、CSS、图片和字体使用完整的 OSS URL，由浏览器直接从 OSS 下载。ECS 不反向代理 OSS，因此静态资源流量不会经过服务器。

```text
浏览器 → http://<ECS_PUBLIC_IP>/ → Nginx → /srv/datav/index.html
浏览器 → https://<OSS_STATIC_ORIGIN>/releases/<release-id>/assets/... → OSS
```

## 1. 安全组和 Nginx

在 ECS 安全组中放行：

| 规则 | 端口 | 来源 |
| --- | --- | --- |
| 网站访问 | TCP 80 | `0.0.0.0/0` 或业务网段 |
| Jenkins 部署 SSH | TCP 22 | Jenkins Agent 的固定出口 IP / VPC 网段 |

不要将 SSH 22 端口对所有公网地址开放。登录 ECS 后，按系统选择一组安装命令：

```bash
# Alibaba Cloud Linux 3、Rocky、CentOS Stream
sudo dnf install -y nginx

# CentOS 7
sudo yum install -y nginx

# Ubuntu / Debian
sudo apt-get update && sudo apt-get install -y nginx

sudo systemctl enable --now nginx
```

若 80 已被占用，先执行 `sudo ss -lntp '( sport = :80 )'` 确认当前服务，不要停止未知进程。

## 2. 部署账号和目录

Jenkins 应使用无 sudo 权限的专用账号写入首页。若 `deploy` 已存在，跳过创建用户：

```bash
sudo useradd --create-home --shell /bin/bash deploy
sudo install -d -m 0755 -o deploy -g deploy /srv/datav
sudo install -d -m 0700 -o deploy -g deploy /home/deploy/.ssh
```

将 Jenkins 私钥对应的公钥写入 `/home/deploy/.ssh/authorized_keys`：

```bash
sudo tee /home/deploy/.ssh/authorized_keys >/dev/null <<'EOF'
<DEPLOY_PUBLIC_KEY>
EOF
sudo chown deploy:deploy /home/deploy/.ssh/authorized_keys
sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

发布脚本先上传 `/srv/datav/.index.html.<release-id>`，再以同一文件系统中的原子重命名替换 `/srv/datav/index.html`。不要把此目录配置为跨文件系统挂载，也不要让其他任务并发写入它。

## 3. Nginx 站点配置

创建 `/etc/nginx/conf.d/datav.conf`：

```nginx
server {
    listen 80 default_server;
    server_name _;

    root /srv/datav;
    index index.html;
    charset utf-8;

    # 首页随发布和回滚切换，禁止浏览器长期缓存。
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # Vue Router history 模式刷新深层路径时回退到首页。
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

检查并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

首个版本发布后，确认读取权限：

```bash
namei -l /srv/datav/index.html
sudo -u nginx test -r /srv/datav/index.html && echo readable
```

若 `getenforce` 输出 `Enforcing`，为自定义目录添加 SELinux 标签：

```bash
sudo semanage fcontext -a -t httpd_sys_content_t '/srv/datav(/.*)?'
sudo restorecon -Rv /srv/datav
```

缺少 `semanage` 时安装系统的 SELinux 管理工具包；不要为此关闭 SELinux。

## 4. Jenkins SSH 凭据

在 Jenkins Agent 上先核对 ECS 主机指纹，再写入 `known_hosts`：

```bash
ssh-keyscan -H <ECS_DEPLOY_HOST> >> ~/.ssh/known_hosts
ssh -o BatchMode=yes deploy@<ECS_DEPLOY_HOST> 'id && test -w /srv/datav'
```

在 Jenkins 创建 **SSH Username with private key** 凭据：

- ID：`aliyun-ecs-static-deploy`
- Username：`deploy`
- Private Key：与 `<DEPLOY_PUBLIC_KEY>` 配对的私钥

不要把私钥写入 Jenkinsfile、环境变量或仓库。

## 5. OSS CORS

由于首页来自 ECS、ES Module 静态资源来自 OSS，Bucket 的“跨域设置（CORS）”必须添加：

| 字段 | 值 |
| --- | --- |
| 来源 | `http://<ECS_PUBLIC_IP>`，不带末尾 `/` |
| Methods | `GET`、`HEAD` |
| Allowed Headers | `*` |
| Expose Headers | `ETag`、`Content-Type` |
| 缓存时间 | 600 秒或组织规定值 |

同时保证 `releases/*` 可由浏览器读取（公共读或 CDN 等价能力），但不要公开 OSS 写权限或 AccessKey。

使用已发布资源验证 CORS：

```bash
curl -sI \
  -H 'Origin: http://<ECS_PUBLIC_IP>' \
  'https://<OSS_STATIC_ORIGIN>/releases/<release-id>/assets/<asset-file>.js'
```

响应必须包含 `Access-Control-Allow-Origin: http://<ECS_PUBLIC_IP>`。若之后绑定 HTTPS 域名，`ECS_SITE_ORIGIN` 和 CORS 来源都要同步改为该域名。

## 6. Jenkinsfile 与验收

将 [Jenkinsfile](../Jenkinsfile) 中的占位符替换为真实值：

```groovy
OSS_STATIC_ORIGIN = 'https://<bucket>.<endpoint>'
ECS_DEPLOY_HOST = '<Jenkins 可达的 ECS IP 或主机名>'
ECS_DEPLOY_PORT = '22'
ECS_DEPLOY_USER = 'deploy'
ECS_DEPLOY_ROOT = '/srv/datav'
ECS_SITE_ORIGIN = 'http://<ECS_PUBLIC_IP>'
```

首次 `ACTION=DEPLOY` 成功后：

```bash
curl -I http://<ECS_PUBLIC_IP>/
curl -I http://<ECS_PUBLIC_IP>/some/vue/route
```

浏览器 Network 面板应显示：文档来自 ECS IP；`index-*.js`、`index-*.css` 等来自 OSS 的 `/releases/<release-id>/`；没有 CORS 或 MIME type 错误。

## 7. 回滚和排障

选择 Jenkins 的 `ACTION=ROLLBACK` 并填写 `ROLLBACK_RELEASE`。脚本会校验目标 OSS 版本的清单、资源和首页，随后原子替换 ECS 首页；校验或 SSH 失败时旧首页不会被覆盖。

| 现象 | 首先检查 |
| --- | --- |
| 访问 IP 超时 | ECS 安全组 80、Nginx 状态、80 端口监听和公网 IP。 |
| Nginx 403 | `/srv`、`/srv/datav` 的目录权限及 SELinux 标签。 |
| 首页正常但资源被拦截 | OSS CORS 来源是否精确等于 `ECS_SITE_ORIGIN`，资源是否可读。 |
| Jenkins SSH 失败 | 22 安全组来源、私钥凭据、`authorized_keys` 权限、`known_hosts`。 |
| 发布后仍是旧页面 | 检查首页响应的 `Cache-Control`，再强制刷新。 |

发布与回滚机制的完整说明见 [Jenkins 发布：ECS 首页 + 阿里云 OSS 静态资源](./jenkins-oss-deploy.md)。
