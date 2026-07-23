import { useState, useEffect, useCallback } from 'react';
import { generateSessionsList } from '../lib/sessions';

export interface TermConfigState {
  session: string;
  term: string;
  termsList: string[];
  sessionsList: string[];
  periodLabel: string;
  loading: boolean;
  reload: () => Promise<void>;
}

const DEFAULT_TERMS = ['First Term', 'Second Term', 'Third Term'];

export function useTermConfig(): TermConfigState {
  const [session, setSession] = useState<string>('2025/2026');
  const [term, setTerm] = useState<string>('First Term');
  const [termsList, setTermsList] = useState<string[]>(DEFAULT_TERMS);
  const [periodLabel, setPeriodLabel] = useState<string>('term');
  const [loading, setLoading] = useState<boolean>(true);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      const api = (window as any).electronAPI;
      if (!api) return;

      // Fetch primary config from school_term_config
      if (api.getTermConfig) {
        const cfg = await api.getTermConfig();
        if (cfg) {
          if (cfg.academic_session) setSession(cfg.academic_session);
          if (cfg.term) setTerm(cfg.term);
        }
      }

      // Fetch term structure from system_settings
      if (api.cbt?.getSystemSettings) {
        const sys = await api.cbt.getSystemSettings();
        if (sys?.term_structure) {
          try {
            const parsed = typeof sys.term_structure === 'string' 
              ? JSON.parse(sys.term_structure) 
              : sys.term_structure;
            if (Array.isArray(parsed?.terms) && parsed.terms.length > 0) {
              setTermsList(parsed.terms);
            }
            if (parsed?.period_label) {
              setPeriodLabel(parsed.period_label);
            }
          } catch (e) {
            console.error('Error parsing term_structure:', e);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load term config:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const sessionsList = generateSessionsList();

  return {
    session,
    term,
    termsList,
    sessionsList,
    periodLabel,
    loading,
    reload
  };
}
