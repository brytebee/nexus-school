const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 🔒 AES-256 Encryption Settings (Must match nexus-school/public_shell/electron/cbt-ipc-handlers.js)
const SECRET_KEY = crypto.scryptSync('NEXUS_NEXPACK_SECRET_2026', 'nexus_salt', 32); 
const ALGORITHM = 'aes-256-cbc';

function buildPack(packId, title, subject, classCategory, jsonDir) {
    console.log(`\n📦 Building NexPack: ${title}...`);
    
    if (!fs.existsSync(jsonDir)) {
        console.error(`❌ Error: Directory '${jsonDir}' not found.`);
        process.exit(1);
    }

    const files = fs.readdirSync(jsonDir).filter(f => f.endsWith('.json'));
    let questions = [];

    for (const file of files) {
        const filePath = path.join(jsonDir, file);
        try {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (Array.isArray(data)) {
                questions = questions.concat(data);
                console.log(`  📄 Included ${file} (${data.length} questions)`);
            } else {
                console.warn(`  ⚠️ Warning: ${file} does not contain a JSON array. Skipping.`);
            }
        } catch (err) {
            console.error(`  ❌ Error reading ${file}:`, err.message);
        }
    }

    if (questions.length === 0) {
        console.error("❌ No valid questions found in JSON files. Aborting.");
        return;
    }

    // Standardize & Hash questions
    questions = questions.map(q => {
        const text = (q.question_text || '').trim();
        // Generate deterministic hash for upsert (preventing duplicates on annual update)
        const hash = crypto.createHash('md5').update(text).digest('hex');
        
        return {
            question_text: text,
            option_a: (q.option_a || '—').toString().trim(),
            option_b: (q.option_b || '—').toString().trim(),
            option_c: (q.option_c || '—').toString().trim(),
            option_d: (q.option_d || '—').toString().trim(),
            correct_option: (q.correct_option || 'A').toString().toUpperCase().trim(),
            marks: parseInt(q.marks) || 1,
            difficulty: q.difficulty || 'medium',
            hash: hash
        };
    });

    const payload = {
        pack_id: packId,
        title: title,
        subject: subject,
        class_category: classCategory,
        is_premium: true,
        version: 1,
        questions: questions
    };

    const jsonString = JSON.stringify(payload);
    
    // Encrypt payload
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, SECRET_KEY, iv);
    let encrypted = cipher.update(jsonString, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const outputObj = {
        iv: iv.toString('hex'),
        data: encrypted
    };

    const outputPath = path.join(process.cwd(), `${packId}.nexpack`);
    fs.writeFileSync(outputPath, JSON.stringify(outputObj, null, 2));
    
    console.log(`\n✅ Success! Created Premium Pack: ${outputPath}`);
    console.log(`📊 Total Questions: ${questions.length}`);
    console.log(`🔒 Status: AES-256 Encrypted & Ready for Distribution\n`);
}

const args = process.argv.slice(2);
if (args.length < 5) {
    console.log("\n🛠️  NexPack CLI Builder\n");
    console.log("Usage: node nexpack-builder.js <pack_id> \"<title>\" \"<subject>\" \"<class>\" <dir>");
    console.log("Example: node nexpack-builder.js waec_econ_premium \"WAEC Economics\" \"Economics\" \"SS3\" ./raw_jsons\n");
    process.exit(1);
}

buildPack(args[0], args[1], args[2], args[3], args[4]);
