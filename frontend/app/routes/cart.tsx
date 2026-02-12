import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Link, useFetcher, useNavigate } from "@remix-run/react";
import { apiFetch } from "~/lib/api.server";
import { getAuthToken } from "~/session.server";
import { useCartStore } from "~/lib/stores/cartStore";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Input } from "~/components/ui/input";
import { MapCn } from "~/components/ui/mapcn";
import {
  fadeScaleVariants,
  fadeUpVariants,
  staggerContainer,
} from "~/components/animation/route-motion";

interface CartItemPayload {
  productId: string;
  quantity: number;
}

export async function action({ request }: ActionFunctionArgs) {
  const token = await getAuthToken(request);
  if (!token) {
    const url = new URL(request.url);
    return json(
      { redirectTo: `/login?redirectTo=${encodeURIComponent(url.pathname + url.search)}` },
      { status: 401 },
    );
  }
  const form = await request.formData();
  const itemsRaw = String(form.get("items") || "[]");
  const shippingAddressText = String(form.get("shipping_address_text") || "");
  if (!shippingAddressText.trim()) {
    return json({ error: "Address is required" }, { status: 400 });
  }
  let items: CartItemPayload[] = [];
  try {
    items = JSON.parse(itemsRaw);
  } catch {
    return json({ error: "Invalid cart payload" }, { status: 400 });
  }

  const order = await apiFetch<{ id: string }>(`/orders`, {
    body: {
      shipping_address_text: shippingAddressText,
      items: items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
    },
    method: "POST",
    token,
  });

  return json({ orderId: order.id });
}

export function meta() {
  return [{ title: "Shopping Cart - iPhone 17 Pro Max" }];
}

export default function Cart() {
  const { items, removeFromCart, updateQuantity, getTotal, getItemCount, clearCart } =
    useCartStore();

  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [shippingAddressText, setShippingAddressText] = useState("");
  const [pickedLngLat, setPickedLngLat] = useState<[number, number] | null>(null);
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  const checkoutPayload = useMemo(
    () => items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
    [items],
  );

  const handleCheckout = async () => {
    setIsCheckingOut(true);
    fetcher.submit(
      { items: JSON.stringify(checkoutPayload), shipping_address_text: shippingAddressText },
      { method: "post" },
    );
  };

  useEffect(() => {
    if (!fetcher.data) {
      return;
    }
    if ("redirectTo" in fetcher.data && fetcher.data.redirectTo) {
      navigate(fetcher.data.redirectTo);
      return;
    }
    if ("orderId" in fetcher.data && fetcher.data.orderId) {
      clearCart();
      navigate(`/orders/${fetcher.data.orderId}`);
    }
  }, [fetcher.data, clearCart, navigate]);

  useEffect(() => {
    if (fetcher.state === "idle") {
      setIsCheckingOut(false);
    }
  }, [fetcher.state]);

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-secondary flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <motion.div
            variants={fadeScaleVariants}
            initial={reduceMotion ? false : "hidden"}
            animate="visible"
            className="mb-8"
          >
            <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-card/60 border border-border/10 backdrop-blur-lg flex items-center justify-center">
              <svg
                className="w-12 h-12 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 3h2l.4 2M7 21h10a2 2 0 002-2V9a2 2 0 00-2-2h-2l-2 2m0-10.586a1 1 0 01-.707-.293l-9.293-9.293a1 1 0 01-1.414 0L9 12l4.293 4.293a1 1 0 01.707.293l9.293 9.293a1 1 0 011.414 0L13 12l-4.293-4.293a1 1 0 01-.707-.293l-9.293-9.293a1 1 0 01-1.414 0L3 12z"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-4">Your cart is empty</h1>
            <p className="text-lg text-foreground/80 mb-8">
              Looks like you haven't added anything to your cart yet.
            </p>
            <Button asChild size="lg" className="px-8">
              <Link to="/products">Browse Products</Link>
            </Button>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="min-h-screen bg-gradient-to-b from-background to-secondary"
      initial={reduceMotion ? false : "hidden"}
      animate="visible"
      variants={staggerContainer(0, 0.08)}
    >
      {/* Cart Content */}
      <div className="w-full px-6 py-12">
        <motion.h1 variants={fadeUpVariants} className="text-4xl font-bold text-foreground mb-8">
          Shopping Cart ({getItemCount()})
        </motion.h1>

        {fetcher.data && "error" in fetcher.data && fetcher.data.error ? (
          <div className="mb-6 rounded-lg bg-destructive/15 border border-destructive/30 px-4 py-3 text-destructive-foreground text-sm">
            {fetcher.data.error}
          </div>
        ) : null}

        <motion.div
          className="grid grid-cols-1 lg:grid-cols-2 gap-8"
          variants={staggerContainer(0.04, 0.08)}
        >
          {/* Cart Items */}
          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {items.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  transition={{ duration: 0.3 }}
                  className="bg-card/70 backdrop-blur-lg rounded-xl p-6 border border-border/10"
                >
                  <div className="flex gap-6">
                    {/* Product Image */}
                    <div className="w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-black/20">
                      {item.image?.endsWith(".mp4") ? (
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
                          src={item.image || "/placeholder.jpg"}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>

                    {/* Product Info */}
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-foreground mb-2">{item.name}</h3>
                      <p className="text-2xl font-bold text-primary mb-4">
                        ${item.price.toLocaleString()}
                      </p>

                      {/* Quantity Controls */}
                      <div className="flex items-center gap-3">
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          disabled={item.quantity <= 1}
                          className="w-10 h-10 rounded-lg"
                        >
                          −
                        </Button>
                        <span className="text-xl font-bold text-foreground w-10 text-center">
                          {item.quantity}
                        </span>
                        <Button
                          type="button"
                          variant="secondary"
                          size="icon"
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="w-10 h-10 rounded-lg"
                        >
                          +
                        </Button>
                      </div>

                      {/* Remove Button */}
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => removeFromCart(item.id)}
                        className="mt-3 h-auto px-0 py-0 text-sm font-medium text-destructive hover:bg-transparent hover:text-destructive/90"
                      >
                        Remove
                      </Button>
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
            className="bg-card/70 backdrop-blur-lg rounded-xl p-6 border border-border/10 h-fit sticky top-24"
          >
            <h2 className="text-2xl font-bold text-foreground mb-6">Order Summary</h2>

            <div className="space-y-4 mb-6">
              <div className="flex justify-between text-foreground/80">
                <span>Subtotal</span>
                <span>${getTotal().toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-foreground/80">
                <span>Shipping</span>
                <span className="text-primary">FREE</span>
              </div>
              <div className="flex justify-between text-foreground/80">
                <span>Tax</span>
                <span>${Math.round(getTotal() * 0.08).toLocaleString()}</span>
              </div>
              <div className="border-t border-border/20 pt-4">
                <div className="flex justify-between text-2xl font-bold text-foreground">
                  <span>Total</span>
                  <span>${Math.round(getTotal() * 1.08).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2 mb-6">
              <Label htmlFor="shipping_address_text">Shipping address</Label>
              <Input
                id="shipping_address_text"
                name="shipping_address_text"
                value={shippingAddressText}
                placeholder="123 Main St, City, State ZIP"
                required
                disabled
              />
              <p className="text-xs text-muted-foreground">
                Pick a location on the map to fill this automatically.
              </p>
            </div>

            <div className="space-y-2 mb-6">
              <Label>Pick on map (optional)</Label>
              <MapCn
                className="h-56"
                pickedLngLat={pickedLngLat}
                onPick={({ lngLat }) => {
                  setPickedLngLat(lngLat);
                  setShippingAddressText(
                    `lat:${lngLat[1].toFixed(5)}, lng:${lngLat[0].toFixed(5)}`,
                  );
                }}
              />
              {pickedLngLat ? (
                <p className="text-xs text-muted-foreground">
                  Pin: {pickedLngLat[1].toFixed(5)}, {pickedLngLat[0].toFixed(5)}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Click the map to drop a pin.</p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  type="button"
                  onClick={handleCheckout}
                  disabled={isCheckingOut || !shippingAddressText.trim()}
                  className="w-full py-6 text-lg rounded-lg"
                >
                  {isCheckingOut ? "Processing..." : "Proceed to Checkout"}
                </Button>
              </motion.div>

              <Button
                type="button"
                variant="secondary"
                onClick={clearCart}
                className="w-full rounded-lg"
              >
                Clear Cart
              </Button>
            </div>

            {/* Security Badge */}
            <div className="mt-6 pt-6 border-t border-border/20">
              <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2h-2l-2 2m0-10.586a1 1 0 01-.707-.293l-9.293-9.293a1 1 0 01-1.414 0L9 12l4.293 4.293a1 1 0 01.707.293l9.293 9.293a1 1 0 011.414 0L13 12l-4.293-4.293a1 1 0 01-.707-.293l-9.293-9.293a1 1 0 01-1.414 0L3 12z"
                  />
                </svg>
                Secure checkout with Apple Pay
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}
