import React, { useCallback, useEffect, useState, type ReactNode } from 'react';
import { SettingsContext } from './useSettings';
import { DEFAULT_RISK_THRESHOLD, clampThreshold } from '../utils/sensitivity';

interface UserProfile {
  name: string;
  email: string;
  role: string;
  avatar: string;
}
export interface AlertBehaviorSettings {
  showDashboardAlerts: boolean;
  highlightFlaggedInbox: boolean;
}
export interface SettingsContextType {
  profile: UserProfile;
  updateProfile: (profile: Partial<UserProfile>) => void;
  advanced: { autoRefresh: boolean; refreshInterval: number };
  alertBehavior: AlertBehaviorSettings;
  updateAlertBehavior: (settings: Partial<AlertBehaviorSettings>) => void;
  riskFlagThreshold: number;
  setRiskFlagThreshold: (value: number) => void;
}
const advanced = { autoRefresh: true, refreshInterval: 30000 };
const defaults: AlertBehaviorSettings = { showDashboardAlerts: true, highlightFlaggedInbox: true };
export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<UserProfile>({ name: '', email: '', role: 'User', avatar: '/logo.png' });
  const [alertBehavior, setAlertBehavior] = useState<AlertBehaviorSettings>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('ironinbox_alert_behavior') || '{}');
      return {
        showDashboardAlerts: typeof saved?.showDashboardAlerts === 'boolean' ? saved.showDashboardAlerts : true,
        highlightFlaggedInbox: typeof saved?.highlightFlaggedInbox === 'boolean' ? saved.highlightFlaggedInbox : true,
      };
    } catch { return defaults; }
  });
  const [riskFlagThreshold, setThreshold] = useState(() => {
    try {
      const saved = localStorage.getItem('ironinbox_risk_threshold');
      return saved === null ? DEFAULT_RISK_THRESHOLD : clampThreshold(Number(saved));
    } catch { return DEFAULT_RISK_THRESHOLD; }
  });
  useEffect(() => {
    try {
      localStorage.setItem('ironinbox_alert_behavior', JSON.stringify(alertBehavior));
      localStorage.setItem('ironinbox_risk_threshold', String(riskFlagThreshold));
    } catch { /* Preferences still work when browser storage is unavailable. */ }
  }, [alertBehavior, riskFlagThreshold]);
  const updateProfile = useCallback((value: Partial<UserProfile>) => setProfile(previous => ({ ...previous, ...value })), []);
  // These must keep the same identity across renders: AppContext loads the
  // user's saved workspace in an effect that depends on setRiskFlagThreshold,
  // and a new function each render re-ran that load on every slider move,
  // snapping the slider back to the saved value.
  const updateAlertBehavior = useCallback((value: Partial<AlertBehaviorSettings>) => setAlertBehavior(previous => ({ ...previous, ...value })), []);
  const setRiskFlagThreshold = useCallback((value: number) => setThreshold(clampThreshold(value)), []);
  return <SettingsContext.Provider value={{
    profile, updateProfile, advanced, alertBehavior, riskFlagThreshold, updateAlertBehavior, setRiskFlagThreshold,
  }}>{children}</SettingsContext.Provider>;
};
