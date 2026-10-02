import { Schema, model, Types } from 'mongoose';
import { badRequest, conflict, notFound } from '../utils/AppError.js';

/**
 * Help articles: short how-tos, in Bangla and English, read in the shop app.
 *
 * Most support calls are the same ten questions — how do I add a medicine, how
 * do I record a delivery, where is the baki. An article answers them at nine
 * at night when nobody is at our desk, and a link to one is a better answer in
 * a support thread than the same paragraph typed out again.
 *
 * Bodies are plain text: paragraphs, and lines that start "1." become numbered
 * steps. No HTML is stored or rendered, so an article can never carry a script.
 */

export const HELP_CATEGORIES = ['getting-started', 'selling', 'stock', 'money', 'account'] as const;
export type HelpCategory = (typeof HELP_CATEGORIES)[number];

const schema = new Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 80 },
    category: { type: String, enum: HELP_CATEGORIES, default: 'getting-started', index: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    titleBn: { type: String, default: '', trim: true, maxlength: 140 },
    body: { type: String, default: '', trim: true, maxlength: 8000 },
    bodyBn: { type: String, default: '', trim: true, maxlength: 8000 },
    /** A YouTube link, shown as a button — the shop's own data plan decides whether to watch. */
    videoUrl: { type: String, default: '', trim: true, maxlength: 300 },
    order: { type: Number, default: 100 },
    published: { type: Boolean, default: true, index: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);
schema.index({ category: 1, order: 1 });
export const HelpArticleModel = model('HelpArticle', schema);

export const SLUG_RX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

export interface HelpInput {
  slug?: string;
  category?: HelpCategory;
  title: string;
  titleBn?: string;
  body?: string;
  bodyBn?: string;
  videoUrl?: string;
  order?: number;
  published?: boolean;
}

function checkVideo(url?: string) {
  if (url && !/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url)) throw badRequest('The video has to be a YouTube link');
}

/* ---------------------------------------------------------------- shop -- */

export async function publishedList() {
  return HelpArticleModel.find({ published: true })
    .select('slug category title titleBn order updatedAt')
    .sort({ category: 1, order: 1, title: 1 })
    .lean();
}

export async function publishedOne(slug: string) {
  const a = await HelpArticleModel.findOne({ slug: slug.toLowerCase(), published: true })
    .select('slug category title titleBn body bodyBn videoUrl updatedAt')
    .lean();
  if (!a) throw notFound('Article');
  return a;
}

/* ------------------------------------------------------------- console -- */

export async function listAll() {
  return HelpArticleModel.find({}).sort({ category: 1, order: 1, title: 1 }).lean();
}

export async function create(input: HelpInput, userId: string) {
  const slug = input.slug?.trim() ? input.slug.trim().toLowerCase() : slugify(input.title);
  if (!SLUG_RX.test(slug)) throw badRequest('The address can only have small letters, digits and dashes');
  if (await HelpArticleModel.exists({ slug })) throw conflict('Another article already has that address');
  checkVideo(input.videoUrl);
  return (await HelpArticleModel.create({ ...input, slug, updatedBy: userId })).toObject();
}

export async function update(id: string, input: Partial<HelpInput>, userId: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound('Article');
  checkVideo(input.videoUrl);
  if (input.slug !== undefined) {
    input.slug = input.slug.trim().toLowerCase();
    if (!SLUG_RX.test(input.slug)) throw badRequest('The address can only have small letters, digits and dashes');
    if (await HelpArticleModel.exists({ slug: input.slug, _id: { $ne: id } })) throw conflict('Another article already has that address');
  }
  const a = await HelpArticleModel.findByIdAndUpdate(id, { $set: { ...input, updatedBy: userId } }, { new: true, runValidators: true }).lean();
  if (!a) throw notFound('Article');
  return a;
}

export async function remove(id: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound('Article');
  const a = await HelpArticleModel.findByIdAndDelete(id).lean();
  if (!a) throw notFound('Article');
  return { deleted: true, title: a.title };
}

/**
 * Eight starter articles, so the help page is not empty on the first day.
 * Added only where the address is free — running it twice adds nothing, and it
 * never overwrites an article somebody has edited.
 */
export const STARTERS: HelpInput[] = [
  {
    slug: 'shop-details-on-receipt',
    category: 'getting-started',
    order: 1,
    title: 'Put your shop’s name and phone on the receipt',
    titleBn: 'রসিদে দোকানের নাম আর ফোন নম্বর দিন',
    body: 'Customers keep the receipt, so it should say who you are.\n1. Open Settings from the menu.\n2. Fill in the shop name, address and phone number. Add your drug licence and BIN if you have them.\n3. Save. The next bill you print shows them.',
    bodyBn: 'কাস্টমার রসিদ রেখে দেন, তাই তাতে আপনার দোকানের পরিচয় থাকা দরকার।\n1. মেনু থেকে সেটিংস খুলুন।\n2. দোকানের নাম, ঠিকানা আর ফোন নম্বর লিখুন। ড্রাগ লাইসেন্স আর BIN থাকলে সেগুলোও দিন।\n3. সেভ করুন। পরের বিল থেকে এগুলো রসিদে আসবে।',
  },
  {
    slug: 'add-medicines',
    category: 'stock',
    order: 2,
    title: 'Add the medicines you sell',
    titleBn: 'যেসব ওষুধ বিক্রি করেন সেগুলো যোগ করুন',
    body: 'Dawai already knows the medicines registered in Bangladesh, so you only pick yours and set your price.\n1. Open Stock and tap New item.\n2. Type the brand name — for example Napa — and pick it from the list.\n3. Set your selling price and how much you have now, then save.\nIf a medicine is not in the list, tap Medicine requests and ask us to add it.',
    bodyBn: 'বাংলাদেশে নিবন্ধিত ওষুধগুলো Dawai-তে আগে থেকেই আছে, আপনি শুধু নিজেরগুলো বেছে দাম ঠিক করবেন।\n1. স্টক খুলে নতুন আইটেম চাপুন।\n2. ব্র্যান্ডের নাম লিখুন — যেমন Napa — তারপর তালিকা থেকে বেছে নিন।\n3. বিক্রয়মূল্য আর এখন কতটা আছে লিখে সেভ করুন।\nকোনো ওষুধ তালিকায় না থাকলে ওষুধের অনুরোধ চেপে আমাদের যোগ করতে বলুন।',
  },
  {
    slug: 'record-a-delivery',
    category: 'stock',
    order: 3,
    title: 'Record a delivery from a supplier',
    titleBn: 'সাপ্লায়ারের কাছ থেকে মাল কেনা লিখুন',
    body: 'Recording what arrives keeps your stock right and shows what you owe each supplier.\n1. Open Stock and tap Receive stock.\n2. Pick the supplier, or add a new one.\n3. Add each medicine with its quantity, batch, expiry date and purchase price.\n4. Save. The stock goes up, and anything not paid is added to what you owe that supplier.',
    bodyBn: 'কী মাল এল তা লিখে রাখলে স্টক ঠিক থাকে, আর কোন সাপ্লায়ারের কাছে কত বাকি তা দেখা যায়।\n1. স্টক খুলে মাল তুলুন চাপুন।\n2. সাপ্লায়ার বেছে নিন, অথবা নতুন যোগ করুন।\n3. প্রতিটি ওষুধ পরিমাণ, ব্যাচ, মেয়াদ আর কেনা দামসহ যোগ করুন।\n4. সেভ করুন। স্টক বাড়বে, আর যা পরিশোধ হয়নি তা ওই সাপ্লায়ারের বাকিতে যোগ হবে।',
  },
  {
    slug: 'first-bill',
    category: 'selling',
    order: 4,
    title: 'Ring up your first bill',
    titleBn: 'প্রথম বিলটি করুন',
    body: 'The counter screen is the first page after you sign in.\n1. Tap Start the day: count the cash in the box, enter it and pick your counter.\n2. Search a medicine by name, or scan its barcode, and set the quantity.\n3. Tap Take payment, choose cash, bKash or card — or put it on the customer’s baki — and print the receipt.\nAt the end of the day, tap Close the day: the screen says what should be in the cash box.',
    bodyBn: 'লগইন করার পর প্রথম পেজটাই কাউন্টারের স্ক্রিন।\n1. দিন শুরু করুন চাপুন: ক্যাশ বাক্সের টাকা গুনে লিখুন আর আপনার কাউন্টার বেছে নিন।\n2. নাম লিখে বা বারকোড স্ক্যান করে ওষুধ খুঁজুন, পরিমাণ দিন।\n3. টাকা নিন চাপুন, নগদ, বিকাশ বা কার্ড বেছে নিন — অথবা কাস্টমারের বাকিতে লিখুন — তারপর রসিদ প্রিন্ট করুন।\nদিন শেষে দিন শেষ করুন চাপুন: ক্যাশ বাক্সে কত থাকার কথা তা স্ক্রিনেই দেখাবে।',
  },
  {
    slug: 'baki-customers',
    category: 'money',
    order: 5,
    title: 'Keep baki for a customer',
    titleBn: 'কাস্টমারের বাকি রাখুন',
    body: 'Every baki is kept on the customer, with each bill and each payment.\n1. Open Customers and add the customer with their phone number.\n2. When you ring up a bill, pick the customer and choose baki for what they do not pay now.\n3. When they come to settle, open the customer and tap Money in. Send a reminder sends them an SMS of what is owing.',
    bodyBn: 'প্রতিটি বাকি কাস্টমারের নামে থাকে, প্রতিটি বিল আর প্রতিটি পরিশোধসহ।\n1. কাস্টমার খুলে ফোন নম্বরসহ কাস্টমার যোগ করুন।\n2. বিল করার সময় কাস্টমার বেছে নিন, আর যা এখন দিচ্ছেন না তা বাকিতে লিখুন।\n3. টাকা দিতে এলে কাস্টমার খুলে টাকা জমা চাপুন। মনে করিয়ে দিন চাপলে কত বাকি তা SMS-এ চলে যাবে।',
  },
  {
    slug: 'add-staff',
    category: 'account',
    order: 6,
    title: 'Add a pharmacist or salesman',
    titleBn: 'ফার্মাসিস্ট বা সেলসম্যান যোগ করুন',
    body: 'Give everyone their own login, so each bill shows who rang it up.\n1. Open Staff and tap Add someone.\n2. Enter their name, phone and a password, and choose the role: a pharmacist runs the shop with you; a salesman sells and does not see purchase prices.\n3. Give them the password. They sign in on their own phone or the counter PC.',
    bodyBn: 'সবাইকে আলাদা লগইন দিন, তাহলে প্রতিটি বিলে দেখা যাবে কে করেছে।\n1. স্টাফ খুলে কাউকে যোগ করুন চাপুন।\n2. নাম, ফোন আর একটি পাসওয়ার্ড দিন, আর ভূমিকা বেছে নিন: ফার্মাসিস্ট আপনার সাথে দোকান চালান; সেলসম্যান বিক্রি করেন, কেনা দাম দেখেন না।\n3. পাসওয়ার্ডটি তাঁকে দিন। তিনি নিজের ফোনে বা কাউন্টারের কম্পিউটারে লগইন করবেন।',
  },
  {
    slug: 'pay-subscription',
    category: 'account',
    order: 7,
    title: 'Pay for your subscription',
    titleBn: 'সাবস্ক্রিপশনের টাকা দিন',
    body: 'Open Subscription to see your plan and until when it is paid.\n1. Pick the plan and how many months.\n2. If you have a discount code, type it in and tap Apply.\n3. Pay online if the button is there — it renews at once — or send by bKash or Nagad to the number shown, then enter the amount and transaction ID and tap I have sent the payment. We check it and confirm, usually the same day.',
    bodyBn: 'আপনার প্ল্যান আর কবে পর্যন্ত পরিশোধিত তা দেখতে সাবস্ক্রিপশন খুলুন।\n1. প্ল্যান আর কত মাস তা বেছে নিন।\n2. ডিসকাউন্ট কোড থাকলে লিখে প্রয়োগ করুন চাপুন।\n3. অনলাইনে পেমেন্ট করুন বোতাম থাকলে সেখানে পেমেন্ট করুন — সাথে সাথে নবায়ন হবে — অথবা দেখানো নম্বরে বিকাশ বা নগদে পাঠিয়ে টাকার পরিমাণ আর ট্রানজেকশন আইডি লিখে আমি টাকা পাঠিয়েছি চাপুন। আমরা যাচাই করে জানাব, সাধারণত সেদিনই।',
  },
  {
    slug: 'ask-for-help',
    category: 'getting-started',
    order: 8,
    title: 'Ask us for help',
    titleBn: 'আমাদের কাছে সাহায্য চান',
    body: 'Open Support from the menu and tap New message. Write what is happening — the more detail, the fewer rounds — and send it. We reply in the same place, and the Support link shows a number when there is a reply you have not read.',
    bodyBn: 'মেনু থেকে সাপোর্ট খুলে নতুন মেসেজ চাপুন। কী হচ্ছে খুলে লিখুন — যত বিস্তারিত, তত তাড়াতাড়ি সমাধান — তারপর পাঠান। আমরা সেখানেই উত্তর দিই, আর না পড়া উত্তর থাকলে সাপোর্ট লিংকে একটি সংখ্যা দেখাবে।',
  },
];

export async function addStarters(userId: string) {
  let added = 0;
  for (const s of STARTERS) {
    if (await HelpArticleModel.exists({ slug: s.slug })) continue;
    await HelpArticleModel.create({ ...s, updatedBy: userId });
    added++;
  }
  return { added };
}
