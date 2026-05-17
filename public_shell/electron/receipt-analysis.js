// ═══════════════════════════════════════════════════════════════════════════════
// Nexus Receipt Analysis Engine
// Analyses bank transfer receipts (images + PDFs) to extract payment data.
// Gold: PDF raw text extraction (pdf-parse, offline, free)
// Diamond: Full AI analysis via Gemini Vision (images + PDFs)
// ═══════════════════════════════════════════════════════════════════════════════
'use strict';

const pdfParse = require('pdf-parse');

// ─── Fuzzy Name Matcher (token-based, no external deps) ──────────────────────
// Handles: reversed order, initials, shortened names, three-part names.
// Returns a score 0.0–1.0.
function fuzzyNameMatch(registeredName, extractedName) {
  if (!registeredName || !extractedName) return 0;
  const normalize = (s) =>
    s.toUpperCase().replace(/[^A-Z\s]/g, '').split(/\s+/).filter(Boolean);
  const regTokens = normalize(registeredName);
  const extTokens = normalize(extractedName);
  if (!regTokens.length || !extTokens.length) return 0;

  let matched = 0;
  for (const et of extTokens) {
    let best = 0;
    for (const rt of regTokens) {
      if (et === rt)                             { best = Math.max(best, 1.0); break; }
      if (et.length === 1 && rt.startsWith(et))  { best = Math.max(best, 0.7); }
      if (rt.length === 1 && et.startsWith(rt))  { best = Math.max(best, 0.7); }
      if (et.length >= 4 && rt.startsWith(et))   { best = Math.max(best, 0.8); }
      if (rt.length >= 4 && et.startsWith(rt))   { best = Math.max(best, 0.8); }
    }
    matched += best;
  }
  return Math.min(1, matched / Math.max(regTokens.length, extTokens.length));
}

// ─── PDF Text Extractor (all tiers with financial module) ─────────────────────
async function extractPdfText(fileDataB64) {
  try {
    const buffer = Buffer.from(fileDataB64, 'base64');
    const result = await pdfParse(buffer);
    return { ok: true, text: (result.text || '').trim() };
  } catch (err) {
    return { ok: false, text: '', error: err.message };
  }
}

// ─── Gemini AI Receipt Analysis (Diamond) ────────────────────────────────────
const RECEIPT_PROMPT = `You are analyzing a Nigerian bank payment receipt or transfer confirmation.
Extract the following fields and return ONLY valid JSON with no markdown formatting, no code blocks, no explanation:
{
  "amount": <number in naira with no commas, or null>,
  "reference": <string or null>,
  "date": <"YYYY-MM-DD" string or null>,
  "payerName": <string - the account holder name of the sender, ALL CAPS as on the receipt, or null>,
  "bank": <string - the receiving/destination bank name, or null>,
  "confidence": <number 0.0-1.0 reflecting your overall certainty>
}
If a field cannot be determined, use null.`;

async function analyzeReceiptAI(fileDataB64, mimeType, geminiApiKey) {
  if (!geminiApiKey) return { ok: false, error: 'No Gemini API key configured in settings.' };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;
  let parts;

  if (mimeType.startsWith('image/')) {
    // Send image inline
    parts = [
      { text: RECEIPT_PROMPT },
      { inlineData: { mimeType, data: fileDataB64 } }
    ];
  } else if (mimeType === 'application/pdf') {
    // Extract text with pdf-parse, then ask Gemini to parse it as text
    const pdfResult = await extractPdfText(fileDataB64);
    const pdfText   = pdfResult.text || '(no text extracted)';
    parts = [{ text: `${RECEIPT_PROMPT}\n\nReceipt text:\n${pdfText}` }];
  } else {
    return { ok: false, error: `Unsupported file type: ${mimeType}` };
  }

  try {
    const response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { maxOutputTokens: 512 }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return { ok: false, error: `Gemini API ${response.status}: ${errText.slice(0, 200)}` };
    }

    const data = await response.json();
    const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    let parsed;
    try {
      // Strip accidental markdown code fences
      const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
      parsed = JSON.parse(clean);
    } catch {
      return { ok: false, error: 'Could not parse Gemini response as JSON', rawResponse: raw };
    }

    return {
      ok:          true,
      amount:      parsed.amount      ?? null,
      reference:   parsed.reference   ?? null,
      date:        parsed.date        ?? null,
      payerName:   parsed.payerName   ?? null,
      bank:        parsed.bank        ?? null,
      confidence:  parsed.confidence  ?? 0.5,
      rawResponse: raw,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { analyzeReceiptAI, extractPdfText, fuzzyNameMatch };
