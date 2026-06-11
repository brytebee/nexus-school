import { useState, useEffect } from 'react';

export interface SchoolIdentity {
  name?: string;
  address?: string;
  motto?: string;
  signature?: string;
  principalPhone?: string;
  portalSlug?: string;
  themePrimary?: string;
  themeSecondary?: string;
  stampStyle?: string;
  stampCustomColor?: string;
  logoBase64?: string;
  principalSignBase64?: string;
  tier?: string;
}

// Global shared state for identity hook instances
let globalIdentity: SchoolIdentity | null = null;
let globalLoading = true;
let globalError: string | null = null;
let hasFetchedOnce = false;

const listeners = new Set<(data: { identity: SchoolIdentity | null; loading: boolean; error: string | null }) => void>();

function updateGlobalIdentity(identity: SchoolIdentity | null, loading: boolean, error: string | null) {
  globalIdentity = identity;
  globalLoading = loading;
  globalError = error;

  // Apply CSS theme variables dynamically to the document root immediately
  if (identity) {
    const primary = identity.themePrimary || "#1A237E";
    const secondary = identity.themeSecondary || "#00E5FF";
    document.documentElement.style.setProperty("--primary", primary);
    document.documentElement.style.setProperty("--accent", secondary);
    document.documentElement.style.setProperty("--school-primary", primary);
    document.documentElement.style.setProperty("--school-secondary", secondary);
    
    // --primary-rgb (needed for rgba() shadows in index.css)
    let r = 26, g = 35, b = 126;
    if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(primary)) {
      let c = primary.substring(1).split("");
      if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
      const hex = parseInt("0x" + c.join(""), 16);
      r = (hex >> 16) & 255;
      g = (hex >> 8) & 255;
      b = hex & 255;
    }
    document.documentElement.style.setProperty("--primary-rgb", `${r}, ${g}, ${b}`);
  }

  listeners.forEach((l) => l({ identity, loading, error }));
}

export function useIdentity() {
  const [state, setState] = useState({
    identity: globalIdentity,
    loading: globalLoading,
    error: globalError,
  });

  useEffect(() => {
    const handler = (nextState: typeof state) => {
      setState(nextState);
    };
    listeners.add(handler);

    // Fetch initial identity if never done
    if (!hasFetchedOnce) {
      hasFetchedOnce = true;
      const fetchIdentity = async () => {
        try {
          updateGlobalIdentity(globalIdentity, true, null);
          if (window.nexusAPI?.getIdentity) {
            const data = await window.nexusAPI.getIdentity();
            updateGlobalIdentity(data || null, false, null);
          } else {
            updateGlobalIdentity(null, false, null);
          }
        } catch (err: any) {
          updateGlobalIdentity(null, false, err.message || 'Failed to fetch identity');
        }
      };
      fetchIdentity();
    }

    return () => {
      listeners.delete(handler);
    };
  }, []);

  const refreshIdentity = async () => {
    try {
      updateGlobalIdentity(globalIdentity, true, null);
      if (window.nexusAPI?.getIdentity) {
        const data = await window.nexusAPI.getIdentity();
        updateGlobalIdentity(data || null, false, null);
      }
    } catch (err: any) {
      updateGlobalIdentity(null, false, err.message || 'Failed to fetch identity');
    }
  };

  const saveIdentity = async (newIdentity: SchoolIdentity) => {
    try {
      if (window.nexusAPI?.saveIdentity) {
        const res = await window.nexusAPI.saveIdentity(newIdentity);
        if (res && res.ok) {
          updateGlobalIdentity(res.identity, false, null);
          return { ok: true, identity: res.identity };
        } else {
          return { ok: false, error: res?.error || 'Save failed' };
        }
      }
      return { ok: false, error: 'nexusAPI not available' };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Save error' };
    }
  };

  return {
    identity: state.identity,
    loading: state.loading,
    error: state.error,
    refreshIdentity,
    saveIdentity,
  };
}

