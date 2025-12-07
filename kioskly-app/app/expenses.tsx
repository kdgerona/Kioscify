import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect } from "react";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  createExpense,
  getExpenses,
  ExpenseResponse,
  CreateExpensePayload,
  ExpenseCategory,
} from "@/services/expenseService";
import ExpenseModal from "@/components/ExpenseModal";
import "@/global.css";

export default function ExpensesScreen() {
  const [expenses, setExpenses] = useState<ExpenseResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { tenant } = useTenant();
  const { user } = useAuth();
  const primaryColor = tenant?.themeColors?.primary || "#ea580c";
  const textColor = tenant?.themeColors?.text || "#1f2937";
  const backgroundColor = tenant?.themeColors?.background || "#ffffff";

  useEffect(() => {
    if (!tenant || !user) {
      router.replace("/");
      return;
    }
    loadExpenses();
  }, [tenant, user, router]);

  const getTodayDateRange = () => {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

    return {
      startDate: startOfDay.toISOString(),
      endDate: endOfDay.toISOString(),
    };
  };

  const loadExpenses = async () => {
    try {
      setError(null);
      const { startDate, endDate } = getTodayDateRange();
      const data = await getExpenses({ startDate, endDate });
      setExpenses(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load expenses");
      console.error("Error loading expenses:", err);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadExpenses();
    setRefreshing(false);
  };

  if (!tenant || !user) {
    return null;
  }

  const handleAddExpense = async (expenseData: CreateExpensePayload) => {
    try {
      setIsSubmitting(true);
      await createExpense(expenseData);
      setIsModalVisible(false);
      await loadExpenses(); // Reload the list
    } catch (err) {
      throw err; // Let the modal handle the error display
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatCurrency = (amount: number) => {
    return `₱${amount.toFixed(2)}`;
  };

  const getCategoryLabel = (category: ExpenseCategory) => {
    return category
      .split("_")
      .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
      .join(" ");
  };

  return (
    <SafeAreaView className="w-full h-full bg-gray-50">
      {/* Header */}
      <View
        className="px-6 py-4 flex-row justify-between items-center"
        style={{ backgroundColor: backgroundColor }}
      >
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => router.back()}
            className="mr-4 p-2"
          >
            <Ionicons name="arrow-back" size={24} color={textColor} />
          </TouchableOpacity>
          <Text className="text-2xl font-bold" style={{ color: textColor }}>
            Expenses
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setIsModalVisible(true)}
          className="bg-gray-800 px-4 py-2 rounded-lg flex-row items-center gap-1"
        >
          <Ionicons name="add-circle-outline" size={20} color="white" />
          <Text className="text-white font-semibold">Add</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View className="flex-1 px-4 py-4">
        {loading ? (
          <View className="flex-1 justify-center items-center">
            <ActivityIndicator size="large" color={primaryColor} />
            <Text className="mt-4 text-gray-600">Loading expenses...</Text>
          </View>
        ) : error ? (
          <View className="flex-1 justify-center items-center">
            <Text className="text-red-600 text-center mb-4">{error}</Text>
            <TouchableOpacity
              className="bg-gray-800 rounded-lg px-6 py-3"
              onPress={loadExpenses}
            >
              <Text className="text-white font-semibold">Retry</Text>
            </TouchableOpacity>
          </View>
        ) : expenses.length === 0 ? (
          <View className="flex-1 justify-center items-center px-6">
            <Text className="text-gray-600 text-center text-lg font-semibold">
              No expenses recorded yet
            </Text>
            <Text className="text-gray-500 text-center mt-2">
              Expenses from today will appear here
            </Text>
          </View>
        ) : (
          <ScrollView
            className="flex-1"
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          >
            {expenses.map((expense, index) => (
              <View key={expense.id}>
              <View
                className="bg-white rounded-lg p-4 shadow-sm border border-gray-200"
              >
                {/* Expense Header */}
                <View className="flex-row justify-between items-start mb-3">
                  <View className="flex-1">
                    <Text className="text-lg font-bold" style={{ color: textColor }}>
                      {expense.description}
                    </Text>
                    <Text className="text-sm text-gray-600 mt-1">
                      {formatDate(expense.date)}
                    </Text>
                    <Text className="text-sm text-gray-600">
                      Added by: {expense.user.username}
                    </Text>
                  </View>
                  <View className="items-end">
                    <Text className="text-xl font-bold" style={{ color: textColor }}>
                      {formatCurrency(expense.amount)}
                    </Text>
                    <View
                      className="px-3 py-1 rounded-full mt-1"
                      style={{
                        backgroundColor: primaryColor,
                      }}
                    >
                      <Text className="text-xs font-semibold" style={{ color: textColor }}>
                        {getCategoryLabel(expense.category)}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Notes */}
                {expense.notes && (
                  <View className="border-t border-gray-200 pt-3">
                    <Text className="text-sm font-semibold text-gray-700 mb-2">
                      Notes:
                    </Text>
                    <View className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                      <Text className="text-sm" style={{ color: textColor }}>
                        {expense.notes}
                      </Text>
                    </View>
                  </View>
                )}
              </View>

              {/* Black Dashed Divider */}
              {index < expenses.length - 1 && (
                <View className="border-b border-dashed border-black my-3" />
              )}
            </View>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Add Expense Modal */}
      <ExpenseModal
        visible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        onSubmit={handleAddExpense}
        isLoading={isSubmitting}
      />
    </SafeAreaView>
  );
}
