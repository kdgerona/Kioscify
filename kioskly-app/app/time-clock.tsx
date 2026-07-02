import { View, Text, TouchableOpacity, ActivityIndicator, ImageBackground } from "react-native";
import { useEffect, useRef, useState } from "react";
import { useRouter, Href } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import ViewShot from "react-native-view-shot";
import AppSafeAreaView from "../components/AppSafeAreaView";
import TimeClockCamera from "../components/TimeClockCamera";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";
import { getTimeLogStatus, submitTimeLog, TimeLogEventType } from "../services/timeLogService";
import { formatUserName } from "../utils/formatUserName";
import { formatDateTime } from "../utils/formatDateTime";
import { showSuccessToast, showErrorToast } from "../utils/toast";

// Composite pending capture — the resized photo plus everything needed to
// render the watermark overlay and, once ViewShot captures it, submit it.
interface PendingComposite {
  uri: string;
  width: number;
  height: number;
  latitude: number;
  longitude: number;
  timestamp: Date;
  eventType: TimeLogEventType;
}

export default function TimeClockScreen() {
  const router = useRouter();
  const { tenant, brand } = useTenant();
  const { user } = useAuth();

  const [nextEventType, setNextEventType] = useState<TimeLogEventType>("TIME_IN");
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [showCamera, setShowCamera] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState("");
  const [composite, setComposite] = useState<PendingComposite | null>(null);
  const [now, setNow] = useState(new Date());

  const viewShotRef = useRef<ViewShot>(null);

  // Live-ticking clock shown on the main screen before the camera opens.
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const primaryColor = brand?.themeColors?.primary ?? tenant?.themeColors?.primary ?? "#ea580c";
  const textColor = brand?.themeColors?.text ?? tenant?.themeColors?.text ?? "#1f2937";
  const backgroundColor = brand?.themeColors?.background ?? tenant?.themeColors?.background ?? "#ffffff";

  useEffect(() => {
    if (!tenant || !user) {
      router.replace("/");
    }
  }, [tenant, user, router]);

  // Load current clock-in/out state on mount so the primary button reflects
  // the correct next action ("Time In" vs "Time Out").
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatusLoading(true);
      setStatusError(null);
      try {
        const status = await getTimeLogStatus();
        if (cancelled) return;
        setNextEventType(status.lastEventType === "TIME_IN" ? "TIME_OUT" : "TIME_IN");
      } catch (err) {
        if (cancelled) return;
        setStatusError(err instanceof Error ? err.message : "Failed to load clock-in status");
      } finally {
        if (!cancelled) setStatusLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Once a composite is queued, wait a tick for the off-screen ViewShot view
  // to actually render/lay out, then capture the flattened watermark image
  // and upload it.
  useEffect(() => {
    if (!composite) return;
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        setProcessingStep("Uploading...");
        const captureUri = await viewShotRef.current?.capture?.();
        if (!captureUri) throw new Error("Failed to prepare the watermarked photo");

        const result = await submitTimeLog(
          composite.eventType,
          captureUri,
          composite.latitude,
          composite.longitude,
        );
        if (cancelled) return;

        setNextEventType(result.eventType === "TIME_IN" ? "TIME_OUT" : "TIME_IN");
        showSuccessToast(
          result.eventType === "TIME_IN" ? "Clocked in successfully." : "Clocked out successfully.",
        );
        setComposite(null);
        setProcessing(false);
        setProcessingStep("");

        setTimeout(() => {
          if (!cancelled) router.replace("/home" as Href);
        }, 1200);
      } catch (err) {
        if (cancelled) return;
        showErrorToast(err instanceof Error ? err.message : "Failed to submit time log");
        setComposite(null);
        setProcessing(false);
        setProcessingStep("");
      }
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composite]);

  const handleOpenCamera = () => {
    setShowCamera(true);
  };

  const handleCancelCamera = () => setShowCamera(false);

  const handleCapture = async (photoUri: string, latitude: number, longitude: number) => {
    setShowCamera(false);
    setProcessing(true);

    try {
      setProcessingStep("Preparing photo...");
      const resized = await manipulateAsync(photoUri, [{ resize: { width: 800 } }], {
        compress: 0.8,
        format: SaveFormat.JPEG,
      });

      // Triggers the effect above once rendered, which captures + uploads.
      setComposite({
        uri: resized.uri,
        width: resized.width,
        height: resized.height,
        latitude,
        longitude,
        timestamp: new Date(),
        eventType: nextEventType,
      });
    } catch (err) {
      setProcessing(false);
      setProcessingStep("");
      showErrorToast(err instanceof Error ? err.message : "Failed to capture photo");
    }
  };

  if (!tenant || !user) {
    return null;
  }

  if (showCamera) {
    return <TimeClockCamera onCapture={handleCapture} onCancel={handleCancelCamera} />;
  }

  return (
    <AppSafeAreaView className="w-full h-full bg-gray-50">
      {/* Header */}
      <View
        className="px-6 py-4 flex-row items-center"
        style={{ backgroundColor: backgroundColor }}
      >
        <TouchableOpacity onPress={() => router.back()} className="mr-4 p-2">
          <Ionicons name="arrow-back" size={24} color={textColor} />
        </TouchableOpacity>
        <Text className="text-2xl font-bold" style={{ color: textColor }}>
          Attendance
        </Text>
      </View>

      {/* Content */}
      <View className="flex-1 px-6 py-8 items-center justify-center">
        <Text className="text-gray-700 text-base font-semibold">{formatUserName(user)}</Text>
        <Text className="text-gray-400 text-xs mb-6">{tenant.name}</Text>

        <View className="items-center mb-8">
          <Text
            className="text-gray-900 text-6xl font-semibold"
            style={{ letterSpacing: -1 }}
          >
            {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
          </Text>
          <Text className="text-gray-500 text-sm font-medium mt-1">
            {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </Text>
        </View>

        {statusLoading ? (
          <ActivityIndicator size="large" color={primaryColor} />
        ) : (
          <>
            {statusError && (
              <View className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 w-full max-w-sm">
                <Text className="text-red-600 text-sm text-center">{statusError}</Text>
              </View>
            )}

            <TouchableOpacity
              className="w-40 h-40 rounded-full items-center justify-center"
              style={{ backgroundColor: primaryColor, opacity: processing ? 0.7 : 1 }}
              onPress={handleOpenCamera}
              disabled={processing || statusLoading}
            >
              {processing ? (
                <>
                  <ActivityIndicator color="#000000" />
                  <Text className="text-black text-xs font-semibold mt-2 px-2 text-center">
                    {processingStep}
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons
                    name={nextEventType === "TIME_IN" ? "log-in-outline" : "log-out-outline"}
                    size={36}
                    color="#000000"
                  />
                  <Text className="text-black text-lg font-bold mt-2">
                    {nextEventType === "TIME_IN" ? "Time In" : "Time Out"}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Off-screen watermark composite — rendered only so ViewShot can capture
          it as the single flattened upload image. Never shown to the user. */}
      {composite && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -9999,
            left: -9999,
            width: composite.width,
            height: composite.height,
          }}
        >
          <ViewShot
            ref={viewShotRef}
            options={{ format: "jpg", quality: 0.7 }}
            style={{ width: composite.width, height: composite.height }}
          >
            <ImageBackground
              source={{ uri: composite.uri }}
              style={{
                width: composite.width,
                height: composite.height,
                justifyContent: "flex-end",
              }}
            >
              <View style={{ backgroundColor: "rgba(0,0,0,0.55)", padding: 10 }}>
                <Text style={{ color: "#ffffff", fontSize: 14, fontWeight: "700" }}>
                  {formatDateTime(composite.timestamp)}
                </Text>
                <Text style={{ color: "#ffffff", fontSize: 13, marginTop: 2 }}>
                  {composite.latitude.toFixed(6)}, {composite.longitude.toFixed(6)}
                </Text>
              </View>
            </ImageBackground>
          </ViewShot>
        </View>
      )}
    </AppSafeAreaView>
  );
}
