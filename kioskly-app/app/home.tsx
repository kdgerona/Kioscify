import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  Image,
  Animated,
  ActivityIndicator,
  Alert,
} from "react-native";
import AppSafeAreaView from "../components/AppSafeAreaView";
import { useRouter, Href } from "expo-router";
import { useState, useEffect, useRef } from "react";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";
import { apiGet } from "../utils/api";
import CheckoutModal from "../components/CheckoutModal";
import TransactionSummary from "../components/TransactionSummary";
import ItemDiscountModal from "../components/ItemDiscountModal";
import { createTransactionOffline } from "../services/transactionService";
import { cacheCategories, getCachedCategories, cacheProducts, getCachedProducts } from "../lib/localCache";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { Ionicons } from "@expo/vector-icons";
import { useDeviceType } from "../hooks/useDeviceType";
import { ItemDiscount } from "../utils/discount";

type Size = {
  id: string;
  name: string;
  priceModifier: number;
  foodpandaPrice?: number | null;
  grabPrice?: number | null;
  volume?: string;
};

type Addon = {
  id: string;
  name: string;
  price: number;
  foodpandaPrice?: number | null;
  grabPrice?: number | null;
};

type Preference = {
  id: string;
  name: string;
  isDefault?: boolean;
  sequenceNo?: number;
};

type Product = {
  id: string;
  name: string;
  price: number;
  foodpandaPrice?: number | null;
  grabPrice?: number | null;
  categoryId: string;
  image?: string;
  sizes?: Size[];
  addons?: Addon[];
  preferences?: Preference[];
};

type OrderType = 'regular' | 'foodpanda' | 'grab';

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
  selectedPreference?: Preference;
  itemDiscount?: ItemDiscount;
};

type PaymentMethodType =
  | "cash"
  | "gcash"
  | "paymaya"
  | "online"
  | "foodpanda"
  | "grab";

type TransactionData = {
  transactionId: string;
  timestamp: Date;
  items: OrderItem[];
  subtotal: number;
  total: number;
  discountAmount?: number;
  paymentMethod: PaymentMethodType;
  cashReceived?: number;
  change?: number;
  referenceNumber?: string;
};

const HEADER_MENU_WIDTH = 280;

const generateTransactionId = (): string => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `TXN${timestamp}${random}`;
};

export default function Home() {
  const router = useRouter();
  const { tenant, brand } = useTenant();
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
  const [selectedPreference, setSelectedPreference] = useState<Preference | null>(null);
  const [isCreatingTransaction, setIsCreatingTransaction] = useState(false);
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [showQueuedConfirm, setShowQueuedConfirm] = useState(false);
  const [orderType, setOrderType] = useState<OrderType>('regular');
  const deviceType = useDeviceType();
  const isPhone = deviceType === 'phone';
  const [phoneActiveTab, setPhoneActiveTab] = useState<'menu' | 'cart'>('menu');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const headerMenuAnim = useRef(new Animated.Value(HEADER_MENU_WIDTH)).current;
  const [discountItemId, setDiscountItemId] = useState<string | null>(null);

  // Fetch categories and products from API, fall back to local cache when offline
  useEffect(() => {
    const fetchData = async () => {
      if (!tenant) return;
      setIsLoadingData(true);
      try {
        const [categoriesResponse, productsResponse] = await Promise.all([
          apiGet("/categories"),
          apiGet("/products"),
        ]);
        const categoriesData: Category[] = categoriesResponse.ok ? await categoriesResponse.json() : [];
        const productsData: Product[] = productsResponse.ok ? await productsResponse.json() : [];
        if (categoriesData.length > 0) {
          await cacheCategories(categoriesData);
          setCategories(categoriesData);
          if (!selectedCategory) setSelectedCategory(categoriesData[0].id);
        }
        if (productsData.length > 0) {
          await cacheProducts(productsData);
          setProducts(productsData);
        }
      } catch {
        // Network failure — load from local cache
        const [cachedCats, cachedProds] = await Promise.all([
          getCachedCategories(),
          getCachedProducts(),
        ]);
        if (cachedCats && cachedProds) {
          setCategories(cachedCats);
          if (!selectedCategory && cachedCats.length > 0) setSelectedCategory(cachedCats[0].id);
          setProducts(cachedProds);
        }
      } finally {
        setIsLoadingData(false);
      }
    };
    fetchData();
  }, [tenant]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const closeHeaderMenu = () => {
    Animated.timing(headerMenuAnim, {
      toValue: HEADER_MENU_WIDTH,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setShowHeaderMenu(false));
  };

  if (!tenant || !user) {
    return null; // Will redirect to login or tenant-setup
  }

  // Brand theme takes priority over store theme
  const primaryColor =
    brand?.themeColors?.primary ?? tenant.themeColors?.primary ?? "#ea580c";
  const textColor =
    brand?.themeColors?.text ?? tenant.themeColors?.text ?? "#1f2937";
  const backgroundColor =
    brand?.themeColors?.background ??
    tenant.themeColors?.background ??
    "#ffffff";

  const enabledPlatforms = tenant?.enabledDeliveryPlatforms ?? [];
  const hasFoodPanda = enabledPlatforms.includes('FOODPANDA');
  const hasGrab = enabledPlatforms.includes('GRAB');
  const showOrderTypeSelector = hasFoodPanda || hasGrab;

  // Resolve logo/image URLs against the storage origin — strips any mismatched host from
  // server-formatted URLs (e.g. kioscify.localhost, unreachable from emulators/devices)
  const apiBase =
    process.env.EXPO_PUBLIC_STORAGE_URL ||
    process.env.EXPO_PUBLIC_API_URL?.replace("/api/v1", "") ||
    "http://localhost:3000";
  const resolveLogoUrl = (raw: string | null | undefined): string | null => {
    if (!raw) return null;
    try {
      const path = raw.startsWith("http") ? new URL(raw).pathname : raw;
      return `${apiBase}${path}`;
    } catch {
      return raw;
    }
  };
  const logoUri = resolveLogoUrl(brand?.logoUrl ?? tenant?.logoUrl ?? null);

  const openCustomizeModal = (product: Product) => {
    setSelectedProduct(product);
    setSelectedSize(product.sizes ? product.sizes[0] : null);
    setSelectedAddons([]);
    setSelectedPreference(product.preferences?.find(p => p.isDefault) ?? null);
    setShowCustomizeModal(true);
  };

  const closeCustomizeModal = () => {
    setShowCustomizeModal(false);
    setSelectedProduct(null);
    setSelectedSize(null);
    setSelectedAddons([]);
    setSelectedPreference(null);
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
      selectedPreference: selectedPreference || undefined,
    };

    setOrders([...orders, newItem]);
    closeCustomizeModal();
  };

  const removeFromOrder = (orderId: string) => {
    setOrders(orders.filter((item) => item.id !== orderId));
  };

  const setItemDiscount = (orderId: string, discount: ItemDiscount | undefined) => {
    setOrders(
      orders.map((item) =>
        item.id === orderId ? { ...item, itemDiscount: discount } : item,
      ),
    );
  };

  const updateQuantity = (orderId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromOrder(orderId);
    } else {
      setOrders(
        orders.map((item) =>
          item.id === orderId ? { ...item, quantity: newQuantity } : item,
        ),
      );
    }
  };

  const filteredProducts = products.filter(
    (p) => p.categoryId === selectedCategory,
  );

  const getEffectiveProductPrice = (product: Product): number => {
    if (orderType === 'foodpanda' && product.foodpandaPrice != null) return product.foodpandaPrice;
    if (orderType === 'grab' && product.grabPrice != null) return product.grabPrice;
    return product.price;
  };

  const getEffectiveAddonPrice = (addon: Addon): number => {
    if (orderType === 'foodpanda' && addon.foodpandaPrice != null) return addon.foodpandaPrice;
    if (orderType === 'grab' && addon.grabPrice != null) return addon.grabPrice;
    return addon.price;
  };

  const getEffectiveSizeModifier = (size: Size): number => {
    if (orderType === 'foodpanda' && size.foodpandaPrice != null) return size.foodpandaPrice;
    if (orderType === 'grab' && size.grabPrice != null) return size.grabPrice;
    return size.priceModifier;
  };

  const calculateItemPrice = (item: OrderItem): number => {
    let price = getEffectiveProductPrice(item.product);
    if (item.selectedSize) {
      price += getEffectiveSizeModifier(item.selectedSize);
    }
    item.selectedAddons.forEach((addon) => {
      price += getEffectiveAddonPrice(addon);
    });
    return price;
  };

  const calculateItemLineTotal = (item: OrderItem): number =>
    calculateItemPrice(item) * item.quantity - (item.itemDiscount?.amount ?? 0);

  const grossOrderTotal = orders.reduce(
    (sum, item) => sum + calculateItemPrice(item) * item.quantity,
    0,
  );

  const totalAmount = orders.reduce(
    (sum, item) => sum + calculateItemLineTotal(item),
    0,
  );

  const getCurrentCustomizationPrice = (): number => {
    if (!selectedProduct) return 0;
    let price = getEffectiveProductPrice(selectedProduct);
    if (selectedSize) {
      price += getEffectiveSizeModifier(selectedSize);
    }
    selectedAddons.forEach((addon) => {
      price += getEffectiveAddonPrice(addon);
    });
    return price;
  };

  const getCategoryName = (categoryId: string): string => {
    const category = categories.find((c) => c.id === categoryId);
    return category ? category.name : "";
  };

  const orderTypeOptions: {
    value: OrderType;
    label: string;
    color: string;
    selectedTextColor: string;
  }[] = [
    { value: 'regular', label: 'In-store', color: primaryColor, selectedTextColor: '#000000' },
    ...(hasFoodPanda ? [{ value: 'foodpanda' as OrderType, label: 'FoodPanda', color: '#ec4899', selectedTextColor: '#ffffff' }] : []),
    ...(hasGrab ? [{ value: 'grab' as OrderType, label: 'Grab', color: '#00B14F', selectedTextColor: '#ffffff' }] : []),
  ];

  const handleOrderTypeChange = (value: OrderType) => {
    if (orders.length > 0) {
      Alert.alert(
        'Switch Order Type',
        'Switching order type will clear the current cart. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Switch', style: 'destructive', onPress: () => { setOrders([]); setOrderType(value); } },
        ]
      );
    } else {
      setOrderType(value);
    }
  };

  const renderProductCard = (product: Product, widthClass: string) => {
    const imageUri = (() => {
      if (!product.image) return null;
      try {
        const path = product.image.startsWith("http")
          ? new URL(product.image).pathname
          : product.image;
        return `${apiBase}${path}`;
      } catch {
        return product.image;
      }
    })();
    return (
      <TouchableOpacity
        key={product.id}
        className={widthClass}
        onPress={() => openCustomizeModal(product)}
      >
        <View className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 h-64">
          <View className={`h-40 mb-3 justify-center items-center rounded-lg overflow-hidden${imageUri ? '' : ' bg-gray-100'}`}>
            {imageUri ? (
              <Image
                source={{ uri: imageUri }}
                className="w-full h-full"
                resizeMode="contain"
              />
            ) : (
              <Text className="text-gray-500 text-xs">
                No Image
              </Text>
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
              <Text
                className="font-bold text-base"
                style={{ color: textColor }}
              >
                ₱{getEffectiveProductPrice(product).toFixed(2)}
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
  };

  // Swipeable Order Item Component
  const SwipeableOrderItem = ({
    item,
    onRemove,
    onUpdateQuantity,
    onOpenDiscount,
  }: {
    item: OrderItem;
    onRemove: (id: string) => void;
    onUpdateQuantity: (id: string, quantity: number) => void;
    onOpenDiscount: (id: string) => void;
  }) => {
    const swipeableRef = useRef<Swipeable>(null);

    const renderRightActions = (
      progress: Animated.AnimatedInterpolation<number>,
      dragX: Animated.AnimatedInterpolation<number>,
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
            {item.selectedPreference && (
              <Text className="text-xs" style={{ color: `${textColor}80` }}>
                {brand?.preferenceLabel ?? 'Preferences'}: {item.selectedPreference.name}
              </Text>
            )}
            {item.itemDiscount ? (
              <View className="flex-row items-center mt-1 gap-2">
                <Text
                  className="font-semibold line-through text-xs"
                  style={{ color: `${textColor}60` }}
                >
                  ₱{(calculateItemPrice(item) * item.quantity).toFixed(2)}
                </Text>
                <Text className="font-semibold" style={{ color: "#ef4444" }}>
                  ₱{calculateItemLineTotal(item).toFixed(2)}
                </Text>
              </View>
            ) : (
              <Text className="font-semibold mt-1" style={{ color: textColor }}>
                ₱{calculateItemLineTotal(item).toFixed(2)}
              </Text>
            )}
          </View>

          {/* Right side - Discount button + Quantity controls */}
          <View className="flex-row items-center gap-2">
            <TouchableOpacity
              className="w-8 h-8 rounded justify-center items-center"
              style={{ backgroundColor: item.itemDiscount ? "#ef444420" : `${primaryColor}20` }}
              onPress={() => {
                if (!showCheckoutModal) onOpenDiscount(item.id);
              }}
              disabled={showCheckoutModal}
            >
              <Ionicons
                name="pricetag-outline"
                size={16}
                color={item.itemDiscount ? "#ef4444" : "#000000"}
              />
            </TouchableOpacity>
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

  // Shared cart content reused by the tablet side panel and the phone full-screen cart tab.
  // On phone the Cart tab is reachable any time (not gated on orders.length like the tablet
  // side panel is), so this needs its own empty state.
  const OrdersPanelContent = () => {
    if (orders.length === 0) {
      return (
        <View className="flex-1 justify-center items-center">
          <Ionicons name="cart-outline" size={40} color="#d1d5db" />
          <Text className="text-gray-500 mt-2">Cart is empty</Text>
        </View>
      );
    }

    return (
    <>
      <Text className="text-lg font-bold mb-4" style={{ color: textColor }}>
        Orders
      </Text>
      <ScrollView className="flex-1">
        {orders.map((item) => (
          <SwipeableOrderItem
            key={item.id}
            item={item}
            onRemove={removeFromOrder}
            onUpdateQuantity={updateQuantity}
            onOpenDiscount={(id) => setDiscountItemId(id)}
          />
        ))}
      </ScrollView>

      {/* Total and Checkout */}
      <View className="border-t border-gray-200 pt-4 mt-4">
        <View className="flex-row justify-between mb-4">
          <Text className="text-xl font-bold" style={{ color: textColor }}>
            Total:
          </Text>
          <Text className="text-xl font-bold" style={{ color: textColor }}>
            ₱{totalAmount.toFixed(2)}
          </Text>
        </View>
        <TouchableOpacity
          className="rounded-lg py-3 items-center"
          style={{ backgroundColor: primaryColor }}
          onPress={handleCheckout}
        >
          <Text className="text-lg font-bold" style={{ color: textColor }}>
            Checkout
          </Text>
        </TouchableOpacity>
      </View>
    </>
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
    details: any,
  ) => {
    if (!paymentMethod) return;

    setIsCreatingTransaction(true);
    setTransactionError(null);

    try {
      const transactionId = generateTransactionId();

      // Map frontend OrderItems to backend TransactionItems format
      const backendItems = orders.map((item) => ({
        productId: item.product.id,
        productName: item.product.name,
        quantity: item.quantity,
        sizeId: item.selectedSize?.id,
        sizeName: item.selectedSize?.name,
        preferenceId: item.selectedPreference?.id,
        preferenceName: item.selectedPreference?.name,
        subtotal: calculateItemPrice(item) * item.quantity,
        ...(item.itemDiscount && item.itemDiscount.amount > 0 && {
          discountAmount: item.itemDiscount.amount,
        }),
        addons: item.selectedAddons.map((addon) => ({
          addonId: addon.id,
          addonName: addon.name,
        })),
      }));

      // Capture the actual sale time now — if the transaction ends up in the
      // offline queue, this timestamp is sent to the server on sync so the
      // record reflects when the sale happened, not when it was uploaded.
      const saleTimestamp = new Date().toISOString();

      // Create transaction payload for backend
      const transactionPayload = {
        transactionId,
        timestamp: saleTimestamp,
        subtotal: grossOrderTotal,
        total: totalAmount - (details.discountAmount ?? 0),
        paymentMethod: paymentMethod.toUpperCase() as
          | "CASH"
          | "GCASH"
          | "PAYMAYA"
          | "ONLINE"
          | "FOODPANDA"
          | "GRAB",
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
        ...(details.discountAmount && details.discountAmount > 0 && {
          discountAmount: details.discountAmount,
        }),
        items: backendItems,
      };

      // Save transaction — offline-first (queues if network unavailable)
      const result = await createTransactionOffline(transactionPayload);

      setShowCheckoutModal(false);
      setTransactionError(null);

      if (result.queued) {
        // Offline: show confirmation instead of receipt, then clear order
        setShowQueuedConfirm(true);
        setOrders([]);
      } else {
        // Online: show receipt as normal
        const transaction: TransactionData = {
          transactionId,
          timestamp: new Date(),
          items: [...orders],
          subtotal: grossOrderTotal,
          total: totalAmount - (details.discountAmount ?? 0),
          discountAmount: details.discountAmount,
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
        setShowTransactionSummary(true);
      }
    } catch (error) {
      console.error("Failed to create transaction:", error);
      setTransactionError(
        error instanceof Error
          ? error.message
          : "Failed to create transaction. Please try again.",
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
    setPhoneActiveTab('menu');
  };

  return (
    <AppSafeAreaView className="w-full h-full bg-gray-50">
      {/* Transaction queued confirmation modal */}
      <Modal visible={showQueuedConfirm} transparent animationType="fade">
        <View className="flex-1 justify-center items-center bg-black/50 px-6">
          <View className="bg-white rounded-2xl p-6 w-full max-w-sm items-center">
            <Ionicons name="checkmark-circle" size={48} color="#16a34a" />
            <Text className="text-gray-900 font-bold text-lg mt-3 text-center">Transaction Saved</Text>
            <Text className="text-gray-500 text-sm mt-2 text-center">
              {"You're offline. The transaction has been saved locally and will sync automatically when you reconnect."}
            </Text>
            <TouchableOpacity
              className="mt-5 w-full py-3 rounded-xl items-center"
              style={{ backgroundColor: primaryColor }}
              onPress={() => setShowQueuedConfirm(false)}
            >
              <Text className="text-white font-semibold">OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View
        className={isPhone ? "px-4 py-3 flex-row justify-between items-center" : "px-6 py-4 flex-row justify-between items-center"}
        style={{ backgroundColor: backgroundColor }}
      >
        <View className="flex-row items-center flex-1 mr-2">
          {logoUri && (
            <Image
              source={{ uri: logoUri }}
              className={isPhone ? "w-9 h-9 mr-2 rounded-lg" : "w-12 h-12 mr-3 rounded-lg"}
              resizeMode="contain"
            />
          )}
          <View className="flex-1">
            <Text
              className="text-2xl font-bold"
              numberOfLines={1}
              style={{ color: textColor }}
            >
              {tenant.name}
            </Text>
          </View>
        </View>
        {isPhone ? (
          <TouchableOpacity className="p-2" onPress={() => setShowHeaderMenu(true)}>
            <Ionicons name="menu" size={28} color={textColor} />
          </TouchableOpacity>
        ) : (
          <View className="flex-row items-center gap-6">
            <TouchableOpacity
              className="p-2"
              onPress={() => router.push("/transactions" as Href)}
            >
              <Ionicons name="receipt-outline" size={24} color={textColor} />
            </TouchableOpacity>
            <TouchableOpacity
              className="p-2"
              onPress={() => router.push("/expenses" as Href)}
            >
              <Ionicons name="wallet-outline" size={24} color={textColor} />
            </TouchableOpacity>
            <TouchableOpacity
              className="p-2"
              onPress={() => router.push("/inventory" as Href)}
            >
              <Ionicons name="cube-outline" size={24} color={textColor} />
            </TouchableOpacity>
            <TouchableOpacity
              className="p-2"
              onPress={() => router.push("/time-clock" as Href)}
            >
              <Ionicons name="time-outline" size={24} color={textColor} />
            </TouchableOpacity>
            <View className="w-px bg-black self-stretch" />
            <TouchableOpacity
              className="p-2"
              onPress={() => router.push("/settings" as Href)}
            >
              <Ionicons name="settings-outline" size={24} color={textColor} />
            </TouchableOpacity>
            <View className="w-px bg-black self-stretch mx-2" />
            <TouchableOpacity className="p-2" onPress={handleLogout}>
              <Ionicons name="log-out-outline" size={24} color={textColor} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Header Menu (phone only) — slide-in side panel */}
      <Modal
        visible={showHeaderMenu}
        transparent
        animationType="none"
        onRequestClose={closeHeaderMenu}
        onShow={() => {
          headerMenuAnim.setValue(HEADER_MENU_WIDTH);
          Animated.timing(headerMenuAnim, {
            toValue: 0,
            duration: 220,
            useNativeDriver: true,
          }).start();
        }}
      >
        <View style={{ flex: 1, flexDirection: 'row' }}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }}
            activeOpacity={1}
            onPress={closeHeaderMenu}
          />
          <Animated.View
            style={{
              width: HEADER_MENU_WIDTH,
              backgroundColor: 'white',
              transform: [{ translateX: headerMenuAnim }],
            }}
          >
            <AppSafeAreaView style={{ flex: 1 }}>
              <View className="px-4 py-4 flex-row items-center justify-between border-b border-gray-100">
                <Text className="text-lg font-bold" style={{ color: textColor }}>
                  Menu
                </Text>
                <TouchableOpacity onPress={closeHeaderMenu} className="p-1">
                  <Ionicons name="close" size={24} color={textColor} />
                </TouchableOpacity>
              </View>
              {[
                { icon: 'receipt-outline' as const, label: 'Transactions', onPress: () => router.push("/transactions" as Href) },
                { icon: 'wallet-outline' as const, label: 'Expenses', onPress: () => router.push("/expenses" as Href) },
                { icon: 'cube-outline' as const, label: 'Inventory', onPress: () => router.push("/inventory" as Href) },
                { icon: 'time-outline' as const, label: 'Time Clock', onPress: () => router.push("/time-clock" as Href) },
                { icon: 'settings-outline' as const, label: 'Settings', onPress: () => router.push("/settings" as Href) },
              ].map((item) => (
                <TouchableOpacity
                  key={item.label}
                  className="flex-row items-center px-4 py-4"
                  style={{ borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}
                  onPress={() => {
                    closeHeaderMenu();
                    item.onPress();
                  }}
                >
                  <Ionicons name={item.icon} size={22} color={textColor} />
                  <Text className="text-base font-medium ml-3" style={{ color: textColor }}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                className="flex-row items-center px-4 py-4 mt-auto border-t border-gray-100"
                onPress={() => {
                  closeHeaderMenu();
                  handleLogout();
                }}
              >
                <Ionicons name="log-out-outline" size={22} color="#ef4444" />
                <Text className="text-base font-medium ml-3" style={{ color: '#ef4444' }}>
                  Log Out
                </Text>
              </TouchableOpacity>
            </AppSafeAreaView>
          </Animated.View>
        </View>
      </Modal>

      {/* Main Content */}
      {isPhone ? (
        <View className="flex-1">
          {phoneActiveTab === 'menu' && showOrderTypeSelector && (
            <View className="flex-row gap-2 px-4 pt-3">
              {orderTypeOptions.map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  className="flex-1 p-2.5 rounded-lg items-center"
                  style={{ backgroundColor: orderType === opt.value ? opt.color : '#f3f4f6' }}
                  onPress={() => handleOrderTypeChange(opt.value)}
                >
                  <Text
                    className="font-semibold text-sm"
                    style={{ color: orderType === opt.value ? opt.selectedTextColor : textColor }}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {phoneActiveTab === 'menu' && (
            <View className="px-4 pt-3 pb-1">
              <TouchableOpacity
                className="flex-row items-center justify-between p-3 rounded-lg"
                style={{ backgroundColor: "#f3f4f6" }}
                onPress={() => setShowCategoryDropdown(true)}
              >
                <Text className="font-semibold text-base" style={{ color: textColor }}>
                  {getCategoryName(selectedCategory) || "Select Category"}
                </Text>
                <Ionicons name="chevron-down" size={20} color={textColor} />
              </TouchableOpacity>
            </View>
          )}

          {phoneActiveTab === 'menu' ? (
            isLoadingData ? (
              <View className="flex-1 justify-center items-center">
                <ActivityIndicator size="large" color={primaryColor} />
                <Text className="mt-2 text-gray-500">Loading products...</Text>
              </View>
            ) : (
              <ScrollView className="px-2 flex-1">
                <View className="flex-row flex-wrap">
                  {filteredProducts.map((product) => renderProductCard(product, "w-1/2 p-2"))}
                </View>
              </ScrollView>
            )
          ) : (
            <View className="flex-1 px-4 pt-2 pb-3">
              <OrdersPanelContent />
            </View>
          )}

          {/* Bottom Tab Bar */}
          <View className="flex-row border-t border-gray-200 bg-white">
            <TouchableOpacity
              className="flex-1 items-center py-2"
              onPress={() => setPhoneActiveTab('menu')}
            >
              <Ionicons
                name="grid-outline"
                size={22}
                color={phoneActiveTab === 'menu' ? textColor : '#9ca3af'}
              />
              <Text
                className="text-xs mt-1"
                style={{
                  color: phoneActiveTab === 'menu' ? textColor : '#9ca3af',
                  fontWeight: phoneActiveTab === 'menu' ? '700' : '400',
                }}
              >
                Menu
              </Text>
              <View
                style={{
                  width: 24,
                  height: 3,
                  borderRadius: 2,
                  marginTop: 4,
                  backgroundColor: primaryColor,
                  opacity: phoneActiveTab === 'menu' ? 1 : 0,
                }}
              />
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 items-center py-2"
              onPress={() => setPhoneActiveTab('cart')}
            >
              <View>
                <Ionicons
                  name="cart-outline"
                  size={22}
                  color={phoneActiveTab === 'cart' ? textColor : '#9ca3af'}
                />
                {orders.length > 0 && (
                  <View
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -10,
                      backgroundColor: '#ef4444',
                      borderRadius: 8,
                      minWidth: 16,
                      height: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 3,
                    }}
                  >
                    <Text style={{ color: 'white', fontSize: 10, fontWeight: '700' }}>
                      {orders.length}
                    </Text>
                  </View>
                )}
              </View>
              <Text
                className="text-xs mt-1"
                style={{
                  color: phoneActiveTab === 'cart' ? textColor : '#9ca3af',
                  fontWeight: phoneActiveTab === 'cart' ? '700' : '400',
                }}
              >
                Cart
              </Text>
              <View
                style={{
                  width: 24,
                  height: 3,
                  borderRadius: 2,
                  marginTop: 4,
                  backgroundColor: primaryColor,
                  opacity: phoneActiveTab === 'cart' ? 1 : 0,
                }}
              />
            </TouchableOpacity>
            <TouchableOpacity
              className="flex-1 items-center py-2"
              disabled={orders.length === 0}
              onPress={handleCheckout}
            >
              <Ionicons
                name="card-outline"
                size={22}
                color={orders.length === 0 ? '#d1d5db' : textColor}
              />
              <Text
                className="text-xs mt-1"
                style={{ color: orders.length === 0 ? '#d1d5db' : textColor }}
              >
                Pay
              </Text>
            </TouchableOpacity>
          </View>

          {/* Category Dropdown List */}
          <Modal
            visible={showCategoryDropdown}
            transparent
            animationType="fade"
            onRequestClose={() => setShowCategoryDropdown(false)}
          >
            <TouchableOpacity
              style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center' }}
              activeOpacity={1}
              onPress={() => setShowCategoryDropdown(false)}
            >
              <View
                style={{
                  backgroundColor: 'white',
                  marginHorizontal: 16,
                  borderRadius: 12,
                  maxHeight: '60%',
                  overflow: 'hidden',
                }}
              >
                <ScrollView>
                  {categories.map((category) => (
                    <TouchableOpacity
                      key={category.id}
                      className="p-4 border-b border-gray-100"
                      style={{
                        backgroundColor:
                          selectedCategory === category.id ? primaryColor : 'white',
                      }}
                      onPress={() => {
                        setSelectedCategory(category.id);
                        setShowCategoryDropdown(false);
                      }}
                    >
                      <Text
                        className="font-semibold text-base"
                        style={{
                          color: selectedCategory === category.id ? 'black' : textColor,
                        }}
                      >
                        {category.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </TouchableOpacity>
          </Modal>
        </View>
      ) : (
        <View className="flex-1 flex-row">
          {/* Category Panel */}
          <View className="w-1/5 bg-white border-r border-gray-200 p-4">
            {/* Order Type + Categories share one scrollable region so a short
                viewport (e.g. landscape phone) can still reach every category
                instead of Order Type claiming a fixed slice outside the scroll area. */}
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
              {showOrderTypeSelector && (
                <>
                  <Text className="text-base font-bold mb-4" style={{ color: textColor }}>
                    Order Type
                  </Text>
                  {orderTypeOptions.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      className="p-3 rounded-lg mb-2"
                      style={{ backgroundColor: orderType === opt.value ? opt.color : '#f3f4f6' }}
                      onPress={() => handleOrderTypeChange(opt.value)}
                    >
                      <Text
                        className="font-semibold"
                        style={{ color: orderType === opt.value ? opt.selectedTextColor : textColor }}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <View style={{ borderTopWidth: 1, borderTopColor: '#e5e7eb', marginTop: 8, marginBottom: 12 }} />
                </>
              )}
              <Text className="text-base font-bold mb-4" style={{ color: textColor }}>
                Categories
              </Text>
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
            <View
              style={{
                paddingTop: 12,
                marginTop: 8,
                borderTopWidth: 1,
                borderTopColor: "#f3f4f6",
                alignItems: "center",
                flexDirection: "row",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <Image
                source={require("../assets/images/logo-with-appname.png")}
                style={{ width: 20, height: 20 }}
                resizeMode="contain"
              />
              <Text style={{ fontSize: 11, color: "#9ca3af" }}>
                Powered by{" "}
                <Text style={{ fontWeight: "600", color: "#4b5563" }}>
                  Kioscify
                </Text>
              </Text>
            </View>
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
                  {filteredProducts.map((product) =>
                    renderProductCard(product, orders.length > 0 ? "w-1/2 p-2" : "w-1/3 p-2"),
                  )}
                </View>
              </ScrollView>
            )}
          </View>

          {/* Orders Panel - Only shows if there are orders */}
          {orders.length > 0 && (
            <View className="w-2/5 bg-white border-l border-gray-200 p-4">
              <OrdersPanelContent />
            </View>
          )}
        </View>
      )}

      {/* Customize Product Modal */}
      <Modal
        visible={showCustomizeModal}
        transparent
        animationType="slide"
        onRequestClose={closeCustomizeModal}
      >
        <View className="flex-1 bg-black/50 justify-center items-center">
          <View className="bg-white rounded-lg w-11/12 max-w-lg" style={{ height: '90%' }}>
            {/* Modal Header */}
            <View
              className="px-6 py-4 rounded-t-lg flex-row justify-between items-center"
              style={{ backgroundColor: primaryColor }}
            >
              <View className="flex-1 mr-3">
                <Text className="text-xl font-bold" style={{ color: textColor }}>
                  {selectedProduct?.name}
                </Text>
                <Text
                  className="text-sm mt-0.5"
                  style={{ color: `${textColor}CC` }}
                >
                  {getCategoryName(selectedProduct?.categoryId || "")}
                </Text>
              </View>
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

            <ScrollView className="px-6 py-4" style={{ flex: 1 }}>

              {/* Sizes Section */}
              {selectedProduct?.sizes && selectedProduct.sizes.length > 0 && (
                <View className="mb-2">
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
                          {getEffectiveSizeModifier(size) > 0
                            ? `+₱${getEffectiveSizeModifier(size).toFixed(2)}`
                            : ""}
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
                  <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                    {selectedProduct.addons.map((addon) => {
                      const isSelected = selectedAddons.find(
                        (a) => a.id === addon.id,
                      );
                      return (
                        <TouchableOpacity
                          key={addon.id}
                          className="p-3 rounded-lg"
                          style={{
                            width: '48.5%',
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
                            className="font-semibold text-sm mb-1"
                            style={{ color: textColor }}
                          >
                            {addon.name}
                          </Text>
                          <Text
                            className="text-xs font-semibold"
                            style={{ color: `${textColor}B3` }}
                          >
                            +₱{getEffectiveAddonPrice(addon).toFixed(2)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Preferences Section */}
              {selectedProduct?.preferences && selectedProduct.preferences.length > 0 && (
                <View className="mb-6">
                  <Text
                    className="text-lg font-bold"
                    style={{ color: textColor }}
                  >
                    {brand?.preferenceLabel ?? 'Preferences'}
                  </Text>
                  <Text
                    className="text-xs mb-3"
                    style={{ color: `${textColor}80` }}
                  >
                    Optional · Defaults to {selectedProduct.preferences.find(p => p.isDefault)?.name ?? selectedProduct.preferences[0].name}
                  </Text>
                  {[...selectedProduct.preferences]
                    .sort((a, b) => (a.sequenceNo ?? 0) - (b.sequenceNo ?? 0))
                    .map((pref) => (
                    <TouchableOpacity
                      key={pref.id}
                      className="p-4 rounded-lg mb-2"
                      style={{
                        backgroundColor:
                          selectedPreference?.id === pref.id
                            ? `${primaryColor}15`
                            : "#f3f4f6",
                        borderWidth: selectedPreference?.id === pref.id ? 2 : 0,
                        borderColor:
                          selectedPreference?.id === pref.id
                            ? primaryColor
                            : "transparent",
                      }}
                      onPress={() =>
                        setSelectedPreference(
                          selectedPreference?.id === pref.id ? null : pref,
                        )
                      }
                    >
                      <Text
                        className="font-semibold"
                        style={{ color: textColor }}
                      >
                        {pref.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
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

      {/* Item Discount Modal */}
      {discountItemId !== null && (() => {
        const discountItem = orders.find((o) => o.id === discountItemId);
        if (!discountItem) return null;
        return (
          <ItemDiscountModal
            visible
            baseLineTotal={calculateItemPrice(discountItem) * discountItem.quantity}
            initialDiscount={discountItem.itemDiscount}
            onApply={(discount) => {
              setItemDiscount(discountItemId, discount);
              setDiscountItemId(null);
            }}
            onClear={() => {
              setItemDiscount(discountItemId, undefined);
              setDiscountItemId(null);
            }}
            onClose={() => setDiscountItemId(null)}
          />
        );
      })()}

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
        initialPaymentMethod={
          orderType === 'foodpanda' ? 'foodpanda' :
          orderType === 'grab' ? 'grab' :
          null
        }
        hiddenPaymentMethods={['foodpanda', 'grab']}
      />

      {/* Transaction Summary Modal */}
      <TransactionSummary
        visible={showTransactionSummary}
        transaction={currentTransaction as any}
        onNewOrder={handleNewOrder}
      />
    </AppSafeAreaView>
  );
}
