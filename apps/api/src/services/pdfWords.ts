/**
 * The shop's PDFs in Bangla.
 *
 * The documents are written in English, as every screen is, and read here in
 * the language asked for: the owner's reports in the language of whoever
 * downloaded them, the papers that leave the shop — a delivery sheet, the
 * controlled-drug register — in the shop's own "Bangla on the receipt" choice.
 *
 * Exact phrases only. A figure, a name or a bill number is never looked up and
 * is always printed as it is; a label missing from the list stays in English
 * rather than turning into something half-translated.
 */
export type PdfLang = 'en' | 'bn';

export const pdfLang = (value: unknown): PdfLang => (value === 'bn' ? 'bn' : 'en');

const BN: Record<string, string> = {
  /* ---- the frame ---- */
  'SALES REPORT': 'বিক্রির রিপোর্ট',
  TODAY: 'আজকের হিসাব',
  'CONTROLLED DRUGS REGISTER': 'নিয়ন্ত্রিত ওষুধের রেজিস্টার',
  DELIVERY: 'ডেলিভারি',
  Mob: 'মোবাইল',
  'Drug Licence': 'ড্রাগ লাইসেন্স',
  Page: 'পাতা',
  of: '/',
  days: 'দিন',

  /* ---- tiles ---- */
  Sold: 'বিক্রি',
  Margin: 'লাভ',
  Bills: 'বিল',
  'Average bill': 'গড় বিল',
  'Came in': 'মাল এসেছে',
  Spent: 'খরচ',
  vs: 'আগের',
  '% of sales': '% বিক্রির',
  deliveries: 'ডেলিভারি',
  pieces: 'পিস',
  'on the shop itself': 'দোকানের নিজের খরচ',
  'Sold today': 'আজ বিক্রি',
  'bills today': 'টি বিল আজ',
  'after what the stock cost': 'মালের দাম বাদ দিয়ে',
  'On account today': 'আজ বাকিতে',
  'left on the khata to collect': 'খাতায় আদায় বাকি',
  'Came in today': 'আজ মাল এসেছে',
  'Owed to you': 'আপনার পাওনা',
  'on the baki khata': 'জন বাকির খাতায়',
  'You owe': 'আপনার দেনা',
  'to the companies': 'কোম্পানিগুলোর কাছে',

  /* ---- the kept sentence ---- */
  'You kept': 'আপনার থাকল',
  'The shop ran behind by': 'দোকানের ঘাটতি',
  'of margin': 'লাভ',
  plus: 'যোগ',
  'other income': 'অন্য আয়',
  minus: 'বাদ',
  'spent on the shop': 'দোকানের খরচ',

  /* ---- sections ---- */
  'Sold each day': 'প্রতিদিনের বিক্রি',
  'in all': 'মোট',
  'best day': 'সেরা দিন',
  'What earned the most': 'সবচেয়ে বেশি লাভ যেগুলোতে',
  'Ranked by what it made this shop, not by how much of it left the shelf.':
    'কতটা বিক্রি হয়েছে তা দিয়ে নয়, দোকানের কত লাভ হয়েছে তা দিয়ে সাজানো।',
  'Which company is worth it': 'কোন কোম্পানি লাভজনক',
  'Margin on the stock each one supplied, traced through the batch it sold from.':
    'প্রতিটা কোম্পানির দেওয়া মালে লাভ, যে ব্যাচ থেকে বিক্রি হয়েছে সেটা ধরে।',
  'What the shop cost': 'দোকান চালাতে কত খরচ',
  "The stretch's spending, by what it was for. This is where the margin becomes the kept profit.":
    'এই সময়ের খরচ, কী বাবদ। এখানেই লাভ থেকে আসল লাভ বের হয়।',
  'Sitting there': 'পড়ে আছে',
  'On the shelf through the whole stretch without selling one piece, valued at what you paid.':
    'পুরো সময় তাকে ছিল, একটা পিসও বিক্রি হয়নি — কেনা দামে হিসাব।',
  'Nothing sold in this stretch.': 'এই সময়ে কিছু বিক্রি হয়নি।',
  'No expenses recorded in this stretch.': 'এই সময়ে কোনো খরচ লেখা হয়নি।',
  'Everything on the shelf sold at least once.': 'তাকের সব মাল অন্তত একবার বিক্রি হয়েছে।',
  'How it was paid': 'কীভাবে টাকা এসেছে',
  'Nothing sold yet today.': 'আজ এখনো কিছু বিক্রি হয়নি।',
  'Baki khata': 'বাকির খাতা',
  'Who owes the most, first.': 'যাঁর বাকি বেশি, তিনি আগে।',
  'Nobody on the khata today.': 'আজ খাতায় কেউ নেই।',
  "Today's bills": 'আজকের বিল',
  shown: 'টি দেখানো হলো',

  /* ---- table heads ---- */
  Item: 'পণ্য',
  Pieces: 'পিস',
  Profit: 'লাভ',
  Company: 'কোম্পানি',
  For: 'বাবদ',
  Rack: 'র‍্যাক',
  'On hand': 'মজুদ',
  Value: 'মূল্য',
  Method: 'মাধ্যম',
  Amount: 'টাকা',
  Customer: 'ক্রেতা',
  Owes: 'বাকি',
  Bill: 'বিল',
  Time: 'সময়',
  'Sold by': 'বিক্রেতা',
  Total: 'মোট',
  Due: 'বাকি',
  Date: 'তারিখ',
  Qty: 'পরিমাণ',
  Buyer: 'ক্রেতা',
  Phone: 'ফোন',
  'Doctor advised': 'পরামর্শদাতা ডাক্তার',
  entries: 'টি এন্ট্রি',
  'Buyer names are kept by law for controlled drugs. The advising doctor and a phone are recorded when known.':
    'নিয়ন্ত্রিত ওষুধের জন্য আইন অনুযায়ী ক্রেতার নাম রাখা হয়। পরামর্শদাতা ডাক্তার আর ফোন জানা থাকলে লেখা হয়।',

  /* ---- payment methods ---- */
  Cash: 'ক্যাশ',
  bKash: 'বিকাশ',
  Nagad: 'নগদ',
  Rocket: 'রকেট',
  Card: 'কার্ড',
  Bank: 'ব্যাংক',
  'On account': 'বাকিতে',

  /* ---- expense categories ---- */
  rent: 'ভাড়া',
  salary: 'বেতন',
  utility: 'বিল',
  transport: 'যাতায়াত',
  supplies: 'সরঞ্জাম',
  other: 'অন্যান্য',

  /* ---- the delivery sheet ---- */
  'Received from': 'যার কাছ থেকে',
  'Invoice date': 'চালানের তারিখ',
  'Entered by': 'লিখেছেন',
  ITEM: 'পণ্য',
  BATCH: 'ব্যাচ',
  EXPIRY: 'মেয়াদ',
  QTY: 'পরিমাণ',
  FREE: 'ফ্রি',
  PIECES: 'পিস',
  RATE: 'দর',
  AMOUNT: 'টাকা',
  'Sub total': 'উপমোট',
  Discount: 'ছাড়',
  VAT: 'ভ্যাট',
  Paid: 'পরিশোধ',
  'Still owed': 'এখনো বাকি',
  'AMOUNT IN WORDS': 'কথায় টাকা',
  'Scan for our details': 'আমাদের তথ্যের জন্য স্ক্যান করুন',
  'Scan for this delivery and our details': 'এই ডেলিভারি আর আমাদের তথ্যের জন্য স্ক্যান করুন',
  'A sample sheet — nothing here was delivered.': 'নমুনা পাতা — এখানের কিছুই আসলে আসেনি।',
  'For the shop': 'দোকানের পক্ষে',
  'Taka only': 'টাকা মাত্র',
  Top: 'ওপরে',
  Bottom: 'নিচে',
  'Your pad’s printed header — left blank': 'আপনার প্যাডের ছাপা হেডার — ফাঁকা রাখা হবে',
  'Your pad’s printed footer — left blank': 'আপনার প্যাডের ছাপা ফুটার — ফাঁকা রাখা হবে',
};

/** The translator for one document: exact phrases, the rest as written. */
export function pdfWords(lang: PdfLang) {
  return (text: string) => (lang === 'bn' ? (BN[text] ?? text) : text);
}
