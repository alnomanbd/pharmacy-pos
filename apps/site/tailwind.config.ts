import type { Config } from 'tailwindcss';

/**
 * PharmacyMaster's tokens.
 *
 * The colour source of truth is `pharmacy/tailwind.config.ts` and
 * `pharmacy/src/styles/index.css` — the till's own `--primary: 173 74% 27%`.
 * The shop owner sees both a button on this page and a button in the counter
 * in the same week, and if they are different greens the site is lying about
 * the product.
 *
 * Everything else here is the site's own: a luminous aurora behind glass. The
 * token *names* (--primary, --card, --border) follow the apps', so `.ink-band`
 * and `.glass` read the same variables everywhere.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },

        /* The ramp, as a scale. `--ramp` in globals.css is these five in order,
           so a gradient in CSS and a gradient in a class are the same colour. */
        emerald: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },
        teal: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
          950: '#042f2e',
        },
        cyan: {
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
        },
        amber: {
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },

        /* Ink. The dark band is teal-black (`194 52% 6%`) rather than neutral,
           so a dark section reads as the same brand after dark, not as a
           different theme. */
        ink: {
          50: '#f5f7f8',
          100: '#e9edee',
          200: '#cfd8d9',
          300: '#a5b3b5',
          400: '#718689',
          500: '#4d6669',
          600: '#3a5153',
          700: '#2d4143',
          800: '#1c2b2c',
          900: '#0e1a1b',
          950: '#071112',
        },
      },

      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
        xl: 'calc(var(--radius) + 6px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 8px)',
      },

      /*
       * Figtree and Hind Siliguri are the app's own two faces, kept so the
       * website and the till are unmistakably the same product. JetBrains Mono
       * is new and load-bearing: every figure on a receipt is monospaced, so
       * the money columns in the till mock and the prices in the plan cards are
       * set in the face the paper would be.
       */
      fontFamily: {
        sans: ['var(--font-sans)', 'var(--font-bn)', 'system-ui', 'sans-serif'],
        bn: ['var(--font-bn)', 'var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },

      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],
      },

      letterSpacing: {
        tightest: '-0.045em',
      },

      boxShadow: {
        glass: 'var(--glow-soft)',
        lift: 'var(--glow-lift)',
        glow: 'var(--glow-teal)',
      },

      maxWidth: {
        measure: '68ch',
      },

      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        'marquee-vertical': {
          from: { transform: 'translateY(0)' },
          to: { transform: 'translateY(-50%)' },
        },
        /* The scanner walking a barcode on the till mock. */
        'scan-line': {
          '0%, 100%': { transform: 'translateY(-10%)', opacity: '0' },
          '14%, 86%': { opacity: '1' },
          '50%': { transform: 'translateY(880%)' },
        },
        'tape-in': {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.8)', opacity: '0.75' },
          '70%, 100%': { transform: 'scale(2.4)', opacity: '0' },
        },
        /* A light bar running across a button on hover. */
        sheen: {
          from: { transform: 'translateX(-140%) skewX(-14deg)' },
          to: { transform: 'translateX(340%) skewX(-14deg)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        /* Three pools of light drifting out of phase, so the aurora breathes
           instead of sitting still behind the text. */
        aurora: {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)' },
          '33%': { transform: 'translate3d(4%, -3%, 0) scale(1.08)' },
          '66%': { transform: 'translate3d(-3%, 4%, 0) scale(0.95)' },
        },
        'spin-slow': {
          to: { transform: 'rotate(360deg)' },
        },
        'blink-caret': {
          '0%, 48%': { opacity: '1' },
          '50%, 100%': { opacity: '0' },
        },
        'tick-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'draw-line': {
          from: { transform: 'scaleX(0)' },
          to: { transform: 'scaleX(1)' },
        },
      },

      animation: {
        'accordion-down': 'accordion-down 260ms cubic-bezier(0.22, 1, 0.36, 1)',
        'accordion-up': 'accordion-up 260ms cubic-bezier(0.22, 1, 0.36, 1)',
        marquee: 'marquee var(--marquee-duration, 44s) linear infinite',
        'marquee-vertical': 'marquee-vertical var(--marquee-duration, 44s) linear infinite',
        'scan-line': 'scan-line 2.6s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        'tape-in': 'tape-in 340ms cubic-bezier(0.22, 1, 0.36, 1)',
        'pulse-ring': 'pulse-ring 2.6s cubic-bezier(0.24, 0, 0.38, 1) infinite',
        sheen: 'sheen 2.4s ease-in-out infinite',
        float: 'float 7s ease-in-out infinite',
        aurora: 'aurora 26s ease-in-out infinite',
        'spin-slow': 'spin-slow 26s linear infinite',
        'blink-caret': 'blink-caret 1.05s steps(1) infinite',
        'tick-in': 'tick-in 260ms cubic-bezier(0.22, 1, 0.36, 1)',
        'draw-line': 'draw-line 900ms cubic-bezier(0.22, 1, 0.36, 1) forwards',
      },

      transitionTimingFunction: {
        spring: 'cubic-bezier(0.22, 1, 0.36, 1)',
        swift: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
