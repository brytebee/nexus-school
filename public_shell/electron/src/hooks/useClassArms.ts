import { useState, useEffect, useCallback } from 'react';

export interface ClassConfig {
  hierarchy_class: string;
  max_subjects: number;
  pass_mark_override: number | null;
  arms: string[];
}

export function useClassArms() {
  const [configs, setConfigs] = useState<ClassConfig[]>([]);
  const [fullList, setFullList] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const api = (window as any).electronAPI;
      if (api?.classes?.getAll) {
        const allConfigs = await api.classes.getAll();
        setConfigs(allConfigs);

        if (api?.classes?.getFullList) {
          const list = await api.classes.getFullList();
          setFullList(list);
        } else {
          // Fallback construction in case getFullList is missing
          const list: string[] = [];
          allConfigs.forEach((c: ClassConfig) => {
            if (c.arms && c.arms.length > 0) {
              c.arms.forEach(a => list.push(`${c.hierarchy_class} ${a}`));
            } else {
              list.push(c.hierarchy_class);
            }
          });
          setFullList(list);
        }
      }
    } catch (err) {
      console.error("Failed to load class configs/arms:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { configs, fullList, loading, refresh };
}
