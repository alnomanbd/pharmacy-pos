import type { Metadata, Viewport } from 'next';
import { Figtree, Hind_Siliguri, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { siteConfig, LANGS } from '@/lib/site';
import { ThemeProvider } from '@/components/theme-provider';

/*
 * Three faces, and each is there for a reason rather than for variety:
 *
 * - **Figtree** is the app's own UI face (`pharmacy/tailwind.config.ts`).
 * - **Hind Siliguri** is the app's own Bangla face, and the counter is staffed
 *   by people who do not read Latin script all day.
 * - **JetBrains Mono** is new and load-bearing. Every figure on a pharmacy
 *   receipt is monospaced, so the money in the billing mock, the prices in the
 *   plan cards and the bill numbers in the stock screens are all set in the
 *   face the paper would be — which is the detail that makes a mock read as a
 * photograph of a product rather than as a drawing of one.
 *
 * All three are `display: swap` with a CSS fallback in the same class, because
 * a Bangla shop owner on a 3G connection should see Bangla immediately.
 */
const sans = Figtree({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800', '900'],
});

const bangla = Hind_Siliguri({
  subsets: ['bengali', 'latin'],
  variable: '--font-bn',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
});

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#e8f3ee' },
    { media: '(prefers-color-scheme: dark)', color: '#071112' },
  ],
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
};

const title = `${siteConfig.name} — Billing & Stock Software for Bangladeshi Medicine Shops`;

const description =
  'The medicine shop software that sells in pieces, tracks every batch and expiry, keeps the baki khata, prints the bill on your own thermal printer, and keeps selling when the line goes down. Free 14-day trial, no card.';

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: title, template: `%s · ${siteConfig.shortName}` },
  description,
  applicationName: siteConfig.shortName,
  keywords: [
    'pharmacy software Bangladesh',
    'medicine shop billing software',
    'pharmacy POS',
    'drug store inventory software',
    'baki khata software',
    'batch expiry software',
    `${siteConfig.name} pharmacy software`,
  ],
  authors: [{ name: siteConfig.company, url: siteConfig.url }],
  creator: siteConfig.company,
  publisher: siteConfig.company,
  alternates: {
    canonical: '/',
    languages: Object.fromEntries(LANGS.map((l) => [l, `/${l}`])),
  },
  /* The capsule in the ramp, for the tab; a PNG for home screens and for the
     crawlers that do not read SVG; and one picture for every shared link. */
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: { url: '/apple-icon.png', sizes: '180x180' },
  },
  openGraph: {
    type: 'website',
    siteName: siteConfig.shortName,
    title,
    description,
    url: siteConfig.url,
    images: [{ url: '/og.png', width: 1200, height: 630, alt: `${siteConfig.name} — pharmacy billing and stock` }],
    locale: 'en_BD',
    alternateLocale: ['bn_BD'],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/og.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  formatDetection: { telephone: true, address: true },
};

/**
 * The software itself, described so a search engine and an assistant can both
 * read it as what it is: a commercial product with a price, not a page.
 *
 * `SoftwareApplication` with `offers` is the schema a buyer's-tool looks for,
 * and the ৳1,500 Basic is the price the API's plan seed (`apps/api/src/seed`)
 * records. It is a month, so `0` — an annual price of nothing would be a lie
 * that outlives this file.
 */
const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareApplication',
      '@id': `${siteConfig.url}/#app`,
      name: siteConfig.name,
      alternateName: siteConfig.shortName,
      description,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web browser',
      url: siteConfig.url,
      inLanguage: ['en-BD', 'bn-BD'],
      featureList: [
        'Point of sale selling in pieces, strips and boxes',
        'Batch and expiry tracking with first-expiry-first-out',
        'Purchase entry with bonus quantity and supplier ledgers',
        'Baki khata: customer credit ledger with SMS reminders',
        'Thermal receipt printing at 58mm, 80mm or any width',
        'Offline selling with queued bills and idempotent replay',
        'Stock counts applied as differences against the live batch',
        'Stock valuation, expiry risk, dead stock and net profit reports',
        'Per-counter shifts with counted opening float and close',
        'Role-based access where a salesman cannot see trade price',
        'Bilingual Bangla and English counter',
      ],
      offers: {
        '@type': 'Offer',
        price: '1500',
        priceCurrency: 'BDT',
        availability: 'https://schema.org/InStock',
        url: `${siteConfig.url}/en/#pricing`,
      },
    },
    {
      '@type': 'Organization',
      '@id': `${siteConfig.url}/#org`,
      name: siteConfig.company,
      url: siteConfig.url,
      logo: `${siteConfig.url}/icon.svg`,
      email: siteConfig.contactEmail,
      address: { '@type': 'PostalAddress', addressLocality: 'Dhaka', addressCountry: 'BD' },
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${bangla.variable} ${mono.variable}`}
    >
      <head>
        {/*
          The theme before the first paint, in a file of its own rather than
          inline so a strict `script-src` still allows it. See
          `public/theme-boot.js`.
        */}
        <script src="/theme-boot.js" />
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="min-h-dvh">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
