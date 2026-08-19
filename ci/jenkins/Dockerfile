FROM node:22-bookworm-slim

ARG PNPM_VERSION=10.27.0
ARG OSSUTIL_VERSION=2.3.0

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl git unzip; \
    rm -rf /var/lib/apt/lists/*; \
    case "$(dpkg --print-architecture)" in \
      amd64) oss_arch="amd64"; oss_sha256="3ae4d9fc85a7a6e9f5654d1599766f1a3a42a3692870887b5ae9338d582ef65a" ;; \
      arm64) oss_arch="arm64"; oss_sha256="f6c95ba0c2d2ef30290af686ce4d706c701f4734ce8090bee4288a77e3f1d764" ;; \
      *) echo "Unsupported architecture: $(dpkg --print-architecture)" >&2; exit 1 ;; \
    esac; \
    oss_package="ossutil-${OSSUTIL_VERSION}-linux-${oss_arch}.zip"; \
    curl --fail --location --retry 3 \
      --output "/tmp/${oss_package}" \
      "https://gosspublic.alicdn.com/ossutil/v2/${OSSUTIL_VERSION}/${oss_package}"; \
    echo "${oss_sha256}  /tmp/${oss_package}" | sha256sum --check --strict; \
    unzip -q "/tmp/${oss_package}" -d /tmp/ossutil; \
    install -m 0755 "/tmp/ossutil/ossutil-${OSSUTIL_VERSION}-linux-${oss_arch}/ossutil" /usr/local/bin/ossutil; \
    rm -rf "/tmp/${oss_package}" /tmp/ossutil; \
    corepack enable; \
    corepack prepare "pnpm@${PNPM_VERSION}" --activate

WORKDIR /workspace
