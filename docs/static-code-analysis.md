# 静态代码检查与社区门禁对齐说明

> 更新日期：2026-08-06。本文档说明 Polymind 的静态检查工具选型、与 openEuler 社区门禁规则的映射关系、本地/PR 落地步骤，以及暂无开源工具覆盖时的人工/AI 检视要点。

## 1. 参考与背景

- 开源代码检查指南（openlibing/docs）：[static-code-analysis](https://gitcode.com/openlibing/docs/tree/main/static-code-analysis)
- pre-commit 工具推荐：[Pre-commit.md](https://gitcode.com/openlibing/docs/blob/main/static-code-analysis/tools/Pre-commit.md)
- JS/TS 语言检查工具选型：[JavaScript-TypeScript.md](https://gitcode.com/openlibing/docs/blob/main/static-code-analysis/languages/JavaScript-TypeScript.md)
- 社区门禁代码：[openeuler-jenkins](https://atomgit.com/openeuler/openeuler-jenkins)

落地方法：选开源工具 → 列出开源规则全集 → 匹配社区门禁规则 → 生成工具配置 → 无开源匹配的规则由 AI 检视补齐（本文档仅说明，未接入服务）。pre-commit 作为本地提交与 CI 门禁的**统一入口**（`.pre-commit-config.yaml`）：本地 `pre-commit install` 注册 hooks、社区门禁用 `scripts/ci-pre-commit-pr.sh` 增量运行同一份配置；local hook 内部调用 `package.json` scripts 同款工具（ESLint/Prettier/tsc/commitlint），避免两套命令漂移。

## 2. 工具选型（已落地）

| 工具 | 版本/位置 | 作用 |
| --- | --- | --- |
| pre-commit | ≥ 4.2.0，`.pre-commit-config.yaml` | 本地 + CI 统一调度入口；`pnpm install` 自动注册 hooks（`prepare`） |
| pre-commit-hooks | v6.0.0（GitCode 镜像） | 通用 hygiene：行尾空白、EOF、YAML/JSON 语法、合并冲突、大文件、私钥等 |
| Prettier | `.prettierrc`/`.prettierignore`，local hook | 代码格式化（修复模式 `--write`） |
| ESLint + typescript-eslint | `eslint.config.js`，local hook | lint（修复模式 `--fix`，存量规则先 warn） |
| tsc | `pnpm typecheck`（CI + manual 阶段） | 类型检查 |
| commitlint | `commitlint.config.js`，commit-msg 阶段 | commit message 规范（对齐门禁 check_commit_msg） |
| Gitleaks | v8.24.3 | 密钥扫描 |
| Codespell | v2.4.1 | 拼写检查 |

## 3. 社区门禁规则映射

| 社区门禁检查项 | 门禁规则要点 | 开源工具匹配 | 归属 |
| --- | --- | --- | --- |
| check_code_style | Python(pylint)/Go(golint)/C++(splint)，无 JS/TS 支持 | ESLint + typescript-eslint + Prettier（pre-commit local hook 统一接入）；tsc 类型检查 | 开源匹配（补齐 JS/TS 缺口） |
| check_commit_msg | gitlint：title 5–72、`type: subject`、body 5–80、conventional commits | commitlint（pre-commit commit-msg 阶段），规则已对齐 | 开源匹配 |
| check_binary_file | 禁止 .pyc/.jar/.ko/.o | `scripts/forbid-binaries.sh`（pre-commit 本地 hook）+ check-added-large-files | 开源匹配 |
| check_package_yaml_file | yaml 格式与必填字段 | check-yaml；RPM 字段校验不适用 | 部分匹配 |
| check_package_license | license 白名单/一致性 | 项目 MIT（package.json 已声明）；新增依赖 license 由评审/检视确认 | AI 检视（文档说明） |
| check_sca | 代码片段扫描 | 无本地开源匹配（ScanOSS 为外部服务） | AI 检视（文档说明） |
| check_anti_poisoning | 依赖投毒 | 无本地开源匹配，依赖审查列入检视清单 | AI 检视（文档说明） |
| check_openlibing | AI 代码检视服务 | 未接入；社区门禁侧服务（openlibing codecheck）作用与启用前提见下文 | 文档说明 |
| check_spec / check_consistency / check_build / check_install / compare_package | RPM 打包/构建/ABI | 不适用（Web 应用仓库） | 不适用 |

## 4. AI 检视清单（暂未接入服务，仅文档说明）

以下规则暂无本地开源工具覆盖，代码评审时按清单人工确认；后续如需自动化，可在社区门禁侧启用 openlibing codecheck 服务（需要社区提供 AK/SK 并配置到门禁）。

1. **类型安全**：`any`/`@ts-ignore`/非空断言的扩散与必要性
2. **安全**：XSS/注入风险（`dangerouslySetInnerHTML`、URL 拼接）、敏感信息、越权/认证绕过
3. **依赖与供应链**：新增依赖的版本锁定、已知漏洞、投毒风险（对应 check_anti_poisoning）
4. **License 合规**：新增依赖的 license 与项目 MIT 的兼容性（对应 check_package_license）
5. **代码片段**：重复/复制代码与第三方代码片段溯源（对应 check_sca）
6. **React 正确性**：hooks 依赖、副作用、内存泄漏与竞态

## 5. 落地步骤

### 5.1 新建配置（本仓库已提交）

- `package.json` scripts：`lint` / `lint:fix` / `format` / `format:check` / `typecheck` / `quality`（lint + format:check + typecheck）/ `precommit`（`pre-commit run --all-files`）；`prepare: pre-commit install` 自动注册 hooks
- `eslint.config.js`：ESLint 9 flat config（Next + typescript-eslint + Prettier），显式注册 react/react-hooks 插件；存量规则先 warn 不阻断
- `tsconfig.json`：已开启 `strict: true`，`pnpm typecheck` 全量类型检查
- `.prettierrc` / `.prettierignore`：格式化规则与忽略范围
- `.pre-commit-config.yaml`：统一入口——官方基础 hooks（hygiene/大文件/私钥）+ Gitleaks + Codespell + 本地 hooks（Prettier `--write`、ESLint `--fix`、`forbid-binaries`、commitlint、manual 阶段 typecheck）
- `.vscode/settings.json` + `extensions.json`：保存时自动格式化（Prettier + ESLint fixAll）

### 5.2 接入本地

```bash
pip install pre-commit
pre-commit install --hook-type pre-commit --hook-type commit-msg   # 注册 hooks
pnpm install          # 安装依赖（prepare 也会自动注册 hooks）
pnpm quality          # 全量非修复检查（lint + format:check + typecheck）
pnpm precommit        # 全量运行 pre-commit 检查（等价 pre-commit run --all-files）
```

编辑器（VS Code）安装推荐扩展后，保存文件自动执行 Prettier 格式化与 ESLint `--fix`。

### 5.3 接入 PR（CI）

`.github/workflows/quality.yml` 在 PR 与 master 推送时运行 pre-commit（PR 增量 `--from-ref origin/master --to-ref HEAD`、master 全量 `--all-files`）+ `pnpm lint`、`pnpm typecheck`、`pnpm format:check`，与本地同一份配置、同一批工具，保证本地与 CI 口径一致。

## 6. 历史问题治理策略

- 新项目：直接开启严格规则（error 级 + `--max-warnings=0`）
- 存量项目（本仓库）：不立即阻断历史问题——
  - 本地提交 pre-commit 只检查暂存文件，PR 门禁只检查变更文件，历史文件不动
  - ESLint 存量规则保持 `warn`，不设 `--max-warnings=0`
  - 当前基线已绿：`pnpm lint`（0 error，存量 warn）、`pnpm format:check`、`pnpm typecheck` 全量通过
  - 历史问题分批治理：按目录/模块逐步把 `warn` 收敛为 `error`，每批独立 PR
- 新规则先增量灰度：仅对变更文件生效，稳定后再全量开启

## 7. 维护约定

- 工具/hook 版本升级单独发 PR，升级后全量运行 `pre-commit run --all-files` 与 `pnpm quality` 确认影响范围
- 误报处理遵循最小影响范围：代码层屏蔽（行级注释）→ 工具配置（规则/ignore）→ 调度层排除（文件范围）
- 生成文件与第三方目录（`.next/`、`coverage/`、`components/ui/`、`.agents/`、`packaging/`、`bin/` 等）集中在 ignore 中排除
- 本地钩子统一由 pre-commit 管理（`prepare` 自动 `pre-commit install`）；从旧版 husky 迁移的仓库需先 `git config --unset-all core.hooksPath`，避免与 `.git/hooks` 冲突

## 8. 国内网络注意事项

- pre-commit hook 仓库使用 GitCode 镜像（`gitcode.com/pre-commit/pre-commit-hooks`、`gitcode.com/gitleaks/gitleaks`、`gitcode.com/codespell-project/codespell`），避免 GitHub 克隆超时；commitlint 等 JS 工具走 pnpm 依赖，pre-commit 本体需 pip 安装
- gitleaks 的 golang hook 安装时会下载 Go 工具链（go.dev）；国内环境若 go.dev 不可达，请预装系统 Go（`yum install golang` 等）并设置 `GOPROXY=https://goproxy.cn,direct`，pre-commit 会自动改用系统 Go。`scripts/ci-pre-commit-pr.sh` 已内置该引导逻辑
