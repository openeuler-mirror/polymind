# PolyMind 打包说明

## 目录说明
`packaging/` 目录包含PolyMind项目的各类打包脚本和配置文件，用于生成不同环境的发布包。

## 脚本说明
### `build.sh` 自动化构建脚本
支持多种构建模式，目前已实现npm包构建功能。

#### 构建npm发布包
```bash
./packaging/build.sh npm
```

执行流程：
1. 自动执行 `pnpm build` 完成Next.js生产构建
2. 自动复制public静态资源目录到standalone运行目录
3. 自动复制前端构建静态资源到standalone运行目录
4. 执行 `npm pack` 生成可发布的npm包文件 `polymind-*.tgz`

#### 构建产物
生成的npm包可以直接：
- 发布到npm官方仓库：`npm publish polymind-*.tgz`
- 本地安装测试：`npm install ./polymind-*.tgz`

## 打包注意事项
1. 构建前请确保所有依赖已安装：`pnpm install`
2. 构建过程会自动清理旧的构建产物
3. 生成的npm包已包含所有运行时依赖，无需额外安装
