import { useState, useEffect, useRef } from 'react';

export interface LicenseStatus {
  tier: 'Standalone' | 'Silver' | 'Gold' | 'Diamond' | 'INVALID';
  locked: boolean;
  needs_activation?: boolean;
  in_grace?: boolean;
  server_revoked?: boolean;
  expires_at?: number;
  student_count?: number;
  message?: string;
  reason?: 'no_license' | 'expired' | 'tampered' | 'hardware_mismatch' | 'clock_rollback' | 'invalid_tier' | 'server_revoked';
}

export function useLicense() {
  // Fail-closed: locked until the IPC fetch or push-update explicitly confirms
  // a valid status. This prevents ANY render of the app before we know for
  // certain the license is clean — even if the IPC call races or returns null.
  const [license, setLicense] = useState<LicenseStatus>({
    locked: true,
    tier:   'INVALID',
    reason: 'no_license',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Track whether we've completed at least one fetch so re-fetches and IPC
  // push-updates never flip loading back to true (which would cause the lock
  // screen to unmount and the app to flash through underneath).
  const initialized = useRef(false);

  const fetchLicenseStatus = async () => {
    try {
      if (!initialized.current) setLoading(true);
      if (window.nexusAPI?.getLicenseStatus) {
        const data = await window.nexusAPI.getLicenseStatus();
        if (data) {
          // Atomically update license + release loading in one React batch.
          setLicense(data);
          setLoading(false);
          initialized.current = true;
        }
        // No data → stay loading; onLicenseStatus push-update will resolve it.
      }
      // No API → stay loading; onLicenseStatus push-update will resolve it.
    } catch (err: any) {
      setError(err.message || 'Failed to fetch license status');
      // Hard error: release loading — fail-closed default (locked) stays in
      // place so the app never accidentally shows on an IPC failure.
      setLoading(false);
      initialized.current = true;
    }
  };

  useEffect(() => {
    fetchLicenseStatus();

    // IPC push-updates (did-finish-load, ui-ready, heartbeat revocation).
    // Always authoritative — update license and release loading.
    if (window.nexusAPI?.onLicenseStatus) {
      window.nexusAPI.onLicenseStatus((status: LicenseStatus) => {
        setLicense(status);
        setLoading(false);
        initialized.current = true;
      });
    }
  }, []);



  const importLicenseFile = async () => {
    try {
      if (window.nexusAPI?.license?.importFile) {
        const res = await window.nexusAPI.license.importFile();
        return res;
      }
      return { ok: false, reason: 'license.importFile not available' };
    } catch (err: any) {
      return { ok: false, reason: err.message || 'Import error' };
    }
  };

  const activateOnline = async () => {
    try {
      if (window.nexusAPI?.license?.activateOnline) {
        const res = await window.nexusAPI.license.activateOnline();
        return res;
      }
      return { ok: false, reason: 'license.activateOnline not available' };
    } catch (err: any) {
      return { ok: false, reason: err.message || 'Activation error' };
    }
  };

  return { 
    license, 
    loading, 
    error, 
    refreshLicense: fetchLicenseStatus, 
    importLicenseFile, 
    activateOnline 
  };
}
