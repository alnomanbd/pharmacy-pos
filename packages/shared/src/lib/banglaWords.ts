/**
 * The everyday words a shop types in Bangla, spelled correctly.
 *
 * `banglish.ts` transliterates *sounds*, strictly by the Avro scheme, and that
 * is not the same thing as spelling a word right. Three kinds of gap show up
 * immediately in the words a counter actually types:
 *
 * - **The scheme needs a letter the typist will not type.** `jor` is জর; জ্বর
 *   needs `jwor`. `tomake` is তমাকে; তোমাকে needs `tOmake`.
 * - **A consonant pair becomes a conjunct.** `ekbar` is এক্বার, because two
 *   adjacent consonants take a virama; একবার needs `ekobar`.
 * - **Bengali spelling is not phonetic.** ঔষধ is not spelled the way `osudh`
 *   sounds, and no rule gets there.
 *
 * Real Avro papers over all three with a large dictionary. This is the small
 * version of the same idea: the vocabulary of a medicine counter — what a
 * customer asks for, dosing, food, advice — plus the everyday words that hold a
 * sentence together.
 * A word listed here is spelled from the list; anything else falls through to
 * the rules, so an unlisted word still transliterates rather than failing.
 *
 * Keys are lowercase. Spellings a typist might plausibly use for the same word
 * all point at one correct output — the point is that the typist does not have
 * to know which one this app wanted.
 */
export const BANGLA_WORDS: Record<string, string> = {
  // ---- complaints
  jor: 'জ্বর',
  jwor: 'জ্বর',
  kashi: 'কাশি',
  kash: 'কাশি',
  sordi: 'সর্দি',
  mathabetha: 'মাথাব্যথা',
  betha: 'ব্যথা',
  byatha: 'ব্যথা',
  matha: 'মাথা',
  gola: 'গলা',
  pet: 'পেট',
  buke: 'বুকে',
  shorir: 'শরীর',
  sorir: 'শরীর',
  bomi: 'বমি',
  bhab: 'ভাব',
  paykhana: 'পায়খানা',
  patla: 'পাতলা',
  kosthokathinno: 'কোষ্ঠকাঠিন্য',
  durbolota: 'দুর্বলতা',
  ghora: 'ঘোরা',
  shashkosto: 'শ্বাসকষ্ট',
  sashkosto: 'শ্বাসকষ্ট',
  chulkani: 'চুলকানি',
  ronger: 'রঙের',
  ghum: 'ঘুম',
  khudha: 'ক্ষুধা',
  rokto: 'রক্ত',
  roktochap: 'রক্তচাপ',
  sugar: 'সুগার',
  diabetes: 'ডায়াবেটিস',

  // ---- dosing and time
  osudh: 'ঔষধ',
  oushodh: 'ঔষধ',
  ekbar: 'একবার',
  ekobar: 'একবার',
  duibar: 'দুইবার',
  duborar: 'দুইবার',
  tinbar: 'তিনবার',
  charbar: 'চারবার',
  bar: 'বার',
  din: 'দিন',
  sopta: 'সপ্তাহ',
  soptaho: 'সপ্তাহ',
  mas: 'মাস',
  bochor: 'বছর',
  sokal: 'সকাল',
  sokale: 'সকালে',
  dupur: 'দুপুর',
  dupure: 'দুপুরে',
  bikal: 'বিকাল',
  bikale: 'বিকালে',
  sondhya: 'সন্ধ্যা',
  sondha: 'সন্ধ্যা',
  rat: 'রাত',
  rate: 'রাতে',
  ghumanor: 'ঘুমানোর',
  protidin: 'প্রতিদিন',
  proyojone: 'প্রয়োজনে',
  niyomito: 'নিয়মিত',

  // ---- food
  khabar: 'খাবার',
  khabarer: 'খাবারের',
  khaben: 'খাবেন',
  khete: 'খেতে',
  khali: 'খালি',
  pete: 'পেটে',
  bhora: 'ভরা',
  pani: 'পানি',
  gorom: 'গরম',
  thanda: 'ঠান্ডা',
  torol: 'তরল',
  dudh: 'দুধ',
  dim: 'ডিম',
  mach: 'মাছ',
  mangsho: 'মাংস',
  bhat: 'ভাত',
  ruti: 'রুটি',
  fol: 'ফল',
  sobji: 'সবজি',
  shak: 'শাক',
  tel: 'তেল',
  mosla: 'মসলা',
  bhaja: 'ভাজা',
  cha: 'চা',
  kofi: 'কফি',

  // ---- advice
  bishram: 'বিশ্রাম',
  bisram: 'বিশ্রাম',
  sompurno: 'সম্পূর্ণ',
  purno: 'পূর্ণ',
  kors: 'কোর্স',
  course: 'কোর্স',
  sesh: 'শেষ',
  korben: 'করবেন',
  korun: 'করুন',
  korte: 'করতে',
  dekhaben: 'দেখাবেন',
  dekhate: 'দেখাতে',
  abar: 'আবার',
  porikkha: 'পরীক্ষা',
  report: 'রিপোর্ট',
  daktar: 'ডাক্তার',
  doctor: 'ডাক্তার',
  hospital: 'হাসপাতাল',
  dhumpan: 'ধূমপান',
  borjon: 'বর্জন',
  hata: 'হাঁটা',
  byam: 'ব্যায়াম',
  ojon: 'ওজন',
  kuli: 'কুলি',
  lobon: 'লবণ',
  poramorsho: 'পরামর্শ',
  onujayi: 'অনুযায়ী',
  moto: 'মতো',

  // ---- the words that hold a sentence together
  ami: 'আমি',
  amake: 'আমাকে',
  amar: 'আমার',
  tumi: 'তুমি',
  tomake: 'তোমাকে',
  tomar: 'তোমার',
  apni: 'আপনি',
  apnake: 'আপনাকে',
  apnar: 'আপনার',
  ache: 'আছে',
  nei: 'নেই',
  hobe: 'হবে',
  hoyeche: 'হয়েছে',
  na: 'না',
  ar: 'আর',
  ebong: 'এবং',
  ba: 'বা',
  jodi: 'যদি',
  tahole: 'তাহলে',
  kintu: 'কিন্তু',
  jonno: 'জন্য',
  sathe: 'সাথে',
  por: 'পর',
  age: 'আগে',
  pore: 'পরে',
  beshi: 'বেশি',
  besi: 'বেশি',
  kom: 'কম',
  kore: 'করে',
  theke: 'থেকে',
  ekti: 'একটি',
  ekta: 'একটা',
  dhonnobad: 'ধন্যবাদ',
};
