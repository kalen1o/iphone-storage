export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  images: string[];
  category: string;
  sku: string;
  inStock: boolean;
  features: string[];
  specifications: Record<string, string>;
}

export const IPHONE_17_PRO_MAX: Product = {
  id: "iphone-17-pro-max",
  name: "iPhone 17 Pro Max",
  description:
    "The most advanced iPhone ever created. Featuring the powerful A19 Pro chip, all-new camera system, and the largest display ever on iPhone.",
  price: 1199,
  compareAtPrice: 1299,
  images: ["/videos/iphone-4k.mp4"], // Using video as preview
  category: "smartphones",
  sku: "IPHONE-17-PRO-MAX-256GB",
  inStock: true,
  features: [
    "A19 Pro chip with 6-core CPU",
    "Pro camera system with 48MP main",
    "Titanium design",
    "All-day battery life",
    "5G capability",
    "Face ID",
    "iOS 18",
  ],
  specifications: {
    Battery: "Up to 29 hours video playback",
    Camera: "48MP Pro camera system",
    Chip: "A19 Pro",
    Colors: "Deep Purple, Midnight Black, Starlight White",
    Display: "6.9-inch Super Retina XDR",
    Storage: "256GB, 512GB, 1TB",
  },
};

export const STORAGE_PLANS: Product[] = [
  {
    category: "cloud-storage",
    description: "Secure cloud storage for all your files. Automatic backups across all devices.",
    features: ["50GB storage", "iCloud Mail", "Shared albums", "iCloud Drive"],
    id: "icloud-50gb",
    images: [],
    inStock: true,
    name: "iCloud+ 50GB",
    price: 0.99,
    sku: "ICLOUD-50GB",
    specifications: {
      Storage: "50GB",
      Devices: "Unlimited",
      Support: "24/7",
    },
  },
  {
    category: "cloud-storage",
    description: "Expand your storage with 200GB plan. Perfect for power users and professionals.",
    features: ["200GB storage", "iCloud Mail", "Shared albums", "iCloud Drive", "Family Sharing"],
    id: "icloud-200gb",
    images: [],
    inStock: true,
    name: "iCloud+ 200GB",
    price: 2.99,
    sku: "ICLOUD-200GB",
    specifications: {
      Storage: "200GB",
      Devices: "Unlimited",
      Support: "24/7",
    },
  },
];
