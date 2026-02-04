# Remix Frontend Implementation

This guide implements the Remix frontend application that provides a modern, server-rendered React user interface for the online storage system.

## Step 1: Initialize Remix Application

Create and initialize the Remix frontend:

```bash
cd frontend

# Create a new Remix application
npx create-remix@latest --template remix-run/remix/templates/remix

# Or use TypeScript template
npx create-remix@latest --template remix-run/remix/templates/typescript

# Install additional dependencies
pnpm add @radix-ui/react-icons axios zustand clsx tailwind-merge

# Install dev dependencies
pnpm add -D @types/node @types/react @types/react-dom tailwindcss postcss autoprefixer
```

## Step 2: Project Structure

Create directory structure:

```bash
cd frontend

# Additional directories
mkdir -p app/components/{ui,layout}
mkdir -p app/lib/{api,hooks,utils}
mkdir -p app/routes
mkdir -p public/icons
```

## Step 3: Tailwind CSS Configuration

Setup Tailwind CSS for styling.

### Create `frontend/tailwind.config.ts`:

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
      },
    },
  },
  plugins: [],
};

export default config;
```

### Create `frontend/postcss.config.js`:

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

## Step 4: API Client

Create a reusable API client for communicating with the backend.

### Create `frontend/app/lib/api/client.ts`:

```typescript
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://localhost/api';

interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    return headers;
  }

  async get<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  async post<T>(path: string, body: any, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  async put<T>(path: string, body: any, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  async delete<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
```

## Step 5: API Service Layer

Create service layer for API calls.

### Create `frontend/app/lib/api/auth.ts`:

```typescript
import { apiClient } from './client';

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
  email_verified: boolean;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
}

export const authService = {
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response = await apiClient.post<LoginResponse>('/auth/login', credentials);
    
    // Store token
    if (response.token) {
      apiClient.setToken(response.token);
      localStorage.setItem('token', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
    }
    
    return response;
  },

  async register(data: RegisterRequest): Promise<LoginResponse> {
    const response = await apiClient.post<LoginResponse>('/auth/register', data);
    
    // Store token
    if (response.token) {
      apiClient.setToken(response.token);
      localStorage.setItem('token', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
    }
    
    return response;
  },

  logout() {
    apiClient.clearToken();
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  isAuthenticated(): boolean {
    return !!localStorage.getItem('token');
  },

  getCurrentUser(): User | null {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  },
};
```

### Create `frontend/app/lib/api/products.ts`:

```typescript
import { apiClient } from './client';

export interface Product {
  id: string;
  name: string;
  description: string;
  sku: string;
  price: number;
  compare_at_price?: number;
  category?: string;
  images?: string[];
  metadata?: Record<string, any>;
  is_active: boolean;
  is_digital: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductsResponse {
  products: Product[];
  limit: number;
  offset: number;
}

export const productsService = {
  async getProducts(limit = 50, offset = 0): Promise<ProductsResponse> {
    return apiClient.get<ProductsResponse>(`/products?limit=${limit}&offset=${offset}`);
  },

  async getProduct(id: string): Promise<Product> {
    return apiClient.get<Product>(`/products/${id}`);
  },
};
```

### Create `frontend/app/lib/api/cart.ts`:

```typescript
import { apiClient } from './client';

export interface CartItem {
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface Cart {
  items: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
}

export const cartService = {
  async getCart(): Promise<Cart> {
    return apiClient.get<Cart>('/cart');
  },

  async addToCart(productId: string, quantity: number): Promise<Cart> {
    return apiClient.post<Cart>('/cart/items', { product_id: productId, quantity });
  },

  async updateCartItem(productId: string, quantity: number): Promise<Cart> {
    return apiClient.put<Cart>(`/cart/items/${productId}`, { quantity });
  },

  async removeFromCart(productId: string): Promise<Cart> {
    return apiClient.delete<Cart>(`/cart/items/${productId}`);
  },

  async clearCart(): Promise<Cart> {
    return apiClient.delete<Cart>('/cart');
  },
};
```

### Create `frontend/app/lib/api/orders.ts`:

```typescript
import { apiClient } from './client';

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface Order {
  id: string;
  user_id: string;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  customer_notes?: string;
  items: OrderItem[];
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CreateOrderRequest {
  items: Array<{
    product_id: string;
    quantity: number;
  }>;
  customer_notes?: string;
}

export const ordersService = {
  async createOrder(data: CreateOrderRequest): Promise<Order> {
    return apiClient.post<Order>('/orders', data);
  },

  async getOrder(id: string): Promise<Order> {
    return apiClient.get<Order>(`/orders/${id}`);
  },

  async getOrders(limit = 20, offset = 0): Promise<Order[]> {
    return apiClient.get<Order[]>(`/orders?limit=${limit}&offset=${offset}`);
  },
};
```

## Step 6: UI Components

Create reusable UI components.

### Create `frontend/app/components/ui/Button.tsx`:

```typescript
import { clsx } from 'clsx';
import { type ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={clsx(
          'inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
          {
            'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500': variant === 'primary',
            'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500': variant === 'secondary',
            'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500': variant === 'danger',
            'bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-500': variant === 'ghost',
          },
          {
            'px-3 py-1.5 text-sm': size === 'sm',
            'px-4 py-2 text-base': size === 'md',
            'px-6 py-3 text-lg': size === 'lg',
          },
          className
        )}
        {...props}
      >
        {isLoading ? (
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12c0 4.411 3.589 8 8 8v4h-6v-4c0-2.757 2.243-5 5-5h4z"></path>
          </svg>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

export default Button;
```

### Create `frontend/app/components/ui/Input.tsx`:

```typescript
import { clsx } from 'clsx';
import { type InputHTMLAttributes, forwardRef } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-gray-700">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={clsx(
            'px-4 py-2 rounded-md border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all',
            error ? 'border-red-500 focus:ring-red-500' : 'focus:ring-blue-500',
            className
          )}
          {...props}
        />
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
```

### Create `frontend/app/components/ui/Card.tsx`:

```typescript
import { clsx, type ClassValue } from 'clsx';
import { type HTMLAttributes, forwardRef } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  className?: ClassValue;
}

const Card = forwardRef<HTMLDivElement, CardProps>(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={clsx(
        'bg-white rounded-lg shadow-md border border-gray-200',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

Card.displayName = 'Card';

export default Card;
```

## Step 7: Layout Components

Create layout components for the application.

### Create `frontend/app/components/layout/Header.tsx`:

```typescript
import { Link, useLocation } from '@remix-run/react';
import { authService } from '~/lib/api/auth';

export default function Header() {
  const location = useLocation();
  const user = authService.getCurrentUser();

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center">
            <span className="text-2xl font-bold text-blue-600">StorageStore</span>
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-6">
            <Link
              to="/products"
              className="text-gray-700 hover:text-blue-600 transition-colors"
            >
              Products
            </Link>
            
            {user ? (
              <>
                <Link
                  to="/orders"
                  className="text-gray-700 hover:text-blue-600 transition-colors"
                >
                  Orders
                </Link>
                <button
                  onClick={authService.logout}
                  className="text-gray-700 hover:text-blue-600 transition-colors"
                >
                  Logout ({user.first_name})
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/login"
                  className={location.pathname === '/login' ? 'text-blue-600 font-medium' : 'text-gray-700 hover:text-blue-600 transition-colors'}
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
                >
                  Register
                </Link>
              </>
            )}
          </nav>
        </div>
      </div>
    </header>
  );
}
```

### Create `frontend/app/components/layout/Footer.tsx`:

```typescript
import { Link } from '@remix-run/react';

export default function Footer() {
  return (
    <footer className="bg-gray-800 text-gray-300 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Company */}
          <div>
            <h3 className="text-white font-semibold mb-4">StorageStore</h3>
            <p className="text-sm">
              Your trusted online storage solution provider.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-white font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li><Link to="/products" className="hover:text-white transition-colors">Products</Link></li>
              <li><Link to="/about" className="hover:text-white transition-colors">About Us</Link></li>
              <li><Link to="/contact" className="hover:text-white transition-colors">Contact</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-white font-semibold mb-4">Legal</h3>
            <ul className="space-y-2">
              <li><Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
              <li><Link to="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-gray-700 text-center text-sm">
          <p>&copy; 2026 StorageStore. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
```

## Step 8: Route Pages

Create route pages for the application.

### Create `frontend/app/routes/_index.tsx` (Home Page):

```typescript
import { Link } from '@remix-run/react';
import { productsService } from '~/lib/api/products';
import type { Route } from './+types/landing';

export const meta: Route.MetaArgs = () => {
  return [
    { title: 'StorageStore - Your Online Storage Solution' },
    { description: 'Browse our selection of storage plans and services.' },
  ];
};

export async function loader() {
  try {
    const products = await productsService.getProducts(8, 0);
    return { products: products.products };
  } catch (error) {
    return { products: [] };
  }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { products } = loaderData;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero Section */}
      <section className="bg-gradient-to-r from-blue-600 to-blue-800 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Your Cloud Storage Solution
          </h1>
          <p className="text-xl mb-8 max-w-2xl mx-auto">
            Secure, reliable, and scalable storage for all your needs
          </p>
          <Link
            to="/products"
            className="inline-block bg-white text-blue-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
          >
            Browse Products
          </Link>
        </div>
      </section>

      {/* Featured Products */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            Featured Products
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {products.map((product) => (
              <Link
                key={product.id}
                to={`/products/${product.id}`}
                className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
              >
                <div className="aspect-square bg-gray-200" />
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">{product.name}</h3>
                  <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                    {product.description}
                  </p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-blue-600">
                      ${product.price.toFixed(2)}
                    </span>
                    {product.compare_at_price && (
                      <span className="text-sm text-gray-500 line-through">
                        ${product.compare_at_price.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="text-center mt-8">
            <Link
              to="/products"
              className="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              View All Products
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
```

### Create `frontend/app/routes/products.tsx` (Products Page):

```typescript
import { useState } from 'react';
import { useLoaderData, Link } from '@remix-run/react';
import { productsService } from '~/lib/api/products';
import type { Route } from './+types/products';
import Input from '~/components/ui/Input';
import Button from '~/components/ui/Button';

export const meta: Route.MetaArgs = () => {
  return [
    { title: 'Products - StorageStore' },
    { description: 'Browse our selection of storage plans and services.' },
  ];
};

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');
  
  try {
    const response = await productsService.getProducts(limit, offset);
    return { products: response.products, total: response.products.length };
  } catch (error) {
    return { products: [], total: 0 };
  }
}

export default function Products({ loaderData }: Route.ComponentProps) {
  const { products } = loaderData;
  const [searchTerm, setSearchTerm] = useState('');

  const filteredProducts = products.filter(product =>
    product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    product.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">
        Products
      </h1>

      {/* Search */}
      <div className="mb-8">
        <Input
          type="text"
          placeholder="Search products..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {filteredProducts.map((product) => (
          <Link
            key={product.id}
            to={`/products/${product.id}`}
            className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
          >
            <div className="aspect-square bg-gray-200" />
            <div className="p-4">
              <h3 className="font-semibold text-gray-900 mb-2">{product.name}</h3>
              <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                {product.description}
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-blue-600">
                  ${product.price.toFixed(2)}
                </span>
                {product.compare_at_price && (
                  <span className="text-sm text-gray-500 line-through">
                    ${product.compare_at_price.toFixed(2)}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {filteredProducts.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-600 text-lg">No products found</p>
        </div>
      )}
    </div>
  );
}
```

### Create `frontend/app/routes/products.$id.tsx` (Product Detail Page):

```typescript
import { useState } from 'react';
import { useLoaderData, useNavigate, Link } from '@remix-run/react';
import { productsService, cartService } from '~/lib/api/auth';
import type { Route } from './+types/product-detail';
import Button from '~/components/ui/Button';
import Input from '~/components/ui/Input';

export const meta: Route.MetaArgs = ({ params }: Route.MetaArgs) => {
  return [
    { title: `Product - StorageStore` },
    { description: 'Product details' },
  ];
};

export async function loader({ params }: Route.LoaderArgs) {
  try {
    const product = await productsService.getProduct(params.id);
    return { product };
  } catch (error) {
    return { product: null };
  }
}

export default function ProductDetail({ loaderData }: Route.ComponentProps) {
  const { product } = loaderData;
  const navigate = useNavigate();
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);

  if (!product) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Product Not Found
        </h1>
        <Link to="/products" className="text-blue-600 hover:underline">
          Back to Products
        </Link>
      </div>
    );
  }

  const handleAddToCart = async () => {
    setIsAdding(true);
    try {
      await cartService.addToCart(product.id, quantity);
      alert('Added to cart!');
    } catch (error) {
      alert('Failed to add to cart');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Product Image */}
        <div className="bg-gray-200 rounded-lg aspect-square" />

        {/* Product Info */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            {product.name}
          </h1>

          <p className="text-gray-600 mb-6">
            {product.description}
          </p>

          <div className="mb-6">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-blue-600">
                ${product.price.toFixed(2)}
              </span>
              {product.compare_at_price && (
                <span className="text-xl text-gray-500 line-through">
                  ${product.compare_at_price.toFixed(2)}
                </span>
              )}
            </div>
          </div>

          {/* Quantity Selector */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quantity
            </label>
            <Input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(parseInt(e.target.value))}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <Button
              onClick={handleAddToCart}
              isLoading={isAdding}
              className="flex-1"
            >
              Add to Cart
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate(-1)}
            >
              Back
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

## Step 9: Root Layout

Create the root layout component.

### Create `frontend/app/root.tsx`:

```typescript
import {
  Links,
  LiveReload,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
} from '@remix-run/react';
import type { LinksFunction, MetaFunction } from '@remix-run/node';
import Header from '~/components/layout/Header';
import Footer from '~/components/layout/Footer';

export const links: LinksFunction = () => [
  { rel: 'stylesheet', href: '/styles/global.css' },
];

export const meta: MetaFunction = () => {
  return [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width,initial-scale=1' },
  ];
};

export default function App() {
  const location = useLocation();

  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
      </head>
      <body className="bg-gray-50 text-gray-900">
        <ScrollRestoration />
        <Header />
        <main className="flex-1">
          <Outlet />
        </main>
        <Footer />
        <ScrollRestoration />
        <Scripts />
        <LiveReload />
      </body>
    </html>
  );
}
```

### Create `frontend/app/styles/global.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-gray-50 text-gray-900;
}

.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

## Step 10: Dockerfile

Create Dockerfile for the frontend.

### Create `frontend/Dockerfile`:

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

EXPOSE 3000

CMD ["pnpm", "start"]
```

### Create `frontend/.dockerignore`:

```
node_modules
.env
.env.local
.git
.DS_Store
build
public/build
```

## Step 11: Run and Test

Build and run the Remix frontend:

```bash
cd frontend

# Install dependencies
pnpm install

# Run in development mode
pnpm dev

# Build for production
pnpm build

# Run production build
pnpm start

# Or run with Docker
docker compose up frontend
```

## Step 12: Environment Configuration

Create environment configuration file.

### Create `frontend/.env.example`:

```
# API Configuration
VITE_API_URL=https://localhost/api

# Environment
NODE_ENV=development
```

### Create `frontend/.env.production`:

```
# API Configuration
VITE_API_URL=https://api.yourdomain.com/api

# Environment
NODE_ENV=production
```

## Step 13: Update Makefile

Add frontend-related targets to Makefile:

```makefile
# Frontend targets
frontend-install:
	cd frontend && pnpm install

frontend-build:
	cd frontend && pnpm build

frontend-dev:
	cd frontend && pnpm dev

frontend-logs:
	docker compose logs -f frontend

frontend-restart:
	docker compose restart frontend
```

## Step 14: Next Steps

With the frontend implemented, continue to the final implementation guide: [10-deployment.md](./10-deployment.md)

## Troubleshooting

### API connection errors
- Verify API URL in `.env` file
- Check NGINX gateway is running: `make nginx-logs`
- Review browser console for CORS errors

### Authentication not persisting
- Check token storage in localStorage
- Verify token is being sent in API calls
- Review token expiration time

### Build errors
- Check Node.js version: `node --version` (should be 20+)
- Clear node_modules and reinstall: `rm -rf node_modules && pnpm install`
- Review TypeScript errors

### Styling issues
- Verify Tailwind CSS is properly configured
- Check build output for CSS files
- Review global.css imports in root.tsx
