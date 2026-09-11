// next.config.js
//
// 双构建目标（用环境变量切换，默认行为与改造前完全一致）：
//
//   默认（不设 POLYMIND_BUILD_TARGET）
//     → output: 'standalone'，供现有「nginx + Next 服务」部署方式使用。
//
//   POLYMIND_BUILD_TARGET=static
//     → output: 'export'，产出**纯静态站点**（落在 .next-export/），
//       由桌面端经 app:// 协议内嵌托管，运行时不再需要 Node 服务端。
//       · 静态导出没有 Node 服务端，Next 的图片优化不可用，必须关掉；
//         本项目里 next/image 只用于固定尺寸的本地 SVG 图标，关闭优化无功能影响。
//       · distDir 刻意另起一个目录，避免把现有的 .next（standalone 产物）冲掉。
const isStaticBuild = process.env.POLYMIND_BUILD_TARGET === 'static'

/** @type {import('next').NextConfig} */
const nextConfig = isStaticBuild
  ? {
      output: 'export',
      distDir: '.next-export',
      images: { unoptimized: true },
    }
  : {
      output: 'standalone',
      allowedDevOrigins: ['127.0.0.1'],
    }

export default nextConfig
