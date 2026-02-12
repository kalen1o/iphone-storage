import { Link, useLoaderData } from "@remix-run/react";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { useCartStore } from "~/lib/stores/cartStore";
import { apiFetch } from "~/lib/api.server";
import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import {
  fadeUpVariants,
  slideLeftVariants,
  slideRightVariants,
  staggerContainer,
} from "~/components/animation/route-motion";

interface Product {
  id: string;
  name: string;
  description?: string;
  sku: string;
  price: number;
  images?: string[];
  metadata?: {
    features?: string[];
    specifications?: Record<string, string>;
  };
}

interface InventoryResponse {
  product_id: string;
  in_stock: boolean;
}

export async function loader({ params }: LoaderFunctionArgs) {
  if (!params.id) {
    return { product: null as Product | null, inStock: false };
  }
  try {
    const [product, inv] = await Promise.all([
      apiFetch<Product>(`/products/${params.id}`),
      apiFetch<InventoryResponse>(`/inventory/${params.id}`),
    ]);
    return { inStock: inv.in_stock, product };
  } catch {
    return { inStock: false, product: null as Product | null };
  }
}

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data?.product?.name || "Product Not Found" },
  { description: data?.product?.description || "" },
];

export default function ProductDetail() {
  const { product, inStock } = useLoaderData<typeof loader>();
  const addToCart = useCartStore((state) => state.addToCart);
  const reduceMotion = useReducedMotion();
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground mb-4">Product Not Found</h1>
          <Button asChild>
            <Link to="/">Back to Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  const canOrder = inStock;

  const handleAddToCart = () => {
    setIsAdding(true);
    addToCart({
      image: product.images?.[0],
      name: product.name,
      price: product.price,
      productId: product.id,
      quantity,
    });
    setIsAdding(false);
  };

  return (
    <motion.div
      className="min-h-screen bg-gradient-to-b from-background to-secondary"
      initial={reduceMotion ? false : "hidden"}
      animate="visible"
      variants={staggerContainer(0, 0.08)}
    >
      {/* Product Details */}
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          {/* Product Image/Preview */}
          <motion.div variants={slideLeftVariants} className="relative">
            <div className="aspect-[4/5] bg-black/20 rounded-2xl overflow-hidden">
              {product.images?.[0]?.endsWith(".mp4") ? (
                <video
                  src={product.images?.[0]}
                  className="w-full h-full object-cover"
                  muted
                  loop
                  autoPlay
                  playsInline
                />
              ) : (
                <img
                  src={product.images?.[0] || "/placeholder.jpg"}
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
          </motion.div>

          {/* Product Info */}
          <motion.div
            variants={staggerContainer(0.05, 0.07)}
            initial={reduceMotion ? false : "hidden"}
            animate="visible"
          >
            <motion.h1
              variants={slideRightVariants}
              className="text-4xl md:text-5xl font-bold text-foreground mb-4"
            >
              {product.name}
            </motion.h1>

            <motion.div variants={fadeUpVariants} className="mb-6">
              {inStock ? (
                <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
                  In stock
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-destructive/30 bg-destructive/15 px-3 py-1 text-sm font-medium text-destructive-foreground">
                  Out of stock
                </span>
              )}
            </motion.div>

            <motion.p variants={fadeUpVariants} className="text-lg text-foreground/80 mb-8">
              {product.description}
            </motion.p>

            {/* Price */}
            <motion.div variants={fadeUpVariants} className="mb-8">
              <div className="flex items-baseline gap-3">
                <span className="text-5xl font-bold text-primary">
                  ${product.price.toLocaleString()}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                Or ${Math.round(product.price / 24).toLocaleString()}/month with Apple Card
              </p>
            </motion.div>

            {/* Features */}
            {product.metadata?.features?.length ? (
              <div className="mb-8">
                <h3 className="text-xl font-semibold text-foreground mb-4">Features</h3>
                <ul className="space-y-3">
                  {product.metadata.features.map((feature, index) => (
                    <motion.li
                      key={feature}
                      variants={fadeUpVariants}
                      transition={{ delay: reduceMotion ? 0 : index * 0.06, duration: 0.35 }}
                      className="flex items-center gap-3 text-foreground/90"
                    >
                      <Check className="w-5 h-5 text-primary flex-shrink-0" />
                      {feature}
                    </motion.li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Specifications */}
            {product.metadata?.specifications ? (
              <div className="mb-8">
                <h3 className="text-xl font-semibold text-foreground mb-4">Specifications</h3>
                <dl className="space-y-3 text-foreground/90">
                  {Object.entries(product.metadata.specifications).map(([key, value]) => (
                    <div key={key} className="flex justify-between py-2 border-b border-border/10">
                      <dt className="font-medium">{key}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            {/* Quantity Selector */}
            <motion.div variants={fadeUpVariants} className="mb-8">
              <Label className="block mb-2">Quantity</Label>
              <div className="flex items-center gap-4">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  disabled={quantity <= 1 || !canOrder}
                  className="w-12 h-12 rounded-lg"
                >
                  −
                </Button>
                <span className="text-2xl font-bold text-foreground w-12 text-center">
                  {quantity}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() => setQuantity(quantity + 1)}
                  disabled={!canOrder}
                  className="w-12 h-12 rounded-lg"
                >
                  +
                </Button>
              </div>
            </motion.div>

            {/* Add to Cart Button */}
            <motion.div
              variants={fadeUpVariants}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Button
                type="button"
                onClick={handleAddToCart}
                disabled={isAdding || !canOrder}
                className="w-full py-6 text-lg rounded-lg"
              >
                {isAdding ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    Adding to Cart...
                  </span>
                ) : (
                  "Add to Cart"
                )}
              </Button>
            </motion.div>

            {/* Stock Status */}
            {inStock ? (
              <p className="text-sm text-primary mt-4">✓ Ready to order</p>
            ) : (
              <p className="text-sm text-destructive-foreground mt-4">
                This item is currently out of stock.
              </p>
            )}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
