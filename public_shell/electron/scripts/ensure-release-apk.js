const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const apkPath = path.resolve(__dirname, '../../android/build/outputs/apk/release/Nexus-release.apk');
const androidDir = path.resolve(__dirname, '../../android');

console.log('🔍 [Release Guard] Checking Android release APK for electron packaging...');

if (!fs.existsSync(apkPath)) {
  console.log('⚠️ [Release Guard] Nexus-release.apk not found. Compiling signed release APK...');
  try {
    execSync('./gradlew assembleRelease', { cwd: androidDir, stdio: 'inherit' });
  } catch (err) {
    console.error('❌ [Release Guard] Failed to compile Android release APK.');
    process.exit(1);
  }
}

if (!fs.existsSync(apkPath)) {
  console.error(`❌ [Release Guard] Android release APK missing at ${apkPath}`);
  process.exit(1);
}

const stat = fs.statSync(apkPath);
console.log(`✅ [Release Guard] Verified signed release APK: ${apkPath} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
