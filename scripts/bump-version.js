#!/usr/bin/env node
/**
 * バージョンバンプスクリプト
 * package.json / src-tauri/tauri.conf.json / src-tauri/Cargo.toml の3ファイルを一括更新する
 *
 * 使い方:
 *   node scripts/bump-version.js <major|minor|bugfix>
 *
 * 標準出力に新バージョン文字列を出力する
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const bumpType = process.argv[2];

if (!['major', 'minor', 'bugfix'].includes(bumpType)) {
  console.error('Usage: node scripts/bump-version.js <major|minor|bugfix>');
  process.exit(1);
}

const root = resolve(__dirname, '..');

// package.json から現在のバージョンを読み取る
const pkgPath = resolve(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const parts = pkg.version.split('.').map(Number);

if (parts.length !== 3 || parts.some(isNaN)) {
  console.error(`Invalid version format in package.json: ${pkg.version}`);
  process.exit(1);
}

if (bumpType === 'major') {
  parts[0]++;
  parts[1] = 0;
  parts[2] = 0;
} else if (bumpType === 'minor') {
  parts[1]++;
  parts[2] = 0;
} else {
  // bugfix
  parts[2]++;
}

const newVersion = parts.join('.');

// package.json を更新
pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// src-tauri/tauri.conf.json を更新
const tauriConfPath = resolve(root, 'src-tauri', 'tauri.conf.json');
const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf8'));
tauriConf.version = newVersion;
writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');

// src-tauri/Cargo.toml を更新（[package] セクションの version 行のみ置換）
const cargoPath = resolve(root, 'src-tauri', 'Cargo.toml');
let cargo = readFileSync(cargoPath, 'utf8');
cargo = cargo.replace(/^version = "[^"]*"/m, `version = "${newVersion}"`);
writeFileSync(cargoPath, cargo);

// 新バージョンを stdout に出力（GitHub Actions の $GITHUB_OUTPUT で使用）
process.stdout.write(newVersion);
