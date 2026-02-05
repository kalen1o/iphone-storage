import { useCartStore } from '~/lib/stores/cartStore';
import { Link } from '@remix-run/react';
import { ShoppingCart } from 'lucide-react';

export function CartIcon() {
  const { getItemCount } = useCartStore();

  return (
    <>
      <Link
        to="/cart"
        className="relative p-2 text-foreground/70 hover:text-foreground transition-colors"
      >
        <ShoppingCart className="w-6 h-6" />

        {getItemCount() > 0 && (
          <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
            {getItemCount()}
          </span>
        )}
      </Link>
    </>
  );
}
