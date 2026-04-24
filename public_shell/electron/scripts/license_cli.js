const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIMOw4tDMKcC7SvUcvHKimLHC8fL59tLO4N7rZi/PJ84i
-----END PRIVATE KEY-----`;

function mintLicense() {
  const args = process.argv.slice(2);
  const params = {};
  
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace('--', '');
    params[key] = args[i + 1];
  }

  if (!params.school || !params.tier || !params.students || !params.months || !params.hardware) {
    console.log(`
Usage: node license_cli.js --school <school_id> --tier <Silver|Gold|Diamond> --students <limit> --months <duration> --hardware <hardware_fingerprint>

Example:
node license_cli.js --school PREMIUM_001 --tier Gold --students 50 --months 4 --hardware 1a2b3c4d5e...
    `);
    process.exit(1);
  }

  const expiresAt = Date.now() + parseInt(params.months) * 30 * 24 * 60 * 60 * 1000;
  
  const payload = {
    tier: params.tier,
    school_id: params.school,
    hardware_id: params.hardware,
    student_count: parseInt(params.students),
    expires_at: expiresAt
  };

  const payloadStr = JSON.stringify(payload);
  const privateKey = crypto.createPrivateKey(PRIVATE_KEY_PEM);
  const signature = crypto.sign(null, Buffer.from(payloadStr), privateKey);

  const licenseFile = {
    payload: payloadStr,
    signature: signature.toString('hex')
  };

  const outputPath = path.join(process.cwd(), 'license.nexus');
  fs.writeFileSync(outputPath, JSON.stringify(licenseFile, null, 2));
  
  console.log(`✅ License successfully minted!`);
  console.log(`Saved to: ${outputPath}`);
  console.log(`\nPayload:`, payload);
}

mintLicense();
