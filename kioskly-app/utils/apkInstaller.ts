import { NativeModules } from 'react-native';

const { AppInstaller } = NativeModules;

export async function installApk(filePath: string): Promise<void> {
  if (!AppInstaller) {
    throw new Error('AppInstaller native module is not available');
  }
  await AppInstaller.installApk(filePath);
}
