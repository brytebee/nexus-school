const { ipcMain } = require('electron');

module.exports = function registerCBTHandlers(database) {
    // --------------------------------------------------------
    // QUESTION BANKS
    // --------------------------------------------------------
    ipcMain.handle("cbt:get-banks", () => {
        return database.getDb().prepare("SELECT * FROM cbt_question_banks ORDER BY created_at DESC").all();
    });

    ipcMain.handle("cbt:create-bank", (event, { name, description, category }) => {
        const stmt = database.getDb().prepare(
            "INSERT INTO cbt_question_banks (name, subject, class_category, description) VALUES (?, ?, ?, ?)"
        );
        const info = stmt.run(name, category || 'General', category || 'General', description || '');
        return { success: true, id: info.lastInsertRowid };
    });

    // --------------------------------------------------------
    // QUESTIONS
    // --------------------------------------------------------
    ipcMain.handle("cbt:get-questions", (event, bank_id) => {
        const bank = database.getDb().prepare("SELECT is_premium FROM cbt_question_banks WHERE id = ?").get(bank_id);
        const limitClause = (bank && bank.is_premium) ? " LIMIT 5" : "";
        return database.getDb().prepare(`SELECT * FROM cbt_questions WHERE bank_id = ?${limitClause}`).all(bank_id);
    });

    ipcMain.handle("cbt:install-nexpack", (event, { filePath }) => {
        try {
            const fs = require('fs');
            const crypto = require('crypto');
            const db = database.getDb();
            
            // Read Encrypted NexPack
            const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (!fileData.iv || !fileData.data) throw new Error("Invalid NexPack format.");

            // Decrypt
            const SECRET_KEY = crypto.scryptSync('NEXUS_NEXPACK_SECRET_2026', 'nexus_salt', 32);
            const ALGORITHM = 'aes-256-cbc';
            const decipher = crypto.createDecipheriv(ALGORITHM, SECRET_KEY, Buffer.from(fileData.iv, 'hex'));
            let decrypted = decipher.update(fileData.data, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            const pack = JSON.parse(decrypted);

            if (!pack.pack_id || !pack.questions || pack.questions.length === 0) {
                throw new Error("NexPack is empty or corrupted.");
            }

            // Database Upsert Transaction
            let imported = 0, skipped = 0;
            let bank_id = null;

            db.transaction(() => {
                // Check if pack already exists
                const existingBank = db.prepare("SELECT id FROM cbt_question_banks WHERE pack_id = ?").get(pack.pack_id);
                
                if (existingBank) {
                    bank_id = existingBank.id;
                } else {
                    // Create new bank
                    const info = db.prepare(`
                        INSERT INTO cbt_question_banks (name, subject, class_category, is_premium, pack_id) 
                        VALUES (?, ?, ?, 1, ?)
                    `).run(pack.title, pack.subject, pack.class_category, pack.pack_id);
                    bank_id = info.lastInsertRowid;
                }

                // Insert questions
                const insertQ = db.prepare(`
                    INSERT OR IGNORE INTO cbt_questions 
                    (bank_id, question_text, option_a, option_b, option_c, option_d, correct_option, marks, difficulty, question_hash) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);

                for (const q of pack.questions) {
                    // We use the deterministic hash. To prevent duplicates across same bank:
                    // SQLite doesn't have UNIQUE constraint on question_hash yet, but we can check manually if we prefer,
                    // or just check existence. Let's check existence manually to avoid relying on schema UNIQUE which we didn't add.
                    const exists = db.prepare("SELECT id FROM cbt_questions WHERE bank_id = ? AND question_hash = ?").get(bank_id, q.hash);
                    
                    if (!exists) {
                        insertQ.run(
                            bank_id,
                            q.question_text,
                            q.option_a,
                            q.option_b,
                            q.option_c,
                            q.option_d,
                            q.correct_option,
                            q.marks,
                            q.difficulty,
                            q.hash
                        );
                        imported++;
                    } else {
                        skipped++;
                    }
                }
            })();

            return { success: true, imported, skipped, total: pack.questions.length, bank_id };

        } catch (e) {
            console.error("[CBT] NexPack Install Error:", e);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle("cbt:add-question", (event, { bank_id, question_text, option_a, option_b, option_c, option_d, correct_option, marks }) => {
        const stmt = database.getDb().prepare(`
            INSERT INTO cbt_questions (bank_id, question_text, option_a, option_b, option_c, option_d, correct_option, marks) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const info = stmt.run(bank_id, question_text, option_a, option_b, option_c, option_d, correct_option, marks || 1);
        return { success: true, id: info.lastInsertRowid };
    });

    ipcMain.handle("cbt:bulk-import-questions", (event, { bank_id, questions }) => {
        const db = database.getDb();
        const insert = db.prepare(`
            INSERT INTO cbt_questions (bank_id, question_text, option_a, option_b, option_c, option_d, correct_option, marks) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        let imported = 0, skipped = 0;
        const tx = db.transaction((qs) => {
            for (const q of qs) {
                const text = (q.question_text || '').trim();
                if (!text) { skipped++; continue; }  // skip blank stems
                // Coerce: Gemini may return null when answer key not found
                const correctOpt = (q.correct_option || 'A').toString().toUpperCase().trim() || 'A';
                insert.run(
                    bank_id,
                    text,
                    q.option_a || '—',
                    q.option_b || '—',
                    q.option_c || '—',
                    q.option_d || '—',
                    correctOpt,
                    q.marks || 1
                );
                imported++;
            }
        });
        tx(questions);
        return { success: true, count: imported, skipped };
    });

    // --------------------------------------------------------
    // EXAMS & DEPLOYMENT
    // --------------------------------------------------------
    ipcMain.handle("cbt:get-exams", () => {
        return database.getDb().prepare("SELECT * FROM cbt_exams ORDER BY created_at DESC").all();
    });

    ipcMain.handle("cbt:deploy-exam", (event, examData) => {
        const {
            title, bank_id, class_name, academic_session, term, question_count, duration_minutes, pass_mark_percentage,
            shuffle_questions, shuffle_options, exam_type, is_promotional, assessment_mapping, security_profile, result_release_policy
        } = examData;

        const stmt = database.getDb().prepare(`
            INSERT INTO cbt_exams (
                title, bank_id, class_name, academic_session, term, question_count, duration_minutes, 
                status, pass_mark_percentage, shuffle_questions, shuffle_options, exam_type, is_promotional,
                assessment_mapping, security_profile, result_release_policy
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const info = stmt.run(
            title, bank_id, class_name, academic_session, term, question_count, duration_minutes,
            pass_mark_percentage || 50, shuffle_questions ? 1 : 0, shuffle_options ? 1 : 0, 
            exam_type, is_promotional ? 1 : 0, assessment_mapping, JSON.stringify(security_profile || {}), result_release_policy
        );
        return { success: true, id: info.lastInsertRowid };
    });

    // --------------------------------------------------------
    // BATCHES
    // --------------------------------------------------------
    ipcMain.handle("cbt:get-batches", (event, exam_id) => {
        return database.getDb().prepare("SELECT * FROM cbt_batches WHERE exam_id = ?").all(exam_id);
    });

    ipcMain.handle("cbt:create-batch", (event, { exam_id, name, start_time, end_time }) => {
        const stmt = database.getDb().prepare("INSERT INTO cbt_batches (exam_id, name, start_time, end_time, status) VALUES (?, ?, ?, ?, 'pending')");
        const info = stmt.run(exam_id, name, start_time, end_time);
        return { success: true, id: info.lastInsertRowid };
    });

    ipcMain.handle("cbt:update-batch-status", (event, { batch_id, status }) => {
        database.getDb().prepare("UPDATE cbt_batches SET status = ? WHERE id = ?").run(status, batch_id);
        return { success: true };
    });

    // --------------------------------------------------------
    // EXTERNAL CANDIDATES & TOKENS
    // --------------------------------------------------------
    ipcMain.handle("cbt:import-external-candidates", (event, candidates) => {
        const db = database.getDb();
        const insert = db.prepare(`
            INSERT INTO cbt_external_candidates (name, guardian_phone, dob_year, dob_month, dob_day, exam_year, exam_month, exam_day, target_class, subjects)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        let insertedIds = [];
        const tx = db.transaction((cands) => {
            for (const c of cands) {
                const info = insert.run(c.name, c.guardian_phone, c.dob_year, c.dob_month, c.dob_day, c.exam_year, c.exam_month, c.exam_day, c.target_class, c.subjects);
                insertedIds.push(info.lastInsertRowid);
            }
        });
        tx(candidates);
        return { success: true, count: candidates.length, ids: insertedIds };
    });

    ipcMain.handle("cbt:generate-tokens", (event, { exam_id, batch_id, is_external, target_ids }) => {
        const db = database.getDb();
        const insertInternal = db.prepare("INSERT OR IGNORE INTO cbt_tokens (exam_id, student_id, batch_id, token, status) VALUES (?, ?, ?, ?, 'unused')");
        const insertExternal = db.prepare("INSERT OR IGNORE INTO cbt_tokens (exam_id, external_candidate_id, batch_id, token, status) VALUES (?, ?, ?, ?, 'unused')");
        
        let count = 0;
        const tx = db.transaction((ids) => {
            for (const id of ids) {
                const token = Math.random().toString(36).substring(2, 8).toUpperCase(); // 6 char random token
                if (is_external) {
                    const res = insertExternal.run(exam_id, id, batch_id, token);
                    if (res.changes > 0) count++;
                } else {
                    const res = insertInternal.run(exam_id, id, batch_id, token);
                    if (res.changes > 0) count++;
                }
            }
        });
        tx(target_ids);
        return { success: true, generated: count };
    });

    ipcMain.handle("cbt:get-tokens", (event, exam_id) => {
        return database.getDb().prepare(`
            SELECT t.*, 
                   COALESCE(s.name, e.name) as candidate_name,
                   COALESCE(s.class_name, e.target_class) as class_name,
                   b.name as batch_name
            FROM cbt_tokens t
            LEFT JOIN students s ON t.student_id = s.id
            LEFT JOIN cbt_external_candidates e ON t.external_candidate_id = e.id
            LEFT JOIN cbt_batches b ON t.batch_id = b.id
            WHERE t.exam_id = ?
        `).all(exam_id);
    });

    // --------------------------------------------------------
    // MONETIZATION (Tokens)
    // --------------------------------------------------------
    ipcMain.handle("cbt:add-expansion-key", (event, { key }) => {
        if (!key.startsWith("NXT-500-")) {
            return { success: false, error: "Invalid expansion key format." };
        }
        const db = database.getDb();
        try {
            const stmt = db.prepare("INSERT INTO used_expansion_keys (key_hash, tokens_added) VALUES (?, ?)");
            stmt.run(key, 500);
            return { success: true, added: 500 };
        } catch (e) {
            if (e.message.includes('UNIQUE constraint failed')) {
                return { success: false, error: "This expansion key has already been used." };
            }
            throw e;
        }
    });

    ipcMain.handle("cbt:get-external-balance", async () => {
        const db = database.getDb();
        const keysSum = db.prepare("SELECT SUM(tokens_added) as total FROM used_expansion_keys").get().total || 0;
        const usedTokens = db.prepare("SELECT COUNT(id) as count FROM cbt_tokens WHERE external_candidate_id IS NOT NULL").get().count || 0;
        const totalAllowance = 500 + keysSum;
        const remaining = totalAllowance - usedTokens;
        return { allowance: totalAllowance, used: usedTokens, remaining: remaining };
    });

    // --------------------------------------------------------
    // SYSTEM SETTINGS (Academic Pipeline)
    // --------------------------------------------------------
    ipcMain.handle("cbt:get-system-settings", () => {
        const db = database.getDb();
        const rows = db.prepare("SELECT key, value FROM system_settings").all();
        const settings = {};
        for (const row of rows) {
            try { settings[row.key] = JSON.parse(row.value); } 
            catch(e) { settings[row.key] = row.value; }
        }
        return settings;
    });

    ipcMain.handle("cbt:save-system-setting", (event, { key, value }) => {
        const db = database.getDb();
        const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
        db.prepare("INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, valStr);
        return { success: true };
    });

    ipcMain.handle("cbt:finalize-promotional-exam", (event, { exam_id, overrides }) => {
        const db = database.getDb();
        
        // Fetch Settings
        let hierarchyStr = db.prepare("SELECT value FROM system_settings WHERE key = 'class_hierarchy'").get()?.value || '[]';
        let currentSession = db.prepare("SELECT value FROM system_settings WHERE key = 'current_academic_session'").get()?.value || 'Unknown';
        let hierarchy = [];
        try { hierarchy = JSON.parse(hierarchyStr); } catch(e) {}

        const getStudent = db.prepare("SELECT id, class_name, session_history FROM students WHERE id = ?");
        const updateStudent = db.prepare("UPDATE students SET class_name = ?, session_history = ? WHERE id = ?");
        const updateToken = db.prepare("UPDATE cbt_tokens SET status = 'completed' WHERE id = ?");

        const tx = db.transaction((ops) => {
            for (const op of ops) {
                if (!op.student_id || op.student_id === 'null') {
                    // External candidate or null, just mark token completed
                    if (op.token_id) updateToken.run(op.token_id);
                    continue;
                }

                const student = getStudent.get(op.student_id);
                if (!student) continue;

                let history = [];
                try { history = JSON.parse(student.session_history || '[]'); } catch(e) {}

                // Archive the session
                history.push({
                    session: currentSession,
                    class: student.class_name,
                    action: op.action === 'promote' ? 'Promoted' : 'Held Back',
                    exam_id: exam_id
                });

                let newClass = student.class_name;
                if (op.action === 'promote') {
                    const currentIndex = hierarchy.indexOf(student.class_name);
                    if (currentIndex !== -1 && currentIndex + 1 < hierarchy.length) {
                        newClass = hierarchy[currentIndex + 1];
                    } else if (currentIndex + 1 >= hierarchy.length) {
                        newClass = "Graduated";
                    }
                }

                updateStudent.run(newClass, JSON.stringify(history), student.id);
                if (op.token_id) updateToken.run(op.token_id);
            }
            
            // Mark Exam as completed
            db.prepare("UPDATE cbt_exams SET status = 'completed' WHERE id = ?").run(exam_id);
        });

        tx(overrides);
        return { success: true };
    });

};
