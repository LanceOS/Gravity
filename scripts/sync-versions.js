#!/usr/bin/env node
const fs = require('fs').promises;
const path = require('path');

async function readJson(p) {
  const txt = await fs.readFile(p, 'utf8');
  return JSON.parse(txt);
}

async function writeJson(p, obj) {
  const txt = JSON.stringify(obj, null, 2) + '\n';
  await fs.writeFile(p, txt, 'utf8');
}

(async () => {
  const rootPkgPath = path.join(__dirname, '..', 'package.json');
  let rootPkg;
  try {
    rootPkg = await readJson(rootPkgPath);
  } catch (err) {
    console.error('Failed to read root package.json:', err.message || err);
    process.exit(1);
  }

  const version = rootPkg.version;
  if (!version) {
    console.error('Root package.json has no version');
    process.exit(1);
  }

  const targets = ['server', 'client', 'library'].map((d) =>
    path.join(__dirname, '..', d, 'package.json'),
  );

  for (const target of targets) {
    try {
      const pkg = await readJson(target);
      if (pkg.version !== version) {
        pkg.version = version;
        await writeJson(target, pkg);
        console.log(`Updated ${path.relative(process.cwd(), target)} -> ${version}`);
      } else {
        console.log(`${path.relative(process.cwd(), target)} already at ${version}`);
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log(`Skipping ${path.relative(process.cwd(), target)} (not found)`);
      } else {
        console.error(`Error processing ${target}:`, err.message || err);
      }
    }
  }
})();
