/**
 * Nexus School OS — Setup Chain Guard
 * Asserts the setup checklist level required for operations.
 */

function assertSetupChain(db, requiredUpTo, identityPacket) {
  let ip = identityPacket;
  if (!ip) {
    try {
      const row = db.prepare("SELECT value FROM app_settings WHERE key = 'school_identity'").get();
      if (row && row.value) {
        ip = JSON.parse(row.value);
      }
    } catch (e) {
      // app_settings might not exist yet or be empty
    }
  }

  const name = ip?.name || "";
  const address = ip?.address || "";
  const motto = ip?.motto || "";
  const phone = ip?.phone || "";
  const email = ip?.email || "";
  const isIdentityConfigured = name && name !== 'Green Valley High' && name !== 'Nexus School' && address && motto && phone && email;
  if (!isIdentityConfigured) {
    return {
      ok: false,
      error: 'SETUP_INCOMPLETE',
      step: 'identity',
      message: 'Please complete your school identity details (Name, Address, Motto, Phone, and Email) in Settings before proceeding.'
    };
  }
  if (requiredUpTo === 'identity') return { ok: true };

  const classesCount = db.prepare("SELECT COUNT(*) as c FROM class_configs").get().c;
  if (classesCount === 0) {
    return {
      ok: false,
      error: 'SETUP_INCOMPLETE',
      step: 'classes',
      message: 'No classes have been configured. Please configure at least one class in Class Manager before proceeding.'
    };
  }
  if (requiredUpTo === 'classes') return { ok: true };

  const teachersCount = db.prepare("SELECT COUNT(*) as c FROM teachers").get().c;
  if (teachersCount === 0) {
    return {
      ok: false,
      error: 'SETUP_INCOMPLETE',
      step: 'teachers',
      message: 'No teachers have been registered. Please add teachers in Teacher Directory before proceeding.'
    };
  }
  if (requiredUpTo === 'teachers') return { ok: true };

  const studentsCount = db.prepare("SELECT COUNT(*) as c FROM students").get().c;
  if (studentsCount === 0) {
    return {
      ok: false,
      error: 'SETUP_INCOMPLETE',
      step: 'students',
      message: 'No students have been registered. Please add students in Student Directory before proceeding.'
    };
  }
  if (requiredUpTo === 'students') return { ok: true };
  
  const termConfig = db.prepare(`
    SELECT academic_session, term, term_start_date, term_end_date, resumption_date
    FROM school_term_config WHERE id = 1
  `).get();

  const isTermConfigured =
    termConfig &&
    termConfig.academic_session &&
    termConfig.term &&
    termConfig.term_start_date &&
    termConfig.term_end_date &&
    termConfig.resumption_date;

  if (!isTermConfigured) {
    const missing = [];
    if (!termConfig?.academic_session || !termConfig?.term) missing.push('Academic Session & Term');
    if (!termConfig?.term_start_date) missing.push('Term Start Date');
    if (!termConfig?.term_end_date)   missing.push('Term End Date');
    if (!termConfig?.resumption_date) missing.push('Next Term Resumption Date');
    return {
      ok: false,
      error: 'SETUP_INCOMPLETE',
      step: 'term',
      message: `The following term details are required before proceeding: ${missing.join(', ')}. Please complete them in Print Hub → Term Settings.`
    };
  }

  return { ok: true };
}

module.exports = { assertSetupChain };
