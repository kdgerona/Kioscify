import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Application from 'expo-application';
import { useAppUpdate } from '@/contexts/AppUpdateContext';

export default function UpdateDialog() {
  const {
    updateInfo,
    isDownloading,
    downloadProgress,
    error,
    dismissUpdate,
    downloadAndInstall,
  } = useAppUpdate();

  if (!updateInfo) return null;

  const currentVersion = Application.nativeApplicationVersion ?? '—';
  const progressPct = Math.round(downloadProgress * 100);

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={updateInfo.force_update ? undefined : dismissUpdate}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          justifyContent: 'center',
          alignItems: 'center',
          paddingHorizontal: 24,
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 360,
            backgroundColor: '#fff',
            borderRadius: 16,
            padding: 24,
          }}
        >
          <Text
            style={{ fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 4 }}
          >
            Update Available
          </Text>
          <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>
            A new version of Kioscify is ready to install.
          </Text>

          {/* Version info */}
          <View
            style={{
              backgroundColor: '#F9FAFB',
              borderRadius: 8,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <View
              style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}
            >
              <Text style={{ fontSize: 13, color: '#6B7280' }}>Current Version</Text>
              <Text style={{ fontSize: 13, fontWeight: '500', color: '#111827' }}>
                {currentVersion}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 13, color: '#6B7280' }}>New Version</Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#059669' }}>
                {updateInfo.version_name}
              </Text>
            </View>
          </View>

          {/* Release notes */}
          {updateInfo.release_notes.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <Text
                style={{ fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 }}
              >
                {"What's New:"}
              </Text>
              {updateInfo.release_notes.map((note, i) => (
                <Text
                  key={i}
                  style={{ fontSize: 13, color: '#4B5563', marginBottom: 2 }}
                >
                  {'• '}{note}
                </Text>
              ))}
            </View>
          )}

          {/* Error */}
          {error ? (
            <Text
              style={{
                fontSize: 12,
                color: '#DC2626',
                backgroundColor: '#FEF2F2',
                borderRadius: 6,
                padding: 8,
                marginBottom: 12,
              }}
            >
              {error}
            </Text>
          ) : null}

          {/* Download progress */}
          {isDownloading ? (
            <View style={{ alignItems: 'center', marginBottom: 8 }}>
              <ActivityIndicator size="large" color="#EA580C" />
              <Text style={{ fontSize: 13, color: '#6B7280', marginTop: 8 }}>
                Downloading… {progressPct}%
              </Text>
              {/* Progress bar */}
              <View
                style={{
                  width: '100%',
                  height: 4,
                  backgroundColor: '#E5E7EB',
                  borderRadius: 2,
                  marginTop: 8,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    width: `${progressPct}%`,
                    height: '100%',
                    backgroundColor: '#EA580C',
                  }}
                />
              </View>
            </View>
          ) : (
            <View>
              <TouchableOpacity
                onPress={downloadAndInstall}
                style={{
                  backgroundColor: '#EA580C',
                  borderRadius: 8,
                  paddingVertical: 12,
                  alignItems: 'center',
                  marginBottom: 8,
                }}
                activeOpacity={0.8}
              >
                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>
                  {error ? 'Retry Update' : 'Update Now'}
                </Text>
              </TouchableOpacity>

              {!updateInfo.force_update && (
                <TouchableOpacity
                  onPress={dismissUpdate}
                  style={{
                    borderWidth: 1,
                    borderColor: '#D1D5DB',
                    borderRadius: 8,
                    paddingVertical: 12,
                    alignItems: 'center',
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: '#6B7280', fontSize: 14 }}>Later</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {updateInfo.force_update && (
            <Text
              style={{
                fontSize: 11,
                color: '#9CA3AF',
                textAlign: 'center',
                marginTop: 12,
              }}
            >
              This update is required to continue using the app.
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}
