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
