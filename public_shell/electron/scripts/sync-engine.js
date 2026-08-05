const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '../../../private_engine/src');
const destDir = path.resolve(__dirname, '../node_modules/@nexus/engine/src');

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
  } catch (err) {
    console.warn(`⚠️ Warning: sync-engine encountered an error: ${err.message}`);
  }
} else {
  console.log('ℹ️ Skipping engine sync — using installed package tarball directly.');
}
