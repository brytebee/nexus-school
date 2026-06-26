import React, { useState, useEffect } from 'react';
import { useIdentity, SchoolIdentity } from '../hooks/useIdentity';
import { useLicense } from '../hooks/useLicense';
import { useSudoAuth } from '../context/SudoAuthContext';

interface SettingsProps {
  onResetSuccess?: () => void;
  onTabChange?: (tab: string) => void;
}

const identityTemplateObj = {
  _comment: "School Identity Config Template. Excludes Logo, Signature image and Stamp style.",
  name: "Nexus Academy",
  address: "123 Education Way",
  motto: "Excellence in all things",
  signature: "Principal Name",
  principalPhone: "08012345678",
  portalSlug: "nexusacademy",
  themePrimary: "#1A237E",
  themeSecondary: "#00E5FF"
};

const identityTemplateUri = "data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(identityTemplateObj, null, 2));

export function Settings({ onResetSuccess, onTabChange }: SettingsProps) {
  const { identity, saveIdentity } = useIdentity();
  const { license } = useLicense();
  const { requireSudo } = useSudoAuth();

  const currentTier = license?.tier || 'Silver';

  // Form states
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [motto, setMotto] = useState('');
  const [signature, setSignature] = useState('');
  const [principalPhone, setPrincipalPhone] = useState('');
  const [portalSlug, setPortalSlug] = useState('');
  const [themePrimary, setThemePrimary] = useState('#1A237E');
  const [themeSecondary, setThemeSecondary] = useState('#00E5FF');
  const [stampStyle, setStampStyle] = useState('none');
  const [stampCustomColor, setStampCustomColor] = useState('');
  const [logoBase64, setLogoBase64] = useState<string | undefined>(undefined);
  const [principalSignBase64, setPrincipalSignBase64] = useState<string | undefined>(undefined);
  const [premiumPlan, setPremiumPlan] = useState(false);

  // Admin Profile & Security States
  const [isProfileUnlocked, setIsProfileUnlocked] = useState(false);
  const [profileUsername, setProfileUsername] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileRecoveryEmail, setProfileRecoveryEmail] = useState('');
  const [profileAvatar, setProfileAvatar] = useState<string | undefined>(undefined);
  const [profileTotpEnabled, setProfileTotpEnabled] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');

  // 2FA Setup States
  const [isSettingUp2fa, setIsSettingUp2fa] = useState(false);
  const [totpSecret, setTotpSecret] = useState('');
  const [totpQrUrl, setTotpQrUrl] = useState('');
  const [totpVerifyCode, setTotpVerifyCode] = useState('');
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);


  // Terminal mode states
  const [terminalMode, setTerminalMode] = useState('master');
  const [masterIp, setMasterIp] = useState('');
  const [showMasterIp, setShowMasterIp] = useState(false);

  // SVG stamp previews cache
  const [stampPreviews, setStampPreviews] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [identityUploadStatus, setIdentityUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [isTemplateDrawerOpen, setIsTemplateDrawerOpen] = useState(false);

  // Load identity values when they arrive
  useEffect(() => {
    if (identity) {
      setName(identity.name || '');
      setAddress(identity.address || '');
      setMotto(identity.motto || '');
      setSignature(identity.signature || '');
      setPrincipalPhone(identity.principalPhone || '');
      setPortalSlug(identity.portalSlug || '');
      ThemeColorLoad(identity.themePrimary, identity.themeSecondary);
      setStampStyle(identity.stampStyle || 'none');
      setStampCustomColor(identity.stampCustomColor || '');
      setLogoBase64(identity.logoBase64);
      setPrincipalSignBase64(identity.principalSignBase64);
      setPremiumPlan(!!(identity as any).premiumPlan);
    }
  }, [identity]);

  // On mount: check if this launch was triggered by a user-initiated restore
  useEffect(() => {
    const checkRestore = async () => {
      try {
        const restored = await (window as any).electronAPI?.wasRestored?.();
        if (restored) {
          const Swal = (window as any).Swal;
          if (Swal) {
            Swal.fire({
              title: '✅ Backup Restored',
              text: 'Your database has been successfully restored from the selected backup file.',
              icon: 'success',
              timer: 4000,
              timerProgressBar: true,
              showConfirmButton: false,
              background: '#0d1235',
              color: '#fff',
            });
          }
        }
      } catch (_) {}
    };
    checkRestore();
  }, []);

  const ThemeColorLoad = (prim?: string, sec?: string) => {
    if (prim) setThemePrimary(prim);
    if (sec) setThemeSecondary(sec);
  };

  // Fetch SVG stamp previews dynamically when style, colors or tier change
  useEffect(() => {
    const fetchPreviews = async () => {
      if (!window.electronAPI?.getStampPreview) return;

      const styles = ['classic_round', 'modern_rect', 'ribbon_endorse', 'minimal_sig'];
      const color = stampCustomColor || (currentTier === 'Silver' ? '#0D47A1' : themePrimary);
      
      const newPreviews: Record<string, string> = {};
      for (const style of styles) {
        try {
          const preview = await window.electronAPI.getStampPreview({ style, color });
          if (preview) {
            newPreviews[style] = preview;
          }
        } catch (err) {
          console.error(`Failed to fetch stamp preview for ${style}:`, err);
        }
      }
      setStampPreviews(newPreviews);
    };

    fetchPreviews();
  }, [currentTier, themePrimary, stampCustomColor]);

  // File read helper
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'sig') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === 'logo' && file.type !== 'image/png' && file.type !== 'image/jpeg') {
      alert('PNG or JPEG only for School Crest.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (type === 'logo') {
        setLogoBase64(base64);
      } else {
        setPrincipalSignBase64(base64);
      }
    };
    reader.readAsDataURL(file);
  };

  // Drag and drop crest logo
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropLogo = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
      alert('PNG or JPEG only for School Crest.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setLogoBase64(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Load Admin Profile Details
  const loadAdminProfile = async () => {
    try {
      const res = await (window as any).electronAPI.auth.getAdminProfile();
      if (res && res.ok && res.profile) {
        setProfileUsername(res.profile.username || '');
        setProfilePhone(res.profile.phone || '');
        setProfileRecoveryEmail(res.profile.recovery_email || '');
        setProfileTotpEnabled(!!res.profile.totp_enabled);
        setProfileAvatar(res.profile.avatar || undefined);
      }
    } catch (err) {
      console.error('Failed to load admin profile:', err);
    }
  };

  // Load admin profile on mount (to render avatar in header if set)
  useEffect(() => {
    loadAdminProfile();
  }, []);


  const handleUnlockProfile = () => {
    requireSudo(
      () => {
        setIsProfileUnlocked(true);
        loadAdminProfile();
      },
      'Unlock Admin Profile',
      'Enter your admin PIN to view and modify your profile and security settings.',
      false // non-destructive
    );
  };

  const handleSaveProfile = async () => {
    if (!profileUsername.trim()) {
      const Swal = (window as any).Swal;
      if (Swal) {
        Swal.fire({
          title: 'Validation Error',
          text: 'Username is required.',
          icon: 'error',
          background: '#0d1235',
          color: '#fff'
        });
      } else {
        alert('Username is required.');
      }
      return;
    }

    if (!verificationCode.trim()) {
      const Swal = (window as any).Swal;
      if (Swal) {
        Swal.fire({
          title: 'Verification Required',
          text: 'Please enter your Admin PIN or TOTP 2FA code to save profile changes.',
          icon: 'warning',
          background: '#0d1235',
          color: '#fff'
        });
      } else {
        alert('Please enter your verification code.');
      }
      return;
    }

    try {
      const payload: any = {
        username: profileUsername,
        phone: profilePhone || null,
        recovery_email: profileRecoveryEmail,
        avatar: profileAvatar || null
      };

      const cleanCode = verificationCode.trim();
      if (cleanCode.length === 6) {
        payload.totpCode = cleanCode;
      } else {
        payload.pin = cleanCode;
      }

      const res = await (window as any).electronAPI.auth.updateAdminProfile(payload);
      const Swal = (window as any).Swal;
      if (res && res.ok) {
        if (Swal) {
          Swal.fire({
            title: 'Profile Updated',
            text: 'Your administrator profile has been updated successfully.',
            icon: 'success',
            background: '#0d1235',
            color: '#fff',
            timer: 2000,
            showConfirmButton: false
          });
        } else {
          alert('Profile updated successfully.');
        }
        setVerificationCode('');
        loadAdminProfile();
      } else {
        if (Swal) {
          Swal.fire({
            title: 'Update Failed',
            text: res?.error || 'Incorrect authorization code.',
            icon: 'error',
            background: '#0d1235',
            color: '#fff'
          });
        } else {
          alert(res?.error || 'Update failed.');
        }
      }
    } catch (err: any) {
      console.error('Failed to update admin profile:', err);
      const Swal = (window as any).Swal;
      if (Swal) {
        Swal.fire({
          title: 'System Error',
          text: err.message || 'An unexpected error occurred.',
          icon: 'error',
          background: '#0d1235',
          color: '#fff'
        });
      } else {
        alert(err.message || 'System error.');
      }
    }
  };

  const handleStart2faSetup = async () => {
    try {
      const res = await (window as any).electronAPI.auth.setupTotp();
      if (res && res.ok) {
        setTotpSecret(res.secret);
        setTotpQrUrl(res.qrCodeUrl);
        setTotpVerifyCode('');
        setIsSettingUp2fa(true);
      } else {
        const Swal = (window as any).Swal;
        if (Swal) {
          Swal.fire({
            title: 'Setup Failed',
            text: res?.error || 'Could not initialize 2FA setup.',
            icon: 'error',
            background: '#0d1235',
            color: '#fff'
          });
        } else {
          alert(res?.error || 'Failed to start 2FA setup.');
        }
      }
    } catch (err: any) {
      console.error('Failed to setup TOTP:', err);
    }
  };

  const handleVerify2fa = async () => {
    if (!totpVerifyCode || totpVerifyCode.length !== 6) {
      const Swal = (window as any).Swal;
      if (Swal) {
        Swal.fire({
          title: 'Invalid Code',
          text: 'Please enter a 6-digit verification code.',
          icon: 'warning',
          background: '#0d1235',
          color: '#fff'
        });
      } else {
        alert('Please enter a 6-digit code.');
      }
      return;
    }

    try {
      const res = await (window as any).electronAPI.auth.verifyTotp({ code: totpVerifyCode });
      const Swal = (window as any).Swal;
      if (res && res.ok) {
        if (Swal) {
          Swal.fire({
            title: '2FA Enabled',
            text: 'Two-Factor Authentication is now active on your account.',
            icon: 'success',
            background: '#0d1235',
            color: '#fff'
          });
        } else {
          alert('2FA enabled successfully.');
        }
        setIsSettingUp2fa(false);
        setProfileTotpEnabled(true);
        loadAdminProfile();
      } else {
        if (Swal) {
          Swal.fire({
            title: 'Verification Failed',
            text: res?.error || 'Invalid 6-digit code. Please try again.',
            icon: 'error',
            background: '#0d1235',
            color: '#fff'
          });
        } else {
          alert(res?.error || 'Verification failed.');
        }
      }
    } catch (err: any) {
      console.error('Failed to verify TOTP:', err);
    }
  };

  const handleDisable2fa = async () => {
    const Swal = (window as any).Swal;
    if (!verificationCode.trim()) {
      if (Swal) {
        Swal.fire({
          title: 'Verification Required',
          text: 'Please enter your Admin PIN or TOTP 2FA code to disable Two-Factor Authentication.',
          icon: 'warning',
          background: '#0d1235',
          color: '#fff'
        });
      } else {
        alert('Please enter your verification code.');
      }
      return;
    }

    if (Swal) {
      const confirm = await Swal.fire({
        title: 'Disable 2FA?',
        text: 'Are you sure you want to disable Two-Factor Authentication? Your account will be less secure.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Yes, disable it',
        cancelButtonText: 'Cancel',
        background: '#0d1235',
        color: '#fff',
        confirmButtonColor: '#ff4444'
      });
      if (!confirm.isConfirmed) return;
    }

    try {
      const cleanCode = verificationCode.trim();
      const payload: any = {};
      if (cleanCode.length === 6) {
        payload.totpCode = cleanCode;
      } else {
        payload.pin = cleanCode;
      }

      const res = await (window as any).electronAPI.auth.disableTotp(payload);
      if (res && res.ok) {
        if (Swal) {
          Swal.fire({
            title: '2FA Disabled',
            text: 'Two-Factor Authentication has been disabled.',
            icon: 'success',
            background: '#0d1235',
            color: '#fff'
          });
        } else {
          alert('2FA disabled successfully.');
        }
        setProfileTotpEnabled(false);
        setVerificationCode('');
        loadAdminProfile();
      } else {
        if (Swal) {
          Swal.fire({
            title: 'Action Failed',
            text: res?.error || 'Verification failed. Incorrect PIN or TOTP code.',
            icon: 'error',
            background: '#0d1235',
            color: '#fff'
          });
        } else {
          alert(res?.error || 'Action failed.');
        }
      }
    } catch (err: any) {
      console.error('Failed to disable TOTP:', err);
    }
  };

  // Submit form
  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      const payload: SchoolIdentity = {
        name,
        address,
        motto,
        signature,
        principalPhone,
        portalSlug: portalSlug.toLowerCase().replace(/[^a-z0-9]/g, '') || undefined,
        themePrimary,
        themeSecondary,
        stampStyle,
        stampCustomColor: stampCustomColor || undefined,
        logoBase64: logoBase64 || undefined,
        principalSignBase64: principalSignBase64 || undefined,
      };
      (payload as any).premiumPlan = premiumPlan;

      const res = await saveIdentity(payload);
      if (res && res.ok) {
        setSaveStatus('success');
      } else {
        setSaveStatus('error');
      }
    } catch (err) {
      console.error('Save settings failed:', err);
      setSaveStatus('error');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  // Reset application
  const handleResetData = async () => {
    if (!window.electronAPI?.resetAppData) {
      alert('Reset function not supported in this terminal.');
      return;
    }

    const Swal = (window as any).Swal;

    // 1. Request global admin PIN authorization using useSudoAuth
    await requireSudo(
      async () => {
        if (!Swal) {
          // Fallback if Swal is not loaded
          if (window.confirm("Reset all data now? This will delete everything.")) {
            await window.electronAPI.resetAppData();
            alert('System Reset Completed. Reloading...');
            window.location.reload();
          }
          return;
        }

        // 2. PIN provided successfully. Now present backup / delete options.
        const result = await Swal.fire({
          title: 'Database Reset Protection',
          html: `
            <p style="color:#ccc;font-size:13px;line-height:1.7;margin:0">
              Would you like to save a local backup of your database before wiping all data?<br/><br/>
              <strong style="color:#00e5ff">Local backup</strong> saves an unencrypted <code>.sqlite</code> copy
              to your computer's Nexus data folder.<br/>
              <span style="color:#888;font-size:11px">For encrypted cloud backup, configure Google Drive in Nexus Pulse.</span>
            </p>`,
          icon: 'warning',
          showCancelButton: true,
          showDenyButton: true,
          confirmButtonText: '💾 Save Local Backup',
          denyButtonText: '🗑 Delete Now',
          cancelButtonText: 'Cancel',
          confirmButtonColor: '#00e5ff',
          denyButtonColor: '#ef4444',
          cancelButtonColor: '#1e293b',
          background: '#0d1235',
          color: '#fff',
        });

        if (result.isConfirmed) {
          // Run backup
          try {
            const backupRes = await (window as any).electronAPI.backupDatabase();
            if (backupRes?.ok) {
              await Swal.fire({
                title: 'Backup Successful',
                text: `Database backup saved successfully at:\n${backupRes.path}`,
                icon: 'success',
                background: '#0d1235',
                color: '#fff',
              });
              
              // Proceed with reset
              const resetRes = await window.electronAPI.resetAppData();
              if ((resetRes as any)?.ok === false) {
                await Swal.fire({
                  title: 'Reset Failed',
                  text: `Could not clear database: ${(resetRes as any).error}`,
                  icon: 'error', background: '#0d1235', color: '#fff',
                });
                return;
              }
              if (onResetSuccess) {
                onResetSuccess();
              } else {
                window.location.reload();
              }
            } else {
              // Backup failed or unconfigured
              const backupPrompt = await Swal.fire({
                title: 'Backup Failed',
                text: 'Could not write a local backup file. Would you like to delete all data anyway, or cancel?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'Wipe Data Anyway',
                cancelButtonText: 'Cancel — Keep Data',
                confirmButtonColor: '#ef4444',
                cancelButtonColor: '#1e293b',
                background: '#0d1235',
                color: '#fff',
              });

              if (backupPrompt.isConfirmed) {
                // Wipe anyway
                const resetRes2 = await window.electronAPI.resetAppData();
                if ((resetRes2 as any)?.ok === false) {
                  await Swal.fire({
                    title: 'Reset Failed',
                    text: `Could not clear database: ${(resetRes2 as any).error}`,
                    icon: 'error', background: '#0d1235', color: '#fff',
                  });
                  return;
                }
                if (onResetSuccess) {
                  onResetSuccess();
                } else {
                  window.location.reload();
                }
              }
              // If cancelled, do nothing — data is safe
            }
          } catch (backupErr: any) {
            Swal.fire({
              title: 'Backup Error',
              text: `Backup failed: ${backupErr.message}. Clear anyway?`,
              icon: 'error',
              showCancelButton: true,
              confirmButtonText: 'Yes, Clear Anyway',
              cancelButtonText: 'Cancel',
              background: '#0d1235',
              color: '#fff',
            }).then(async (innerRes) => {
            if (innerRes.isConfirmed) {
                const resetRes3 = await window.electronAPI.resetAppData();
                if ((resetRes3 as any)?.ok === false) {
                  Swal.fire({
                    title: 'Reset Failed',
                    text: `Could not clear database: ${(resetRes3 as any).error}`,
                    icon: 'error', background: '#0d1235', color: '#fff',
                  });
                  return;
                }
                if (onResetSuccess) {
                  onResetSuccess();
                } else {
                  window.location.reload();
                }
              }
            });
          }
        } else if (result.isDenied) {
          // Delete Now
          try {
            const resetRes4 = await window.electronAPI.resetAppData();
            if ((resetRes4 as any)?.ok === false) {
              Swal.fire({
                title: 'Reset Failed',
                text: `Could not clear database: ${(resetRes4 as any).error}`,
                icon: 'error', background: '#0d1235', color: '#fff',
              });
              return;
            }
            if (onResetSuccess) {
              onResetSuccess();
            } else {
              window.location.reload();
            }
          } catch (resetErr: any) {
            Swal.fire({
              title: 'Error',
              text: `Failed to reset application data: ${resetErr.message}`,
              icon: 'error',
              background: '#0d1235',
              color: '#fff',
            });
          }
        }
      },
      'Authorize Destruction',
      'Enter administrator PIN to confirm database reset.',
      true
    );
  };

  const handleIdentityJSONUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const data = JSON.parse(text);
        
        if (data.name !== undefined) setName(String(data.name));
        if (data.address !== undefined) setAddress(String(data.address));
        if (data.motto !== undefined) setMotto(String(data.motto));
        if (data.signature !== undefined) setSignature(String(data.signature));
        if (data.principalPhone !== undefined) setPrincipalPhone(String(data.principalPhone));
        if (data.portalSlug !== undefined) setPortalSlug(String(data.portalSlug));
        if (data.themePrimary !== undefined) setThemePrimary(String(data.themePrimary));
        if (data.themeSecondary !== undefined) setThemeSecondary(String(data.themeSecondary));
        
        setIdentityUploadStatus('success');
        setTimeout(() => setIdentityUploadStatus('idle'), 4000);
      } catch (err) {
        console.error(err);
        setIdentityUploadStatus('error');
        setTimeout(() => setIdentityUploadStatus('idle'), 4000);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Apply terminal mode helper
  const handleApplyTerminalMode = () => {
    alert('Terminal architecture mode applied. Please restart the application.');
  };

  // Restore Database Backup helper
  const handleRestoreDatabase = async () => {
    const Swal = (window as any).Swal;
    if (!Swal) {
      if (!confirm('This will completely replace the current database with the selected backup. All existing changes will be lost, and the application will restart. Continue?')) {
        return;
      }
      try {
        const res = await (window as any).electronAPI.restoreDatabase();
        if (!res.ok && res.reason !== 'cancelled') {
          alert('Failed to restore database: ' + (res.error || res.reason));
        }
      } catch (err: any) {
        alert('An unexpected error occurred: ' + err.message);
      }
      return;
    }

    const result = await Swal.fire({
      title: 'Restore Database Backup?',
      text: 'This will completely replace the current database with the selected backup. All existing changes will be lost, and the application will restart.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, Restore Backup',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#1e293b',
      background: '#0d1235',
      color: '#fff',
    });

    if (!result.isConfirmed) return;

    try {
      const res = await (window as any).electronAPI.restoreDatabase();
      if (!res.ok) {
        if (res.reason === 'cancelled') return;
        await Swal.fire({
          title: 'Restore Failed',
          text: `Failed to restore database: ${res.error || res.reason}`,
          icon: 'error',
          background: '#0d1235',
          color: '#fff',
        });
      }
    } catch (err: any) {
      await Swal.fire({
        title: 'Error',
        text: `An unexpected error occurred: ${err.message}`,
        icon: 'error',
        background: '#0d1235',
        color: '#fff',
      });
    }
  };

  // Stamp Styles config
  const stampStylesList = [
    { id: 'none', label: 'No Stamp', icon: '🚫' },
    { id: 'classic_round', label: 'Classic Seal' },
    { id: 'modern_rect', label: 'Modern Rect' },
    { id: 'ribbon_endorse', label: 'Legal Ribbon' },
    { id: 'minimal_sig', label: 'Signature' },
  ];

  // Stamp custom colors config
  const canCustomizeColor = currentTier === 'Gold' || currentTier === 'Diamond';
  const stampColorSwatches = [
    { id: 'red', color: '#D32F2F' },
    { id: 'primary', color: themePrimary },
    { id: 'blue', color: '#0D47A1' },
  ];

  const isPremiumTier = currentTier === 'Gold' || currentTier === 'Diamond';

  return (
    <div className="animate-in fade-in duration-300 h-full flex flex-col min-h-0">
      {/* View Header */}
      <div className="view-header">
        <div>
          <h2 className="view-title">School Identity Forge</h2>
          <p className="view-sub">
            Customize your school's branding and report card metadata.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => setIsAdminModalOpen(true)}
            id="admin-profile-btn"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '50%',
              width: '34px',
              height: '34px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              overflow: 'hidden',
              padding: 0,
              marginRight: '4px',
              transition: 'all 0.2s',
              boxShadow: '0 0 10px rgba(0,0,0,0.2)'
            }}
            title="Admin Profile & Security"
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(0,229,255,0.4)';
              e.currentTarget.style.boxShadow = '0 0 12px rgba(0,229,255,0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
              e.currentTarget.style.boxShadow = '0 0 10px rgba(0,0,0,0.2)';
            }}
          >
            {profileAvatar ? (
              <img src={profileAvatar} alt="Admin" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: '16px', color: '#fff' }}>👤</span>
            )}
          </button>
          <button
            id="data-templates-btn"
            onClick={() => setIsTemplateDrawerOpen(true)}
            style={{
              background: 'rgba(0,229,255,0.1)',
              border: '1px solid rgba(0,229,255,0.3)',
              color: '#00e5ff',
              padding: '8px 14px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            📋 Data Templates
          </button>
          <button
            onClick={handleResetData}
            id="reset-btn"
            style={{
              background: 'transparent',
              border: '1px solid #ff4444',
              color: '#ff4444',
              padding: '8px 16px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            🗑 Reset All Data
          </button>
        </div>
      </div>

      <div className="settings-content">
        {/* Column 1: Visual Identity & Stamp Studio */}
        <div className="settings-column">
          <h3>Visual Identity</h3>
          
          <div className="form-group">
            <label>School Crest (Logo)</label>
            <div 
              className="logo-uploader" 
              id="logo-dropzone"
              onClick={() => document.getElementById('logo-upload-input')?.click()}
              onDragOver={handleDragOver}
              onDrop={handleDropLogo}
            >
              {logoBase64 ? (
                <img
                  id="logo-preview"
                  src={logoBase64}
                  alt="Logo Preview"
                />
              ) : (
                <div className="uploader-content" id="uploader-content">
                  <span className="upload-icon">﹢</span>
                  <p>Drag &amp; Drop PNG/JPEG</p>
                  <span className="upload-hint">or click to browse</span>
                </div>
              )}
              <input
                type="file"
                id="logo-upload-input"
                accept="image/png, image/jpeg"
                style={{ display: 'none' }}
                onChange={(e) => handleFileChange(e, 'logo')}
              />
            </div>
          </div>

          <div className="color-pickers-group">
            <div className="form-group">
              <label>Primary Theme</label>
              <div className="color-picker-wrapper">
                <input 
                  type="color" 
                  id="theme-primary" 
                  value={themePrimary} 
                  onChange={(e) => setThemePrimary(e.target.value)}
                />
                <span className="color-hex" id="primary-hex">{themePrimary.toUpperCase()}</span>
              </div>
            </div>
            <div className="form-group">
              <label>Accent Color</label>
              <div className="color-picker-wrapper">
                <input 
                  type="color" 
                  id="theme-secondary" 
                  value={themeSecondary} 
                  onChange={(e) => setThemeSecondary(e.target.value)}
                />
                <span className="color-hex" id="secondary-hex">{themeSecondary.toUpperCase()}</span>
              </div>
            </div>
          </div>

          {/* Stamp Studio */}
          <div className="form-group" style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span>Stamp Studio <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 'normal', marginLeft: '6px' }}>(Auto-generates SVG seals)</span></span>
              <span 
                id="stamp-tier-badge" 
                style={{
                  fontSize: '10px', 
                  background: isPremiumTier ? '#ffd700' : 'rgba(255,255,255,0.1)', 
                  color: isPremiumTier ? '#000' : '#00E5FF',
                  padding: '2px 8px', 
                  borderRadius: '10px', 
                  fontWeight: 'bold'
                }}
              >
                {currentTier}
              </span>
            </label>

            <div style={{ marginBottom: '12px' }}>
              <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>1. Select Style</p>
              <div className="stamp-gallery" id="stamp-gallery">
                {stampStylesList.map((style) => {
                  const isActive = stampStyle === style.id;
                  const previewImg = stampPreviews[style.id];
                  
                  return (
                    <div
                      key={style.id}
                      onClick={() => setStampStyle(style.id)}
                      className={`stamp-option ${isActive ? 'active' : ''}`}
                    >
                      {style.id === 'none' ? (
                        <div style={{ height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px' }}>🚫</div>
                      ) : previewImg ? (
                        <img
                          src={previewImg}
                          alt={style.label}
                          className="stamp-template-preview"
                        />
                      ) : (
                        <div style={{ height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', opacity: 0.4 }}>🖋</div>
                      )}
                      <span className="stamp-option-label">{style.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div id="stamp-color-section" style={{ display: canCustomizeColor ? 'block' : 'none' }}>
              <p style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '1px' }}>2. Select Ink Color</p>
              <div id="stamp-color-swatches" className={`color-swatch-list ${!canCustomizeColor ? 'tier-locked' : ''}`}>
                {stampColorSwatches.map((swatch) => {
                  const isActive = stampCustomColor === swatch.color || (!stampCustomColor && swatch.id === 'primary');
                  return (
                    <div
                      key={swatch.id}
                      onClick={() => {
                        if (canCustomizeColor) {
                          setStampCustomColor(swatch.color);
                        }
                      }}
                      className={`color-swatch ${isActive ? 'active' : ''}`}
                      style={{ backgroundColor: swatch.color }}
                      title={swatch.id}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Column 2: School Metadata */}
        <div className="settings-column">
          <h3>School Metadata</h3>
          
          <div className="form-group">
            <label>School Name</label>
            <input
              type="text"
              id="school-name-input"
              className="modern-input"
              placeholder="e.g. Nexus Academy"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>School Address</label>
            <input
              type="text"
              id="school-address-input"
              className="modern-input"
              placeholder="e.g. 123 Education Way"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Motto</label>
            <input
              type="text"
              id="school-motto-input"
              className="modern-input"
              placeholder="e.g. Excellence in all things"
              value={motto}
              onChange={(e) => setMotto(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Principal's Name (Digital Signature)</label>
            <input
              type="text"
              id="school-signature-input"
              className="modern-input"
              placeholder="Full Name"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>
              Principal's Signature Image{' '}
              <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                (PNG with transparent bg recommended)
              </span>
            </label>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <label
                htmlFor="principal-sign-upload"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(255,215,0,0.08)',
                  border: '1px dashed rgba(255,215,0,0.35)',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: '#ffd700',
                  transition: 'all 0.2s',
                }}
              >
                📁 Upload Signature (.png)
              </label>
              <input
                type="file"
                id="principal-sign-upload"
                style={{ display: 'none' }}
                accept="image/*"
                onChange={(e) => handleFileChange(e, 'sig')}
              />
              {principalSignBase64 && (
                <div
                  id="principal-sign-preview-wrap"
                  style={{
                    display: 'flex',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,215,0,0.2)',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  <img
                    id="principal-sign-preview-img"
                    style={{ height: '40px', filter: 'brightness(0.9) contrast(1.1)' }}
                    src={principalSignBase64}
                    alt="Principal Signature"
                  />
                  <button
                    onClick={() => setPrincipalSignBase64(undefined)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ff6b6b',
                      fontSize: '11px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    ✕ Remove
                  </button>
                </div>
              )}
            </div>
          </div>

          <div
            className="form-group"
            style={{
              background: 'rgba(255,215,0,0.05)',
              padding: '12px',
              borderRadius: '8px',
              border: '1px dashed rgba(255,215,0,0.3)',
            }}
          >
            <label style={{ color: '#ffd700' }}>⭐ Nexus Premium Plan</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
              <input
                type="checkbox"
                id="premium-plan-toggle"
                style={{ width: '16px', height: '16px', accentColor: '#ffd700' }}
                checked={premiumPlan}
                onChange={(e) => setPremiumPlan(e.target.checked)}
              />
              <span style={{ fontSize: '12px', color: '#ccc' }}>
                Enable 'Digital Envelope' HTML Exports for WhatsApp
              </span>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="primary-btn"
            style={{
              marginTop: 'auto',
              background: 'var(--accent)',
              color: 'var(--bg-deep)',
              border: 'none',
              padding: '12px 22px',
              borderRadius: '8px',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '14px',
              justifyContent: 'center',
              display: 'flex',
              alignItems: 'center',
              boxShadow: '0 4px 14px rgba(0,229,255,0.25)',
            }}
          >
            {saving ? '⌛ Saving...' : saveStatus === 'success' ? '✅ Saved!' : saveStatus === 'error' ? '❌ Error' : 'Save Identity Shard'}
          </button>
        </div>
      </div>

      {/* ── Data Templates Slide-in Drawer (position:fixed, same pattern as FinancialHub) ── */}
      {isTemplateDrawerOpen && (
        <>
          {/* Dim overlay */}
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 99 }}
            onClick={() => setIsTemplateDrawerOpen(false)}
          />
          {/* Drawer panel */}
          <div
            id="templates-drawer-panel"
            style={{
              position: 'fixed', right: 0, top: 0, bottom: 0, width: '400px',
              background: '#0d1235',
              borderLeft: '1px solid var(--glass-border)',
              zIndex: 100,
              display: 'flex', flexDirection: 'column',
              boxShadow: '-10px 0 40px rgba(0,0,0,0.7)',
            }}
          >
          {/* Drawer Header */}
            <div style={{ padding: '20px', borderBottom: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px' }}>📋 Data Templates</h3>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--text-dim)' }}>Download templates to bulk import your school data correctly.</p>
              </div>
              <button
                id="close-templates-drawer-btn"
                onClick={() => setIsTemplateDrawerOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', fontSize: '24px', cursor: 'pointer', lineHeight: 1 }}
              >
                ×
              </button>
            </div>

            {/* Scrollable body */}
            <div style={{ padding: '20px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>

        {/* Identity JSON */}
        <div
          className="form-group"
          style={{
            background: 'rgba(0, 229, 255, 0.05)',
            padding: '16px',
            borderRadius: '8px',
            border: '1px dashed rgba(0, 229, 255, 0.3)',
            marginBottom: '12px',
          }}
        >
          <label style={{ color: '#00e5ff', fontSize: '13px', marginBottom: '8px', display: 'block' }}>
            ℹ️ School Identity Template
          </label>
          <p style={{ fontSize: '11px', color: '#aaa', marginBottom: '10px' }}>
            Import branding metadata (Name, Motto, Phone, Theme Colors, etc.) via JSON. Excludes binary Logo/Signature images and Stamp style.
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <a
              href={identityTemplateUri}
              download="Nexus_Identity_Template.json"
              className="secondary-btn"
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: '11px',
                padding: '8px',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              📥 Download JSON
            </a>
            <button
              onClick={() => document.getElementById('identity-json-upload-input')?.click()}
              className="secondary-btn"
              style={{
                flex: 1,
                fontSize: '11px',
                padding: '8px',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
              }}
            >
              📤 Upload JSON
            </button>
          </div>
          <input
            type="file"
            id="identity-json-upload-input"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleIdentityJSONUpload}
          />
          {identityUploadStatus === 'success' && (
            <p style={{ color: '#4caf50', fontSize: '11px', marginTop: '6px', textAlign: 'center' }}>
              ✅ Identity config loaded! Save to persist.
            </p>
          )}
          {identityUploadStatus === 'error' && (
            <p style={{ color: '#ff4444', fontSize: '11px', marginTop: '6px', textAlign: 'center' }}>
              ❌ Error parsing JSON file.
            </p>
          )}
        </div>

        {/* Teachers Template */}
        <div
          className="form-group"
          style={{
            background: 'rgba(0, 229, 255, 0.05)',
            padding: '16px',
            borderRadius: '8px',
            border: '1px dashed rgba(0, 229, 255, 0.3)',
            marginBottom: '12px',
          }}
        >
          <label style={{ color: '#00e5ff', fontSize: '13px', marginBottom: '8px', display: 'block' }}>
            🧑‍🏫 Teachers Template
          </label>
          <p style={{ fontSize: '11px', color: '#aaa', marginBottom: '10px' }}>
            Columns: <code>Teacher_ID, Teacher_Name, Teacher_Phone, Class, Subjects, Class_Host</code> — classes and subjects pipe-delimited, Class_Host is TRUE/FALSE or an explicit class arm.
          </p>
          <a
            href="data:text/csv;charset=utf-8,Teacher_ID,Teacher_Name,Teacher_Phone,Class,Subjects,Class_Host%0ATCH-01,John%20Doe,08012345678,JSS%201%20Gold|JSS%201%20Silver,Mathematics|English%20Language,JSS%201%20Gold"
            download="Nexus_Teachers_Template.csv"
            className="secondary-btn"
            style={{
              display: 'block',
              textAlign: 'center',
              width: '100%',
              fontSize: '12px',
              padding: '8px',
              textDecoration: 'none',
            }}
          >
            📥 Download Teachers.csv
          </a>
        </div>

        {/* Students Template */}
        <div
          className="form-group"
          style={{
            background: 'rgba(0, 229, 255, 0.05)',
            padding: '16px',
            borderRadius: '8px',
            border: '1px dashed rgba(0, 229, 255, 0.3)',
            marginBottom: '12px',
          }}
        >
          <label style={{ color: '#00e5ff', fontSize: '13px', marginBottom: '8px', display: 'block' }}>
            🎓 Students Template
          </label>
          <p style={{ fontSize: '11px', color: '#aaa', marginBottom: '10px' }}>
            Columns: <code>Student_ID, First_Name, Last_Name, Class, Subjects, Parent_Name, Parent_Email, Parent_Phone, Gender, DOB, Registration_Number</code> (Optional).
          </p>
          <a
            href="data:text/csv;charset=utf-8,Student_ID,First_Name,Last_Name,Class,Subjects,Parent_Name,Parent_Email,Parent_Phone,Gender,DOB,Registration_Number%0ASTU-001,Jane,Smith,JSS%201,English%20Language|Mathematics|Basic%20Science,John%20Smith,john@example.com,08098765432,Female,2015-05-15,REG-100293"
            download="Nexus_Students_Template.csv"
            className="secondary-btn"
            style={{
              display: 'block',
              textAlign: 'center',
              width: '100%',
              fontSize: '12px',
              padding: '8px',
              textDecoration: 'none',
            }}
          >
            📥 Download Students.csv
          </a>
        </div>

        {/* Terminal Architecture */}
        <div
          className="form-group"
          style={{
            background: 'rgba(255, 215, 0, 0.05)',
            padding: '16px',
            borderRadius: '8px',
            border: '1px dashed rgba(255, 215, 0, 0.3)',
            marginTop: '8px',
          }}
        >
          <label style={{ color: '#ffd700', fontSize: '13px', marginBottom: '8px', display: 'block' }}>
            🖥️ Terminal Architecture
          </label>
          <p style={{ fontSize: '11px', color: '#aaa', marginBottom: '10px' }}>
            Select the role of this PC. Changes require a restart.
          </p>
          <select
            className="modern-input"
            id="terminal-mode-select"
            style={{ fontSize: '12px', marginBottom: '8px' }}
            value={terminalMode}
            onChange={(e) => {
              setTerminalMode(e.target.value);
              setShowMasterIp(e.target.value === 'client');
            }}
          >
            <option value="master">Master Node (Runs Database)</option>
            <option value="client">Client Terminal (Connects via IP)</option>
          </select>
          {showMasterIp && (
            <input
              type="text"
              id="master-ip-input"
              className="modern-input"
              placeholder="Master Node IP (e.g., 192.168.1.5)"
              style={{ fontSize: '12px', marginBottom: '8px' }}
              value={masterIp}
              onChange={(e) => setMasterIp(e.target.value)}
            />
          )}
          <button
            onClick={handleApplyTerminalMode}
            className="primary-btn"
            style={{
              width: '100%',
              fontSize: '11px',
              padding: '6px',
              background: 'linear-gradient(135deg, #b8860b, #ffd700)',
              color: '#000',
              justifyContent: 'center',
              boxShadow: 'none',
            }}
          >
            Apply Mode
          </button>
        </div>

        {/* Database Restore */}
        <div
          className="form-group"
          style={{
            background: 'rgba(239, 68, 68, 0.05)',
            padding: '16px',
            borderRadius: '8px',
            border: '1px dashed rgba(239, 68, 68, 0.3)',
            marginTop: '8px',
          }}
        >
          <label style={{ color: '#ef4444', fontSize: '13px', marginBottom: '8px', display: 'block' }}>
            🔄 Restore Database Backup
          </label>
          <p style={{ fontSize: '11px', color: '#aaa', marginBottom: '10px' }}>
            Restore your database from an existing <code>.sqlite</code> copy. This will overwrite all current school records.
          </p>
          <button
            onClick={handleRestoreDatabase}
            id="restore-db-btn"
            className="secondary-btn"
            style={{
              width: '100%',
              fontSize: '12px',
              padding: '8px',
              borderColor: '#ef4444',
              color: '#ef4444',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              background: 'transparent',
              cursor: 'pointer',
              border: '1px solid',
              borderRadius: '6px',
            }}
          >
            🔄 Select Backup file
          </button>
        </div>
      </div>{/* end scrollable body */}
    </div>{/* end drawer panel */}
  </>
)}{/* end isTemplateDrawerOpen */}

      {/* ── Admin Profile & Security Modal ── */}
      {isAdminModalOpen && (
        <>
          {/* Dim overlay */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(4px)',
              zIndex: 999
            }}
            onClick={() => setIsAdminModalOpen(false)}
          />
          {/* Modal Panel */}
          <div
            id="admin-profile-modal-panel"
            style={{
              position: 'fixed',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '420px',
              maxHeight: '90vh',
              background: '#0d1235',
              border: '1px solid var(--glass-border)',
              borderRadius: '16px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
              zIndex: 1000,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--glass-border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: '15px', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>👤</span> Admin Profile &amp; Security
              </h3>
              <button
                onClick={() => setIsAdminModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-dim)',
                  fontSize: '20px',
                  cursor: 'pointer',
                  padding: 0,
                  lineHeight: 1
                }}
              >
                ×
              </button>
            </div>

            {/* Modal Body */}
            <div style={{
              padding: '20px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}>
              {!isProfileUnlocked ? (
                <div style={{
                  padding: '30px 10px',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '16px'
                }}>
                  <div style={{ fontSize: '32px' }}>🔒</div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '13px', color: '#fff', fontWeight: 600 }}>Security Settings Locked</h4>
                    <p style={{ margin: '6px 0 0', fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.5 }}>
                      Please authorize to edit admin profile and security credentials.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleUnlockProfile}
                    style={{
                      background: 'rgba(0,229,255,0.1)',
                      border: '1px solid rgba(0,229,255,0.3)',
                      color: '#00e5ff',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    🔓 Unlock Profile
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Circular Avatar */}
                  <div className="avatar-uploader-container">
                    <div
                      className="avatar-uploader-circle"
                      onClick={() => document.getElementById('avatar-upload-input')?.click()}
                    >
                      {profileAvatar ? (
                        <img
                          src={profileAvatar}
                          alt="Avatar Preview"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <span style={{ fontSize: '28px' }}>👤</span>
                      )}
                      <div className="avatar-uploader-overlay">
                        Change
                      </div>
                    </div>
                    <input
                      type="file"
                      id="avatar-upload-input"
                      accept="image/png, image/jpeg"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          setProfileAvatar(event.target?.result as string);
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '4px' }}>Admin Avatar</span>
                  </div>

                  <div className="form-group">
                    <label>Admin Username</label>
                    <input
                      type="text"
                      className="modern-input"
                      placeholder="Username"
                      value={profileUsername}
                      onChange={(e) => setProfileUsername(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>Recovery Phone Number</label>
                    <input
                      type="text"
                      className="modern-input"
                      placeholder="e.g. +234..."
                      value={profilePhone}
                      onChange={(e) => setProfilePhone(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>Recovery Email</label>
                    <input
                      type="email"
                      className="modern-input"
                      placeholder="e.g. admin@school.com"
                      value={profileRecoveryEmail}
                      onChange={(e) => setProfileRecoveryEmail(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label>Verification Code (PIN or 2FA Code)</label>
                    <input
                      type="password"
                      className="modern-input"
                      placeholder="Enter 4-digit PIN or 6-digit 2FA code"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveProfile}
                    className="primary-btn"
                    style={{
                      background: 'var(--accent)',
                      color: 'var(--bg-deep)',
                      border: 'none',
                      padding: '10px 18px',
                      borderRadius: '8px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '13px',
                      justifyContent: 'center',
                      display: 'flex',
                      alignItems: 'center',
                      boxShadow: '0 4px 14px rgba(0,229,255,0.2)'
                    }}
                  >
                    Save Profile Shard
                  </button>

                  <div style={{
                    margin: '10px 0 0',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    paddingTop: '16px'
                  }}>
                    <h4 style={{ fontSize: '11px', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>
                      Two-Factor Authentication (2FA)
                    </h4>

                    {profileTotpEnabled ? (
                      <div style={{
                        background: 'rgba(34,197,94,0.05)',
                        border: '1px solid rgba(34,197,94,0.2)',
                        borderRadius: '8px',
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#22c55e', fontSize: '12px', fontWeight: 600 }}>
                          <span>🛡️</span>
                          <span>TOTP 2FA Status: Enabled</span>
                        </div>
                        <p style={{ fontSize: '10px', color: 'var(--text-dim)', margin: 0, lineHeight: 1.4 }}>
                          Secure verification is active. Use your authenticator app to generate codes.
                        </p>
                        <button
                          type="button"
                          onClick={handleDisable2fa}
                          style={{
                            background: 'transparent',
                            border: '1px solid #ff4444',
                            color: '#ff4444',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '10px',
                            fontWeight: 600,
                            alignSelf: 'flex-start'
                          }}
                        >
                          Disable 2FA
                        </button>
                      </div>
                    ) : isSettingUp2fa ? (
                      <div style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '8px',
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px'
                      }}>
                        <p style={{ fontSize: '11px', color: '#fff', fontWeight: 600, margin: 0 }}>Scan this QR Code</p>
                        <div style={{ display: 'flex', justifyContent: 'center', background: '#fff', padding: '6px', borderRadius: '8px', alignSelf: 'center' }}>
                          <img src={totpQrUrl} alt="TOTP QR Code" style={{ width: '130px', height: '130px' }} />
                        </div>
                        <div>
                          <p style={{ fontSize: '10px', color: 'var(--text-dim)', margin: '0 0 4px 0' }}>Manual Entry Key:</p>
                          <code style={{ fontSize: '10px', color: '#00e5ff', background: 'rgba(0,0,0,0.3)', padding: '3px 6px', borderRadius: '4px', wordBreak: 'break-all', display: 'block', textAlign: 'center', fontFamily: 'monospace' }}>
                            {totpSecret}
                          </code>
                        </div>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label style={{ fontSize: '10px' }}>Enter 6-Digit Verification Code</label>
                          <input
                            type="text"
                            maxLength={6}
                            className="modern-input"
                            placeholder="000000"
                            style={{ textAlign: 'center', fontSize: '16px', letterSpacing: '3px' }}
                            value={totpVerifyCode}
                            onChange={(e) => setTotpVerifyCode(e.target.value.replace(/[^0-9]/g, ''))}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => setIsSettingUp2fa(false)}
                            className="secondary-btn"
                            style={{ flex: 1, padding: '6px', fontSize: '10px' }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleVerify2fa}
                            className="primary-btn"
                            style={{ flex: 1, padding: '6px', fontSize: '10px', background: 'var(--accent)', color: 'var(--bg-deep)' }}
                          >
                            Verify &amp; Enable
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px dashed var(--glass-border)',
                        borderRadius: '8px',
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-dim)', fontSize: '11px' }}>
                          <span>🔓</span>
                          <span>TOTP 2FA Status: Disabled</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleStart2faSetup}
                          style={{
                            background: 'rgba(0,229,255,0.1)',
                            border: '1px solid rgba(0,229,255,0.3)',
                            color: '#00e5ff',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '10px',
                            fontWeight: 600,
                            alignSelf: 'flex-start'
                          }}
                        >
                          Setup 2FA Authenticator
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}


export default Settings;
