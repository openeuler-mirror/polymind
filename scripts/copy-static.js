#!/usr/bin/env node
// scripts/copy-static.js
// 构建后复制静态资源到 standalone 目录

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

function copyDirectory(src, dest) {
  if (!fs.existsSync(src)) {
    console.log(`⚠️ 源目录不存在: ${src}`);
    return;
  }

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('📁 构建后复制静态资源...');

const standaloneDir = path.join(rootDir, '.next', 'standalone');
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const appDir = path.join(standaloneDir, pkg.name);

let targetDir = standaloneDir;
if (fs.existsSync(appDir) && fs.lstatSync(appDir).isDirectory()) {
  console.log(`🔍 检测到应用子目录: ${appDir}`);
  targetDir = appDir;
}

copyDirectory(
  path.join(rootDir, 'public'),
  path.join(targetDir, 'public')
);

copyDirectory(
  path.join(rootDir, '.next', 'static'),
  path.join(targetDir, '.next', 'static')
);

console.log('✅ 静态资源复制完成');
