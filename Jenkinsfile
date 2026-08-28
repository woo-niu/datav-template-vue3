pipeline {
  agent {
    // Node.js 与 pnpm 由下方的 Jenkins NodeJS 工具注入；节点只需提供 ossutil。
    // 保留既有标签，避免变更 Jenkins 节点标签后导致任务无法调度。
    label 'node22-ossutil'
  }

  tools {
    // 在“Manage Jenkins > Tools”中创建同名 NodeJS 工具：Node.js 22，
    // 并配置全局 npm 包 pnpm@10.27.0。该插件会将它们加入当前构建的 PATH。
    nodejs 'node-22'
  }

  options {
    // 同一流水线只保留最新构建，避免两个任务同时切换 OSS 稳定入口。
    disableConcurrentBuilds(abortPrevious: true)
    buildDiscarder(logRotator(numToKeepStr: '30', artifactNumToKeepStr: '10'))
    timeout(time: 30, unit: 'MINUTES')
    timestamps()
    skipStagesAfterUnstable()
  }

  parameters {
    choice(
      name: 'ACTION',
      choices: ['DEPLOY', 'ROLLBACK'],
      description: 'DEPLOY 构建并发布新版本；ROLLBACK 将稳定入口切换到已有版本。'
    )
    string(
      name: 'ROLLBACK_RELEASE',
      defaultValue: '',
      trim: true,
      description: 'ACTION=ROLLBACK 时必填，例如 20260811T083000Z-128-a1b2c3d4。'
    )
  }

  environment {
    CI = 'true'
    OSS_BUCKET = 'wn-test-deploy'
    OSS_ENDPOINT = 'https://oss-cn-hangzhou.aliyuncs.com'
    OSS_REGION = 'cn-hangzhou'
    // 构建产物中的 JS、CSS、图片等静态资源直接从 OSS 的不可变版本目录加载。
    OSS_STATIC_ORIGIN = 'https://wn-test-deploy.oss-cn-hangzhou.aliyuncs.com'
    OSS_RELEASE_PREFIX = 'releases'
    // 在 Jenkins 凭据中配置该 SSH 私钥；账号须能原子替换 ECS_DEPLOY_ROOT/index.html。
    ECS_SSH_CREDENTIALS_ID = 'aliyun-ecs-static-deploy'
    ECS_DEPLOY_HOST = 'REPLACE_WITH_ECS_DEPLOY_HOST'
    ECS_DEPLOY_PORT = '22'
    ECS_DEPLOY_USER = 'deploy'
    ECS_DEPLOY_ROOT = '/srv/datav'
    ECS_SITE_ORIGIN = 'http://REPLACE_WITH_ECS_PUBLIC_IP'
    // CI 测试阶段仅允许 jenkins-develop 分支变更测试环境稳定入口。
    OSS_DEPLOY_BRANCH = 'jenkins-develop'
  }

  stages {
    stage('Checkout') {
      steps {
        script {
          deleteDir()
          def checkoutVariables = checkout scm
          env.CHECKED_OUT_BRANCH = checkoutVariables.GIT_BRANCH ?: ''
        }
      }
    }

    stage('Initialize') {
      steps {
        script {
          def commit = sh(
            label: 'Resolve Git commit',
            returnStdout: true,
            script: 'git rev-parse HEAD'
          ).trim()

          env.GIT_COMMIT = commit
          def sourceBranch = env.BRANCH_NAME ?: env.CHECKED_OUT_BRANCH ?: env.GIT_BRANCH
          sourceBranch = sourceBranch?.replaceFirst(/^origin\//, '')

          // 禁止 PR 或非 jenkins-develop 分支触发部署、回滚，避免未受信任代码取得发布凭据。
          if (env.CHANGE_ID || sourceBranch != env.OSS_DEPLOY_BRANCH) {
            error("ECS 首页发布和 OSS 资源回滚只允许在受信任分支 ${env.OSS_DEPLOY_BRANCH} 执行，当前分支：${sourceBranch ?: 'unknown'}")
          }

          if (params.ACTION == 'ROLLBACK') {
            def requestedRelease = params.ROLLBACK_RELEASE.trim()
            if (!(requestedRelease ==~ /[A-Za-z0-9][A-Za-z0-9._-]{0,127}/)) {
              error('ROLLBACK_RELEASE 不能为空，且只能包含字母、数字、点、下划线和连字符。')
            }
            env.RELEASE_ID = requestedRelease
          } else {
            def releaseTimestamp = sh(
              label: 'Create release timestamp',
              returnStdout: true,
              script: 'date -u +%Y%m%dT%H%M%SZ'
            ).trim()
            env.RELEASE_ID = "${releaseTimestamp}-${env.BUILD_NUMBER}-${commit.substring(0, 8)}"
            // Vite 构建产物引用当前不可变版本目录，支持安全缓存与快速回滚。
            env.VITE_BASE_PATH = "${env.OSS_STATIC_ORIGIN}/${env.OSS_RELEASE_PREFIX}/${env.RELEASE_ID}/"
          }

          currentBuild.displayName = "#${env.BUILD_NUMBER} ${params.ACTION} ${env.RELEASE_ID}"
          currentBuild.description = "${params.ACTION}: ${env.RELEASE_ID}"
        }

        sh label: 'Verify toolchain', script: '''
          node_version="$(node --version)"
          pnpm_version="$(pnpm --version)"

          case "$node_version" in
            v22.*) ;;
            *) echo "Node.js 22 is required; found $node_version" >&2; exit 1 ;;
          esac

          if [ "$pnpm_version" != '10.27.0' ]; then
            echo "pnpm 10.27.0 is required; found $pnpm_version" >&2
            exit 1
          fi

          printf '%s\n' "Node.js: $node_version" "pnpm: $pnpm_version"
          ossutil version
          command -v ssh
          command -v scp
        '''
        sh label: 'Test OSS release workflow', script: 'pnpm test:ci'
      }
    }

    stage('Install') {
      when {
        expression { params.ACTION == 'DEPLOY' }
      }
      steps {
        sh label: 'Install locked dependencies', script: 'pnpm install --frozen-lockfile --store-dir .pnpm-store'
      }
    }

    stage('Build') {
      when {
        expression { params.ACTION == 'DEPLOY' }
      }
      steps {
        sh label: 'Typecheck and build', script: 'pnpm build'
        sh label: 'Write release manifest', script: 'node ci/jenkins/write-release-manifest.mjs dist/release.json'
        archiveArtifacts artifacts: 'dist/**/*', fingerprint: true
      }
    }

    stage('Publish') {
      when {
        expression { params.ACTION == 'DEPLOY' }
      }
      steps {
        sshagent(credentials: [env.ECS_SSH_CREDENTIALS_ID]) {
          withCredentials([
            usernamePassword(
              credentialsId: 'aliyun-oss-deploy',
              usernameVariable: 'OSS_ACCESS_KEY_ID',
              passwordVariable: 'OSS_ACCESS_KEY_SECRET'
            )
          ]) {
            retry(2) {
              // 先验证 OSS 不可变版本，再原子替换 ECS 首页；静态资源不经过 ECS。
              sh label: 'Upload static assets and switch ECS index', script: 'node ci/jenkins/oss-release.mjs deploy'
            }
          }
        }
      }
    }

    stage('Rollback') {
      when {
        expression { params.ACTION == 'ROLLBACK' }
      }
      steps {
        sshagent(credentials: [env.ECS_SSH_CREDENTIALS_ID]) {
          withCredentials([
            usernamePassword(
              credentialsId: 'aliyun-oss-deploy',
              usernameVariable: 'OSS_ACCESS_KEY_ID',
              passwordVariable: 'OSS_ACCESS_KEY_SECRET'
            )
          ]) {
            retry(2) {
              // 回滚不重新构建；校验目标 OSS 版本后，原子替换 ECS 首页。
              sh label: 'Verify release and switch ECS index', script: 'node ci/jenkins/oss-release.mjs rollback'
            }
          }
        }
      }
    }
  }

  post {
    success {
      echo "${params.ACTION} succeeded: ${env.ECS_SITE_ORIGIN}/ (release ${env.RELEASE_ID})"
    }
    failure {
      echo 'The ECS index is only replaced after the candidate OSS release passes verification.'
    }
  }
}
