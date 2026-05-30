#!/usr/bin/env node
/**
 * 在 npm publish 前运行，将 Next.js standalone 模式不会自动包含的
 * static/ 和 public/ 目录复制到 standalone 输出目录中。
 *
 * 这是 Next.js standalone 模式的已知要求：
 * https://nextjs.org/docs/pages/api-reference/next-config-js/output#automatically-copying-traced-files
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const standaloneBase = path.join(rootDir, '.next', 'standalone');
const staticSrc = path.join(rootDir, '.next', 'static');
const publicSrc = path.join(rootDir, 'public');

if (!fs.existsSync(standaloneBase)) {
  console.error('❌ .next/standalone 目录不存在，请先执行 pnpm build');
  process.exit(1);
}

// 查找 standalone 目录中所有包含 server.js 的子目录
const entries = fs.readdirSync(standaloneBase, { withFileTypes: true });
let targets = [];

for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const candidate = path.join(standaloneBase, entry.name);
  if (fs.existsSync(path.join(candidate, 'server.js'))) {
    targets.push(candidate);
  }
}

// 如果 server.js 直接在 standalone/ 下（扁平结构）
if (fs.existsSync(path.join(standaloneBase, 'server.js'))) {
  targets.push(standaloneBase);
}

if (targets.length === 0) {
  console.log('⚠ 未找到 server.js，跳过');
  process.exit(0);
}

for (const target of targets) {
  const name = path.basename(target) === 'standalone' ? '.' : path.basename(target);
  console.log(`📦 准备 standalone 目录: ${name}`);

  // 复制 .next/static 到 standalone/.next/static
  const staticDest = path.join(target, '.next', 'static');
  if (fs.existsSync(staticSrc)) {
    fs.cpSync(staticSrc, staticDest, { recursive: true });
    console.log(`   ✅ .next/static → ${name}/.next/static`);
  }

  // 复制 public 到 standalone/public
  const publicDest = path.join(target, 'public');
  if (fs.existsSync(publicSrc)) {
    fs.cpSync(publicSrc, publicDest, { recursive: true });
    console.log(`   ✅ public → ${name}/public`);
  }

  // 清理 .env 文件（不应发布开发环境配置）
  for (const envFile of ['.env', '.env.local', '.env.production']) {
    const envPath = path.join(target, envFile);
    if (fs.existsSync(envPath)) {
      fs.rmSync(envPath);
      console.log(`   🧹 已删除: ${name}/${envFile}`);
    }
  }
}

console.log('✅ standalone 准备完成');
