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
