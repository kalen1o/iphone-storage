export const STORY_BEAT_CONTENT = {
  CAMERA: {
    headline: "A camera system without compromise.",
    subcopy: ["Sharper optics. Larger sensors. Computational photography at its most advanced."],
    align: "center",
  },
  ENGINEERING: {
    headline: "Precision, down to every layer.",
    subcopy: [
      "From titanium frame to advanced internal architecture, every element is engineered for balance, strength, and efficiency.",
    ],
    align: "left",
  },
  HERO: {
    headline: "iPhone 17 Pro Max",
    subheadline: "Pro, taken further.",
    tagline: "The most advanced iPhone ever created.",
    align: "center",
  },
  PERFORMANCE: {
    headline: "Power that adapts in real time.",
    subcopy: [
      "Next-generation Apple silicon.",
      "Desktop-class performance.",
      "Advanced efficiency built in.",
    ],
    align: "right",
  },
  REASSEMBLY: {
    headline: "Designed to be extraordinary.",
    subheadline: "iPhone 17 Pro Max. Power, precision, perfectly aligned.",
    cta: "Explore iPhone 17 Pro Max",
    secondaryCta: "View technical specs",
    align: "center",
  },
} as const;

export const NAVIGATION_LINKS = [
  { label: "Overview", to: "/#overview" },
  { label: "Design", to: "/#design" },
  { label: "Performance", to: "/#performance" },
  { label: "Camera", to: "/#camera" },
  { label: "Tech Specs", to: "/#tech-specs" },
  { label: "Products", to: "/products" },
] as const;
