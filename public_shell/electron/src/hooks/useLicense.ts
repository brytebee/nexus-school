import { useState, useEffect } from 'react';

export interface LicenseStatus {
  tier: 'Silver' | 'Gold' | 'Diamond';
  locked: boolean;
  needs_activation?: boolean;
  in_grace?: boolean;
  server_revoked?: boolean;
  expires_at: number;
  student_count: number;
  message?: string;
  reason?: 'no_license' | 'expired' | 'tampered' | 'hardware_mismatch' | 'clock_rollback';
}

export function useLicense() {
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLicenseStatus = async () => {
    try {
      setLoading(true);
      if (window.nexusAPI?.getLicenseStatus) {
        const data = await window.nexusAPI.getLicenseStatus();
        setLicense(data || null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch license status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLicenseStatus();

    // Set up reactive updates from IPC
    if (window.nexusAPI?.onLicenseStatus) {
      window.nexusAPI.onLicenseStatus((status: LicenseStatus) => {
        setLicense(status);
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
