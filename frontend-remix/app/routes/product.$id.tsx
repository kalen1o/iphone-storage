import { Link, useLoaderData, useNavigate } from '@remix-run/react';
import type { LoaderFunctionArgs } from '@remix-run/node';
import { useCartStore } from '~/lib/stores/cartStore';
import { IPHONE_17_PRO_MAX } from '~/lib/products';
import { motion } from 'framer-motion';
import { useState } from 'react';

export function loader({ params }: LoaderFunctionArgs) {
  const product = params.id === 'iphone-17-pro-max' ? IPHONE_17_PRO_MAX : null;
  return { product };
}

export function meta({ data }: { data: typeof loader }) {
  return [
    { title: data.product?.name || 'Product Not Found' },
    { description: data.product?.description || '' },
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
              className={`w-full bg-accent-primary hover:bg-accent-secondary text-white px-8 py-4 rounded-lg font-semibold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
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
