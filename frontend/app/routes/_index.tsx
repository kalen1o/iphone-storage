import { WelcomeHero } from '~/components/landing/WelcomeHero';
import { HorizontalPreviewColor } from '~/components/landing/HorizontalPreviewColor';

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

      <HorizontalPreviewColor />
    </div>
  );
}
