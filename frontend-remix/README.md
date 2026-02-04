# iPhone 17 Pro Max Landing Page - Remix Version

This is a Remix-based version of the iPhone 17 Pro Max landing page with scroll-telling animations and e-commerce functionality (cart, product details).

## Features

- **Scroll-telling Animation**: Video-based scroll experience using VideoScrollPlayer component
- **Product Page**: Full product details with specifications and features
- **Shopping Cart**: Add/remove items, update quantities, calculate totals
- **Responsive Design**: Mobile-friendly with Tailwind CSS
- **Modern Animations**: Framer Motion for smooth transitions
- **State Management**: Zustand for client-side cart state

## Project Structure

```
frontend-remix/
├── app/
│   ├── components/
│   │   ├── animation/
│   │   │   ├── VideoScrollPlayer.tsx    # Video sync with scroll
│   │   │   ├── StoryBeat.tsx            # Story beat overlay wrapper
│   │   │   └── content.tsx             # Hero, Engineering, Performance, etc.
│   │   └── layout/
│   │       ├── Navigation.tsx             # Site navigation
│   │       └── CartIcon.tsx              # Cart icon with badge
│   ├── constants/
│   │   ├── content.ts                    # Story beat content
│   │   └── images.ts                    # Story beat timing
│   ├── lib/
│   │   ├── products.ts                  # Product data (iPhone, storage plans)
│   │   └── stores/
│   │       └── cartStore.ts              # Zustand cart state
│   ├── routes/
│   │   ├── _index.tsx                  # Home page with scroll animation
│   │   ├── product.$id.tsx              # Product detail page
│   │   └── cart.tsx                    # Shopping cart page
│   ├── styles/
│   │   └── global.css                   # Global styles and Tailwind
│   ├── entry.client.tsx                 # Client entry point
│   ├── entry.server.tsx                 # Server entry point
│   └── root.tsx                       # Root layout
├── public/
│   └── videos/
│       └── iphone-4k.mp4               # Hero video
├── Dockerfile                          # Production build
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
└── vite.config.ts
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm (or npm)

### Installation

```bash
# Navigate to the project directory
cd frontend-remix

# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Start production server
pnpm start
```

## Available Scripts

- `pnpm dev` - Start development server (http://localhost:5173)
- `pnpm build` - Build for production
- `pnpm start` - Start production server (http://localhost:3000)
- `pnpm typecheck` - Run TypeScript type checking

## Key Components

### VideoScrollPlayer

Handles video playback synchronized with scroll position. Features:
- Debounced seeking for smooth performance
- Loading overlay during video initialization
- Multiple event listeners for reliable initialization

### StoryBeat Components

Each story beat (Hero, Engineering, Performance, Camera, Reassembly) has:
- Fade in/out based on scroll position
- Fixed z-index layering
- Responsive text sizing

### Cart Store (Zustand)

Client-side state management with:
- Add to cart
- Remove from cart
- Update quantities
- Clear cart
- Calculate totals

## Routes

### `/`

Home page with scroll-telling animation featuring:
- Video background synced to scroll
- Five story beats with overlay content
- Product CTA section

### `/product/iphone-17-pro-max`

Product detail page with:
- Video preview
- Product specifications
- Feature list
- Add to cart functionality
- Quantity selector

### `/cart`

Shopping cart page with:
- Item list with quantity controls
- Order summary with calculations
- Remove items
- Clear cart
- Checkout button (placeholder)

## Docker

Build and run with Docker:

```bash
# Build image
docker build -t iphone-landing-remix .

# Run container
docker run -p 3000:3000 iphone-landing-remix
```

## Migration Notes from Next.js

Key differences in Remix:

1. **Routing**: File-based routes (`app/routes/_index.tsx`) instead of App Router
2. **Data Loading**: `loader` function instead of `getServerSideProps`
3. **No `use client` directive**: Remix automatically handles client components
4. **Links**: Use `<Link>` from `@remix-run/react` instead of Next.js Link
5. **State**: Zustand stores reset on page navigation (client-side only)

## Next Steps

1. **Backend Integration**
   - Connect cart to PostgreSQL database
   - Implement checkout API
   - Add authentication

2. **Enhanced Features**
   - User accounts
   - Order history
   - Payment processing (Stripe, Apple Pay)
   - Email notifications

3. **Performance Optimization**
   - Image optimization
   - Code splitting
   - CDN for video assets

4. **Analytics**
   - Page view tracking
   - Conversion tracking
   - Cart abandonment metrics

## Troubleshooting

### Video not loading
- Check `/public/videos/iphone-4k.mp4` exists
- Verify path in VideoScrollPlayer component
- Check browser console for errors

### Scroll animation not working
- Ensure container has `h-[400vh]` height
- Check scroll listener is attached
- Verify `useScrollProgress` hook is called

### Cart state not persisting
- Zustand resets on page refresh (expected in Remix)
- For persistence, implement Remix cookies or localStorage wrapper

### Build errors
- Run `pnpm install` to ensure dependencies
- Check TypeScript version compatibility
- Review console for specific errors

## Resources

- [Remix Documentation](https://remix.run/docs)
- [Framer Motion](https://www.framer.com/motion)
- [Zustand](https://docs.pmnd.rs/core/introduction/getting-started)
- [Tailwind CSS](https://tailwindcss.com/docs)
