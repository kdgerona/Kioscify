import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  Image,
  Animated,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, Href } from "expo-router";
import { useState, useEffect, useRef } from "react";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";
import { apiGet } from "../utils/api";
import CheckoutModal from "../components/CheckoutModal";
import TransactionSummary from "../components/TransactionSummary";
import { createTransaction } from "../services/transactionService";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { Ionicons } from "@expo/vector-icons";

type Size = {
  id: string;
  name: string;
  priceModifier: number;
  volume?: string;
};

type Addon = {
  id: string;
  name: string;
  price: number;
};

type Product = {
  id: string;
  name: string;
  price: number;
  categoryId: string;
  image?: string;
  sizes?: Size[];
  addons?: Addon[];
};

type Category = {
  id: string;
  name: string;
  sequenceNo: number;
};

type OrderItem = {
  id: string;
  product: Product;
  quantity: number;
  selectedSize?: Size;
  selectedAddons: Addon[];
};

type PaymentMethodType = "cash" | "card" | "gcash" | "paymaya" | "online";

type TransactionData = {
  transactionId: string;
  timestamp: Date;
  items: OrderItem[];
  subtotal: number;
  total: number;
  paymentMethod: PaymentMethodType;
  cashReceived?: number;
  change?: number;
  referenceNumber?: string;
};

const generateTransactionId = (): string => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `TXN${timestamp}${random}`;
};

export default function Home() {
  const router = useRouter();
  const { tenant } = useTenant();
  const { user, logout } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [showCustomizeModal, setShowCustomizeModal] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showTransactionSummary, setShowTransactionSummary] = useState(false);
  const [currentTransaction, setCurrentTransaction] =
    useState<TransactionData | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedSize, setSelectedSize] = useState<Size | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<Addon[]>([]);
  const [isCreatingTransaction, setIsCreatingTransaction] = useState(false);
  const [transactionError, setTransactionError] = useState<string | null>(null);

  // Fetch categories and products from API
  useEffect(() => {
    const fetchData = async () => {
      if (!tenant) return;
      
      setIsLoadingData(true);
      try {
        // Fetch categories
        const categoriesResponse = await apiGet("/categories");
        if (categoriesResponse.ok) {
          const categoriesData: Category[] = await categoriesResponse.json();
          setCategories(categoriesData);
          if (categoriesData.length > 0 && !selectedCategory) {
            setSelectedCategory(categoriesData[0].id);
          }
        }

        // Fetch products
        const productsResponse = await apiGet("/products");
        if (productsResponse.ok) {
          const productsData = await productsResponse.json();
          setProducts(productsData);
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setIsLoadingData(false);
      }
    };

    fetchData();
  }, [tenant]);

  useEffect(() => {
    // If no tenant is set, redirect to tenant setup
    // Use setTimeout to ensure router is mounted
    if (!tenant) {
      const timer = setTimeout(() => {
        router.replace("/tenant-setup" as Href);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [tenant, router]);

  useEffect(() => {
    // If user is not authenticated, redirect to login
    // Use setTimeout to ensure router is mounted
    if (!user) {
      const timer = setTimeout(() => {
        router.replace("/");
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [user, router]);

  const handleLogout = async () => {
    await logout();
    router.replace("/");
  };

  if (!tenant || !user) {
    return null; // Will redirect to login or tenant-setup
  }

  const primaryColor = tenant.themeColors?.primary || "#ea580c";
  const textColor = tenant.themeColors?.text || "#1f2937";
  const logoUri = tenant.logoUrl || null;
  const backgroundColor = tenant.themeColors?.background || "#ffffff";

  const openCustomizeModal = (product: Product) => {
    setSelectedProduct(product);
    setSelectedSize(product.sizes ? product.sizes[0] : null);
    setSelectedAddons([]);
    setShowCustomizeModal(true);
  };

  const closeCustomizeModal = () => {
    setShowCustomizeModal(false);
    setSelectedProduct(null);
    setSelectedSize(null);
    setSelectedAddons([]);
  };

  const toggleAddon = (addon: Addon) => {
    if (selectedAddons.find((a) => a.id === addon.id)) {
      setSelectedAddons(selectedAddons.filter((a) => a.id !== addon.id));
    } else {
      setSelectedAddons([...selectedAddons, addon]);
    }
  };

  const addToOrder = () => {
    if (!selectedProduct) return;

    const newItem: OrderItem = {
      id: Date.now().toString(),
      product: selectedProduct,
      quantity: 1,
      selectedSize: selectedSize || undefined,
      selectedAddons: [...selectedAddons],
    };

    setOrders([...orders, newItem]);
    closeCustomizeModal();
  };

  const removeFromOrder = (orderId: string) => {
    setOrders(orders.filter((item) => item.id !== orderId));
  };

  const updateQuantity = (orderId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromOrder(orderId);
    } else {
      setOrders(
        orders.map((item) =>
          item.id === orderId ? { ...item, quantity: newQuantity } : item
        )
      );
    }
  };

  const filteredProducts = products.filter(
    (p) => p.categoryId === selectedCategory
  );

  const calculateItemPrice = (item: OrderItem): number => {
    let price = item.product.price;
    if (item.selectedSize) {
      price += item.selectedSize.priceModifier;
    }
    item.selectedAddons.forEach((addon) => {
      price += addon.price;
    });
    return price;
  };

  const totalAmount = orders.reduce(
    (sum, item) => sum + calculateItemPrice(item) * item.quantity,
    0
  );

  const getCurrentCustomizationPrice = (): number => {
    if (!selectedProduct) return 0;
    let price = selectedProduct.price;
    if (selectedSize) {
      price += selectedSize.priceModifier;
    }
    selectedAddons.forEach((addon) => {
      price += addon.price;
    });
    return price;
  };

  const getCategoryName = (categoryId: string): string => {
    const category = categories.find((c) => c.id === categoryId);
    return category ? category.name : "";
  };

  // Swipeable Order Item Component
  const SwipeableOrderItem = ({
    item,
    onRemove,
    onUpdateQuantity,
  }: {
    item: OrderItem;
    onRemove: (id: string) => void;
    onUpdateQuantity: (id: string, quantity: number) => void;
  }) => {
    const swipeableRef = useRef<Swipeable>(null);

    const renderRightActions = (
      progress: Animated.AnimatedInterpolation<number>,
      dragX: Animated.AnimatedInterpolation<number>
    ) => {
      const opacity = dragX.interpolate({
        inputRange: [-70, 0],
        outputRange: [1, 0],
        extrapolate: "clamp",
      });

      return (
        <Animated.View
          style={{
            width: 70,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "#ef4444",
            borderTopRightRadius: 8,
            borderBottomRightRadius: 8,
            opacity,
          }}
        >
          <TouchableOpacity
            className="w-full h-full justify-center items-center"
            onPress={() => {
              swipeableRef.current?.close();
              onRemove(item.id);
            }}
          >
            <Text className="text-white font-bold text-lg">×</Text>
            <Text className="text-white text-xs mt-1">Delete</Text>
          </TouchableOpacity>
        </Animated.View>
      );
    };

    return (
      <Swipeable
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        rightThreshold={40}
        overshootRight={false}
        containerStyle={{
          marginBottom: 8,
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            backgroundColor: `${primaryColor}10`,
            borderWidth: 2,
            borderColor: primaryColor,
            borderRadius: 8,
            padding: 12,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          {/* Left side - Order details */}
          <View className="flex-1 mr-4">
            <Text className="font-semibold" style={{ color: textColor }}>
              {item.product.name}
            </Text>
            <Text className="text-xs font-medium" style={{ color: textColor }}>
              {getCategoryName(item.product.categoryId)}
            </Text>
            {item.selectedSize && (
              <Text className="text-xs" style={{ color: `${textColor}80` }}>
                {item.selectedSize.name}
              </Text>
            )}
            {item.selectedAddons.length > 0 && (
              <Text className="text-xs" style={{ color: `${textColor}80` }}>
                +{item.selectedAddons.map((a) => a.name).join(", ")}
              </Text>
            )}
            <Text className="font-semibold mt-1" style={{ color: textColor }}>
              ₱{calculateItemPrice(item).toFixed(2)}
            </Text>
          </View>

          {/* Right side - Quantity controls */}
          <View className="flex-row items-center">
            <TouchableOpacity
              className="w-10 h-10 rounded justify-center items-center"
              style={{ backgroundColor: `${primaryColor}30` }}
              onPress={() => onUpdateQuantity(item.id, item.quantity - 1)}
            >
              <Text className="font-bold text-lg" style={{ color: textColor }}>
                -
              </Text>
            </TouchableOpacity>
            <Text
              className="mx-4 font-semibold text-lg"
              style={{ color: textColor }}
            >
              {item.quantity}
            </Text>
            <TouchableOpacity
              className="w-10 h-10 rounded justify-center items-center"
              style={{ backgroundColor: `${primaryColor}30` }}
              onPress={() => onUpdateQuantity(item.id, item.quantity + 1)}
            >
              <Text className="font-bold text-lg" style={{ color: textColor }}>
                +
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Swipeable>
    );
  };

  const handleCheckout = () => {
    if (orders.length === 0) {
      return;
    }
    setShowCheckoutModal(true);
  };

  const handleCheckoutComplete = async (
    paymentMethod: PaymentMethodType | null,
    details: any
  ) => {
    if (!paymentMethod) return;

    setIsCreatingTransaction(true);
    setTransactionError(null);

    try {
      const transactionId = generateTransactionId();

      // Map frontend OrderItems to backend TransactionItems format
      const backendItems = orders.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
        sizeId: item.selectedSize?.id,
        subtotal: calculateItemPrice(item) * item.quantity,
        addons: item.selectedAddons.map((addon) => ({
          addonId: addon.id,
        })),
      }));

      // Create transaction payload for backend
      const transactionPayload = {
        transactionId,
        subtotal: totalAmount,
        total: totalAmount,
        paymentMethod: paymentMethod.toUpperCase() as "CASH" | "CARD" | "GCASH" | "PAYMAYA" | "ONLINE",
        ...(paymentMethod === "cash" && {
          cashReceived: details.cashReceived,
          change: details.change,
        }),
        ...(paymentMethod !== "cash" && {
          referenceNumber: details.referenceNumber,
        }),
        ...(details.remarks && {
          remarks: details.remarks,
        }),
        items: backendItems,
      };

      // Save transaction to backend
      const savedTransaction = await createTransaction(transactionPayload);

      console.log("🟢 Transaction saved to backend:", savedTransaction);

      // Create transaction data for local display
      const transaction: TransactionData = {
        transactionId,
        timestamp: new Date(),
        items: [...orders],
        subtotal: totalAmount,
        total: totalAmount,
        paymentMethod,
        ...(paymentMethod === "cash" && {
          cashReceived: details.cashReceived,
          change: details.change,
        }),
        ...(paymentMethod !== "cash" && {
          referenceNumber: details.referenceNumber,
        }),
      };

      setCurrentTransaction(transaction);
      setShowCheckoutModal(false);
      setShowTransactionSummary(true);
      setTransactionError(null); // Clear any previous errors
    } catch (error) {
      console.error("Failed to create transaction:", error);
      setTransactionError(
        error instanceof Error
          ? error.message
          : "Failed to create transaction. Please try again."
      );
      // Keep checkout modal open so user can retry
    } finally {
      setIsCreatingTransaction(false);
    }
  };

  const handleNewOrder = () => {
    setShowTransactionSummary(false);
    setCurrentTransaction(null);
    setOrders([]);
  };

  return (
    <SafeAreaView className="w-full h-full bg-gray-50">
      {/* Header */}
      <View
        className="px-6 py-4 flex-row justify-between items-center"
        style={{ backgroundColor: backgroundColor }}
      >
        <View className="flex-row items-center">
          {logoUri && (
            <Image
              source={{ uri: logoUri }}
              className="w-10 h-10 mr-3 border-2 border-white rounded-full p-6"
              resizeMode="contain"
            />
          )}
          <Text className="text-2xl font-bold" style={{ color: textColor }}>
            {tenant.name}
          </Text>
        </View>
        <View className="flex-row gap-6">
          <TouchableOpacity
            className="rounded-lg p-2"
            style={{ backgroundColor: primaryColor }}
            onPress={() => router.push("/transactions" as Href)}
          >
            <Ionicons name="receipt-outline" size={24} color={textColor} />
          </TouchableOpacity>
          <TouchableOpacity
            className="rounded-lg p-2"
            style={{ backgroundColor: primaryColor }}
            onPress={() => router.push("/expenses" as Href)}
          >
            <Ionicons name="wallet-outline" size={24} color={textColor} />
          </TouchableOpacity>
          <View className="w-px bg-black self-stretch mx-2" />
          <TouchableOpacity
            className="rounded-lg p-2"
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={24} color={textColor} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content */}
      <View className="flex-1 flex-row">
        {/* Category Panel */}
        <View className="w-1/5 bg-white border-r border-gray-200 p-4">
          <Text className="text-lg font-bold mb-4" style={{ color: textColor }}>
            Categories
          </Text>
          <ScrollView>
            {categories.map((category) => (
              <TouchableOpacity
                key={category.id}
                className="p-3 rounded-lg mb-2"
                style={{
                  backgroundColor:
                    selectedCategory === category.id ? primaryColor : "#f3f4f6",
                }}
                onPress={() => setSelectedCategory(category.id)}
              >
                <Text
                  className="font-semibold"
                  style={{
                    color:
                      selectedCategory === category.id ? "black" : textColor,
                  }}
                >
                  {category.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Products Panel */}
        <View className={orders.length > 0 ? "w-2/5 p-4" : "flex-1 p-4"}>
          <Text className="text-lg font-bold mb-4" style={{ color: textColor }}>
            Products
          </Text>
          {isLoadingData ? (
            <View className="flex-1 justify-center items-center">
              <ActivityIndicator size="large" color={primaryColor} />
              <Text className="mt-2 text-gray-500">Loading products...</Text>
            </View>
          ) : (
          <ScrollView>
            <View className="flex-row flex-wrap">
              {filteredProducts.map((product) => {
                // Use image URL directly from API (already transformed to absolute URL)
                const imageUri = product.image || null;
                return (
                  <TouchableOpacity
                    key={product.id}
                    className={orders.length > 0 ? "w-1/2 p-2" : "w-1/3 p-2"}
                    onPress={() => openCustomizeModal(product)}
                  >
                    <View className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 h-64">
                      <View className="h-40 mb-3 justify-center items-center bg-gray-100 rounded-lg overflow-hidden">
                        {imageUri ? (
                          <Image
                            source={{ uri: imageUri }}
                            className="w-full h-full"
                            resizeMode="contain"
                          />
                        ) : (
                          <Text className="text-gray-500 text-xs">No Image</Text>
                        )}
                      </View>
                      <View className="flex-1">
                        <View className="flex flex-row justify-between">
                          <Text
                            className="font-semibold text-base flex-1 mr-2"
                            style={{ color: textColor }}
                            numberOfLines={1}
                          >
                            {product.name}
                          </Text>
                          <Text className="font-bold" style={{ color: textColor }}>
                            ₱{product.price.toFixed(2)}
                          </Text>
                        </View>
                        <Text
                          className="text-xs font-medium"
                          style={{ color: textColor }}
                          numberOfLines={1}
                        >
                          {getCategoryName(product.categoryId)}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
          )}
        </View>

        {/* Orders Panel - Only shows if there are orders */}
        {orders.length > 0 && (
          <View className="w-2/5 bg-white border-l border-gray-200 p-4">
            <Text
              className="text-lg font-bold mb-4"
              style={{ color: textColor }}
            >
              Orders
            </Text>
            <ScrollView className="flex-1">
              {orders.map((item) => (
                <SwipeableOrderItem
                  key={item.id}
                  item={item}
                  onRemove={removeFromOrder}
                  onUpdateQuantity={updateQuantity}
                />
              ))}
            </ScrollView>

            {/* Total and Checkout */}
            <View className="border-t border-gray-200 pt-4 mt-4">
              <View className="flex-row justify-between mb-4">
                <Text
                  className="text-xl font-bold"
                  style={{ color: textColor }}
                >
                  Total:
                </Text>
                <Text
                  className="text-xl font-bold"
                  style={{ color: textColor }}
                >
                  ₱{totalAmount.toFixed(2)}
                </Text>
              </View>
              <TouchableOpacity
                className="rounded-lg py-3 items-center"
                style={{ backgroundColor: primaryColor }}
                onPress={handleCheckout}
              >
                <Text
                  className="text-lg font-bold"
                  style={{ color: textColor }}
                >
                  Checkout
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Customize Product Modal */}
      <Modal
        visible={showCustomizeModal}
        transparent
        animationType="slide"
        onRequestClose={closeCustomizeModal}
      >
        <View className="flex-1 bg-black/50 justify-center items-center">
          <View className="bg-white rounded-lg w-11/12 max-w-lg max-h-5/6">
            {/* Modal Header */}
            <View
              className="px-6 py-4 rounded-t-lg flex-row justify-between items-center"
              style={{ backgroundColor: primaryColor }}
            >
              <Text className="text-xl font-bold" style={{ color: textColor }}>
                {selectedProduct?.name}
              </Text>
              <TouchableOpacity
                onPress={closeCustomizeModal}
                className="w-11 h-11 items-center justify-center rounded-full"
                style={{ backgroundColor: `${textColor}15` }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text
                  className="text-3xl font-bold leading-none"
                  style={{ color: textColor }}
                >
                  ×
                </Text>
              </TouchableOpacity>
            </View>

            <ScrollView className="px-6 py-4">
              <View className="flex flex-row justify-between">
                <Text
                  className="text-lg font-bold mb-3"
                  style={{ color: textColor }}
                >
                  Category:{" "}
                  <Text className="font-normal" style={{ color: textColor }}>
                    {getCategoryName(selectedProduct?.categoryId || "")}
                  </Text>
                </Text>
              </View>

              {/* Sizes Section */}
              {selectedProduct?.sizes && selectedProduct.sizes.length > 0 && (
                <View className="mb-6">
                  <Text
                    className="text-lg font-bold mb-3"
                    style={{ color: textColor }}
                  >
                    Choose Size
                  </Text>
                  {selectedProduct.sizes.map((size) => (
                    <TouchableOpacity
                      key={size.id}
                      className="p-4 rounded-lg mb-2 flex-row justify-between items-center"
                      style={{
                        backgroundColor:
                          selectedSize?.id === size.id
                            ? `${primaryColor}15`
                            : "#f3f4f6",
                        borderWidth: selectedSize?.id === size.id ? 2 : 0,
                        borderColor:
                          selectedSize?.id === size.id
                            ? primaryColor
                            : "transparent",
                      }}
                      onPress={() => setSelectedSize(size)}
                    >
                      <Text
                        className="font-semibold"
                        style={{
                          color: textColor,
                        }}
                      >
                        {size.name}
                      </Text>
                      <View className="items-end">
                        <Text
                          className="font-semibold"
                          style={{
                            color: textColor,
                          }}
                        >
                          {size.priceModifier > 0
                            ? `+₱${size.priceModifier.toFixed(2)}`
                            : "Base"}
                        </Text>
                        {size.volume && (
                          <Text
                            className="text-xs"
                            style={{ color: `${textColor}80` }}
                          >
                            {size.volume}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Addons Section */}
              {selectedProduct?.addons && selectedProduct.addons.length > 0 && (
                <View className="mb-6">
                  <Text
                    className="text-lg font-bold mb-3"
                    style={{ color: textColor }}
                  >
                    Add-ons (Optional)
                  </Text>
                  {selectedProduct.addons.map((addon) => {
                    const isSelected = selectedAddons.find(
                      (a) => a.id === addon.id
                    );
                    return (
                      <TouchableOpacity
                        key={addon.id}
                        className="p-4 rounded-lg mb-2 flex-row justify-between items-center"
                        style={{
                          backgroundColor: isSelected
                            ? `${primaryColor}15`
                            : "#f3f4f6",
                          borderWidth: isSelected ? 2 : 0,
                          borderColor: isSelected
                            ? primaryColor
                            : "transparent",
                        }}
                        onPress={() => toggleAddon(addon)}
                      >
                        <Text
                          className="font-semibold"
                          style={{
                            color: textColor,
                          }}
                        >
                          {addon.name}
                        </Text>
                        <Text
                          className="font-semibold"
                          style={{
                            color: `${textColor}B3`,
                          }}
                        >
                          +₱{addon.price.toFixed(2)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </ScrollView>

            {/* Modal Footer */}
            <View className="px-6 py-4 border-t border-gray-200">
              <View className="flex-row justify-between items-center mb-4">
                <Text
                  className="text-lg font-bold"
                  style={{ color: textColor }}
                >
                  Total:
                </Text>
                <Text
                  className="text-xl font-bold"
                  style={{ color: textColor }}
                >
                  ₱{getCurrentCustomizationPrice().toFixed(2)}
                </Text>
              </View>
              <TouchableOpacity
                className="rounded-lg py-3 items-center"
                style={{ backgroundColor: primaryColor }}
                onPress={addToOrder}
              >
                <Text
                  className="text-lg font-bold"
                  style={{ color: textColor }}
                >
                  Add to Order
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Checkout Modal */}
      <CheckoutModal
        visible={showCheckoutModal}
        totalAmount={totalAmount}
        onClose={() => {
          setShowCheckoutModal(false);
          setTransactionError(null);
        }}
        onCheckoutComplete={handleCheckoutComplete}
        isLoading={isCreatingTransaction}
        error={transactionError}
      />

      {/* Transaction Summary Modal */}
      <TransactionSummary
        visible={showTransactionSummary}
        transaction={currentTransaction}
        onNewOrder={handleNewOrder}
      />
    </SafeAreaView>
  );
}
