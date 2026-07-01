import { useRef, useState } from "react";
import { View, Text, TouchableOpacity, Linking, ActivityIndicator } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import AppSafeAreaView from "./AppSafeAreaView";

interface TimeClockCameraProps {
  onCapture: (uri: string) => void;
  onCancel: () => void;
}

/**
 * Full-screen front-facing camera capture for the Time Clock selfie.
 * This component's only output is a captured photo URI via `onCapture` —
 * there is no gallery/library picker wired in anywhere by design.
 */
export default function TimeClockCamera({ onCapture, onCancel }: TimeClockCameraProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (photo?.uri) {
        onCapture(photo.uri);
      }
    } catch (error) {
      console.error("Failed to capture selfie:", error);
    } finally {
      setIsCapturing(false);
    }
  };

  // Permission not yet determined
  if (!permission) {
    return (
      <View className="flex-1 bg-black items-center justify-center">
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <AppSafeAreaView className="flex-1 bg-black px-6">
        <View className="flex-1 items-center justify-center">
          <Ionicons name="camera-outline" size={48} color="#ffffff" />
          <Text className="text-white text-base font-semibold text-center mt-4">
            Camera access is required to clock in or out.
          </Text>
          {permission.canAskAgain ? (
            <TouchableOpacity
              className="mt-6 bg-white rounded-lg px-6 py-3"
              onPress={requestPermission}
            >
              <Text className="text-black font-semibold">Grant Camera Access</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              className="mt-6 bg-white rounded-lg px-6 py-3"
              onPress={() => Linking.openSettings()}
            >
              <Text className="text-black font-semibold">Open Settings</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity className="mt-4 px-6 py-3" onPress={onCancel}>
            <Text className="text-white/70 font-semibold">Cancel</Text>
          </TouchableOpacity>
        </View>
      </AppSafeAreaView>
    );
  }

  return (
    <View className="flex-1 bg-black">
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="front">
        <AppSafeAreaView style={{ flex: 1 }}>
          <View className="flex-1 justify-between items-center px-6 py-6">
            <View className="w-full flex-row justify-between items-center">
              <TouchableOpacity
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
                onPress={onCancel}
              >
                <Ionicons name="close" size={22} color="#ffffff" />
              </TouchableOpacity>
              <Text className="text-white text-sm font-semibold">
                Center your face in the frame
              </Text>
              <View className="w-10" />
            </View>

            <TouchableOpacity
              className="w-20 h-20 rounded-full items-center justify-center"
              style={{
                backgroundColor: "rgba(255,255,255,0.25)",
                borderWidth: 4,
                borderColor: "#ffffff",
              }}
              onPress={handleCapture}
              disabled={isCapturing}
            >
              {isCapturing ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <View className="w-14 h-14 rounded-full bg-white" />
              )}
            </TouchableOpacity>
          </View>
        </AppSafeAreaView>
      </CameraView>
    </View>
  );
}
