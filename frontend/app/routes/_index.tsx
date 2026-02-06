import { WelcomeHero } from '~/components/landing/WelcomeHero';
import { PreviewSection } from '~/components/landing/PreviewSection';
import { ColorPickerSection } from '~/components/landing/ColorPickerSection';
import { motion } from 'framer-motion';
import { Link } from '@remix-run/react';
import { Button } from '~/components/ui/button';

export function meta() {
  return [
    { title: 'iPhone 17 Pro Max - The Most Advanced iPhone Ever' },
    { description: 'Pro, taken further. The most advanced iPhone ever created.' },
    { viewport: 'width=device-width,initial-scale=1' },
  ];
}

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <WelcomeHero />

      <PreviewSection />
      <ColorPickerSection />

      {/* Product CTA Section */}
      <motion.section
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="relative z-20 bg-gradient-to-b from-background to-secondary py-20"
      >
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
            Ready to experience the future?
          </h2>
          <p className="text-xl text-foreground/80 mb-8 max-w-2xl mx-auto">
            Pre-order now and be among the first to receive your iPhone 17 Pro Max.
          </p>
          <Button asChild size="lg" className="text-lg px-8 py-6 rounded-lg">
            <Link to="/products">Shop Products</Link>
          </Button>
        </div>
      </motion.section>
    </div>
  );
}
