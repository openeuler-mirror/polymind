# desktop/assets

桌面壳自己的静态资源。目录里的文件会随 RPM 一起装到 `<app>/assets/`（见 `polymind.spec` 的
`%install`），同时也被桌面项/图标主题复用 —— 所以这里只放**打包需要、前端产物里没有**的东西。

## `icon.png`

窗口图标（Linux 上落到 `_NET_WM_ICON`），256×256。主进程在 `src/main.js` 里通过
`BrowserWindow({ icon })` 引用它；RPM 另外把它装成
`/usr/share/icons/hicolor/256x256/apps/polymind.png`，给读不了 SVG 的图标主题做位图兜底。

**为什么要单独存一份，而不是直接用 `public/icon.png`**：后者是 11112×11112，作为窗口图标
解成位图约占 470 MiB 内存，开窗即吃满。这里留的是它的 256×256 降采样。

重新生成（仓库里没有图像工具，用自带的 Electron 运行时来做；`public/icon.png` 是源图）：

```bash
# 任意一个能跑的 electron 都行：desktop/node_modules/.bin/electron 或
# /opt/polymind/desktop/runtime/electron
electron -e 'const {app,nativeImage}=require("electron");const fs=require("fs");
app.whenReady().then(()=>{const i=nativeImage.createFromPath("public/icon.png")
  .resize({width:256,height:256,quality:"best"});
  fs.writeFileSync("desktop/assets/icon.png",i.toPNG());app.exit(0)})'
```

`public/icon.png` 换了以后要重新跑一次，否则窗口图标会和新 logo 不一致（应用列表里的
SVG 图标是另一条路径，不会跟着变）。
