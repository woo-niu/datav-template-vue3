pipeline {
  agent {
    // 构建节点需预装 Node.js 22、pnpm 10.27.0 和 ossutil。
    label 'node22-ossutil'
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
    OSS_PUBLIC_ORIGIN = 'https://wn-test-deploy.oss-cn-hangzhou.aliyuncs.com'
    // 静态资源以不可变的 release ID 存放在该前缀下。
    OSS_RELEASE_PREFIX = 'releases'
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
            error("OSS 发布和回滚只允许在受信任分支 ${env.OSS_DEPLOY_BRANCH} 执行，当前分支：${sourceBranch ?: 'unknown'}")
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
            env.VITE_BASE_PATH = "/${env.OSS_RELEASE_PREFIX}/${env.RELEASE_ID}/"
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
        withCredentials([
          usernamePassword(
            credentialsId: 'aliyun-oss-deploy',
            usernameVariable: 'OSS_ACCESS_KEY_ID',
            passwordVariable: 'OSS_ACCESS_KEY_SECRET'
          )
        ]) {
          retry(2) {
            // 脚本负责上传候选版本、校验 OSS 内容后再切换稳定入口。
            sh label: 'Upload and promote release', script: 'node ci/jenkins/oss-release.mjs deploy'
          }
        }
      }
    }

    stage('Rollback') {
      when {
        expression { params.ACTION == 'ROLLBACK' }
      }
      steps {
        withCredentials([
          usernamePassword(
            credentialsId: 'aliyun-oss-deploy',
            usernameVariable: 'OSS_ACCESS_KEY_ID',
            passwordVariable: 'OSS_ACCESS_KEY_SECRET'
          )
        ]) {
          retry(2) {
            // 回滚不重新构建，只校验指定版本存在后切换稳定入口。
            sh label: 'Verify and switch release', script: 'node ci/jenkins/oss-release.mjs rollback'
          }
        }
      }
    }
  }

  post {
    success {
      echo "${params.ACTION} succeeded: ${env.OSS_PUBLIC_ORIGIN}/ (release ${env.RELEASE_ID})"
    }
    failure {
      echo 'The stable index is only replaced after the candidate release passes OSS verification.'
    }
  }
}
