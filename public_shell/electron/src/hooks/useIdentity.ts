import { useSyncExternalStore } from 'react';

export interface SchoolIdentity {
  name?: string;
  address?: string;
  motto?: string;
  phone?: string;
  email?: string;
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

interface StoreState {
  identity: SchoolIdentity | null;
  loading: boolean;
  error: string | null;
}

// Global shared state for identity hook instances
let storeState: StoreState = {
  identity: null,
  loading: true,
  error: null,
};

const listeners = new Set<() => void>();

function updateStore(identity: SchoolIdentity | null, loading: boolean, error: string | null) {
  storeState = { identity, loading, error };

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

  listeners.forEach((l) => l());
}

let hasFetchedOnce = false;

const fetchIdentity = async () => {
  try {
    updateStore(storeState.identity, true, null);
    if (window.nexusAPI?.getIdentity) {
      const data = await window.nexusAPI.getIdentity();
      updateStore(data || null, false, null);
    } else {
      updateStore(null, false, null);
    }
  } catch (err: any) {
    updateStore(null, false, err.message || 'Failed to fetch identity');
  }
};

export function useIdentity() {
  const state = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      // Fetch initial identity if never done
      if (!hasFetchedOnce) {
        hasFetchedOnce = true;
        fetchIdentity();
      }
      return () => {
        listeners.delete(onChange);
      };
    },
    () => storeState
  );

  const refreshIdentity = async () => {
    try {
      updateStore(storeState.identity, true, null);
      if (window.nexusAPI?.getIdentity) {
        const data = await window.nexusAPI.getIdentity();
        updateStore(data || null, false, null);
      }
    } catch (err: any) {
      updateStore(null, false, err.message || 'Failed to fetch identity');
    }
  };

  const saveIdentity = async (newIdentity: SchoolIdentity) => {
    try {
      if (window.nexusAPI?.saveIdentity) {
        const res = await window.nexusAPI.saveIdentity(newIdentity);
        if (res && res.ok) {
          updateStore(res.identity, false, null);
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
