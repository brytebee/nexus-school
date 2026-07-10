const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
const path = require('path');
const fs = require('fs');

module.exports = async function(context) {
  const { appOutDir, packager } = context;
  const platform = packager.platform.name;
  
  const execName = packager.executableName || packager.appInfo.productFilename;
  let executablePath;
  if (platform === 'mac') {
    const appBundlePath = path.join(appOutDir, `${packager.appInfo.productFilename}.app`);
    executablePath = path.join(appBundlePath, 'Contents', 'MacOS', packager.appInfo.productFilename);
  } else if (platform === 'windows') {
    executablePath = path.join(appOutDir, `${execName}.exe`);
  } else {
    // Linux (e.g. AppImage / unpacked dir)
    executablePath = path.join(appOutDir, execName);
  }

  if (!fs.existsSync(executablePath)) {
    console.warn(`[Fuses] Executable not found at ${executablePath}. Skipping fuses.`);
    return;
  }

  console.log(`[Fuses] Flipping security fuses for ${executablePath}...`);
  try {
    await flipFuses(executablePath, {
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false, // Disable ELECTRON_RUN_AS_NODE
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false, // Disable NODE_OPTIONS
      [FuseV1Options.EnableNodeCliInspectArguments]: false, // Disable --inspect
      [FuseV1Options.OnlyLoadAppFromAsar]: true, // Enforce loading from app.asar only
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true, // Enforce ASAR integrity check
    });
    console.log('[Fuses] Security fuses successfully applied.');
  } catch (err) {
    console.error('[Fuses] Failed to apply fuses:', err.message);
    throw err;
  }
};
