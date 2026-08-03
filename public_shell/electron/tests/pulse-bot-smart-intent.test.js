import { describe, it, expect } from 'vitest';
const { database } = require('@nexus/engine');
const {
  detectIntent,
  buildMainMenu,
  sendNewsAnnouncements,
  sendPoliciesAndFaq,
  sendOptionalExtras,
} = require('../pulse-bot.js');

describe('Pulse Bot — Smart Intent & Knowledge Engine', () => {
  it('correctly classifies natural language queries into intents', () => {
    expect(detectIntent('how much is tuition fee for jss1?')).toBe('FEES');
    expect(detectIntent('I want to pay school fees online')).toBe('FEES');
    expect(detectIntent('are there any school announcements or news?')).toBe('NEWS');
    expect(detectIntent('what is the PTA update?')).toBe('NEWS');
    expect(detectIntent('when is resumption date?')).toBe('POLICIES');
    expect(detectIntent('what is the school dress code policy?')).toBe('POLICIES');
    expect(detectIntent('can I see my child result?')).toBe('RESULTS');
    expect(detectIntent('was my child present in class today?')).toBe('ATTENDANCE');
    expect(detectIntent('can I buy school uniform or books?')).toBe('EXTRAS');
    expect(detectIntent('hello menu options')).toBe('MENU');
    expect(detectIntent('random gibberish text 12345')).toBe('UNKNOWN');
  });

  it('buildMainMenu includes optional extras and school news options', () => {
    const menuText = buildMainMenu('Nexus International School');
    expect(menuText).toContain('Nexus International School');
    expect(menuText).toContain('Academic Results');
    expect(menuText).toContain('Attendance Record');
    expect(menuText).toContain('Fee Status');
    expect(menuText).toContain('Optional Extras');
    expect(menuText).toContain('School News & Announcements');
  });

  it('sendNewsAnnouncements queries published portal news and replies cleanly', async () => {
    const mockDb = {
      prepare: (sql) => {
        if (sql.includes('FROM portal_news')) {
          return {
            all: () => [
              { id: 1, title: 'Inter-House Sports Day', category: 'General Notice', body: 'Sports day holds next Friday at 9am.' },
              { id: 2, title: 'PTA Meeting Notice', category: 'PTA', body: 'General PTA meeting scheduled for August 15th.' },
            ]
          };
        }
        return { all: () => [], get: () => null };
      }
    };

    database.getDb = () => mockDb;

    let repliedText = '';
    const mockMsg = { reply: async (t) => { repliedText = t; } };
    const mockSession = { schoolName: 'Nexus School' };

    await sendNewsAnnouncements(mockMsg, mockSession);

    expect(repliedText).toContain('📢 *School News & Announcements*');
    expect(repliedText).toContain('Inter-House Sports Day');
    expect(repliedText).toContain('Sports day holds next Friday');
    expect(repliedText).toContain('PTA Meeting Notice');
  });

  it('sendPoliciesAndFaq queries portal policies and replies cleanly', async () => {
    const mockDb = {
      prepare: (sql) => {
        if (sql.includes('FROM portal_policies')) {
          return {
            all: () => [
              { id: 1, title: 'Dress Code & Uniform Policy', body: 'All students must be in complete uniform by 7:45am.' },
              { id: 2, title: 'Resumption & Calendar', body: 'First Term resumes on September 8th, 2026.' }
            ]
          };
        }
        if (sql.includes('school_term_config')) {
          return {
            get: () => ({ academic_session: '2026/2027', term: 'First Term', resumption_date: '2026-09-08' })
          };
        }
        return { all: () => [], get: () => null };
      }
    };

    database.getDb = () => mockDb;

    let repliedText = '';
    const mockMsg = { reply: async (t) => { repliedText = t; } };
    const mockSession = { schoolName: 'Nexus School', termConfig: { academic_session: '2026/2027', term: 'First Term' } };

    await sendPoliciesAndFaq(mockMsg, mockSession);

    expect(repliedText).toContain('📋 *School Policies & Calendar*');
    expect(repliedText).toContain('Dress Code & Uniform Policy');
    expect(repliedText).toContain('Resumption & Calendar');
  });

  it('sendOptionalExtras lists class extras and current student opt-in state', async () => {
    const mockDb = {
      prepare: (sql) => {
        if (sql.includes('FROM fee_extras')) {
          return {
            all: () => [
              { id: 10, item_name: 'School Uniform Set', amount: 15000, term: 'All Terms', bank_name: 'First Bank' },
              { id: 11, item_name: 'Excursion Ticket', amount: 5000, term: 'First Term', bank_name: null },
            ]
          };
        }
        if (sql.includes('FROM student_extra_selections')) {
          return {
            all: () => [
              { extra_id: 10 }
            ]
          };
        }
        return { all: () => [], get: () => null };
      }
    };

    database.getDb = () => mockDb;

    let repliedText = '';
    const mockMsg = { reply: async (t) => { repliedText = t; } };
    const mockSession = {
      schoolName: 'Nexus School',
      students: [{ id: 'STU001', name: 'Chidi Okeke', class_name: 'JSS 1' }],
      termConfig: { academic_session: '2026/2027', term: 'First Term' }
    };

    await sendOptionalExtras(mockMsg, mockSession, '08012345678');

    expect(repliedText).toContain('🧩 *Optional Extras & Materials*');
    expect(repliedText).toContain('School Uniform Set');
    expect(repliedText).toContain('₦15,000');
    expect(repliedText).toContain('Opted In');
    expect(repliedText).toContain('Excursion Ticket');
  });
});
