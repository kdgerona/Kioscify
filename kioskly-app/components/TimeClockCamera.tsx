import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, Linking, ActivityIndicator } from "react-native";
import { CameraView, useCameraPermissions, CameraType } from "expo-camera";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import AppSafeAreaView from "./AppSafeAreaView";
import { formatDateTime } from "../utils/formatDateTime";

interface TimeClockCameraProps {
  onCapture: (uri: string, latitude: number, longitude: number) => void;
  onCancel: () => void;
}

/**
 * Full-screen camera capture for the Time Clock photo, front or back facing.
 * This component's only output is a captured photo URI + coordinates via
 * `onCapture` — there is no gallery/library picker wired in anywhere by design.
 *
 * Location is fetched once on mount (not continuously polled, to avoid battery
 * drain) and shown live alongside a ticking clock so the user can preview
 * exactly what the final watermark will contain before they capture.
 */
export default function TimeClockCamera({ onCapture, onCancel }: TimeClockCameraProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>("front");
  const [isCapturing, setIsCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const [now, setNow] = useState(new Date());
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(true);

  // Live-ticking clock for the on-camera watermark preview.
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Fetch location once so the preview and the eventual capture use the same
  // coordinates — re-fetching per second would drain battery for no benefit.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLocationLoading(true);
      setLocationError(null);
      try {
        const permissionResult = await Location.requestForegroundPermissionsAsync();
        if (!permissionResult.granted) {
          if (!cancelled) setLocationError("Location permission is required to clock in or out.");
          return;
        }
        const position = await Location.getCurrentPositionAsync({});
        if (!cancelled) {
          setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        }
      } catch {
        if (!cancelled) setLocationError("Failed to get your location.");
      } finally {
        if (!cancelled) setLocationLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleFacing = () => setFacing((current) => (current === "front" ? "back" : "front"));

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing || !location) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (photo?.uri) {
        onCapture(photo.uri, location.latitude, location.longitude);
      }
    } catch (error) {
      console.error("Failed to capture photo:", error);
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

  const canCapture = !isCapturing && !!location;

  return (
    <View className="flex-1 bg-black">
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing={facing}>
        <AppSafeAreaView style={{ flex: 1 }}>
          <View className="flex-1 justify-between items-center px-6 py-6">
            <View className="w-full">
              <View className="w-full flex-row justify-between items-center">
                <TouchableOpacity
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
                  onPress={onCancel}
                >
                  <Ionicons name="close" size={22} color="#ffffff" />
                </TouchableOpacity>
                <Text className="text-white text-sm font-semibold">
                  {facing === "front" ? "Center your face in the frame" : "Frame your shot"}
                </Text>
                <TouchableOpacity
                  className="w-10 h-10 rounded-full items-center justify-center"
                  style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
                  onPress={toggleFacing}
                >
                  <Ionicons name="camera-reverse-outline" size={22} color="#ffffff" />
                </TouchableOpacity>
              </View>

              {/* Live preview of the watermark that will be burned into the
                  final photo — same date-time format and coordinate precision
                  as the actual composite. Placed top-left, below the close
                  button, out of the way of the framing area. */}
              <View className="items-start mt-3">
                <View style={{ backgroundColor: "rgba(0,0,0,0.55)", padding: 10, borderRadius: 8 }}>
                  <Text style={{ color: "#ffffff", fontSize: 14, fontWeight: "700" }}>
                    {formatDateTime(now)}
                  </Text>
                  {locationLoading ? (
                    <Text style={{ color: "#ffffff", fontSize: 13, marginTop: 2 }}>
                      Getting location...
                    </Text>
                  ) : location ? (
                    <Text style={{ color: "#ffffff", fontSize: 13, marginTop: 2 }}>
                      {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                    </Text>
                  ) : (
                    <Text style={{ color: "#fca5a5", fontSize: 13, marginTop: 2 }}>
                      {locationError ?? "Location unavailable"}
                    </Text>
                  )}
                </View>
              </View>
            </View>

            <TouchableOpacity
              className="w-20 h-20 rounded-full items-center justify-center"
              style={{
                backgroundColor: "rgba(255,255,255,0.25)",
                borderWidth: 4,
                borderColor: "#ffffff",
                opacity: canCapture ? 1 : 0.5,
              }}
              onPress={handleCapture}
              disabled={!canCapture}
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
