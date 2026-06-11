/**
 * Shared Phone Number Normalization Utility
 * Formats phone numbers to robust E.164 Nigerian format (23480...)
 */
function normalizePhone(phone) {
  if (!phone) return "";
  let clean = String(phone).replace(/\D/g, "");
  
  // Remove leading 0 from country code prefix if present (e.g. 234080... -> 23480...)
  if (clean.startsWith("2340") && clean.length === 14) {
    clean = "234" + clean.slice(4);
  }
  // Convert local Nigerian format to international (e.g. 080... -> 23480...)
  else if (clean.startsWith("0") && clean.length === 11) {
    clean = "234" + clean.slice(1);
  }
  // Handle 10-digit raw format (e.g. 80... -> 23480...)
  else if (clean.length === 10) {
    clean = "234" + clean;
  }
  
  return clean;
}

module.exports = { normalizePhone };
