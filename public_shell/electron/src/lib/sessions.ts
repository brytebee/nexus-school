/**
 * Dynamically generates progressively incremental academic sessions list (e.g., YYYY/YYYY)
 * starting from a baseline year up to the upcoming years.
 */
export function generateSessionsList(baseYear = 2023): string[] {
  const currentYear = new Date().getFullYear();
  // Dynamically grow the sessions dropdown to include future years (currentYear + 2)
  const maxYear = currentYear + 2;
  const sessions: string[] = [];
  
  for (let year = baseYear; year <= maxYear; year++) {
    sessions.push(`${year}/${year + 1}`);
  }
  return sessions;
}
