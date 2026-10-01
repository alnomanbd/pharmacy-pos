import type { Lang } from '@/lib/site';

/**
 * The words inside the product mocks — the billing screen, the rack, the
 * offline card.
 *
 * They live apart from `dictionary.ts` because they are not marketing copy:
 * they are the app's own labels, and they follow the app's rule. Chrome and
 * counts are translated, Bangla numerals included; identifiers stay exactly as
 * printed — a brand, a batch, a bill reference, a function key — because those
 * are what the counter matches against the pack and the paper.
 */

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

/** Latin digits to Bangla digits in `bn`; anything else passes through. */
export function num(lang: Lang, value: string | number): string {
  const s = String(value);
  return lang === 'bn' ? s.replace(/[0-9]/g, (d) => BN_DIGITS[+d]) : s;
}

/** A grouped figure — `84,120` / `৮৪,১২০`, `1,12,400` in the subcontinent's grouping. */
export function money(lang: Lang, value: number, grouping: 'en-US' | 'en-IN' = 'en-US'): string {
  return num(lang, value.toLocaleString(grouping));
}

const en = {
  pos: {
    online: 'Online',
    lines: 'lines',
    takings: 'Today’s takings',
    bills: 'bills',
    khata: 'on the khata',
    subtotal: 'Subtotal',
    discount: 'Discount',
    toPay: 'To pay',
    exactCash: 'Exact cash',
    salesman: 'Rashed',
    onHand: 'pcs on hand',
    shiftOpen: 'Shift open',
    strip: 'strip',
    strips: 'strips',
  },
  stock: {
    kicker: 'One product · four lots',
    maker: 'Square Pharmaceuticals · 20 tablets per strip',
    pcs: 'pcs',
    now: 'Selling now',
    finished: 'Finished',
    sold: 'Bills so far in this loop',
    taken: 'Taken from batch',
    left: 'Left on the shelf',
    soon: 'within 90 days',
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  },
  offline: {
    down: 'Still selling',
    syncing: 'Sending the queue',
    online: 'Connected',
    downNote: 'bills are being written to this device',
    leftToSend: 'left to send',
    upToDate: 'everything is up to date',
    badgeDown: 'offline',
    badgeSync: 'syncing',
    badgeOnline: 'online',
    rung: 'Bills rung up on this device',
    empty: 'queue empty',
  },
  screens: {
    sub: 'Counter 1 · Jonni Pharmacy',
    billing: {
      stats: [['Today', '৳84,120'], ['Bills', '214'], ['Average bill', '৳393']],
      rows: [
        ['#01051', 'Cash · 4 items · 21:07', '৳140', ''],
        ['#01050', 'bKash · 2 items · 21:02', '৳386', ''],
        ['#01049', 'Baki · Karim Uddin · 20:55', '৳1,250', 'warn'],
        ['#01048', 'Cash · 1 item · 20:51', '৳32', ''],
        ['#01047', 'Card · 6 items · 20:44', '৳2,140', ''],
      ],
    },
    stock: {
      stats: [['Products', '1,284'], ['Stock value', '৳6,42,300'], ['Expiring in 90 days', '৳18,900']],
      rows: [
        ['Napa Extra 500 mg', 'Rack A-1 · 3 batches', '295 pcs', ''],
        ['Seclo 20 mg', 'Rack A-2 · 2 batches', '180 pcs', ''],
        ['Alatrol 10 mg', 'Rack A-1 · reorder at 50', '12 pcs', 'warn'],
        ['Fexo 120 mg', 'Rack A-3 · 1 batch', '96 pcs', ''],
        ['Monas 10 mg', 'Rack B-2 · expires November 2026', '40 pcs', 'warn'],
        ['Pantonix 20 mg', 'Rack A-2 · 2 batches', '210 pcs', ''],
      ],
    },
    purchases: {
      stats: [['This month', '৳1,86,400'], ['Invoices', '38'], ['Bonus received', '৳7,920']],
      rows: [
        ['PUR-0412', 'Square · 18 lines · bonus 10+1', '৳24,600', ''],
        ['PUR-0411', 'Incepta · 9 lines', '৳11,250', ''],
        ['PUR-0410', 'Beximco · 12 lines · bonus 20+3', '৳16,980', ''],
        ['PUR-0409', 'ACI · 6 lines · unpaid', '৳8,400', 'warn'],
        ['PUR-0408', 'Renata · 4 lines', '৳5,120', ''],
      ],
    },
    suppliers: {
      stats: [['Suppliers', '14'], ['You owe', '৳42,800'], ['Paid this month', '৳1,43,600']],
      rows: [
        ['Square Pharmaceuticals', 'Paid 3 days ago', '৳18,400', 'warn'],
        ['Beximco Pharma', 'Paid in full', '৳0', ''],
        ['Incepta Pharmaceuticals', 'Next visit Thursday', '৳11,250', ''],
        ['ACI Limited', 'Invoice PUR-0409', '৳8,400', ''],
        ['Renata Limited', 'Paid in full', '৳0', ''],
      ],
    },
    khata: {
      stats: [['Customers on baki', '41'], ['Owed to you', '৳38,650'], ['Collected this week', '৳9,200']],
      rows: [
        ['Karim Uddin', 'Since 12 September · SMS sent', '৳1,250', ''],
        ['Rahima Begum', 'Over 30 days', '৳3,480', 'warn'],
        ['Abdul Malek', 'Since 24 September', '৳640', ''],
        ['Nasrin Akter', 'Paid ৳500 today', '৳920', ''],
        ['Jamal Hossain', 'Over 30 days', '৳2,150', 'warn'],
        ['Shirin Sultana', 'Since 28 September', '৳310', ''],
      ],
    },
    reports: {
      stats: [['Sales, September', '৳24,82,000'], ['Gross profit', '৳3,72,300'], ['Margin', '15.0%']],
      chartLabel: 'Sales, last 7 days',
      days: ['Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'],
      rows: [
        ['Napa Extra 500 mg', 'Top seller · 2,140 pcs', '৳6,420', ''],
        ['Seclo 20 mg', '1,060 pcs', '৳7,420', ''],
        ['Dead stock, 90 days', '23 products', '৳14,600', 'warn'],
      ],
    },
  },
};

type MockDict = typeof en;

const bn: MockDict = {
  pos: {
    online: 'অনলাইন',
    lines: 'লাইন',
    takings: 'আজকের বিক্রি',
    bills: 'বিল',
    khata: 'বাকি খাতায়',
    subtotal: 'সাবটোটাল',
    discount: 'ছাড়',
    toPay: 'পরিশোধ',
    exactCash: 'পুরো ক্যাশ',
    salesman: 'রাশেদ',
    onHand: 'পিস মজুদ',
    shiftOpen: 'শিফট শুরু',
    strip: 'পাতা',
    strips: 'পাতা',
  },
  stock: {
    kicker: 'একটি ঔষধ · চারটি ব্যাচ',
    maker: 'Square Pharmaceuticals · প্রতি পাতায় ২০টি ট্যাবলেট',
    pcs: 'পিস',
    now: 'এখান থেকে বিক্রি',
    finished: 'শেষ',
    sold: 'এই চক্রে বিল',
    taken: 'যে ব্যাচ থেকে গেল',
    left: 'তাকে বাকি',
    soon: 'পিসের মেয়াদ ৯০ দিনে শেষ',
    months: ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'],
  },
  offline: {
    down: 'বিক্রি চলছে',
    syncing: 'জমা বিল পাঠানো হচ্ছে',
    online: 'সংযুক্ত',
    downNote: 'বিলগুলো এই ডিভাইসেই লেখা হচ্ছে',
    leftToSend: 'টি পাঠানো বাকি',
    upToDate: 'সব হালনাগাদ',
    badgeDown: 'অফলাইন',
    badgeSync: 'সিঙ্ক হচ্ছে',
    badgeOnline: 'অনলাইন',
    rung: 'এই ডিভাইসে কাটা বিল',
    empty: 'কিছু জমা নেই',
  },
  screens: {
    sub: 'কাউন্টার ১ · জন্নী ফার্মেসি',
    billing: {
      stats: [['আজ', '৳৮৪,১২০'], ['বিল', '২১৪'], ['গড় বিল', '৳৩৯৩']],
      rows: [
        ['#01051', 'ক্যাশ · ৪টি আইটেম · ২১:০৭', '৳১৪০', ''],
        ['#01050', 'বিকাশ · ২টি আইটেম · ২১:০২', '৳৩৮৬', ''],
        ['#01049', 'বাকি · করিম উদ্দিন · ২০:৫৫', '৳১,২৫০', 'warn'],
        ['#01048', 'ক্যাশ · ১টি আইটেম · ২০:৫১', '৳৩২', ''],
        ['#01047', 'কার্ড · ৬টি আইটেম · ২০:৪৪', '৳২,১৪০', ''],
      ],
    },
    stock: {
      stats: [['ঔষধ', '১,২৮৪'], ['স্টকের মূল্য', '৳৬,৪২,৩০০'], ['৯০ দিনে মেয়াদ শেষ', '৳১৮,৯০০']],
      rows: [
        ['Napa Extra 500 mg', 'তাক A-1 · ৩টি ব্যাচ', '২৯৫ পিস', ''],
        ['Seclo 20 mg', 'তাক A-2 · ২টি ব্যাচ', '১৮০ পিস', ''],
        ['Alatrol 10 mg', 'তাক A-1 · ৫০-এ নামলে অর্ডার', '১২ পিস', 'warn'],
        ['Fexo 120 mg', 'তাক A-3 · ১টি ব্যাচ', '৯৬ পিস', ''],
        ['Monas 10 mg', 'তাক B-2 · মেয়াদ নভেম্বর ২০২৬', '৪০ পিস', 'warn'],
        ['Pantonix 20 mg', 'তাক A-2 · ২টি ব্যাচ', '২১০ পিস', ''],
      ],
    },
    purchases: {
      stats: [['এই মাসে', '৳১,৮৬,৪০০'], ['ইনভয়েস', '৩৮'], ['বোনাস পাওয়া', '৳৭,৯২০']],
      rows: [
        ['PUR-0412', 'Square · ১৮ লাইন · বোনাস ১০+১', '৳২৪,৬০০', ''],
        ['PUR-0411', 'Incepta · ৯ লাইন', '৳১১,২৫০', ''],
        ['PUR-0410', 'Beximco · ১২ লাইন · বোনাস ২০+৩', '৳১৬,৯৮০', ''],
        ['PUR-0409', 'ACI · ৬ লাইন · বাকি', '৳৮,৪০০', 'warn'],
        ['PUR-0408', 'Renata · ৪ লাইন', '৳৫,১২০', ''],
      ],
    },
    suppliers: {
      stats: [['সাপ্লায়ার', '১৪'], ['আপনার দেনা', '৳৪২,৮০০'], ['এই মাসে পরিশোধ', '৳১,৪৩,৬০০']],
      rows: [
        ['Square Pharmaceuticals', '৩ দিন আগে পরিশোধ', '৳১৮,৪০০', 'warn'],
        ['Beximco Pharma', 'সম্পূর্ণ পরিশোধিত', '৳০', ''],
        ['Incepta Pharmaceuticals', 'পরের ভিজিট বৃহস্পতিবার', '৳১১,২৫০', ''],
        ['ACI Limited', 'ইনভয়েস PUR-0409', '৳৮,৪০০', ''],
        ['Renata Limited', 'সম্পূর্ণ পরিশোধিত', '৳০', ''],
      ],
    },
    khata: {
      stats: [['বাকির কাস্টমার', '৪১'], ['আপনার পাওনা', '৳৩৮,৬৫০'], ['এই সপ্তাহে আদায়', '৳৯,২০০']],
      rows: [
        ['করিম উদ্দিন', '১২ সেপ্টেম্বর থেকে · SMS গেছে', '৳১,২৫০', ''],
        ['রহিমা বেগম', '৩০ দিনের বেশি', '৳৩,৪৮০', 'warn'],
        ['আব্দুল মালেক', '২৪ সেপ্টেম্বর থেকে', '৳৬৪০', ''],
        ['নাসরিন আক্তার', 'আজ ৳৫০০ দিয়েছেন', '৳৯২০', ''],
        ['জামাল হোসেন', '৩০ দিনের বেশি', '৳২,১৫০', 'warn'],
        ['শিরিন সুলতানা', '২৮ সেপ্টেম্বর থেকে', '৳৩১০', ''],
      ],
    },
    reports: {
      stats: [['বিক্রি, সেপ্টেম্বর', '৳২৪,৮২,০০০'], ['মোট লাভ', '৳৩,৭২,৩০০'], ['মার্জিন', '১৫.০%']],
      chartLabel: 'গত ৭ দিনের বিক্রি',
      days: ['বৃহঃ', 'শুক্র', 'শনি', 'রবি', 'সোম', 'মঙ্গল', 'বুধ'],
      rows: [
        ['Napa Extra 500 mg', 'সবচেয়ে বেশি বিক্রি · ২,১৪০ পিস', '৳৬,৪২০', ''],
        ['Seclo 20 mg', '১,০৬০ পিস', '৳৭,৪২০', ''],
        ['৯০ দিন অবিক্রিত', '২৩টি ঔষধ', '৳১৪,৬০০', 'warn'],
      ],
    },
  },
};

export function mockT(lang: Lang): MockDict {
  return lang === 'bn' ? bn : en;
}
