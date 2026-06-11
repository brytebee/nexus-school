import React, { useState, useEffect } from 'react';
import { useLicense } from '../hooks/useLicense';
import { useIdentity } from '../hooks/useIdentity';

interface NavSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  isCollapsed: boolean;
  onOpenHelp: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: string;
  tier?: 'Silver' | 'Gold' | 'Diamond';
  badgeId?: string;
}

export function NavSidebar({ activeTab, onTabChange, isCollapsed, onOpenHelp }: NavSidebarProps) {
  const { license } = useLicense();
  const { identity } = useIdentity();
  const [stats, setStats] = useState({ teachers: 0, students: 0 });

  const currentTier = license?.tier || 'Silver';
  const tiers: Record<'Silver' | 'Gold' | 'Diamond', number> = {
    Silver: 1,
    Gold: 2,
    Diamond: 3,
  };
  const currentLevel = tiers[currentTier] || 1;

  const schoolName = identity?.name || 'Nexus School';
  const logoBase64 = identity?.logoBase64;

  const mainNavItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
    { id: 'teachers', label: 'Teachers', icon: '👩‍🏫', badgeId: 'badge-teachers' },
    { id: 'students', label: 'Students', icon: '👥', badgeId: 'badge-students' },
    { id: 'sync', label: 'Sync Hub', icon: '📲' },
    { id: 'printhub', label: 'Print Hub', icon: '🖨️' },
    { id: 'result-studio', label: 'Result Studio', icon: '📊' },
    { id: 'attendance', label: 'Attendance', icon: '📅', tier: 'Gold' },
    { id: 'pulse', label: 'Nexus Pulse', icon: '🤖', tier: 'Gold' },
    { id: 'fees', label: 'Financial Hub', icon: '💳', tier: 'Gold' },
    { id: 'portal', label: 'Sovereign Portal', icon: '🌐', tier: 'Gold' },
    { id: 'portal-content', label: 'Portal Content', icon: '📰', tier: 'Gold' },
    { id: 'scholar', label: 'Nexus Scholar', icon: '🧠', tier: 'Diamond' },
    { id: 'cbt', label: 'CBT Arena', icon: '💎', tier: 'Diamond' },
  ];

  const comingSoonItems = [
    { id: 'live-quiz', label: 'Live Quiz System', icon: '⚡' },
    { id: 'analytics', label: 'Analytics Dashboard', icon: '📈' },
    { id: 'notes-marketplace', label: 'Notes Marketplace', icon: '📚' },
    { id: 'skill-mastery', label: 'Skill Mastery', icon: '🎯' },
  ];

  // Load stats dynamically
  useEffect(() => {
    const fetchStats = async () => {
      if (window.electronAPI?.getDbStats) {
        try {
          const res = await window.electronAPI.getDbStats();
          if (res) {
            setStats({
              teachers: res.teachers || 0,
              students: res.students || 0,
            });
          }
        } catch (err) {
          console.error('Failed to fetch DB stats for sidebar:', err);
        }
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleItemClick = (item: NavItem) => {
    const reqTier = item.tier || 'Silver';
    const reqLevel = tiers[reqTier] || 1;

    if (currentLevel < reqLevel) {
      alert(`This feature requires the ${reqTier} tier. Your current tier is ${currentTier}.`);
      return;
    }
    onTabChange(item.id);
  };

  const handleLockNow = () => {
    if (window.nexusAPI?.auth?.lock) {
      window.nexusAPI.auth.lock();
    } else if (window.electronAPI?.send) {
      window.electronAPI.send('auth:lock');
    }
  };

  return (
    <nav className={`sidebar ${isCollapsed ? 'collapsed' : ''}`} id="app-sidebar">
      {/* School Brand */}
      <div className="sidebar-brand">
        {logoBase64 ? (
          <div className="logo-placeholder">
            <img 
              src={logoBase64.startsWith('data:') ? logoBase64 : `data:image/png;base64,${logoBase64}`} 
              alt="School Logo" 
              style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '10px', pointerEvents: 'none' }}
            />
          </div>
        ) : (
          <div className="logo-placeholder">
            {schoolName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="brand-text">
          <span className="brand-name">{schoolName}</span>
          <span className="brand-sub">Admin Dashboard</span>
        </div>
      </div>

      {/* Navigation list */}
      <ul className="sidebar-nav">
        {mainNavItems.map((item) => {
          const reqTier = item.tier || 'Silver';
          const reqLevel = tiers[reqTier] || 1;
          const isLocked = currentLevel < reqLevel;
          const isActive = activeTab === item.id;

          return (
            <li
              key={item.id}
              data-view={item.id}
              onClick={() => handleItemClick(item)}
              className={`nav-item ${isActive ? 'active' : ''} ${isLocked ? 'locked-feature' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              
              {/* Badges for Teachers and Students */}
              {!isLocked && item.id === 'teachers' && stats.teachers > 0 && (
                <span className="nav-badge" id={item.badgeId}>{stats.teachers}</span>
              )}
              {!isLocked && item.id === 'students' && stats.students > 0 && (
                <span className="nav-badge" id={item.badgeId}>{stats.students}</span>
              )}
            </li>
          );
        })}

        {/* Pinned Coming Soon header */}
        <div className="px-3 pt-4 pb-1 mt-3 shrink-0">
          <div className="text-[9px] font-bold tracking-[1.5px] text-nexus-text-dim uppercase">Coming Soon</div>
        </div>

        {comingSoonItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <li
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`nav-item ${isActive ? 'active' : 'opacity-65 hover:opacity-100 transition-opacity cursor-pointer'}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              <span 
                className="nav-badge" 
                style={{
                  fontSize: '9px',
                  background: isActive ? 'var(--accent)' : 'rgba(99,102,241,0.2)',
                  color: isActive ? 'var(--bg-deep)' : '#818cf8',
                  padding: '2px 5px',
                  borderRadius: '8px',
                  marginLeft: 'auto',
                  whiteSpace: 'nowrap',
                  fontWeight: isActive ? '800' : 'normal'
                }}
              >
                SOON
              </span>
            </li>
          );
        })}
      </ul>

      {/* Footer navigation wrapper */}
      <div className="sidebar-footer-nav">
        {/* Lock Now */}
        <li
          onClick={handleLockNow}
          className="nav-item"
          style={{ color: 'rgba(255, 110, 110, 0.85)' }}
          title="Lock the screen"
        >
          <span className="nav-icon">🔒</span>
          <span className="nav-label">Lock Now</span>
        </li>

        {/* Contextual ? Help */}
        <li
          onClick={onOpenHelp}
          className="nav-item"
          title="Help for this screen"
        >
          <span className="nav-icon" style={{ fontWeight: 900, color: 'var(--accent)', fontSize: '15px' }}>?</span>
          <span className="nav-label">About This Screen</span>
        </li>

        {/* Settings */}
        <li
          onClick={() => onTabChange('settings')}
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
        >
          <span className="nav-icon">⚙️</span>
          <span className="nav-label">Settings</span>
        </li>

        {/* About */}
        <li
          onClick={() => onTabChange('about')}
          className={`nav-item ${activeTab === 'about' ? 'active' : ''}`}
        >
          <span className="nav-icon">ℹ️</span>
          <span className="nav-label">About</span>
        </li>
      </div>

      {/* Status */}
      <div className="sidebar-status" id="thermal-badge">
        <span className="dot" />
        <span>Hardware: COOL</span>
      </div>
    </nav>
  );
}
