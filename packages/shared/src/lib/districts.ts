/**
 * Bangladesh's districts — the one list a shop's place is picked from, so the
 * medicine picture counts "Bogra", "Bogura" and "বগুড়া" as the same place.
 *
 * Copied, word for word below this note, into packages/shared/src/lib/districts.ts
 * (shop app, console), apps/site/src/lib/districts.ts (signup) and
 * apps/data-api/src/lib/districts.ts; a test keeps them the same.
 */
// ---- the list ----

/** A division: its English and Bangla names. */
export const DIVISIONS = {
  Barishal: 'বরিশাল',
  Chattogram: 'চট্টগ্রাম',
  Dhaka: 'ঢাকা',
  Khulna: 'খুলনা',
  Mymensingh: 'ময়মনসিংহ',
  Rajshahi: 'রাজশাহী',
  Rangpur: 'রংপুর',
  Sylhet: 'সিলেট',
} as const;

export type Division = keyof typeof DIVISIONS;
export interface District {
  /** The official English spelling (the 2018 names) — what is stored. */
  name: string;
  bn: string;
  division: Division;
  /** Older spellings and common ways of typing it. */
  aliases?: string[];
}

/** Bangladesh's 64 districts, by division. */
export const DISTRICTS: District[] = [
  { name: 'Barguna', bn: 'বরগুনা', division: 'Barishal' },
  { name: 'Barishal', bn: 'বরিশাল', division: 'Barishal', aliases: ['Barisal'] },
  { name: 'Bhola', bn: 'ভোলা', division: 'Barishal' },
  { name: 'Jhalokati', bn: 'ঝালকাঠি', division: 'Barishal', aliases: ['Jhalakati', 'Jhalokathi', 'Jhalakathi'] },
  { name: 'Patuakhali', bn: 'পটুয়াখালী', division: 'Barishal' },
  { name: 'Pirojpur', bn: 'পিরোজপুর', division: 'Barishal' },

  { name: 'Bandarban', bn: 'বান্দরবান', division: 'Chattogram' },
  { name: 'Brahmanbaria', bn: 'ব্রাহ্মণবাড়িয়া', division: 'Chattogram', aliases: ['B Baria', 'Brahmonbaria'] },
  { name: 'Chandpur', bn: 'চাঁদপুর', division: 'Chattogram' },
  { name: 'Chattogram', bn: 'চট্টগ্রাম', division: 'Chattogram', aliases: ['Chittagong', 'Ctg', 'Chottogram'] },
  { name: "Cox's Bazar", bn: 'কক্সবাজার', division: 'Chattogram', aliases: ['Coxs Bazar', 'Cox Bazar'] },
  { name: 'Cumilla', bn: 'কুমিল্লা', division: 'Chattogram', aliases: ['Comilla'] },
  { name: 'Feni', bn: 'ফেনী', division: 'Chattogram' },
  { name: 'Khagrachhari', bn: 'খাগড়াছড়ি', division: 'Chattogram', aliases: ['Khagrachari'] },
  { name: 'Lakshmipur', bn: 'লক্ষ্মীপুর', division: 'Chattogram', aliases: ['Laxmipur', 'Lakhsmipur'] },
  { name: 'Noakhali', bn: 'নোয়াখালী', division: 'Chattogram' },
  { name: 'Rangamati', bn: 'রাঙ্গামাটি', division: 'Chattogram' },

  { name: 'Dhaka', bn: 'ঢাকা', division: 'Dhaka', aliases: ['Dacca', 'Dhaka City', 'Dhaka North', 'Dhaka South'] },
  { name: 'Faridpur', bn: 'ফরিদপুর', division: 'Dhaka' },
  { name: 'Gazipur', bn: 'গাজীপুর', division: 'Dhaka' },
  { name: 'Gopalganj', bn: 'গোপালগঞ্জ', division: 'Dhaka', aliases: ['Gopalgonj'] },
  { name: 'Kishoreganj', bn: 'কিশোরগঞ্জ', division: 'Dhaka', aliases: ['Kishorganj', 'Kishoregonj'] },
  { name: 'Madaripur', bn: 'মাদারীপুর', division: 'Dhaka' },
  { name: 'Manikganj', bn: 'মানিকগঞ্জ', division: 'Dhaka', aliases: ['Manikgonj'] },
  { name: 'Munshiganj', bn: 'মুন্সিগঞ্জ', division: 'Dhaka', aliases: ['Munsiganj', 'Munshigonj', 'Bikrampur'] },
  { name: 'Narayanganj', bn: 'নারায়ণগঞ্জ', division: 'Dhaka', aliases: ['Narayangonj'] },
  { name: 'Narsingdi', bn: 'নরসিংদী', division: 'Dhaka', aliases: ['Narshingdi', 'Narsingdhi'] },
  { name: 'Rajbari', bn: 'রাজবাড়ী', division: 'Dhaka' },
  { name: 'Shariatpur', bn: 'শরীয়তপুর', division: 'Dhaka' },
  { name: 'Tangail', bn: 'টাঙ্গাইল', division: 'Dhaka' },

  { name: 'Bagerhat', bn: 'বাগেরহাট', division: 'Khulna' },
  { name: 'Chuadanga', bn: 'চুয়াডাঙ্গা', division: 'Khulna' },
  { name: 'Jashore', bn: 'যশোর', division: 'Khulna', aliases: ['Jessore'] },
  { name: 'Jhenaidah', bn: 'ঝিনাইদহ', division: 'Khulna', aliases: ['Jhenidah', 'Jhenaida'] },
  { name: 'Khulna', bn: 'খুলনা', division: 'Khulna' },
  { name: 'Kushtia', bn: 'কুষ্টিয়া', division: 'Khulna' },
  { name: 'Magura', bn: 'মাগুরা', division: 'Khulna' },
  { name: 'Meherpur', bn: 'মেহেরপুর', division: 'Khulna' },
  { name: 'Narail', bn: 'নড়াইল', division: 'Khulna' },
  { name: 'Satkhira', bn: 'সাতক্ষীরা', division: 'Khulna' },

  { name: 'Jamalpur', bn: 'জামালপুর', division: 'Mymensingh' },
  { name: 'Mymensingh', bn: 'ময়মনসিংহ', division: 'Mymensingh', aliases: ['Mymensing', 'Moymonsingh'] },
  { name: 'Netrokona', bn: 'নেত্রকোণা', division: 'Mymensingh', aliases: ['Netrakona'] },
  { name: 'Sherpur', bn: 'শেরপুর', division: 'Mymensingh' },

  { name: 'Bogura', bn: 'বগুড়া', division: 'Rajshahi', aliases: ['Bogra'] },
  { name: 'Chapainawabganj', bn: 'চাঁপাইনবাবগঞ্জ', division: 'Rajshahi', aliases: ['Chapai Nawabganj', 'Nawabganj', 'Chapai'] },
  { name: 'Joypurhat', bn: 'জয়পুরহাট', division: 'Rajshahi', aliases: ['Jaipurhat'] },
  { name: 'Naogaon', bn: 'নওগাঁ', division: 'Rajshahi' },
  { name: 'Natore', bn: 'নাটোর', division: 'Rajshahi' },
  { name: 'Pabna', bn: 'পাবনা', division: 'Rajshahi' },
  { name: 'Rajshahi', bn: 'রাজশাহী', division: 'Rajshahi' },
  { name: 'Sirajganj', bn: 'সিরাজগঞ্জ', division: 'Rajshahi', aliases: ['Sirajgonj'] },

  { name: 'Dinajpur', bn: 'দিনাজপুর', division: 'Rangpur' },
  { name: 'Gaibandha', bn: 'গাইবান্ধা', division: 'Rangpur' },
  { name: 'Kurigram', bn: 'কুড়িগ্রাম', division: 'Rangpur' },
  { name: 'Lalmonirhat', bn: 'লালমনিরহাট', division: 'Rangpur' },
  { name: 'Nilphamari', bn: 'নীলফামারী', division: 'Rangpur' },
  { name: 'Panchagarh', bn: 'পঞ্চগড়', division: 'Rangpur', aliases: ['Panchagar'] },
  { name: 'Rangpur', bn: 'রংপুর', division: 'Rangpur' },
  { name: 'Thakurgaon', bn: 'ঠাকুরগাঁও', division: 'Rangpur' },

  { name: 'Habiganj', bn: 'হবিগঞ্জ', division: 'Sylhet', aliases: ['Hobiganj', 'Habigonj'] },
  { name: 'Moulvibazar', bn: 'মৌলভীবাজার', division: 'Sylhet', aliases: ['Moulvi Bazar', 'Maulvibazar', 'Maulvi Bazar'] },
  { name: 'Sunamganj', bn: 'সুনামগঞ্জ', division: 'Sylhet', aliases: ['Sunamgonj'] },
  { name: 'Sylhet', bn: 'সিলেট', division: 'Sylhet' },
];

// NFC: one Bangla letter can be typed two ways (ড় as one character or two).
const key = (s: string) =>
  s
    .normalize('NFC')
    .toLowerCase()
    .replace(/\b(district|zila|zilla|sadar)\b/g, '')
    .replace(/জেলা|সদর/g, '')
    .replace(/[^a-zঀ-৿]/g, '');

const LOOKUP = new Map<string, District>();
for (const d of DISTRICTS) for (const s of [d.name, d.bn, ...(d.aliases ?? [])]) LOOKUP.set(key(s), d);

/** The district this text names — any spelling, either script — or null when it names none. */
export function findDistrict(text?: string | null): District | null {
  if (!text) return null;
  return LOOKUP.get(key(text)) ?? null;
}

/** The official spelling of the district this text names, or null. */
export function canonicalDistrict(text?: string | null): string | null {
  return findDistrict(text)?.name ?? null;
}
