import { NativeModules } from 'react-native';

const { AppInstaller } = NativeModules;

function assertAvailable() {
  if (!AppInstaller) {
    throw new Error('AppInstaller native module is not available');
  }
}

export async function installApk(filePath: string): Promise<void> {
  assertAvailable();
  await AppInstaller.installApk(filePath);
}

export async function canRequestPackageInstalls(): Promise<boolean> {
  assertAvailable();
  return AppInstaller.canRequestPackageInstalls();
}

export async function openInstallPermissionSettings(): Promise<void> {
  assertAvailable();
  await AppInstaller.openInstallPermissionSettings();
}
