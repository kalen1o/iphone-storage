import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./app/**/*.{js,jsx,ts,tsx}",
        "./app/components/**/*.{js,jsx,ts,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                background: {
                    primary: '#050505',
                    secondary: '#0A0A0C',
                },
                accent: {
                    primary: '#3A6DFF',
                    secondary: '#6FE3FF',
                },
            },
            fontFamily: {
                sans: [
                    '-apple-system',
                    'BlinkMacSystemFont',
                    '"SF Pro Display"',
                    '"SF Pro Text"',
                    'Inter',
                    'sans-serif',
                ],
            },
            backgroundImage: {
                'radial-glow': 'radial-gradient(circle at center, #050815 0%, #050505 100%)',
                'cta-gradient': 'linear-gradient(135deg, #3A6DFF 0%, #6FE3FF 100%)',
            },
            animation: {
                'fade-in': 'fadeIn 0.6s ease-out',
                'slide-up': 'slideUp 0.8s ease-out',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                slideUp: {
                    '0%': { opacity: '0', transform: 'translateY(20px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
            },
        },
    },
    plugins: [],
};

export default config;
