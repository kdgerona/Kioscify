import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus, BackHandler } from 'react-native';
import * as Application from 'expo-application';
import { apiGet, getApiUrl } from '@/utils/api';
import { downloadApk } from '@/utils/apkDownloader';
import {
  canRequestPackageInstalls,
  installApk,
  openInstallPermissionSettings,
} from '@/utils/apkInstaller';

const UPDATE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const INSTALLER_FOREGROUND_TIMEOUT_MS = 15000;

// installApk() resolving only means the install intent was dispatched, not
// that the system installer UI actually appeared (e.g. Play Protect scanning
// can delay it by several seconds on some devices/OS versions). This waits
// for a real signal — the app actually losing the foreground — before we
// treat the install as having taken over.
function waitForBackgroundTransition(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      subscription.remove();
      clearTimeout(timer);
      resolve(result);
    };
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') finish(true);
    });
    const timer = setTimeout(() => finish(false), timeoutMs);
  });
}

export interface UpdateInfo {
  version_code: number;
  version_name: string;
  apk_url: string;
  force_update: boolean;
  checksum_sha256: string;
  release_notes: string[];
}

interface AppUpdateContextValue {
  updateInfo: UpdateInfo | null;
  isChecking: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  error: string | null;
  needsInstallPermission: boolean;
  checkForUpdates: () => Promise<void>;
  dismissUpdate: () => void;
  downloadAndInstall: () => Promise<void>;
  openInstallSettings: () => Promise<void>;
}

const AppUpdateContext = createContext<AppUpdateContextValue | null>(null);

export function AppUpdateProvider({ children }: { children: React.ReactNode }) {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [needsInstallPermission, setNeedsInstallPermission] = useState(false);

  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentVersionCode = parseInt(
    Application.nativeBuildVersion ?? '0',
    10,
  );

  const checkForUpdates = async () => {
    if (isChecking) return;
    setIsChecking(true);
    try {
      const response = await apiGet('/app/version', {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!response.ok) return;
      const data = (await response.json()) as UpdateInfo;
      if (data.version_code > currentVersionCode) {
        // Rewrite apk_url origin to match the app's configured API host so the
        // device can reach the file regardless of what the server stored in the DB.
        const apiBase = getApiUrl().replace(/\/api\/v1\/?$/, '');
        setUpdateInfo({ ...data, apk_url: data.apk_url.replace(/^https?:\/\/[^/]+/, apiBase) });
      }
    } catch {
      // Silently fail — update check must never crash the app
    } finally {
      setIsChecking(false);
    }
  };

  const dismissUpdate = () => {
    if (updateInfo?.force_update) return; // Cannot dismiss force updates
    setUpdateInfo(null);
    setError(null);
  };

  const downloadAndInstall = async () => {
    if (!updateInfo || isDownloading) return;
    setIsDownloading(true);
    setError(null);
    setNeedsInstallPermission(false);
    setDownloadProgress(0);
    try {
      const filePath = await downloadApk(updateInfo.apk_url, updateInfo.checksum_sha256, setDownloadProgress);

      const allowed = await canRequestPackageInstalls();
      if (!allowed) {
        setNeedsInstallPermission(true);
        setError("Please enable 'Install unknown apps' for Kioscify in Settings, then try again.");
        return;
      }

      await installApk(filePath);

      // Only exit once we have real confirmation the installer took over the
      // foreground — never force-kill the app on a blind guess, since that
      // can close the app before the installer UI has even appeared.
      const installerTookForeground = await waitForBackgroundTransition(
        INSTALLER_FOREGROUND_TIMEOUT_MS,
      );
      if (!installerTookForeground) {
        // The installer never took over — this can happen if the "Install
        // unknown apps" permission was revoked/blocked after our earlier
        // check (e.g. an OEM security feature stepping in silently), so
        // re-check rather than showing a dead-end generic error.
        const stillAllowed = await canRequestPackageInstalls();
        if (!stillAllowed) {
          setNeedsInstallPermission(true);
          setError("Please enable 'Install unknown apps' for Kioscify in Settings, then try again.");
        } else {
          setError('Unable to open the installer. Please try again.');
        }
        return;
      }
      BackHandler.exitApp();
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      if (code === 'PERMISSION_REQUIRED') setNeedsInstallPermission(true);
      setError((e as { message?: string })?.message ?? 'Download failed. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const openInstallSettings = async () => {
    try {
      await openInstallPermissionSettings();
    } catch {
      // best-effort — the error text already tells the user what to do manually
    }
  };

  useEffect(() => {
    checkForUpdates();

    intervalRef.current = setInterval(checkForUpdates, UPDATE_INTERVAL_MS);

    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        const wasBackground = appStateRef.current.match(/inactive|background/);
        if (wasBackground && nextState === 'active') {
          checkForUpdates();
        }
        appStateRef.current = nextState;
      },
    );

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      subscription.remove();
    };
  }, []);

  return (
    <AppUpdateContext.Provider
      value={{
        updateInfo,
        isChecking,
        isDownloading,
        downloadProgress,
        error,
        needsInstallPermission,
        checkForUpdates,
        dismissUpdate,
        downloadAndInstall,
        openInstallSettings,
      }}
    >
      {children}
    </AppUpdateContext.Provider>
  );
}

export function useAppUpdate(): AppUpdateContextValue {
  const ctx = useContext(AppUpdateContext);
  if (!ctx) throw new Error('useAppUpdate must be used inside AppUpdateProvider');
  return ctx;
}
