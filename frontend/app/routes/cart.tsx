import { useCartStore } from '~/lib/stores/cartStore';
import { Link } from '@remix-run/react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2h-2l-2 2m0-10.586a1 1 0 01-.707-.293l-9.293-9.293a1 1 0 01-1.414 0L9 12l4.293 4.293a1 1 0 01.707.293l9.293 9.293a1 1 0 011.414 0L13 12l-4.293-4.293a1 1 0 01-.707-.293l-9.293-9.293a1 1 0 01-1.414 0L3 12z" />
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
