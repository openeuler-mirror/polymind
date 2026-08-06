#!/usr/bin/env bash
# CI incremental pre-commit check for GitCode/Jenkins (openEuler community gate).
# Based on the generic script from openlibing/docs static-code-analysis.
#
# Required env: REPO_URL, PR_ID
# Optional env: TARGET_BRANCH (default: master), GIT_TOKEN (private repos only)
set -e
set +x

REPO_URL=${REPO_URL:?REPO_URL is required}
PR_ID=${PR_ID:?PR_ID is required}
TARGET_BRANCH=${TARGET_BRANCH:-master}

echo "[INFO] 代码仓: ${REPO_URL}"
echo "[INFO] PR号: ${PR_ID}"
echo "[INFO] 目标分支: ${TARGET_BRANCH}"

# Credentials for private repos
if [ -n "${GIT_TOKEN:-}" ]; then
  REPO_DOMAIN=$(echo "${REPO_URL}" | awk -F/ '{print $3}')
  git config --global credential.helper store
  echo "https://oauth2:${GIT_TOKEN}@${REPO_DOMAIN}" > ~/.git-credentials
fi

SOURCE_CODE_DIR="source_code"
rm -rf "${SOURCE_CODE_DIR}"
git clone "${REPO_URL}" -b "${TARGET_BRANCH}" "${SOURCE_CODE_DIR}"
cd "${SOURCE_CODE_DIR}"

git config --global user.email "openlibing-robot@openlibing.com"
git config --global user.name "openlibing-robot"
git config core.quotePath false

echo "[INFO] 拉取PR源分支代码"
LOCAL_SOURCE_BRANCH="pr_${PR_ID}"
git fetch origin "refs/merge-requests/${PR_ID}/head:${LOCAL_SOURCE_BRANCH}"
git checkout "${LOCAL_SOURCE_BRANCH}"
git merge "${TARGET_BRANCH}" --no-edit

PRE_COMMIT_CONFIG_YAML=".pre-commit-config.yaml"
if [ ! -f "${PRE_COMMIT_CONFIG_YAML}" ]; then
  echo "[SUCCESS] 未找到${PRE_COMMIT_CONFIG_YAML}，检查通过"
  exit 0
fi

echo "[INFO] 获取变更文件列表"
# shellcheck disable=SC2207
FILES_ARR=($(git diff --name-only --diff-filter=ACMR "origin/${TARGET_BRANCH}" HEAD | sort -u))

if [ ${#FILES_ARR[@]} -eq 0 ]; then
  echo "[INFO] 无变更文件，检查通过"
  exit 0
fi

echo "[INFO] 变更文件数量: ${#FILES_ARR[@]}"
echo "[INFO] 变更文件列表:"
for f in "${FILES_ARR[@]}"; do echo "  $f"; done

echo "[INFO] 安装 pre-commit"
pip config set global.index-url https://repo.huaweicloud.com/repository/pypi/simple >/dev/null 2>&1 || true
pip config set global.trusted-host repo.huaweicloud.com >/dev/null 2>&1 || true
pip install pre-commit || pip3 install pre-commit
pre-commit --version

echo "[INFO] 确保 Go 工具链可用（gitleaks golang hook 依赖）"
if ! command -v go >/dev/null 2>&1; then
  (yum install -y golang >/dev/null 2>&1 || dnf install -y golang >/dev/null 2>&1 || true)
fi
export GOPROXY="${GOPROXY:-https://goproxy.cn,direct}"

echo "[INFO] 安装依赖"
corepack enable >/dev/null 2>&1 || true
corepack prepare pnpm@11.17.0 --activate >/dev/null 2>&1 || true
pnpm install --frozen-lockfile || pnpm install

echo "[INFO] 开始 pre-commit 增量检查"
CODE=0
set +e
pre-commit run --show-diff-on-failure --files "${FILES_ARR[@]}"
CODE=$?
echo "[INFO] 类型检查"
pnpm typecheck
TC_CODE=$?
set -e

if [ "${CODE}" -ne 0 ] || [ "${TC_CODE}" -ne 0 ]; then
  echo "[ERROR] pre-commit 或类型检查失败，请在本地执行:"
  echo "  pip install pre-commit && pre-commit install --install-hooks"
  echo "  pre-commit run --files ${FILES_ARR[*]}"
  exit 1
fi

echo "[SUCCESS] pre-commit 检查全部通过"
exit 0
