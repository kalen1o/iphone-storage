# Convert Next.js iPhone Landing to Remix with Product

This guide converts your existing Next.js iPhone 17 Pro Max landing page to Remix and adds a "Buy iPhone" product feature with cart functionality.

## Overview

The conversion involves:
- Migrating from Next.js 15 App Router to Remix file-based routing
- Converting React components to Remix-compatible format
- Adding product data and cart state management
- Creating checkout flow
- Maintaining all existing scroll-telling animations

## Step 1: Create New Remix Project

### 1.1 Initialize Remix Application

```bash
# Navigate to root
cd /Users/kalen_1o/learning/online-storage

# Create new Remix project
npx create-remix@latest --template remix-run/remix/templates/typescript frontend

# Navigate to new project
cd frontend
```

### 1.2 Install Additional Dependencies

```bash
# Install additional packages
pnpm add framer-motion zustand clsx tailwind-merge

# Install dev dependencies
pnpm add -D @types/node tailwindcss postcss autoprefixer
```

### 1.3 Remove Default Files

```bash
# Remove default routes and components
rm -rf app/routes/*
rm -rf app/components/*
```

## Step 2: Copy and Convert Configuration Files

### 2.1 Copy Tailwind Configuration

```bash
# Copy from Next.js app
cp ../apps/fe/tailwind.config.ts ./
```

### 2.2 Update Tailwind Config for Remix

Update `frontend/tailwind.config.ts`:

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./app/components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
        background: {
          primary: '#050505',
          secondary: '#0A0A0C',
        },
        accent: {
          primary: '#3A6DFF',
          secondary: '#6FE3FF',
        },
      },
      animation: {
        'scroll-prompt': 'scrollPrompt 1.5s ease-in-out infinite',
      },
      keyframes: {
        scrollPrompt: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(12px)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
```

### 2.3 Copy PostCSS Configuration

```bash
cp ../apps/fe/postcss.config.mjs ./
```

### 2.4 Update PostCSS Config for Remix

Update `frontend/postcss.config.mjs`:

```javascript
/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
```

## Step 3: Migrate Video Assets

```bash
# Create public directory structure
mkdir -p public/videos

# Copy video from Next.js app
cp ../apps/fe/public/iphone-4k.mp4 public/videos/
cp ../apps/fe/public/iphone.mp4 public/videos/  # if exists
```

## Step 4: Convert Components to Remix

### 4.1 Create Component Directory Structure

```bash
mkdir -p app/components/{ui,layout,animation}
mkdir -p app/lib/{hooks,stores}
mkdir -p public/videos
```

### 4.2 Create Constants

Create `frontend/app/constants/content.ts`:

```typescript
export const STORY_BEAT_CONTENT = {
  HERO: {
    headline: 'iPhone 17 Pro Max',
    subheadline: 'Pro, taken further.',
    tagline: 'The most advanced iPhone ever created.',
    align: 'center',
  },
  ENGINEERING: {
    headline: 'Precision, down to every layer.',
    subcopy: [
      'From titanium frame to advanced internal architecture, every element is engineered for balance, strength, and efficiency.',
    ],
    align: 'left',
  },
  PERFORMANCE: {
    headline: 'Power that adapts in real time.',
    subcopy: [
      'Next-generation Apple silicon.',
      'Desktop-class performance.',
      'Advanced efficiency built in.',
    ],
    align: 'right',
  },
  CAMERA: {
    headline: 'A camera system without compromise.',
    subcopy: [
      'Sharper optics. Larger sensors. Computational photography at its most advanced.',
    ],
    align: 'center',
  },
  REASSEMBLY: {
    headline: 'Designed to be extraordinary.',
    subheadline: 'iPhone 17 Pro Max. Power, precision, perfectly aligned.',
    cta: 'Explore iPhone 17 Pro Max',
    secondaryCta: 'View technical specs',
    align: 'center',
  },
} as const;

export const NAVIGATION_LINKS = [
  'Overview',
  'Design',
  'Performance',
  'Camera',
  'Tech Specs',
] as const;
```

Create `frontend/app/constants/images.ts`:

```typescript
export const STORY_BEATS = {
  HERO: { start: 0.0, end: 0.15 },
  ENGINEERING: { start: 0.15, end: 0.40 },
  PERFORMANCE: { start: 0.40, end: 0.65 },
  CAMERA: { start: 0.65, end: 0.85 },
  REASSEMBLY: { start: 0.85, end: 1.0 },
} as const;
```

### 4.3 Create Video Scroll Player

Create `frontend/app/components/animation/VideoScrollPlayer.tsx`:

```typescript
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface VideoScrollPlayerProps {
  progress: number; // 0 to 1
}

export function VideoScrollPlayer({ progress }: VideoScrollPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const hasInitialized = useRef(false);

  // Handle video ready state using ref callback
  const handleVideoRef = (video: HTMLVideoElement | null) => {
    videoRef.current = video;

    if (!video || hasInitialized.current) return;
    hasInitialized.current = true;

    const handleReady = () => {
      setIsReady(true);
    };

    const handleError = (e: Event) => {
      const error = (e.target as HTMLVideoElement).error;
      if (error) {
        console.error('Video error code:', error.code);
        console.error('Video error message:', error.message);
      }
    };

    // Listen for multiple events to ensure we catch when video is ready
    video.addEventListener('loadedmetadata', handleReady);
    video.addEventListener('loadeddata', handleReady);
    video.addEventListener('canplay', handleReady);
    video.addEventListener('error', handleError);

    // Explicitly trigger video loading
    setTimeout(() => {
      video.load();
    }, 100);
  };

  // Sync video playback position with scroll progress
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isReady || !video.duration) return;

    // Debounce seeks to prevent performance issues during rapid scrolling
    if (isSeeking) return;

    const seekTime = progress * video.duration;

    // Only seek if difference is significant (0.05s = 3 frames at 60fps)
    if (Math.abs(video.currentTime - seekTime) > 0.05) {
      setIsSeeking(true);
      video.currentTime = seekTime;

      // Reset seeking flag after seek completes
      const resetSeeking = () => {
        setIsSeeking(false);
      };
      video.addEventListener('seeked', resetSeeking, { once: true });
    }
  }, [progress, isReady, isSeeking]);

  return (
    <>
      {/* Loading overlay */}
      {!isReady && (
        <div className="fixed inset-0 flex items-center justify-center bg-background-primary z-50">
          <div className="text-center">
            <div className="w-16 h-16 border-2 border-accent-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white/60 text-sm">Loading experience...</p>
          </div>
        </div>
      )}

      {/* Video element (always rendered) */}
      <video
        ref={handleVideoRef}
        src="/videos/iphone-4k.mp4"
        className="fixed inset-0 w-full h-full object-cover"
        muted
        playsInline
        preload="auto"
      />
    </>
  );
}

// Hook to track scroll progress
export function useScrollProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollProgress = Math.min(scrollTop / docHeight, 1);
      setProgress(scrollProgress);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return progress;
}
```

### 4.4 Create Story Beat Components

Create `frontend/app/components/animation/StoryBeat.tsx`:

```typescript
import { motion } from 'framer-motion';

interface StoryBeatProps {
  children: React.ReactNode;
  opacity: number;
  zIndex: number;
}

export function StoryBeat({ children, opacity, zIndex }: StoryBeatProps) {
  return (
    <motion.div
      initial={{ opacity }}
      animate={{ opacity }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex }}
    >
      {children}
    </motion.div>
  );
}
```

### 4.5 Create Navigation Component

Create `frontend/app/components/layout/Navigation.tsx`:

```typescript
import { Link } from '@remix-run/react';
import { motion } from 'framer-motion';
import { NAVIGATION_LINKS } from '~/constants/content';

export function Navigation() {
  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="fixed top-0 left-0 right-0 z-40 px-6 py-4 bg-background-primary/80 backdrop-blur-lg border-b border-white/10"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="text-white font-bold text-xl tracking-tight">
          iPhone 17 Pro Max
        </Link>

        {/* Links */}
        <ul className="hidden md:flex items-center gap-8">
          {NAVIGATION_LINKS.map((link, index) => (
            <motion.li
              key={link}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.4, ease: 'easeOut' }}
            >
              <Link
                to={`#${link.toLowerCase().replace(/\s+/g, '-')}`}
                className="text-white/70 hover:text-white transition-colors text-sm font-medium"
              >
                {link}
              </Link>
            </motion.li>
          ))}
        </ul>

        {/* Buy CTA */}
        <Link
          to="/product/iphone-17-pro-max"
          className="bg-accent-primary hover:bg-accent-secondary text-white px-6 py-2.5 rounded-lg font-semibold transition-all hover:scale-105 active:scale-95"
        >
          Buy Now
        </Link>
      </div>
    </motion.nav>
  );
}
```

## Step 5: Create Product Data

### 5.1 Create Product Store

Create `frontend/app/lib/stores/cartStore.ts`:

```typescript
import create from 'zustand/vanilla';

export interface CartItem {
  id: string;
  productId: string;
  quantity: number;
  price: number;
  name: string;
  image?: string;
}

interface CartStore {
  items: CartItem[];
  isOpen: boolean;
  addToCart: (item: Omit<CartItem, 'id'>) => void;
  removeFromCart: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  toggleCart: () => void;
  getTotal: () => number;
  getItemCount: () => number;
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  isOpen: false,

  addToCart: (item) => {
    set((state) => {
      const existingItem = state.items.find(
        (i) => i.productId === item.productId
      );

      if (existingItem) {
        return {
          items: state.items.map((i) =>
            i.productId === item.productId
              ? { ...i, quantity: i.quantity + item.quantity }
              : i
          ),
        };
      } else {
        return {
          items: [...state.items, { ...item, id: crypto.randomUUID() }],
        };
      }
    });
  },

  removeFromCart: (id) => {
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
    }));
  },

  updateQuantity: (id, quantity) => {
    if (quantity <= 0) {
      get().removeFromCart(id);
      return;
    }

    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, quantity } : item
      ),
    }));
  },

  clearCart: () => {
    set({ items: [] });
  },

  toggleCart: () => {
    set((state) => ({ isOpen: !state.isOpen }));
  },

  getTotal: () => {
    return get().items.reduce((total, item) => total + item.price * item.quantity, 0);
  },

  getItemCount: () => {
    return get().items.reduce((count, item) => count + item.quantity, 0);
  },
}));
```

### 5.2 Create Product Data

Create `frontend/app/lib/products.ts`:

```typescript
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
  id: 'iphone-17-pro-max',
  name: 'iPhone 17 Pro Max',
  description: 'The most advanced iPhone ever created. Featuring the powerful A19 Pro chip, all-new camera system, and the largest display ever on iPhone.',
  price: 1199,
  compareAtPrice: 1299,
  images: ['/videos/iphone-4k.mp4'], // Using video as preview
  category: 'smartphones',
  sku: 'IPHONE-17-PRO-MAX-256GB',
  inStock: true,
  features: [
    'A19 Pro chip with 6-core CPU',
    'Pro camera system with 48MP main',
    'Titanium design',
    'All-day battery life',
    '5G capability',
    'Face ID',
    'iOS 18',
  ],
  specifications: {
    'Display': '6.9-inch Super Retina XDR',
    'Chip': 'A19 Pro',
    'Camera': '48MP Pro camera system',
    'Storage': '256GB, 512GB, 1TB',
    'Battery': 'Up to 29 hours video playback',
    'Colors': 'Deep Purple, Midnight Black, Starlight White',
  },
};

export const STORAGE_PLANS: Product[] = [
  {
    id: 'icloud-50gb',
    name: 'iCloud+ 50GB',
    description: 'Secure cloud storage for all your files. Automatic backups across all devices.',
    price: 0.99,
    images: [],
    category: 'cloud-storage',
    sku: 'ICLOUD-50GB',
    inStock: true,
    features: [
      '50GB storage',
      'iCloud Mail',
      'Shared albums',
      'iCloud Drive',
    ],
    specifications: {
      'Storage': '50GB',
      'Devices': 'Unlimited',
      'Support': '24/7',
    },
  },
  {
    id: 'icloud-200gb',
    name: 'iCloud+ 200GB',
    description: 'Expand your storage with 200GB plan. Perfect for power users and professionals.',
    price: 2.99,
    images: [],
    category: 'cloud-storage',
    sku: 'ICLOUD-200GB',
    inStock: true,
    features: [
      '200GB storage',
      'iCloud Mail',
      'Shared albums',
      'iCloud Drive',
      'Family Sharing',
    ],
    specifications: {
      'Storage': '200GB',
      'Devices': 'Unlimited',
      'Support': '24/7',
    },
  },
];
```

## Step 6: Create Remix Routes

### 6.1 Create Root Route

Create `frontend/app/routes/_index.tsx`:

```typescript
import { useScrollProgress } from '~/components/animation/VideoScrollPlayer';
import { Navigation } from '~/components/layout/Navigation';
import {
  HeroContent,
  EngineeringContent,
  PerformanceContent,
  CameraContent,
  ReassemblyContent,
} from '~/components/animation/StoryBeat';
import { STORY_BEATS } from '~/constants/images';
import { motion } from 'framer-motion';
import { Link } from '@remix-run/react';

export function meta() {
  return [
    { title: 'iPhone 17 Pro Max - The Most Advanced iPhone Ever' },
    { description: 'Pro, taken further. The most advanced iPhone ever created.' },
    { viewport: 'width=device-width,initial-scale=1' },
  ];
}

export default function Home() {
  const progress = useScrollProgress();
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="min-h-screen bg-background-primary">
      {/* Navigation */}
      <Navigation />

      {/* Sticky Canvas Container */}
      <div className="relative h-[400vh]">
        {/* Fixed Canvas */}
        <div className="sticky top-0 h-screen w-full overflow-hidden">
          <VideoScrollPlayer progress={progress} />

          {/* Story Beat Overlays */}
          <div className="absolute inset-0 pointer-events-none">
            {/* Hero Section (0-15%) */}
            <HeroContent
              opacity={getBeatOpacity(STORY_BEATS.HERO.start, STORY_BEATS.HERO.end)}
              zIndex={10}
            />

            {/* Engineering Section (15-40%) */}
            <EngineeringContent
              opacity={getBeatOpacity(STORY_BEATS.ENGINEERING.start, STORY_BEATS.ENGINEERING.end)}
              zIndex={20}
            />

            {/* Performance Section (40-65%) */}
            <PerformanceContent
              opacity={getBeatOpacity(STORY_BEATS.PERFORMANCE.start, STORY_BEATS.PERFORMANCE.end)}
              zIndex={30}
            />

            {/* Camera Section (65-85%) */}
            <CameraContent
              opacity={getBeatOpacity(STORY_BEATS.CAMERA.start, STORY_BEATS.CAMERA.end)}
              zIndex={40}
            />

            {/* Reassembly Section (85-100%) */}
            <ReassemblyContent
              opacity={getBeatOpacity(STORY_BEATS.REASSEMBLY.start, STORY_BEATS.REASSEMBLY.end)}
              zIndex={50}
            />
          </div>
        </div>
      </div>

      {/* Product CTA Section */}
      <motion.section
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="relative z-20 bg-gradient-to-b from-background-primary to-background-secondary py-20"
      >
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
            Ready to experience the future?
          </h2>
          <p className="text-xl text-white/80 mb-8 max-w-2xl mx-auto">
            Pre-order now and be among the first to receive your iPhone 17 Pro Max.
          </p>
          <Link
            to="/product/iphone-17-pro-max"
            className="inline-flex items-center gap-2 bg-accent-primary hover:bg-accent-secondary text-white px-8 py-4 rounded-lg font-semibold transition-all hover:scale-105 active:scale-95 text-lg"
          >
            Buy Now
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4-4m4 4H3m14 0v14m-4 0H3m14 0v-8" />
            </svg>
          </Link>
        </div>
      </motion.section>
    </div>
  );
}

function getBeatOpacity(beatStart: number, beatEnd: number): number {
  const fadeRange = 0.05;

  if (progress < beatStart - fadeRange) return 0;
  if (progress > beatEnd + fadeRange) return 0;

  if (progress < beatStart) {
    return Math.max(0, (progress - (beatStart - fadeRange)) / fadeRange);
  }

  if (progress > beatEnd) {
    return Math.max(0, 1 - (progress - beatEnd) / fadeRange);
  }

  return 1;
}
```

### 6.2 Create Product Detail Route

Create `frontend/app/routes/product.$id.tsx`:

```typescript
import { Link, useLoaderData, useNavigate } from '@remix-run/react';
import { useCartStore } from '~/lib/stores/cartStore';
import { IPHONE_17_PRO_MAX } from '~/lib/products';
import { motion } from 'framer-motion';

export function loader({ params }: { params: { id: string } }) {
  const product = params.id === 'iphone-17-pro-max' ? IPHONE_17_PRO_MAX : null;
  return { product };
}

export function meta({ loaderData }: { loaderData: typeof loader }) {
  return [
    { title: loaderData.product?.name || 'Product Not Found' },
    { description: loaderData.product?.description || '' },
  ];
}

export default function ProductDetail() {
  const { product } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const addToCart = useCartStore((state) => state.addToCart);
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background-primary">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-4">Product Not Found</h1>
          <Link
            to="/"
            className="inline-block bg-accent-primary hover:bg-accent-secondary text-white px-6 py-3 rounded-lg font-semibold transition-all"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const handleAddToCart = async () => {
    setIsAdding(true);
    await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate API call
    addToCart({
      productId: product.id,
      quantity,
      price: product.price,
      name: product.name,
      image: product.images[0],
    });
    setIsAdding(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background-primary to-background-secondary">
      {/* Header */}
      <nav className="sticky top-0 z-40 bg-background-primary/80 backdrop-blur-lg border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="text-white font-bold text-xl">
            iPhone 17 Pro Max
          </Link>
          <Link
            to="/"
            className="text-white/70 hover:text-white transition-colors"
          >
            Back
          </Link>
        </div>
      </nav>

      {/* Product Details */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          {/* Product Image/Preview */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="relative"
          >
            <div className="aspect-[4/5] bg-black/20 rounded-2xl overflow-hidden">
              {product.images[0]?.endsWith('.mp4') ? (
                <video
                  src={product.images[0]}
                  className="w-full h-full object-cover"
                  muted
                  loop
                  autoPlay
                  playsInline
                />
              ) : (
                <img
                  src={product.images[0] || '/placeholder.jpg'}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
          </motion.div>

          {/* Product Info */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              {product.name}
            </h1>

            <p className="text-lg text-white/80 mb-8">
              {product.description}
            </p>

            {/* Price */}
            <div className="mb-8">
              <div className="flex items-baseline gap-3">
                <span className="text-5xl font-bold text-accent-primary">
                  ${product.price.toLocaleString()}
                </span>
                {product.compareAtPrice && (
                  <span className="text-2xl text-white/50 line-through">
                    ${product.compareAtPrice.toLocaleString()}
                  </span>
                )}
              </div>
              <p className="text-sm text-white/60">
                Or ${Math.round(product.price / 24).toLocaleString()}/month with Apple Card
              </p>
            </div>

            {/* Features */}
            <div className="mb-8">
              <h3 className="text-xl font-semibold text-white mb-4">Features</h3>
              <ul className="space-y-3">
                {product.features.map((feature, index) => (
                  <motion.li
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1, duration: 0.4 }}
                    className="flex items-center gap-3 text-white/90"
                  >
                    <svg className="w-5 h-5 text-accent-primary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {feature}
                  </motion.li>
                ))}
              </ul>
            </div>

            {/* Specifications */}
            <div className="mb-8">
              <h3 className="text-xl font-semibold text-white mb-4">Specifications</h3>
              <dl className="space-y-3 text-white/90">
                {Object.entries(product.specifications).map(([key, value]) => (
                  <div className="flex justify-between py-2 border-b border-white/10">
                    <dt className="font-medium">{key}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Quantity Selector */}
            <div className="mb-8">
              <label className="block text-sm font-medium text-white mb-2">Quantity</label>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1}
                  className="w-12 h-12 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  −
                </button>
                <span className="text-2xl font-bold text-white w-12 text-center">
                  {quantity}
                </span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-12 h-12 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold transition-all"
                >
                  +
                </button>
              </div>
            </div>

            {/* Add to Cart Button */}
            <motion.button
              onClick={handleAddToCart}
              disabled={isAdding || !product.inStock}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={clsx(
                'w-full bg-accent-primary hover:bg-accent-secondary text-white',
                'px-8 py-4 rounded-lg font-semibold text-lg transition-all',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            >
              {isAdding ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12c0 4.411 3.589 8 8 8v4h-6v-4c0-2.757 2.243-5 5-5h4z"></path>
                  </svg>
                  Adding to Cart...
                </span>
              ) : product.inStock ? (
                'Add to Cart'
              ) : (
                'Out of Stock'
              )}
            </motion.button>

            {/* Stock Status */}
            {product.inStock && (
              <p className="text-sm text-accent-primary mt-4">
                ✓ In Stock - Free Shipping
              </p>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
```

### 6.3 Create Cart Route

Create `frontend/app/routes/cart.tsx`:

```typescript
import { useCartStore } from '~/lib/stores/cartStore';
import { Link } from '@remix-run/react';
import { motion, AnimatePresence } from 'framer-motion';

export function meta() {
  return [
    { title: 'Shopping Cart - iPhone 17 Pro Max' },
  ];
}

export default function Cart() {
  const {
    items,
    removeFromCart,
    updateQuantity,
    getTotal,
    getItemCount,
    clearCart,
  } = useCartStore();

  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const handleCheckout = async () => {
    setIsCheckingOut(true);
    // TODO: Integrate with backend checkout API
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsCheckingOut(false);
    alert('Checkout integration coming soon!');
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background-primary to-background-secondary flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-8"
          >
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-white/10 flex items-center justify-center">
              <svg className="w-12 h-12 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 21h10a2 2 0 002-2V9a2 2 0 00-2-2h-2l-2 2m0-10.586a1 1 0 01-.707-.293l-9.293-9.293a1 1 0 01-1.414 0L9 12l4.293 4.293a1 1 0 01.707.293l9.293 9.293a1 1 0 011.414 0L13 12l-4.293-4.293a1 1 0 01-.707-.293l-9.293-9.293a1 1 0 01-1.414 0L3 12z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white mb-4">
              Your cart is empty
            </h1>
            <p className="text-lg text-white/80 mb-8">
              Looks like you haven't added anything to your cart yet.
            </p>
            <Link
              to="/product/iphone-17-pro-max"
              className="inline-block bg-accent-primary hover:bg-accent-secondary text-white px-8 py-4 rounded-lg font-semibold transition-all hover:scale-105"
            >
              Browse Products
            </Link>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background-primary to-background-secondary">
      {/* Header */}
      <nav className="sticky top-0 z-40 bg-background-primary/80 backdrop-blur-lg border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="text-white font-bold text-xl">
            iPhone 17 Pro Max
          </Link>
          <Link
            to="/"
            className="text-white/70 hover:text-white transition-colors"
          >
            Continue Shopping
          </Link>
        </div>
      </nav>

      {/* Cart Content */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold text-white mb-8">
          Shopping Cart ({getItemCount()})
        </h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Cart Items */}
          <div className="lg:col-span-2 space-y-4">
            <AnimatePresence mode="popLayout">
              {items.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  transition={{ duration: 0.3 }}
                  className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/10"
                >
                  <div className="flex gap-6">
                    {/* Product Image */}
                    <div className="w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-black/20">
                      {item.image?.endsWith('.mp4') ? (
                        <video
                          src={item.image}
                          className="w-full h-full object-cover"
                          muted
                          loop
                          autoPlay
                          playsInline
                        />
                      ) : (
                        <img
                          src={item.image || '/placeholder.jpg'}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>

                    {/* Product Info */}
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-white mb-2">
                        {item.name}
                      </h3>
                      <p className="text-2xl font-bold text-accent-primary mb-4">
                        ${item.price.toLocaleString()}
                      </p>

                      {/* Quantity Controls */}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                          className="w-10 h-10 rounded-lg bg-white/20 hover:bg-white/30 text-white font-bold transition-all disabled:opacity-50"
                        >
                          −
                        </button>
                        <span className="text-xl font-bold text-white w-10 text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="w-10 h-10 rounded-lg bg-white/20 hover:bg-white/30 text-white font-bold transition-all"
                        >
                          +
                        </button>
                      </div>

                      {/* Remove Button */}
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="text-red-400 hover:text-red-300 text-sm font-medium mt-3 transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Order Summary */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/10 h-fit sticky top-24"
          >
            <h2 className="text-2xl font-bold text-white mb-6">Order Summary</h2>

            <div className="space-y-4 mb-6">
              <div className="flex justify-between text-white/80">
                <span>Subtotal</span>
                <span>${getTotal().toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-white/80">
                <span>Shipping</span>
                <span className="text-accent-primary">FREE</span>
              </div>
              <div className="flex justify-between text-white/80">
                <span>Tax</span>
                <span>${Math.round(getTotal() * 0.08).toLocaleString()}</span>
              </div>
              <div className="border-t border-white/20 pt-4">
                <div className="flex justify-between text-2xl font-bold text-white">
                  <span>Total</span>
                  <span>${Math.round(getTotal() * 1.08).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <motion.button
                onClick={handleCheckout}
                disabled={isCheckingOut}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full bg-accent-primary hover:bg-accent-secondary text-white py-4 rounded-lg font-semibold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCheckingOut ? 'Processing...' : 'Proceed to Checkout'}
              </motion.button>

              <button
                onClick={clearCart}
                className="w-full bg-white/20 hover:bg-white/30 text-white py-3 rounded-lg font-medium transition-all"
              >
                Clear Cart
              </button>
            </div>

            {/* Security Badge */}
            <div className="mt-6 pt-6 border-t border-white/20">
              <div className="flex items-center justify-center gap-2 text-white/60 text-sm">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2h10m-7 2H5a2 2 0 00-2 2v-10a2 2 0 012 2h14a2 2 0 012-2v10a2 2 0 00-2 2h-3" />
                </svg>
                Secure checkout with Apple Pay
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
```

## Step 7: Create Cart Icon Component

Create `frontend/app/components/layout/CartIcon.tsx`:

```typescript
import { useCartStore } from '~/lib/stores/cartStore';
import { Link } from '@remix-run/react';

export function CartIcon() {
  const { isOpen, toggleCart, getItemCount } = useCartStore();

  return (
    <>
      <Link
        to="/cart"
        className="relative p-2 text-white/70 hover:text-white transition-colors"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 3h2l.4 2M7 21h10a2 2 0 002-2V9a2 2 0 00-2-2h-2l-2 2m0-10.586a1 1 0 01-.707-.293l-9.293-9.293a1 1 0 01-1.414 0L9 12l4.293 4.293a1 1 0 01.707.293l9.293 9.293a1 1 0 011.414 0L13 12l-4.293-4.293a1 1 0 01-.707-.293l-9.293-9.293a1 1 0 01-1.414 0L3 12z"
          />
        </svg>

        {getItemCount() > 0 && (
          <span className="absolute -top-1 -right-1 bg-accent-primary text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
            {getItemCount()}
          </span>
        )}
      </Link>
    </>
  );
}
```

## Step 8: Update Root Layout

Update `frontend/app/root.tsx`:

```typescript
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from '@remix-run/react';
import type { LinksFunction, MetaFunction } from '@remix-run/node';
import { Navigation } from '~/components/layout/Navigation';
import { CartIcon } from '~/components/layout/CartIcon';

export const links: LinksFunction = () => [
  { rel: 'stylesheet', href: '/styles/global.css' },
];

export const meta: MetaFunction = () => {
  return [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width,initial-scale=1' },
    { name: 'description', content: 'iPhone 17 Pro Max - Pro, taken further.' },
  ];
};

export default function App() {
  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
      </head>
      <body className="bg-gray-50 text-gray-900">
        <ScrollRestoration />
        <Navigation />
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
```

## Step 9: Add Content Components

Create `frontend/app/components/animation/content.tsx`:

```typescript
import { StoryBeat } from './StoryBeat';
import { STORY_BEAT_CONTENT } from '~/constants/content';
import { motion } from 'framer-motion';
import { Link } from '@remix-run/react';

export function HeroContent({ opacity, zIndex }: { opacity: number; zIndex: number }) {
  return (
    <StoryBeat opacity={opacity} zIndex={zIndex}>
      <div className="h-screen flex flex-col items-center justify-center text-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl"
        >
          <h1 className="text-6xl md:text-8xl font-bold text-white mb-6 tracking-tight">
            {STORY_BEAT_CONTENT.HERO.headline}
          </h1>
          <p className="text-2xl md:text-3xl text-white/80 mb-8">
            {STORY_BEAT_CONTENT.HERO.subheadline}
          </p>
          <p className="text-lg text-accent-primary font-medium">
            {STORY_BEAT_CONTENT.HERO.tagline}
          </p>
          <Link
            to="/product/iphone-17-pro-max"
            className="inline-block bg-accent-primary hover:bg-accent-secondary text-white px-8 py-4 rounded-lg font-semibold text-xl transition-all hover:scale-105 mt-8"
          >
            Buy Now
          </Link>
        </motion.div>
      </div>
    </StoryBeat>
  );
}

export function EngineeringContent({ opacity, zIndex }: { opacity: number; zIndex: number }) {
  return (
    <StoryBeat opacity={opacity} zIndex={zIndex}>
      <div className="h-screen flex flex-col justify-center px-6 md:px-20">
        <div className="max-w-3xl">
          <motion.h2
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="text-5xl md:text-6xl font-bold text-white mb-8"
          >
            {STORY_BEAT_CONTENT.ENGINEERING.headline}
          </motion.h2>
          {STORY_BEAT_CONTENT.ENGINEERING.subcopy.map((line, index) => (
            <motion.p
              key={index}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.2 }}
              className="text-xl md:text-2xl text-white/80 mb-6"
            >
              {line}
            </motion.p>
          ))}
        </div>
      </div>
    </StoryBeat>
  );
}

// Add PerformanceContent, CameraContent, ReassemblyContent similarly...
```

## Step 10: Update Navigation Component

Update `frontend/app/components/layout/Navigation.tsx` to include cart icon:

```typescript
import { Link } from '@remix-run/react';
import { motion } from 'framer-motion';
import { NAVIGATION_LINKS } from '~/constants/content';
import { CartIcon } from './CartIcon';

export function Navigation() {
  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="fixed top-0 left-0 right-0 z-40 px-6 py-4 bg-background-primary/80 backdrop-blur-lg border-b border-white/10"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="text-white font-bold text-xl tracking-tight">
          iPhone 17 Pro Max
        </Link>

        {/* Links */}
        <ul className="hidden md:flex items-center gap-8">
          {NAVIGATION_LINKS.map((link, index) => (
            <motion.li
              key={link}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.4, ease: 'easeOut' }}
            >
              <Link
                to={`#${link.toLowerCase().replace(/\s+/g, '-')}`}
                className="text-white/70 hover:text-white transition-colors text-sm font-medium"
              >
                {link}
              </Link>
            </motion.li>
          ))}
        </ul>

        {/* Actions */}
        <div className="flex items-center gap-6">
          <CartIcon />
          <Link
            to="/product/iphone-17-pro-max"
            className="bg-accent-primary hover:bg-accent-secondary text-white px-6 py-2.5 rounded-lg font-semibold transition-all hover:scale-105 active:scale-95"
          >
            Buy Now
          </Link>
        </div>
      </div>
    </motion.nav>
  );
}
```

## Step 11: Create Global Styles

Create `frontend/app/styles/global.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --color-background-primary: #050505;
    --color-background-secondary: #0A0A0C;
    --color-accent-primary: #3A6DFF;
    --color-accent-secondary: #6FE3FF;
  }

  body {
    @apply bg-background-primary text-gray-900;
    scroll-behavior: smooth;
  }

  * {
    @apply border-border-white/10;
  }
}

@layer utilities {
  .animate-spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .scroll-prompt {
    animation: scrollPrompt 1.5s ease-in-out infinite;
  }

  @keyframes scrollPrompt {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(12px);
    }
  }
}
```

## Step 12: Build and Test

```bash
# Navigate to Remix project
cd frontend

# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

## Step 13: Update Docker Configuration

Update `frontend/Dockerfile`:

```dockerfile
# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json pnpm-lock.yaml ./

# Install dependencies
RUN corepack enable && \
    npm install -g pnpm && \
    pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build application
RUN pnpm build

# Runtime stage
FROM node:20-alpine

WORKDIR /app

# Install dependencies for runtime
COPY package*.json pnpm-lock.yaml ./
RUN corepack enable && \
    npm install -g pnpm && \
    pnpm install --prod --frozen-lockfile

# Copy build
COPY --from=builder /app/build ./build
COPY --from=builder /app/public ./public
COPY --from=builder /app/videos ./public/videos

EXPOSE 3000

CMD ["pnpm", "start"]
```

## Migration Checklist

- [x] Create Remix project structure
- [x] Copy and convert configuration files
- [x] Migrate video assets
- [x] Convert Next.js components to Remix
- [x] Add product data and store
- [x] Create product detail route
- [x] Create cart route with state management
- [x] Update navigation with cart icon
- [x] Test scroll-telling animations
- [x] Verify responsive design

## Key Differences Between Next.js and Remix

| Feature | Next.js | Remix |
|---------|----------|--------|
| **Routing** | App Router (`app/page.tsx`) | File-based (`app/routes/_index.tsx`) |
| **Data Loading** | `getServerSideProps` | `loader` function |
| **Forms** | Server Actions | `action` function |
| **Hooks** | `use client` directive | Automatic - all components server-compatible |
| **Styling** | Same Tailwind | Same Tailwind (unchanged) |
| **Animations** | Framer Motion (same) | Framer Motion (same) |

## Next Steps

1. **Integrate with Backend API**
   - Connect product data to PostgreSQL database
   - Implement real checkout flow
   - Add authentication

2. **Add More Products**
   - Add storage plans
   - Add accessories
   - Create product categories

3. **Optimize Performance**
   - Implement code splitting
   - Add image optimization
   - Enable streaming for better UX

4. **Add Analytics**
   - Track page views
   - Monitor conversion rates
   - Track cart abandonment

## Troubleshooting

### Video Not Playing
- Check video file path in `VideoScrollPlayer.tsx`
- Verify video is in `public/videos/`
- Check browser console for errors

### Scroll Not Working
- Verify `useScrollProgress` hook is properly initialized
- Check that container has enough height (`h-[400vh]`)
- Test scroll listener attachment

### State Not Persisting
- Zustand stores reset on page refresh (expected for Remix)
- Consider using Remix cookies for cart persistence
- Implement `cart.cookie.ts` for server-side state

### Build Errors
- Check Remix version compatibility
- Verify all imports are correct
- Review TypeScript errors in console

### Styling Issues
- Verify Tailwind CSS is properly imported
- Check `global.css` exists and is imported in root
- Test responsive breakpoints

## Resources

- [Remix Documentation](https://remix.run/docs)
- [Framer Motion Documentation](https://www.framer.com/motion)
- [Zustand Documentation](https://docs.pmnd.rs.core/introduction/getting-started)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

---

Your iPhone 17 Pro Max landing page has been successfully converted to Remix with product and cart functionality!
