const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const apkPath = path.resolve(__dirname, '../../android/build/outputs/apk/release/Nexus-release.apk');
const androidDir = path.resolve(__dirname, '../../android');

console.log('🔍 [Release Guard] Checking Android release APK for electron packaging...');

if (!fs.existsSync(apkPath)) {
  console.log('⚠️ [Release Guard] Nexus-release.apk not found. Compiling signed release APK...');
  
  // Ensure gradle.properties exists with android.useAndroidX
  const gradleProps = path.resolve(androidDir, 'gradle.properties');
  if (!fs.existsSync(gradleProps)) {
    fs.writeFileSync(
      gradleProps,
      'android.useAndroidX=true\nandroid.nonTransitiveRClass=true\norg.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8\n'
    );
    console.log('📝 [Release Guard] Created fallback gradle.properties with android.useAndroidX=true');
  }

  const isWin = process.platform === 'win32';
  const gradlewCmd = isWin ? 'gradlew.bat' : './gradlew';
  if (!isWin) {
    try {
      fs.chmodSync(path.join(androidDir, 'gradlew'), 0o755);
    } catch (_) {}
  }

  try {
    // shell:true is required on Windows so cmd.exe can interpret gradlew.bat.
    // Pass through JAVA_HOME so Gradle respects the setup-java JDK 17 pin from CI.
    const env = { ...process.env };
    execSync(`${gradlewCmd} assembleRelease`, {
      cwd: androidDir,
      stdio: 'inherit',
      shell: isWin,
      env
    });
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
