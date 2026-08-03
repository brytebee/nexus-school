export interface SystemRole {
  level: number;
  label: string;
  shortLabel: string;
  category: string;
  color: string;
  border: string;
  textColor: string;
}

export const SYSTEM_ROLES: SystemRole[] = [
  { level: 9, label: 'Super Admin', shortLabel: 'Super Admin', category: 'IT / System Admin', color: 'rgba(255,215,0,0.15)', border: 'rgba(255,215,0,0.4)', textColor: '#ffd700' },
  { level: 7, label: 'Principal / Headmaster', shortLabel: 'Principal / Head', category: 'Executive Management', color: 'rgba(0,229,255,0.15)', border: 'rgba(0,229,255,0.4)', textColor: '#00e5ff' },
  { level: 5, label: 'Manager / Bursar', shortLabel: 'Manager / Bursar', category: 'Administrative / Finance', color: 'rgba(199,125,255,0.15)', border: 'rgba(199,125,255,0.4)', textColor: '#c77dff' },
  { level: 3, label: 'Teacher / Exam Officer', shortLabel: 'Teacher / Officer', category: 'Academic Staff', color: 'rgba(96,165,250,0.15)', border: 'rgba(96,165,250,0.4)', textColor: '#60a5fa' },
  { level: 1, label: 'Staff / Clerk', shortLabel: 'Staff', category: 'Operations / Data Entry', color: 'rgba(51,153,0,0.15)', border: 'rgba(51,153,0,0.4)', textColor: '#55ff55' },
];

export function getRoleConfig(level: number): SystemRole {
  return SYSTEM_ROLES.find(r => level >= r.level) || SYSTEM_ROLES[SYSTEM_ROLES.length - 1];
}
