const fs = require('fs');
const path = '/Users/MAC/Documents/Projects/nexus-school/private_engine/src/database.js';

let content = fs.readFileSync(path, 'utf8');

const cbtTables = `
        -- ── Phase 7: Full Production CBT Engine (Diamond) ──────

        -- Table 15: cbt_question_banks — Groups of questions
        CREATE TABLE IF NOT EXISTS cbt_question_banks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            subject TEXT NOT NULL,
            class_category TEXT NOT NULL DEFAULT 'General',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- Table 16: cbt_questions — Individual questions
        CREATE TABLE IF NOT EXISTS cbt_questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bank_id INTEGER NOT NULL,
            question_text TEXT NOT NULL,
            option_a TEXT NOT NULL,
            option_b TEXT NOT NULL,
            option_c TEXT NOT NULL,
            option_d TEXT NOT NULL,
            correct_option TEXT NOT NULL CHECK(correct_option IN ('A','B','C','D')),
            marks INTEGER NOT NULL DEFAULT 1,
            difficulty TEXT NOT NULL DEFAULT 'medium' CHECK(difficulty IN ('easy','medium','hard')),
            FOREIGN KEY (bank_id) REFERENCES cbt_question_banks(id) ON DELETE CASCADE
        );

        -- Table 17: cbt_exams — Scheduled exams
        CREATE TABLE IF NOT EXISTS cbt_exams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            bank_id INTEGER NOT NULL,
            class_name TEXT NOT NULL,
            academic_session TEXT NOT NULL,
            term TEXT NOT NULL,
            question_count INTEGER NOT NULL,
            duration_minutes INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','completed')),
            pass_mark_percentage INTEGER NOT NULL DEFAULT 50,
            shuffle_questions INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (bank_id) REFERENCES cbt_question_banks(id) ON DELETE RESTRICT
        );

        -- Table 18: cbt_tokens — Access tokens for students taking exams
        CREATE TABLE IF NOT EXISTS cbt_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exam_id INTEGER NOT NULL,
            student_id TEXT NOT NULL,
            token TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL DEFAULT 'unused' CHECK(status IN ('unused','active','submitted')),
            score INTEGER DEFAULT NULL,
            started_at TEXT DEFAULT NULL,
            submitted_at TEXT DEFAULT NULL,
            tab_switches INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (exam_id) REFERENCES cbt_exams(id) ON DELETE CASCADE,
            FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
            UNIQUE(exam_id, student_id)
        );

        -- Table 19: cbt_answers — Student answers for auto-grading
        CREATE TABLE IF NOT EXISTS cbt_answers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token_id INTEGER NOT NULL,
            question_id INTEGER NOT NULL,
            selected_option TEXT NOT NULL CHECK(selected_option IN ('A','B','C','D','NONE')),
            is_correct INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (token_id) REFERENCES cbt_tokens(id) ON DELETE CASCADE,
            FOREIGN KEY (question_id) REFERENCES cbt_questions(id) ON DELETE CASCADE,
            UNIQUE(token_id, question_id)
        );
`;

content = content.replace(
    ');\n    `);\n\n    // Seed default school name',
    ');\n' + cbtTables + '\n    `);\n\n    // Seed default school name'
);

fs.writeFileSync(path, content, 'utf8');
console.log("Success");
