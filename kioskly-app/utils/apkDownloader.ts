import * as FileSystem from 'expo-file-system';
import { NativeModules } from 'react-native';

const { AppInstaller } = NativeModules;

export class DownloadError extends Error {
  constructor(
    message: string,
    public readonly code: 'NO_INTERNET' | 'INSUFFICIENT_STORAGE' | 'CHECKSUM_MISMATCH' | 'FAILED',
  ) {
    super(message);
    this.name = 'DownloadError';
  }
}

export async function downloadApk(
  url: string,
  expectedChecksum: string,
  onProgress: (progress: number) => void,
): Promise<string> {
  const fileUri = `${FileSystem.documentDirectory}kioscify-update.apk`;

  // Remove any incomplete previous download
  const existing = await FileSystem.getInfoAsync(fileUri);
  if (existing.exists) await FileSystem.deleteAsync(fileUri, { idempotent: true });

  const downloadResumable = FileSystem.createDownloadResumable(
    url,
    fileUri,
    {},
    (progress) => {
      if (progress.totalBytesExpectedToWrite > 0) {
        onProgress(progress.totalBytesWritten / progress.totalBytesExpectedToWrite);
      }
    },
  );

  let result: FileSystem.FileSystemDownloadResult | undefined;
  try {
    result = await downloadResumable.downloadAsync();
  } catch (err: unknown) {
    const msg: string = (err as { message?: string })?.message ?? '';
    if (msg.includes('Network') || msg.includes('network') || msg.includes('internet')) {
      throw new DownloadError('No internet connection', 'NO_INTERNET');
    }
    if (msg.includes('storage') || msg.includes('space') || msg.includes('ENOSPC')) {
      throw new DownloadError('Not enough storage space', 'INSUFFICIENT_STORAGE');
    }
    throw new DownloadError(msg || 'Download failed', 'FAILED');
  }

  if (!result || result.status !== 200) {
    throw new DownloadError('Download failed — server returned an error', 'FAILED');
  }

  // Verify integrity via streaming SHA-256 in Kotlin (avoids loading large file into JS)
  const actualChecksum: string = await AppInstaller.computeSha256(result.uri);
  if (actualChecksum.toLowerCase() !== expectedChecksum.toLowerCase()) {
    await FileSystem.deleteAsync(result.uri, { idempotent: true });
    throw new DownloadError('APK checksum mismatch — file may be corrupted', 'CHECKSUM_MISMATCH');
  }

  return result.uri;
}
