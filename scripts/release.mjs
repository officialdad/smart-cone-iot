#!/usr/bin/env node
/**
 * Promote current RC to production release.
 *
 * Usage:
 *   node scripts/release.mjs          → 1.0.13-rc.1 → 1.1.0
 *   node scripts/release.mjs minor    → 1.0.13-rc.1 → 1.1.0
 *   node scripts/release.mjs major    → 1.0.13-rc.1 → 2.0.0
 *   node scripts/release.mjs patch    → 1.0.13-rc.1 → 1.0.14
 *   add --dry-run to print the plan and change nothing
 *
 * Strips -rc.N suffix. The version commit goes through a pull request, then the
 * script tags the merge commit. See publish-release.mjs.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preflight, publishRelease } from './publish-release.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const pkgPath = resolve(rootDir, 'dashboard/package.json');
const indexTsPath = resolve(rootDir, 'dashboard/src/index.ts');
const indexHtmlPath = resolve(rootDir, 'dashboard/public/index.html');
const hazardsHtmlPath = resolve(rootDir, 'dashboard/public/hazards.html');
const cifsHtmlPath = resolve(rootDir, 'dashboard/public/cifs-viewer.html');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const bump = args.find((arg) => !arg.startsWith('--')) ?? 'minor';
if (!['patch', 'minor', 'major'].includes(bump)) {
  console.error(`Unknown bump type "${bump}". Use: patch | minor | major`);
  process.exit(1);
}

function replaceInFile(filePath, search, replace) {
  const content = readFileSync(filePath, 'utf8');
  writeFileSync(filePath, content.replaceAll(search, replace));
}

const defaultBranch = preflight(rootDir);

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const currentVersion = pkg.version;
const base = currentVersion.replace(/-.*$/, '');
const [major, minor, patch] = base.split('.').map(Number);

let version;
if (bump === 'major') version = `${major + 1}.0.0`;
else if (bump === 'minor') version = `${major}.${minor + 1}.0`;
else version = `${major}.${minor}.${patch + 1}`;

const tag = `v${version}`;

console.log(`\n🚀 Production release: ${currentVersion} → ${version}\n`);

if (dryRun) {
  console.log(`Dry run: would open a PR "release: ${tag}" from release/${tag} into ${defaultBranch}, merge it, then tag the merge commit and push the tag.`);
  process.exit(0);
}

// Update files
pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
replaceInFile(indexTsPath, `version: '${currentVersion}'`, `version: '${version}'`);
replaceInFile(indexHtmlPath, `v${currentVersion}`, `v${version}`);
replaceInFile(hazardsHtmlPath, `v${currentVersion}`, `v${version}`);
replaceInFile(cifsHtmlPath, `v${currentVersion}`, `v${version}`);

console.log(`Updated files:`);
console.log(`  - dashboard/package.json`);
console.log(`  - dashboard/src/index.ts`);
console.log(`  - dashboard/public/index.html`);
console.log(`  - dashboard/public/hazards.html`);
console.log(`  - dashboard/public/cifs-viewer.html`);
console.log();

await publishRelease({
  rootDir,
  defaultBranch,
  tag,
  files: [pkgPath, indexTsPath, indexHtmlPath, hazardsHtmlPath, cifsHtmlPath],
});

console.log(`\n✓ Released ${tag} — GitHub Actions will deploy automatically\n`);
