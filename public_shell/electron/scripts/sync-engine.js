const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '../../../private_engine/src');
const destDir = path.resolve(__dirname, '../node_modules/@nexus/engine/src');
const srcPublicDir = path.resolve(__dirname, '../../../private_engine/public');
const destPublicDir = path.resolve(__dirname, '../node_modules/@nexus/engine/public');

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (fs.existsSync(srcDir) && fs.existsSync(destDir)) {
  try {
    const files = fs.readdirSync(srcDir);
    let copied = 0;
    for (const file of files) {
      if (file.endsWith('.js')) {
        fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
        copied++;
      }
    }
    console.log(`✅ Engine source synced to installed package (${copied} files)`);

    // Also sync public directory (CBT, Staff Portal, etc.)
    if (fs.existsSync(srcPublicDir)) {
      copyDirRecursive(srcPublicDir, destPublicDir);
      console.log(`✅ Engine public assets synced to installed package`);
    }
  } catch (err) {
    console.warn(`⚠️ Warning: sync-engine encountered an error: ${err.message}`);
  }
} else {
  console.log('ℹ️ Skipping engine sync — using installed package tarball directly.');
}

