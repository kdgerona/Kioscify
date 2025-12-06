// Mock data types
export type Size = {
  id: string;
  name: string;
  priceModifier: number;
  volume?: string;
};

export type Addon = {
  id: string;
  name: string;
  price: number;
};

export type Product = {
  id: string;
  name: string;
  price: number;
  categoryId: string;
  image?: string;
  sizes?: Size[];
  addons?: Addon[];
};

export type Category = {
  id: string;
  name: string;
};

// Categories
export const categories: Category[] = [
  { id: "lemonade", name: "Lemonade" },
  { id: "hot-lemonade", name: "Hot Lemonade" },
  { id: "calamansi", name: "Calamansi" },
  { id: "hot-calamansi", name: "Hot Calamansi" },
];

// Addons
export const lemonadeAddons: Addon[] = [
  { id: "nata-de-coco", name: "Nata De Coco", price: 10 },
  { id: "popping-bobba", name: "Popping Bobba", price: 20 },
  { id: "lemon-shot", name: "Lemon Shot", price: 20 },
  { id: "yakult", name: "Yakult", price: 20 },
];

export const calamansiAddons: Addon[] = [
  { id: "nata-de-coco", name: "Nata De Coco", price: 10 },
  { id: "popping-bobba", name: "Popping Bobba", price: 20 },
  { id: "yakult", name: "Yakult", price: 20 },
];

// Sizes
const lemonadeSizes: Size[] = [
  { id: "regular-16oz", name: "Regular", priceModifier: 0, volume: "16oz" },
  { id: "large-22oz", name: "Large", priceModifier: 20, volume: "22oz" },
];

const hotLemonadeSizes: Size[] = [
  { id: "regular-12oz", name: "Regular", priceModifier: 0, volume: "12oz" },
];

const calamansiSizes: Size[] = [
  { id: "regular-16oz", name: "Regular", priceModifier: 0, volume: "16oz" },
  { id: "large-22oz", name: "Large", priceModifier: 20, volume: "22oz" },
];

const hotCalamansiSizes: Size[] = [
  { id: "regular-12oz", name: "Regular", priceModifier: 0, volume: "12oz" },
];

// Products
export const products: Product[] = [
  // Lemonade Category
  {
    id: "lem-1",
    name: "Classic Lemonade",
    price: 49,
    categoryId: "lemonade",
    sizes: lemonadeSizes,
    addons: lemonadeAddons,
  },
  {
    id: "lem-2",
    name: "Classic Guava",
    price: 69,
    categoryId: "lemonade",
    sizes: lemonadeSizes,
    addons: lemonadeAddons,
  },
  {
    id: "lem-3",
    name: "Classic Strawberry",
    price: 69,
    categoryId: "lemonade",
    sizes: lemonadeSizes,
    addons: lemonadeAddons,
  },
  {
    id: "lem-4",
    name: "Classic Watermelon",
    price: 69,
    categoryId: "lemonade",
    sizes: lemonadeSizes,
    addons: lemonadeAddons,
  },
  {
    id: "lem-5",
    name: "Classic Lychee",
    price: 69,
    categoryId: "lemonade",
    sizes: lemonadeSizes,
    addons: lemonadeAddons,
  },
  {
    id: "lem-6",
    name: "Classic Pineapple",
    price: 69,
    categoryId: "lemonade",
    sizes: lemonadeSizes,
    addons: lemonadeAddons,
  },
  {
    id: "lem-7",
    name: "Green Apple",
    price: 55,
    categoryId: "lemonade",
    sizes: lemonadeSizes,
    addons: lemonadeAddons,
  },
  {
    id: "lem-8",
    name: "Strawberry",
    price: 55,
    categoryId: "lemonade",
    sizes: lemonadeSizes,
    addons: lemonadeAddons,
  },
  {
    id: "lem-9",
    name: "Kiwi",
    price: 55,
    categoryId: "lemonade",
    sizes: lemonadeSizes,
    addons: lemonadeAddons,
  },
  {
    id: "lem-10",
    name: "Peach",
    price: 55,
    categoryId: "lemonade",
    sizes: lemonadeSizes,
    addons: lemonadeAddons,
  },
  {
    id: "lem-11",
    name: "Mango",
    price: 55,
    categoryId: "lemonade",
    sizes: lemonadeSizes,
    addons: lemonadeAddons,
  },

  // Hot Lemonade Category
  {
    id: "hot-lem-1",
    name: "Classic Lemonade",
    price: 59,
    categoryId: "hot-lemonade",
    sizes: hotLemonadeSizes,
  },
  {
    id: "hot-lem-2",
    name: "Ginger Lemonade",
    price: 79,
    categoryId: "hot-lemonade",
    sizes: hotLemonadeSizes,
  },

  // Calamansi Category
  {
    id: "cal-1",
    name: "Classic Calamansi",
    price: 39,
    categoryId: "calamansi",
    sizes: calamansiSizes,
    addons: calamansiAddons,
  },
  {
    id: "cal-2",
    name: "Guava",
    price: 59,
    categoryId: "calamansi",
    sizes: calamansiSizes,
    addons: calamansiAddons,
  },
  {
    id: "cal-3",
    name: "Strawberry",
    price: 59,
    categoryId: "calamansi",
    sizes: calamansiSizes,
    addons: calamansiAddons,
  },
  {
    id: "cal-4",
    name: "Watermelon",
    price: 59,
    categoryId: "calamansi",
    sizes: calamansiSizes,
    addons: calamansiAddons,
  },
  {
    id: "cal-5",
    name: "Lychee",
    price: 59,
    categoryId: "calamansi",
    sizes: calamansiSizes,
    addons: calamansiAddons,
  },
  {
    id: "cal-6",
    name: "Pineapple",
    price: 59,
    categoryId: "calamansi",
    sizes: calamansiSizes,
    addons: calamansiAddons,
  },

  // Hot Calamansi Category
  {
    id: "hot-cal-1",
    name: "Classic Calamansi",
    price: 49,
    categoryId: "hot-calamansi",
    sizes: hotCalamansiSizes,
  },
  {
    id: "hot-cal-2",
    name: "Ginger Calamansi",
    price: 69,
    categoryId: "hot-calamansi",
    sizes: hotCalamansiSizes,
  },
];
