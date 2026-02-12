import { useCartStore } from "~/lib/stores/cartStore";
import { Link } from "@remix-run/react";
import { ShoppingCart } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export function CartIcon() {
  const { getItemCount } = useCartStore();
  const count = getItemCount();
  const reduceMotion = useReducedMotion();

  return (
    <Link
      to="/cart"
      className="relative p-2 text-foreground/70 hover:text-foreground transition-colors"
    >
      <ShoppingCart className="w-6 h-6" />

      <AnimatePresence mode="popLayout">
        {count > 0 && (
          <motion.span
            key={count}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center"
          >
            {count}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  );
}
