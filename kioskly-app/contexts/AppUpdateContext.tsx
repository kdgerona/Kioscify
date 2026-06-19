import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Application from 'expo-application';
import { apiGet } from '@/utils/api';
import { downloadApk } from '@/utils/apkDownloader';
import { installApk } from '@/utils/apkInstaller';

const UPDATE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

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
  checkForUpdates: () => Promise<void>;
  dismissUpdate: () => void;
  downloadAndInstall: () => Promise<void>;
}

const AppUpdateContext = createContext<AppUpdateContextValue | null>(null);

export function AppUpdateProvider({ children }: { children: React.ReactNode }) {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

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
      const response = await apiGet('/app/version');
      const data = (await response.json()) as UpdateInfo;
      if (data.version_code > currentVersionCode) {
        setUpdateInfo(data);
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
    setDownloadProgress(0);
    try {
      const filePath = await downloadApk(updateInfo.apk_url, updateInfo.checksum_sha256, setDownloadProgress);
      await installApk(filePath);
    } catch (e: unknown) {
      setError((e as { message?: string })?.message ?? 'Download failed. Please try again.');
    } finally {
      setIsDownloading(false);
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
        checkForUpdates,
        dismissUpdate,
        downloadAndInstall,
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
