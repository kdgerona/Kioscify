import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface LastSubmissionBannerProps {
  lastSubmission: {
    date: string;
    submittedAt: string;
  } | null;
  isLoading: boolean;
  primaryColor?: string;
  textColor?: string;
}

export default function LastSubmissionBanner({
  lastSubmission,
  isLoading,
  primaryColor = "#ea580c",
  textColor = "#1f2937",
}: LastSubmissionBannerProps) {
  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    const dateOptions: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
      year: "numeric",
    };
    const timeOptions: Intl.DateTimeFormatOptions = {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    };

    const formattedDate = date.toLocaleDateString("en-US", dateOptions);
    const formattedTime = date.toLocaleTimeString("en-US", timeOptions);

    return `${formattedDate} at ${formattedTime}`;
  };

  if (isLoading) {
    return (
      <View className="bg-gray-100 border-2 border-gray-300 rounded-lg p-4 mb-4">
        <View className="flex-row items-center">
          <Ionicons name="time-outline" size={20} color="#6b7280" />
          <Text className="ml-2 text-gray-600">Loading submission info...</Text>
        </View>
      </View>
    );
  }

  if (!lastSubmission) {
    return (
      <View className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4 mb-4">
        <View className="flex-row items-center">
          <Ionicons name="alert-circle-outline" size={20} color="#f59e0b" />
          <Text className="ml-2 text-yellow-800 font-semibold">
            No reports submitted yet
          </Text>
        </View>
        <Text className="text-sm text-yellow-700 mt-1 ml-7">
          This will be the first report submission
        </Text>
      </View>
    );
  }

  return (
    <View
      className="border-2 rounded-lg p-4 mb-4"
      style={{
        backgroundColor: `${primaryColor}15`,
        borderColor: primaryColor,
      }}
    >
      <View className="flex-row items-start">
        <Ionicons name="checkmark-circle" size={20} color={primaryColor} />
        <View className="flex-1 ml-2">
          <Text className="text-sm font-semibold" style={{ color: textColor }}>
            Last Submission
          </Text>
          <Text className="text-base font-bold mt-1" style={{ color: textColor }}>
            {formatDateTime(lastSubmission.submittedAt)}
          </Text>
          <Text className="text-xs text-gray-600 mt-1">
            Report Date: {lastSubmission.date}
          </Text>
        </View>
      </View>
    </View>
  );
}
