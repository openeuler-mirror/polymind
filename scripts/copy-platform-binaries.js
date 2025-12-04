#!/usr/bin/env node

/**
 * Copy specific platform packages from .pnpm store to node_modules for electron-builder
 * 从 .pnpm 存储复制特定平台包到 node_modules 供 electron-builder 使用
 * 使用正则表达式动态匹配包版本，适配多种版本
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';

const platform = process.platform;
const arch = process.arch;

console.log(`📦 Copying platform packages for ${platform}-${arch}`);

/**
 * 使用正则表达式动态查找包路径
 * @param {string} packageName 包名模式
 * @param {string} targetPath 目标路径
 * @returns {Object|null} 包信息对象或null
 */
function findPackagePath(packageName, targetPath) {
  const pnpmDir = 'node_modules/.pnpm';
  
  if (!existsSync(pnpmDir)) {
    console.log(`⚠️  .pnpm directory not found: ${pnpmDir}`);
    return null;
  }

  try {
    const entries = readdirSync(pnpmDir);
    
    // 构建正则表达式模式
    // 匹配格式: packageName@version 或 packageName@version_other_deps
    const regexPattern = new RegExp(`^${packageName.replace(/\+/g, '\\+')}@([^_]+)`);
    
    for (const entry of entries) {
      if (regexPattern.test(entry)) {
        const sourcePath = join(pnpmDir, entry, 'node_modules', packageName.split('+')[0]);
        
        if (existsSync(sourcePath)) {
          console.log(`🔍 Found package: ${entry} -> ${sourcePath}`);
          return {
            source: sourcePath,
            target: targetPath
          };
        }
      }
    }
    
    console.log(`⚠️  Package not found: ${packageName}`);
    return null;
  } catch (error) {
    console.log(`❌ Error searching for package ${packageName}: ${error.message}`);
    return null;
  }
}

/**
 * 获取需要复制的包配置
 * @returns {Array} 包信息数组
 */
function getPackagesToCopy() {
  const packages = [];
  
  // Sharp 相关包
  const sharpPackage = findPackagePath(`@img+sharp-${platform}-${arch}`, `node_modules/@img/`);
  if (sharpPackage) packages.push(sharpPackage);
  
  const sharpLibvipsPackage = findPackagePath(`@img+sharp-libvips-${platform}-${arch}`, `node_modules/@img/`);
  if (sharpLibvipsPackage) packages.push(sharpLibvipsPackage);
  
  // DuckDB 相关包
  const duckdbPackage = findPackagePath(`@duckdb+node-bindings-${platform}-${arch}`, `node_modules/@duckdb/`);
  if (duckdbPackage) packages.push(duckdbPackage);
  
  // LZO 包 - 这个包没有平台架构后缀
  const lzoPackage = findPackagePath('lzo', 'node_modules/lzo/');
  if (lzoPackage) packages.push(lzoPackage);

  // LightningCSS 包
  const lightningcssPackage = findPackagePath(`lightningcss-${platform}-${arch}-gnu`, `node_modules/lightningcss-${platform}-${arch}-gnu/`);
  if (lightningcssPackage) packages.push(lightningcssPackage);
  
  // Rollup 包
  const rollupPackage = findPackagePath(`@rollup+rollup-${platform}-${arch}-gnu`, `node_modules/@rollup/`);
  if (rollupPackage) packages.push(rollupPackage);
  
  // TailwindCSS 包
  const tailwindPackage = findPackagePath(`@tailwindcss+oxide-${platform}-${arch}-gnu`, `node_modules/@tailwindcss/`);
  if (tailwindPackage) packages.push(tailwindPackage);
  
  // Better-sqlite3 包 - 这个包没有平台架构后缀
  const sqlitePackage = findPackagePath('better-sqlite3-multiple-ciphers', 'node_modules/better-sqlite3-multiple-ciphers/');
  if (sqlitePackage) packages.push(sqlitePackage);
  
  return packages;
}

/**
 * 递归复制目录
 * @param {string} sourceDir 源目录
 * @param {string} targetDir 目标目录
 * @returns {Object} 复制统计
 */
function copyDirectory(sourceDir, targetDir) {
  let copiedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  
  try {
    const entries = readdirSync(sourceDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const sourcePath = join(sourceDir, entry.name);
      const targetPath = join(targetDir, entry.name);
      
      if (entry.isDirectory()) {
        // 递归复制子目录
        if (!existsSync(targetPath)) {
          mkdirSync(targetPath, { recursive: true });
        }
        const result = copyDirectory(sourcePath, targetPath);
        copiedCount += result.copiedCount;
        skippedCount += result.skippedCount;
        errorCount += result.errorCount;
      } else if (entry.isFile()) {
        // 复制文件
        if (existsSync(targetPath)) {
          skippedCount++;
        } else {
          try {
            // 确保目标目录存在
            const targetFileDir = dirname(targetPath);
            if (!existsSync(targetFileDir)) {
              mkdirSync(targetFileDir, { recursive: true });
            }
            
            copyFileSync(sourcePath, targetPath);
            console.log(`✅ Copied: ${basename(sourcePath)} -> ${targetPath.replace('node_modules/', '')}`);
            copiedCount++;
          } catch (error) {
            console.log(`❌ Failed to copy: ${sourcePath} -> ${targetPath}: ${error.message}`);
            errorCount++;
          }
        }
      }
    }
  } catch (error) {
    console.log(`❌ Error reading directory ${sourceDir}: ${error.message}`);
    errorCount++;
  }
  
  return { copiedCount, skippedCount, errorCount };
}

/**
 * 复制平台包
 * @param {Array} packages 包信息数组
 * @returns {Object} 复制统计
 */
function copyPlatformPackages(packages) {
  let totalCopied = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  
  packages.forEach(pkg => {
    console.log(`\n🔍 Processing: ${pkg.source}`);
    
    if (!existsSync(pkg.source)) {
      console.log(`⚠️  Source package not found: ${pkg.source}`);
      return;
    }
    
    // 确保目标目录存在
    if (!existsSync(pkg.target)) {
      mkdirSync(pkg.target, { recursive: true });
    }
    
    // 复制整个包目录
    const { copiedCount, skippedCount, errorCount } = copyDirectory(pkg.source, pkg.target);
    
    totalCopied += copiedCount;
    totalSkipped += skippedCount;
    totalErrors += errorCount;
    
    console.log(`   📊 ${pkg.source}: ${copiedCount} copied, ${skippedCount} skipped, ${errorCount} errors`);
  });
  
  return { totalCopied, totalSkipped, totalErrors };
}

// 主函数
function main() {
  console.log('🔍 Copying specific platform packages...');
  
  // 动态获取要复制的包
  const packagesToCopy = getPackagesToCopy();
  
  if (packagesToCopy.length === 0) {
    console.log('⚠️  No platform packages found to copy');
    return;
  }
  
  // 显示要复制的包
  packagesToCopy.forEach(pkg => {
    console.log(`   📦 ${pkg.source} -> ${pkg.target}`);
  });
  
  // 复制包
  const { totalCopied, totalSkipped, totalErrors } = copyPlatformPackages(packagesToCopy);
  
  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Copied: ${totalCopied} files`);
  console.log(`   ⏭️  Skipped: ${totalSkipped} files (already up-to-date)`);
  console.log(`   ❌ Errors: ${totalErrors} files`);
  console.log(`   📁 Total packages: ${packagesToCopy.length}`);
  
  if (totalCopied > 0) {
    console.log(`🎉 Successfully updated platform packages`);
  } else if (totalErrors > 0) {
    console.log(`⚠️  Some packages had errors during copying`);
    process.exit(1);
  } else {
    console.log(`ℹ️  All packages are already up-to-date`);
  }
}

// 执行主函数
main();