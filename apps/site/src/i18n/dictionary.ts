import { siteConfig, type Lang } from '@/lib/site';

/**
 * Every word on the site, in the two languages the shop is read in.
 *
 * Two things are decided here rather than in a component:
 *
 * - **The chrome is translated, the data is not.** A brand name, a bill number
 *   and a batch number stay exactly as typed, in Latin digits, on both sides of
 *   the switch — the same rule `pharmacy/src/i18n/ui.ts` keeps. A batch number
 *   in Bangla numerals is a number nobody can check against the pack.
 * - **A missing key falls back to English, never to blank.** Half a Bangla
 *   screen is worse than an English one, and an English word inside a Bangla
 *   screen is a word the counter already knows. So the type is derived from the
 *   English object and a partial `bn` is legal at compile time.
 */

const en = {
  meta: {
    title: '{brand} — Billing & Stock Software for Bangladeshi Medicine Shops',
    shortTitle: '{brand}',
    description:
      'The medicine shop software that sells in pieces, tracks every batch, keeps the baki khata, prints the bill on your own thermal printer — and keeps selling when the line goes down. Free 14-day trial, no card.',
    keywords: [
      'pharmacy software Bangladesh',
      'medicine shop billing software',
      'POS software for pharmacy',
      'drug store inventory software',
      'baki khata software',
      '{brand} pharmacy software',
    ],
    ogAlt: 'The {brand} billing screen on a counter, mid-sale',
  },

  nav: {
    features: 'Features',
    how: 'How it works',
    pricing: 'Pricing',
    faq: 'FAQ',
    demo: 'See a demo',
    contact: 'Contact',
    status: 'Status',
    signIn: 'Sign in',
    getStarted: 'Start free',
    openApp: 'Open the app',
    menu: 'Menu',
    trialBadge: '14 days',
    close: 'Close',
    backToTop: 'Back to top',
  },

  announce: [
    'Free for 14 days. No card, no setup fee, and we turn the shop on for you.',
    'Works in বাংলা and English — the whole counter, not just the buttons.',
    'Keeps selling when the internet drops. The bill syncs when it is back.',
    '45,000+ Bangladeshi medicines already loaded — type the brand and it is there.',
  ],

  hero: {
    eyebrow: 'Built for the counter of a Bangladeshi pharmacy',
    titleA: 'One screen runs',
    titleEm: 'the whole counter',
    titleB: '— the bill, the stock, the baki',
    lede:
      'Sell by the piece, watch every batch, keep the baki — and print on the printer you already own. It speaks বাংলা too, and it keeps selling when the line drops.',
    ctaPrimary: 'Start your 14-day trial',
    ctaSecondary: 'Book a live demo',
    ctaNote: 'No card. We switch it on the same day.',
    proof: [
      'Free 14-day trial',
      'Cancel any time',
      'Your data, exportable',
    ],
    /* The three facts floating beside the billing screen. They are the three questions a
       shop owner asks in the first ten minutes, in the order they ask them. */
    orbit: [
      { label: 'Billed tonight', note: '৳9,340 counted in the box' },
      { label: 'Waiting to sync', note: '17 bills, sold when the line was down' },
      { label: 'On hand, 214 lots', note: '৳18,900 expires within 90 days' },
    ],
    /* The four figures under the hero. The numbers live in the component
       because they are animated; the wording lives here. */
    stats: [
      { suffix: ' pcs', label: 'on one shelf screen, every lot' },
      { suffix: ' days', label: 'free trial, with no card' },
      { suffix: '', label: 'per bill, per customer, per day' },
      { suffix: '', label: 'languages on the whole counter' },
    ],
    scroll: 'See the counter',
  },

  counter: {
    kicker: 'The counter',
    title: 'A billing screen, not a web page with a form on it',
    lede: 'Full-screen, keyboard-first, and nothing on it but the bill.',
    points: [
      {
        title: 'Every key has a button behind it',
        body: 'F2 to F10 — every action is one key or one tap.',
      },
      {
        title: 'Sell four tablets out of a strip',
        body: 'Box, strip or single piece — the price is worked out for you.',
      },
      {
        title: 'Three customers at once',
        body: 'Park a bill with F6, serve the next customer, bring it back with F7.',
      },
      {
        title: 'Split the payment',
        body: 'Cash, bKash, Nagad, card — or split across them.',
      },
      {
        title: 'Quick keys that learn',
        body: 'Your best-sellers float to the top on their own.',
      },
      {
        title: 'Sales-only, on purpose',
        body: 'Salesmen never see trade price or margin.',
      },
    ],
    /* The key grid. Only the wording is here; which function key lights which
       key is code, because it is also what the billing mock listens to. */
    keyCard: {
      title: 'Every key has a button behind it',
      body: 'Click one — or press it on your keyboard right now. Every action a billing screen needs has both, so a new salesman can work a touch screen and the one who has done it for six years never has to look down.',
      badge: 'Try F2 – F10',
    },
    keymap: [
      {
        what: 'Find',
        body: 'Search 45,000+ medicines by brand, generic or company — or scan the pack.',
      },
      {
        what: 'Customer',
        body: 'Pick who is buying. One key, and the bill goes on their baki khata.',
      },
      {
        what: 'Discount',
        body: 'Only if the role allows it. A salesman cannot discount a strip below the floor.',
      },
      {
        what: 'Hold',
        body: 'Parks the bill you are stuck on and clears the screen for the next customer.',
      },
      {
        what: 'Held',
        body: 'Brings every parked bill back. They live in this browser and never on the server.',
      },
      {
        what: 'Payment',
        body: 'Cash, bKash, Nagad, card — or split across them. The change is its own line.',
      },
      {
        what: 'Return',
        body: 'Take something back against the original bill, into its own batch.',
      },
      {
        what: 'Exact cash',
        body: 'The customer handed over the note. The billing screen does the subtraction.',
      },
    ],
    receipt: {
      kicker: 'The other half of the sale',
      lede: 'Through the printer the shop already owns',
      points: [
        'Shop name in Bangla and English',
        'DGDA drug licence number from the wall',
        'Total in figures and in words',
        'Batch on every line — a return needs it',
        'A QR that finds the bill again',
      ],
    },
  },

  stock: {
    kicker: 'The shelves',
    title: 'Stock counted the way a shop actually counts it',
    lede: 'Every batch, every expiry — the one expiring first sells first.',
    points: [
      {
        title: 'The ledger is the truth',
        body: 'Worked out from every sale and purchase — never typed in.',
      },
      {
        title: 'FEFO, not FIFO',
        body: 'Each sale takes the batch that expires first.',
      },
      {
        title: 'Bonus is a field, not a note',
        body: '10+1 and 20+3 bonuses go into the real cost.',
      },
      {
        title: 'A blank is not a zero',
        body: 'Only what you count changes. Blanks are left alone.',
      },
      {
        title: 'Applied as a difference',
        body: 'Sales made during the count are never lost.',
      },
      {
        title: 'Cold storage, and labels',
        body: 'Fridge racks, and shelf labels you can print.',
      },
    ],
  },

  purchase: {
    kicker: 'Where the stock comes from',
    title: 'Four kinds of supplier, one book each',
    lede:
      'A company depot, a Mitford wholesaler, the bigger pharmacy down the road, or somebody else. Each has its own profile, its own ledger and its own statement — and the answer to "Incepta-ke koto dite hobe" is one number at the top of the page.',
    points: [
      { title: 'Invoice, batch, expiry, rate, bonus' },
      { title: 'A running balance after every row' },
      { title: 'A printable statement for any range' },
      { title: 'The rep is a field, with his visit day' },
      { title: 'Expiry and damage go back as their own document' },
      { title: 'Credits settle against the next delivery' },
    ],
  },

  khata: {
    kicker: 'The baki khata',
    title: 'The notebook, except the notebook never loses a page',
    lede:
      'The regular who pays at the end of the month. One row per person — not one row per bill — with every bill taken and every payment made, and the balance as it stood after each one.',
    points: [
      { title: 'Money in, taken on that screen' },
      { title: 'A credit limit the counter can see' },
      { title: 'A due brought forward from the old notebook' },
      { title: 'One SMS reminder, never twice in three days' },
      { title: 'The whole khata as a CSV' },
      { title: 'The balance recomputed, never read off the customer' },
    ],
  },

  offline: {
    kicker: 'When the line drops',
    title: 'The one screen that must not close',
    lede: 'Internet gone? Keep billing. It syncs when the line is back.',
    points: [
      { title: 'The bill is written down before it prints', body: 'Saved on the device first — survives a reload or a power cut.' },
      { title: 'The same bill posted twice does nothing', body: 'No double bills, however many times it retries.' },
      { title: 'The slip prints without a number', body: 'The slip says the serial number will follow.' },
      { title: 'A shelf that is empty still sells', body: 'Sell now, count later — the sale is never blocked.' },
    ],
  },

  reports: {
    kicker: 'What the owner asks for',
    title: 'This month against last. And the five things that need a look.',
    lede:
      'Margin by supplier, what is dead on the shelf, what is expiring, who owes what, and the day’s cash — with rent, salary and power taken off to give the kept profit, not the margin.',
    cards: [
      { title: 'Net profit', body: 'Margin, less what the shop itself costs.' },
      { title: 'Which company is worth it', body: 'Margin and turnover, supplier by supplier.' },
      { title: 'Sitting there', body: 'Stock that has not moved in ninety days, and what it is tied up in.' },
      { title: 'Expiry', body: 'What goes in this month, in three, and what it is worth.' },
      { title: 'Worth a look', body: 'The short counts, the returns, the bills somebody held.' },
      { title: 'Every register as CSV', body: 'Sales, stock, companies, khata — from the screen that shows them.' },
    ],
  },

  trust: {
    kicker: 'What it will not let happen',
    title: 'The rules that make the numbers worth trusting',
    items: [
      { title: 'Nothing is ever deleted', body: 'A bill, an item, a customer, a company, a shelf, a counter — all of it lands on one screen with who threw it away and why, and comes back from there.' },
      { title: 'Every cancel needs a reason', body: 'Kept on the bill’s own history and in the audit trail. "Which salesman did that, and what did they say" has an answer at both ends.' },
      { title: 'A cancelled bill is listed, not counted', body: 'Its money came back out when it was cancelled. Counting it again would invent takings.' },
      { title: 'A salesman can undo their own mis-punch', body: 'On their own open counter, within the hour. Not generosity — a counter that cannot undo one will undo it by handing the cash back and saying nothing.' },
      { title: 'The server decides what a role can see', body: 'Not the screen. Trade prices and margins are unreachable from a salesman’s session however it is opened.' },
      { title: 'Your register is yours', body: 'Every list exports to CSV. There is no lock-in and nothing to lose if you leave.' },
    ],
  },

  steps: {
    kicker: 'Getting started',
    title: 'Trading on it by this evening',
    items: [
      { n: '01', title: 'Tell us the shop', body: 'Name, address, the drug licence number off the wall, and who will be at the counter.' },
      { n: '02', title: 'We switch it on', body: 'Your catalogue, your suppliers, your racks. Same day, usually. We do it on a call if you want it done for you.' },
      { n: '03', title: 'Count the opening stock', body: 'Rack by rack, or bring in a single count. Whatever the screen says, the count is the truth and the difference is written down.' },
      { n: '04', title: 'Open the day', body: 'Count the cash in the box, pick the counter, and start selling. Every bill carries the name of whoever rang it up.' },
    ],
  },

  screens: {
    kicker: 'The screens',
    title: 'Every page here was designed at a counter',
    items: [
      { name: 'The billing screen', note: 'Full screen, no rail, no top bar. The bill is the whole interface.' },
      { name: 'Stock', note: 'What you sell and how much is left, with the nearest expiry coloured on the row.' },
      { name: 'Purchases', note: 'A delivery, line by line, against the paper it was typed from.' },
      { name: 'Suppliers', note: 'The account in date order with the balance after each row.' },
      { name: 'The baki khata', note: 'One row per regular, with the balance recomputed from the rows.' },
      { name: 'Reports', note: 'This month against the same days of last month, in one request.' },
    ],
  },

  voices: {
    kicker: 'From the counter',
    title: 'What a shop says once the trial is over',
    /* These are written as *scenarios* the product is designed to produce, not
       as quotes from named customers, and the section says so on the page. They
       get replaced with real, permissioned quotes as the trial list grows — and
       until then the page is honest about what it is showing. */
    note: 'Illustrative scenarios from the trial design, not attributed customer quotes.',
    items: [
      {
        quote:
          'The thing I did not expect was the count. We found a whole rack that had been walked for months. The ledger showed exactly which day it started and which counter it was on.',
        name: 'Pharmacy owner',
        where: 'Dhanmondi, Dhaka · 2 counters',
      },
      {
        quote:
          'Our salesman sells a lot and he still cannot find out what we buy at. That is worth the subscription on its own.',
        name: 'Owner of a two-counter shop',
        where: 'Uttara, Dhaka',
      },
      {
        quote:
          'The wifi goes at seven most evenings. We did not close for a single day in three weeks of the trial. On the old software we closed for nine.',
        name: 'Pharmacist',
        where: 'Mirpur, Dhaka',
      },
      {
        quote:
          'It prints on the printer we already own. That was the whole decision for us — I am not buying new hardware.',
        name: 'Shop owner',
        where: 'Bogura',
      },
    ],
  },

  how: {
    kicker: 'How it works',
    title: 'Selling on {brand} by this evening',
    lede: 'No installer and no new hardware. Three steps — and we do the middle one for you.',
    cta: 'Start the free trial',
    steps: [
      {
        tag: '2 minutes',
        title: 'Tell us about the shop',
        body: 'Sign up, or book a call. The shop name, the drug licence number and how many counters you run.',
      },
      {
        tag: 'Same day',
        title: 'We set the counter up',
        body: 'Your medicine list from the national catalogue, your opening stock and your printer width — done with you on a call.',
      },
      {
        tag: '14 days free',
        title: 'Start billing',
        body: 'Open the billing screen on the computer you already have. Pay only if you keep it after the trial.',
      },
    ],
  },

  pricing: {
    kicker: 'Pricing',
    title: 'Per shop, not per prescription',
    lede: 'One monthly price per shop. No per-bill fee, ever — and leave whenever you like.',
    cta: 'Start free',
    ctaNote: '14 days, no card. We turn it on for you.',
    compareCta: 'See the full comparison',
    plans: [
      {
        name: 'Trial',
        price: 'Free',
        period: 'for 14 days',
        blurb: 'The whole shop, nothing held back. This is how a shop decides.',
        cta: 'Start the trial',
        highlight: false,
        features: [
          'Every feature, all of them',
          'Every billing counter you have',
          'A login for each counter',
          'Unlimited bills',
          'We switch it on for you',
          'Your data exports to CSV from day one',
        ],
      },
      {
        name: 'Pharmacy Basic',
        price: '৳1,500',
        period: 'per month',
        blurb: 'One shop, one billing screen, two people. Everything a single-counter pharmacy needs.',
        cta: 'Start on Basic',
        highlight: true,
        badge: 'Most shops start here',
        features: [
          'Everything in the trial',
          'One outlet',
          'One billing screen',
          'Two users — owner and one salesman',
          'Full stock, batches, expiry and FEFO',
          'Purchase, suppliers and the ledger',
          'The baki khata and SMS reminders',
          'Unlimited bills and customers',
          'Thermal printing at 58mm, 80mm or any width',
          'Works offline',
        ],
      },
      {
        name: 'Pharmacy Plus',
        price: '৳3,000',
        period: 'per month',
        blurb: 'Several billing screens and staff, for a shop that is busy all day.',
        cta: 'Start on Plus',
        highlight: false,
        features: [
          'Everything in Basic',
          'Several billing screens',
          'Up to ten users, with roles',
          'Multiple counters and shifts per day',
          'Purchases, supplier ledgers and statements',
          'Ordering: what to ask each rep for',
          'Full reports and CSV export',
          'Priority support on a call',
        ],
      },
    ],
    footnote:
      'Prices are in BDT and exclude VAT. Pay monthly by bKash, Nagad or bank transfer, and leave whenever you like — your data comes with you.',
  },

  faq: {
    kicker: 'Questions',
    title: 'The ones a shop actually asks',
    lede: 'Straight answers to what owners ask us before they switch — pick a topic, or read them all.',
    topicsLabel: 'Questions by topic',
    topics: {
      all: 'All',
      start: 'Getting started',
      counter: 'At the counter',
      stock: 'Stock',
      trust: 'Data & trust',
    },
    helpTitle: 'Still have a question?',
    helpText: 'Ask us on a call. Twenty minutes with a shop set up like yours, and you ring up the first bill yourself.',
    items: [
      {
        c: 'start',
        q: 'Is there really a free trial?',
        a: 'Yes — fourteen days, every feature, no card. We switch the shop on for you rather than sending you a setup guide, because a counter cannot stop trading to learn a new system.',
      },
      {
        c: 'start',
        q: 'Do I have to buy the computer and the printer?',
        a: 'No. It runs in the browser on whatever machine the shop already has, and it prints through that machine to whatever thermal printer is on the counter — 80mm, 58mm, or a width you type in. Most shops start with what is already in the room.',
      },
      {
        c: 'counter',
        q: 'What happens when the internet goes down?',
        a: 'The billing screen keeps selling. Bills are written to the machine first and sent when the connection returns; sending the same bill twice cannot happen. The slip prints without a bill number and says so, because only your shop can issue one and it has not been asked yet.',
      },
      {
        c: 'counter',
        q: 'Will my salesman be able to see what I buy at?',
        a: 'No. A salesman can sell, take returns and close their own counter. They cannot see trade price, margin, purchase cost or anyone else’s day. That is decided on the server, so it is not something the screen can be talked out of.',
      },
      {
        c: 'start',
        q: 'Can it keep the notebook I already have?',
        a: 'Yes. Every regular goes on with what they already owe, entered as brought forward, and the khata runs from that day. Bring the notebook or a rough list — it is an hour’s work with us on a call.',
      },
      {
        c: 'counter',
        q: 'Can I sell by the piece, not the whole strip?',
        a: 'Yes, and that is the first thing it gets right. A customer buys four tablets out of a strip of ten all day. Stock moves in pieces; purchase is entered in boxes or strips; the price comes off the MRP and divides down.',
      },
      {
        c: 'stock',
        q: 'Do you handle the expiry?',
        a: 'Sales take from the batch that expires soonest. The expiry report tells you what goes in the next month and in the next three, what it is worth, and sends the return back to the company as a document rather than a negative purchase.',
      },
      {
        c: 'stock',
        q: 'What about a shop with more than one branch?',
        a: 'Yes. Open a branch from the Branches page and each one keeps its own stock, counters, cash and takings, while customers’ baki and your suppliers stay shared. A switcher at the top moves between branches, staff can be kept to theirs, and stock goes across with a transfer. What an extra branch adds to the month is shown before you open it.',
      },
      {
        c: 'counter',
        q: 'Is it in Bangla?',
        a: 'The whole counter is, and so is this website. It is two letters in the top bar, not a flag, because one counter may be staffed by somebody who wants Bangla and the owner’s laptop by somebody who does not. Identifiers — bill numbers, batch numbers, phone numbers — deliberately stay in Latin digits.',
      },
      {
        c: 'trust',
        q: 'What happens to my data if I leave?',
        a: 'Every register exports to CSV from the screen that shows it: sales, stock, suppliers, the khata, the ledgers. There is nothing held hostage and nothing to argue about afterwards.',
      },
      {
        c: 'trust',
        q: 'Do I need a drug licence to use it?',
        a: 'The bill prints the licence number your shop already holds, because a pharmacy has one. The software is not licensed and does not become licensed, and nothing in the interface pretends otherwise.',
      },
      {
        c: 'start',
        q: 'How long does it take to get running?',
        a: 'Usually the same day. We need the shop’s name, address, drug licence number, your first suppliers and an opening stock count. Then count the cash, pick the counter, and open the day.',
      },
    ],
  },

  cta: {
    kicker: 'Ready when you are',
    title: 'Your counter is open for business',
    lede:
      'Fourteen days, every feature, no card. Tell us about the shop and we will have it counting stock by the evening.',
    primary: 'Start your free trial',
    secondary: 'Book a live demo',
    tertiary: 'Or just sign in',
    points: [
      'We switch it on for you',
      'Your data exports to CSV',
      'No per-bill fee, ever',
    ],
  },

  demo: {
    title: 'See it on your own counter',
    lede:
      'Twenty minutes, on a call, with a shop set up like yours — your kind of shelves, your way of taking money. You will ring up a bill, take something back, count a shelf and close the day, and you can ask anything.',
    screen: {
      kicker: 'The real thing',
      title: 'The screen, running, before you say yes',
      body:
        'This is the billing screen itself — the same rows, the same keys, the same printer. Press F2 on your keyboard and the search lights up. It is not a screenshot of the product; it is the product.',
    },
    steps: {
      eyebrow: 'The call',
      title: 'Twenty minutes, on a shop like yours',
      item: [
        { n: '01', title: 'Book it, in one minute', body: 'A name, an email, the shop. Nobody sells you anything on the call.' },
        { n: '02', title: 'We call with your counter set up', body: 'Your kind of shelves, your way of taking money — so you practise the real thing, not a demo of a demo.' },
        { n: '03', title: 'You run it', body: 'Ring up a bill, take a return, count a shelf, close the day. For twenty minutes it is your counter.' },
        { n: '04', title: 'Ask anything, then decide', body: 'No card and no contract anywhere. If it fits, the fourteen-day trial is switched on the same day.' },
      ],
    },
    book: {
      eyebrow: 'Book the call',
      title: 'Tell us about the shop',
      lede:
        'A name and a phone number are enough. The rest is so the call starts on your kind of counter — your shelves, your way of taking money — not on ours.',
      rights: [
        'Twenty minutes, and you run the counter',
        'No card, nothing to install',
        'If it fits, the trial is on the same day',
      ],
      trialLink: 'Prefer to skip the call? Start the free trial instead',
    },
    form: {
      name: 'Your name',
      email: 'Email',
      phone: 'Mobile number',
      shop: 'Shop name',
      staff: 'How many people work at the counter',
      size: 'Roughly how many bills a day',
      message: 'Anything we should set up before the call',
      submit: 'Book my demo',
      sending: 'Sending…',
      success: 'Booked. We will call you within one working day.',
      error: 'That did not go through. Please write to us by email instead.',
      options: {
        staff: ['Just me', 'Two or three', 'Four or five', 'Six or more'],
        size: ['Under 50', '50 – 150', '150 – 400', '400 or more'],
      },
    },
  },

  auth: {
    login: {
      title: 'Sign in to the shop',
      lede: 'Your counter, your stock and your khata — where you left them.',
      email: 'Email',
      password: 'Password',
      submit: 'Sign in',
      working: 'Signing in…',
      forgot: 'Forgotten your password?',
      noAccount: 'No account yet?',
      startHere: 'Start a free trial',
      demo: 'Want to look before you start?',
      bookDemo: 'Book a demo',
      error: 'That did not work.',
      rights: 'A shared counter machine should be signed out. Your profile shows every machine this account is open on.',
    },
    register: {
      title: 'Start your free trial',
      lede: 'Three short steps. We switch every counter on for you — free for fourteen days, no card.',
      stepOf: 'Step {n} of {total}',
      steps: {
        shop: 'Your shop',
        you: 'About you',
        secure: 'Secure & confirm',
      },
      shopName: 'Shop name',
      shopPlaceholder: 'e.g. Jononi Pharmacy',
      counters: 'How many billing counters?',
      countersHint: 'Every computer or till that prints a bill.',
      exact: 'Exactly how many?',
      fewer: 'One fewer',
      more: 'One more',
      counterOne: '{n} counter',
      counterMany: '{n} counters',
      outlets: 'How many branches?',
      branchOne: '{n} branch',
      branchMany: '{n} branches',
      licence: 'Drug licence no. (optional)',
      plan: {
        kicker: 'Your plan',
        basic: 'For a one-counter shop.',
        plus: 'For two to five counters.',
        custom: 'We will price the extra counters with you on the setup call.',
        trial: '14 days free, on every counter you have',
      },
      yourName: 'Your name',
      phone: 'Mobile number',
      phoneHint: 'We call this number to set the shop up.',
      email: 'Email',
      password: 'Password',
      confirm: 'Confirm password',
      review: 'One last look',
      edit: 'Edit',
      terms: 'I accept the terms and the privacy policy',
      next: 'Next',
      back: 'Back',
      submit: 'Create the shop',
      working: 'Setting it up…',
      haveAccount: 'Already have an account?',
      signIn: 'Sign in',
      successTitle: 'That is the shop created',
      successBody:
        'We have your details and we will switch the shop on — usually the same day. Nothing to install and no card: when it is live you will get a sign-in at {email}.',
      nextTitle: 'What happens next',
      nextSteps: ['We review it today', 'We call to set up your {n}', 'You start selling'],
      required: 'Please fill this in.',
      badPhone: 'An 11-digit mobile number starting with 01.',
      badEmail: 'That email address does not look right.',
      passwordHint: 'At least 8 characters',
      error: 'That did not go through.',
      mismatch: 'Those two passwords are not the same.',
      needTerms: 'Please accept the terms to continue.',
    },
  },

  pages: {
    meta: {
      features: {
        title: 'Features — every board on the counter',
        description:
          'The billing screen, the shelves, purchases, the baki khata, reports and offline selling — everything a Bangladeshi medicine shop runs on, in one place.',
      },
      pricing: {
        title: 'Pricing — per shop, not per bill',
        description:
          'One monthly price, the whole shop open: unlimited bills, unlimited customers, every feature. Basic ৳1,500, Plus ৳3,000 a month. Free 14-day trial.',
      },
      faq: {
        title: 'Questions & answers',
        description:
          'The questions a Bangladeshi pharmacy actually asks: the trial, the printer, offline selling, the medicine list, the khata, and what happens when you leave.',
      },
      demo: {
        title: 'Book a live demo',
        description:
          'Twenty minutes on a call with a shop set up like yours — you ring up a bill, take a return, count a shelf and close the day.',
      },
      login: {
        title: 'Sign in to the shop',
        description:
          'Sign in to your shop account. A shared counter machine should be signed out when the shift ends.',
      },
      register: {
        title: 'Start your free trial',
        description:
          'Fourteen days, every feature, no card. Tell us about the shop and we will switch it on for you.',
      },
      contact: {
        title: 'Contact us',
        description: 'Write to the people building it. A real answer within one working day.',
      },
      status: {
        title: 'System status',
        description: 'Is Dawai working right now? Each part of the platform, and anything we are fixing.',
      },
      legal: {
        title: 'Legal',
        description: 'The terms of service, the privacy policy and the refund policy for {brand}.',
      },
    },

    features: {
      kicker: 'Features',
      title: 'One counter, six boards',
      lede:
        'Everything a medicine shop actually runs on, in the order a shop runs it: ring it up, count it, buy it, owe it, see it, and keep selling when the line drops.',
      modules: {
        kicker: 'The boards',
        title: 'Six screens, one counter',
        lede: 'Each board is one job, and every number on any board comes from the same ledger.',
      },
      deep: {
        kicker: 'Close up',
        title: 'The details that count',
        lede:
          'The difference between medicine-shop software and a cash register is in this list.',
      },
    },

    status: {
      kicker: 'Status',
      title: 'Is Dawai working?',
      lede: 'Each part of the platform, right now, and anything we are fixing. This page checks itself every minute.',
      overall: {
        operational: 'Everything is working',
        degraded: 'Some things are slow',
        maintenance: 'Planned maintenance',
        outage: 'Something is down',
        unreachable: 'We cannot reach Dawai right now',
      },
      state: { operational: 'Working', degraded: 'Slow', maintenance: 'Maintenance', outage: 'Down' },
      incident: { investigating: 'Looking into it', identified: 'Found the cause', monitoring: 'Fixed, watching', resolved: 'Resolved' },
      open: 'Happening now',
      recent: 'Last two weeks',
      none: 'Nothing has gone wrong in the last two weeks.',
      started: 'Started',
      resolvedAt: 'Resolved',
      checked: 'Checked',
      offlineNote: 'Bills you ring up while the connection is down are kept on the counter and sent once it is back.',
    },
    contact: {
      kicker: 'Contact',
      title: 'Talk to the person building it',
      lede:
        'A real answer within one working day. If the shop is open, somebody is working.',
      response: 'Every message gets an answer within one working day.',
      direct: {
        title: 'Write directly',
        lede: 'For anything at all — a price, a bug, an idea, a complaint.',
      },
      form: {
        emailInstead: 'Email us instead',
        name: 'Your name',
        email: 'Email',
        message: 'How can we help?',
        submit: 'Send the message',
        sending: 'Sending…',
        success: 'Received. We will write back within one working day.',
        error: 'That did not go through. Please write to us by email instead.',
      },
    },

    legal: {
      kicker: 'Legal',
      updated: 'Last updated',
      terms: {
        title: 'Terms of service',
        lede: 'The agreement between you and us for using {brand}.',
        items: [
          {
            h: 'The account is yours',
            t: 'You keep the account; we provide the service. Your login, your shop data, your staff list — you can export it as CSV at any time and take it with you when you leave.',
          },
          {
            h: 'What the subscription covers',
            t: 'One price per shop per month covers the whole shop: unlimited bills, unlimited customers and every feature on the pricing page. Nothing is sold per bill and no feature is sold as an add-on.',
          },
          {
            h: 'The trial',
            t: 'A free fourteen-day trial with every feature and no card. When it ends, the shop continues on the plan you chose; if you do not continue, your data stays exportable for ninety days.',
          },
          {
            h: 'Your data is yours',
            t: 'We never sell or rent your data. It is used to run the software, keep it working and improve it. Deleting the account deletes the data within ninety days.',
          },
          {
            h: 'The counter is a pharmacy',
            t: '{brand} is a billing and bookkeeping tool. It does not decide what medicine a customer should take, does not write prescriptions and is not medical advice.',
          },
          {
            h: 'Fees and payment',
            t: 'Plans are billed monthly in advance, per shop.',
          },
          {
            h: 'Leaving',
            t: 'You can cancel at any time and billing stops at the end of the paid period. CSV export keeps working for ninety days after you cancel.',
          },
          {
            h: 'Changes to this agreement',
            t: 'We may update these terms. Material changes are announced on the site and by email at least thirty days before they apply.',
          },
        ],
      },
      privacy: {
        title: 'Privacy policy',
        lede: 'What we collect, what we do with it, and what we never do.',
        items: [
          {
            h: 'What we collect',
            t: 'What you type: the shop profile, the drug licence number, staff names, customers and their balances, purchases and bills. Plus the technical basics — the browser, the language, and an IP address for security.',
          },
          {
            h: 'What we do with it',
            t: 'We use it to run the software you are paying us to run. Nobody at the company looks at a shop’s register without being asked, and nothing is shared with anyone outside the company.',
          },
          {
            h: 'The baki khata and SMS',
            t: 'If you use SMS reminders for the khata, the message goes out with your shop’s name on it. A customer’s number is used only for the reminder you configured.',
          },
          {
            h: 'What we never do',
            t: 'We do not sell data, rent data, or hand it to advertisers. We do not read your bills to advertise to your customers.',
          },
          {
            h: 'Where it lives',
            t: 'Your data is stored where you chose when the shop was created, and backups are kept for disaster recovery only.',
          },
          {
            h: 'Offline bills',
            t: 'A bill rung up offline stays on the counter machine until the line returns and is then sent once. The same bill can never be posted twice.',
          },
          {
            h: 'Your right to be forgotten',
            t: 'Ask, and the account is closed and the data is deleted within ninety days. Export it as CSV before you ask.',
          },
          {
            h: 'Changes',
            t: 'Anything material is announced at least thirty days before it applies.',
          },
        ],
      },
      refund: {
        title: 'Refund policy',
        lede: 'When you get your money back, and when you do not.',
        items: [
          {
            h: 'What is covered',
            t: 'If the software stops working in a way that keeps you from billing, and we cannot fix or replace it within seven days, you get the unused part of the month back.',
          },
          {
            h: 'What is not',
            t: 'Wrong entries, cancelled bills and data entered against the screen’s warnings are not refundable, and the trial is already free.',
          },
          {
            h: 'How to ask',
            t: 'Email us during the subscription. Refunds are settled to the same method the shop is billed on, within ten working days.',
          },
          {
            h: 'Cancellation',
            t: 'Cancelling stops the next payment; it does not refund the current month, which you have already used.',
          },
          {
            h: 'Reconciliation',
            t: 'If a billing error overcharges a shop, we refund the difference within ten working days and explain what happened.',
          },
        ],
      },
    },
  },

  footer: {
    blurb:
      '{brand} — the billing screen, the stock, the khata and the books for a Bangladeshi medicine shop.',
    product: 'Product',
    company: 'Company',
    resources: 'Resources',
    legal: 'Legal',
    terms: 'Terms of service',
    privacy: 'Privacy policy',
    refund: 'Refund policy',
    rights: 'All rights reserved.',
    poweredBy: 'Powered by {name}',
  },
} as const;

/*
 * Both of these keep arrays as arrays.
 *
 * A mapped type applied blindly to an array turns it into an object with `0`,
 * `length` and `map` on it, and then every list in `bn` is typed as a bag of
 * methods instead of a list of words — which hides the one mistake this file
 * cannot afford, a list that is one entry shorter than the one it translates.
 */
type DeepStringify<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? readonly DeepStringify<U>[]
    : T extends object
      ? { [K in keyof T]: DeepStringify<T[K]> }
      : T;

export type Dictionary = DeepStringify<typeof en>;

/*
 * Bangla. Deliberately not a literal `Dictionary`: a missing key has to fall
 * back to English rather than render blank, and typing it as one would forbid
 * the exact case the rule exists for.
 */
const bn: DeepPartial<Dictionary> = {
  meta: {
    title: '{brand} — বাংলাদেশের ঔষধের দোকানের বিলিং ও স্টক সফটওয়্যার',
    shortTitle: '{brand}',
    description:
      'ঔষধের দোকানের সফটওয়্যার — পিস অনুযায়ী বিক্রি, প্রতিটি ব্যাচ ও মেয়াদ হিসাব, বাকি খাতা, আপনার নিজের থার্মাল প্রিন্টারে বিল, আর লাইন চলে গেলেও বিক্রি চলে। ১৪ দিন ফ্রি, কার্ড লাগে না।',
    ogAlt: '{brand}-এর কাউন্টার, বিক্রি চলাকালীন',
  },

  nav: {
    trialBadge: '১৪ দিন',
    features: 'ফিচার',
    how: 'কীভাবে কাজ করে',
    pricing: 'দাম',
    faq: 'প্রশ্ন',
    demo: 'ডেমো দেখুন',
    contact: 'যোগাযোগ',
    status: 'স্ট্যাটাস',
    signIn: 'লগ ইন',
    getStarted: 'ফ্রি শুরু করুন',
    openApp: 'অ্যাপ খুলুন',
    menu: 'মেনু',
    close: 'বন্ধ',
    backToTop: 'উপরে ফিরে যান',
  },

  announce: [
    '১৪ দিন ফ্রি। কার্ড লাগে না, সেটআপ ফি লাগে না — দোকানটা আমরাই চালু করে দিই।',
    'বাংলা ও ইংরেজি — পুরো কাউন্টার, শুধু বাটন নয়।',
    'ইন্টারনেট চলে গেলেও বিক্রি চলে। লাইন এলে বিলগুলো চলে যায়।',
    '৪৫,০০০+ বাংলাদেশি ঔষধ আগে থেকেই আছে — ব্র্যান্ডের নাম লিখলেই পাবেন।',
  ],

  hero: {
    eyebrow: 'বাংলাদেশের ঔষধের দোকানের কাউন্টারের জন্য তৈরি',
    titleA: 'একটা স্ক্রিনে',
    titleEm: 'পুরো কাউন্টার',
    titleB: '— বিল, স্টক, আর বাকি',
    lede:
      'পিসে পিসে বিক্রি, প্রতিটি ব্যাচের হিসাব, বাকি খাতা গোছানো — আর বিল ছাপে আপনার নিজের প্রিন্টারেই। বাংলাতেও কথা বলে, আর লাইন চলে গেলেও বিক্রি চলতে থাকে।',
    ctaPrimary: '১৪ দিনের ট্রায়াল শুরু করুন',
    ctaSecondary: 'লাইভ ডেমো বুক করুন',
    ctaNote: 'কার্ড লাগে না। আমরা সেদিনই চালু করে দিই।',
    proof: ['১৪ দিন ফ্রি', 'যেকোনো সময় বাতিল', 'আপনার তথ্য CSV-তে নেওয়া যায়'],
    orbit: [
      { label: 'আজ রাতে বিক্রি', note: 'বাক্সে গোনা ৳৯,৩৪০' },
      { label: 'সিঙ্কের অপেক্ষায়', note: '১৭টি বিল, লাইন না থাকতেই বিক্রি' },
      { label: 'আছে, ২১৪টি লট', note: '৯০ দিনে মেয়াদ শেষ ৳১৮,৯০০' },
    ],
    stats: [
      { suffix: ' পিস', label: 'একই তাকের পর্দায়, প্রতিটি লট' },
      { suffix: ' দিন', label: 'ফ্রি ট্রায়াল, কার্ড ছাড়াই' },
      { suffix: '', label: 'প্রতি বিলে, প্রতি কাস্টমারে, প্রতিদিন' },
      { suffix: '', label: 'ভাষা পুরো কাউন্টার জুড়ে' },
    ],
    scroll: 'কাউন্টারটা দেখুন',
  },

  counter: {
    kicker: 'কাউন্টার',
    title: 'এটা ওয়েব পেজ নয়, এটা বিলিং স্ক্রিন',
    lede: 'পুরো স্ক্রিন জুড়ে শুধু বিল — কিবোর্ডেই সব কাজ।',
    points: [
      {
        title: 'প্রতিটি কী-এর পেছনে একটি বোতাম',
        body: 'F2 থেকে F10 — প্রতিটি কাজ এক চাপে।',
      },
      {
        title: 'দশটার স্ট্রিপ থেকে চারটা বিক্রি',
        body: 'বক্স, পাতা বা এক পিস — দাম নিজেই হিসাব হয়।',
      },
      {
        title: 'একসঙ্গে তিনজন কাস্টমার',
        body: 'F6-এ বিল সরিয়ে রাখুন, পরের কাস্টমার সারুন, F7-এ ফিরিয়ে আনুন।',
      },
      {
        title: 'টাকা ভাগ করে নেওয়া',
        body: 'ক্যাশ, বিকাশ, নগদ, কার্ড — বা ভাগ করে।',
      },
      {
        title: 'কোন দোকানের কাছে যায়, সেটা শিখে নেয়',
        body: 'বেশি বিক্রির ঔষধ নিজে থেকেই উপরে আসে।',
      },
      {
        title: 'শুধু বিক্রি — এটাই ইচ্ছাকৃত',
        body: 'সেলসম্যান কেনা দাম বা লাভ দেখতে পায় না।',
      },
    ],
    keyCard: {
      title: 'প্রতিটি কী-এর পেছনে একটি বোতাম',
      body: 'একটিতে ক্লিক করুন — অথবা এখনই কীবোর্ডে সেটিই চাপুন। বিলিং স্ক্রিনের প্রতিটি কাজের জন্য দুটোই আছে, তাই নতুন সেলসম্যান টাচ করেই চালাতে পারেন, আর যে ছয় বছর ধরে করে সে কখনো তাকাতেই হয় না।',
      badge: 'F2 – F10 চেষ্টা করুন',
    },
    keymap: [
      { what: 'খোঁজা', body: 'ব্র্যান্ড, জেনেরিক বা কোম্পানি দিয়ে ৪৫,০০০+ ঔষধে খোঁজা — অথবা প্যাক স্ক্যান করুন।' },
      { what: 'কাস্টমার', body: 'কে কিনছেন বেছে নিন। এক চাপে বিল তাঁর বাকি খাতায়।' },
      { what: 'ছাড়', body: 'শুধু তখনই, যখন ওই ভূমিকায় করার অনুমতি আছে। সেলসম্যান সর্বনিম্ন দামের নিচে ছাড় দিতে পারে না।' },
      { what: 'সরিয়ে রাখা', body: 'আটকে থাকা বিলটা সরিয়ে রেখে পর্দা পরের কাস্টমারের জন্য খালি করে দেয়।' },
      { what: 'সরানো বিল', body: 'সরিয়ে রাখা সব বিল ফিরিয়ে আনে। সেগুলো থাকে এই ব্রাউজারে, সার্ভারে কখনো নয়।' },
      { what: 'টাকা', body: 'ক্যাশ, বিকাশ, নগদ, কার্ড — বা ভাগ করে। ফেরত টাকা আলাদা লাইনে।' },
      { what: 'ফেরত', body: 'আসল বিলের বিপরীতে ফেরত নেওয়া, নিজের আলাদা ব্যাচে।' },
      { what: 'পুরো ক্যাশ', body: 'কাস্টমার নোটটা দিয়েছেন। বাকিটা বিলিং স্ক্রিনই হিসাব করে নেয়।' },
    ],
    receipt: {
      kicker: 'বিক্রির আরেক অর্ধেক',
      lede: 'দোকানের নিজের থার্মাল প্রিন্টারেই',
      points: [
        'বাংলা আর ইংরেজি — দুই ভাষায় দোকানের নাম',
        'দেয়ালে টাঙানো ডিআরজিডিএ লাইসেন্স নম্বর',
        'মোট অঙ্কে আর কথায়',
        'প্রতিটা লাইনে ব্যাচ — ফেরত লাগে',
        'একটি QR, দিয়ে আবার বিলটা খুঁজে পাওয়া যায়',
      ],
    },
  },

  stock: {
    kicker: 'তাক',
    title: 'দোকান যেভাবে গোনে, ঠিক সেভাবেই স্টক হিসাব',
    lede: 'প্রতিটি ব্যাচ, প্রতিটি মেয়াদ — যার মেয়াদ আগে শেষ, সেটাই আগে বিক্রি।',
    points: [
      {
        title: 'খতা-ই আসল সত্য',
        body: 'প্রতিটি বিক্রি আর কেনা থেকে হিসাব — হাতে লিখতে হয় না।',
      },
      {
        title: 'যার মেয়াদ আগে, সেটাই আগে',
        body: 'প্রতিটি বিক্রি আগে-মেয়াদ-শেষ ব্যাচ থেকে যায়।',
      },
      {
        title: 'বোনাস একটি ঘর, নোট নয়',
        body: '১০+১, ২০+৩ বোনাস আসল খরচে ধরা হয়।',
      },
      {
        title: 'ফাঁকা জায়গা আর শূন্য এক জিনিস নয়',
        body: 'শুধু যা গুনলেন তা বদলায়, ফাঁকা ঘর যেমন ছিল থাকে।',
      },
      {
        title: 'পার্থক্য হিসেবে বসানো হয়',
        body: 'গোনার সময়ের বিক্রিও হারায় না।',
      },
      {
        title: 'ফ্রিজও একটা তাক, আর লেবেলও',
        body: 'ফ্রিজের তাক আর প্রিন্ট করার শেল্ফ লেবেল।',
      },
    ],
  },

  purchase: {
    kicker: 'মাল আসে যেখান থেকে',
    title: 'চার ধরনের সাপ্লায়ার, প্রত্যেকের আলাদা হিসাব',
    lede:
      'কোম্পানির ডিপো, মিটফোর্ডের পাইকারি, পাশের বড় ঔষধের দোকান, বা অন্য কেউ। প্রত্যেকের নিজের খাতা আর বিবরণী — আর "ইনসেপ্টাকে কত দিতে হবে" এর উত্তর হলো পাতার উপরে একটাই সংখ্যা।',
    points: [
      { title: 'ইনভয়েস, ব্যাচ, মেয়াদ, রেট, বোনাস' },
      { title: 'প্রতিটি লাইনের পর হিসাব বাকি' },
      { title: 'যেকোনো সময়ের জন্য ছাপার মতো বিবরণী' },
      { title: 'এসআর একটি তথ্য, তার আসার দিনসহ' },
      { title: 'মেয়াদ ও নষ্ট মাল ফেরত — নিজস্ব কাগজে' },
      { title: 'ডেলিভারির বিল থেকেই ক্রেডিট হিসাব' },
    ],
  },

  khata: {
    kicker: 'বাকি খাতা',
    title: 'নোটবই, তবে নোটবইয়ের কোনো পাতা হারায় না',
    lede:
      'মাস শেষে টাকা দেয় এমন নিয়মিত কাস্টমার। প্রতি বিলে নয়, প্রতি জনে একটি লাইন — প্রতিটি বিল ও প্রতিটি জমা, আর তারপর কত বাকি ছিল।',
    points: [
      { title: 'টাকা নেওয়া ওই একই পর্দায়' },
      { title: 'কাউন্টার দেখতে পায় বাকির সীমা' },
      { title: 'পুরনো নোটবইয়ের বাকি আগের জের হিসেবে' },
      { title: 'একবার মনে করিয়ে দেওয়া, তিন দিনে দুবার নয়' },
      { title: 'পুরো খাতা CSV-তে' },
      { title: 'বাকি হিসাব করা হয় লাইন থেকে, কাস্টমারের খাতা থেকে নয়' },
    ],
  },

  offline: {
    kicker: 'লাইন চলে গেলে',
    title: 'একমাত্র স্ক্রিন যেটা বন্ধ হওয়া উচিত নয়',
    lede: 'ইন্টারনেট নেই? বিল কাটা চলবে। লাইন এলে সব চলে যাবে।',
    points: [
      { title: 'বিল ছাপার আগেই কম্পিউটারে লেখা হয়', body: 'আগে ডিভাইসে সেভ হয় — রিলোড বা বিদ্যুৎ গেলেও থাকে।' },
      { title: 'একই বিল দুবার গেলে কিছু হয় না', body: 'বারবার পাঠালেও একই বিল দুবার হয় না।' },
      { title: 'স্লিপ ছাপে নম্বর ছাড়াই', body: 'স্লিপে লেখা থাকে, সিরিয়াল নম্বর পরে আসবে।' },
      { title: 'তাক খালি হলেও বিক্রি হয়', body: 'এখন বিক্রি, পরে গোনা — বিক্রি আটকায় না।' },
    ],
  },

  reports: {
    kicker: 'মালিক যা জানতে চান',
    title: 'এই মাস বনাম গত মাস। আর যে পাঁচটা দেখা দরকার।',
    lede:
      'কোম্পানি অনুযায়ী মার্জিন, তাকে পড়ে আছে কোন মাল, কী মেয়াদ শেষ হচ্ছে, কার কত বাকি, আর দিনের ক্যাশ — ভাড়া, বেতন আর বিদ্যুৎ কেটে রেখে আসল লাভ।',
    cards: [
      { title: 'আসল লাভ', body: 'মার্জিন, দোকানের নিজের খরচ কেটে।' },
      { title: 'কোন কোম্পানি ভালো', body: 'কোম্পানি ধরে মার্জিন আর চলাচল।' },
      { title: 'পড়ে আছে', body: 'নব্বই দিনে যা নড়েনি, আর তাতে কত টাকা আটকে।' },
      { title: 'মেয়াদ', body: 'এই মাসে কী শেষ হবে, তিন মাসে কী, আর তার দাম।' },
      { title: 'দেখা দরকার', body: 'গোনায় ঘাটতি, ফেরত, কেউ যে বিল সরিয়ে রেখেছেন।' },
      { title: 'সব খাতা CSV-তে', body: 'বিক্রি, স্টক, কোম্পানি, খাতা — যে পর্দায় দেখা যায় সেখান থেকেই।' },
    ],
  },

  trust: {
    kicker: 'যা হতে এটি বাঁচায়',
    title: 'সংখ্যা বিশ্বাসযোগ্য করে যেসব নিয়ম',
    items: [
      { title: 'কিছুই মোছা হয় না', body: 'বিল, আইটেম, কাস্টমার, কোম্পানি, তাক, কাউন্টার — সব একটি পর্দায় পড়ে থাকে কে কে ফেলেছে এবং কেন, আর সেখান থেকেই ফেরত আসে।' },
      { title: 'ফেরত দিতে কারণ লাগে', body: 'বিলের নিজের ইতিহাসে আর অডিট ট্রেইলে থাকে। "কোন সেলসম্যানটা করেছে, আর সে কী বলেছে" — দুই প্রশ্নেরই উত্তর থাকে।' },
      { title: 'বাতিল বিল তালিকায় থাকে, হিসাবে ধরা হয় না', body: 'বাতিল করার সময় তার টাকা ফিরে গেছে। আবার হিসাবে ধরলে আয় বানিয়ে ফেলা হয়।' },
      { title: 'সেলসম্যান নিজের ভুল বিল ফেরত নিতে পারেন', body: 'নিজের খোলা কাউন্টারে, এক ঘণ্টার মধ্যে। এটি উদারতা নয় — যে কাউন্টার একটি ভুল ফেরত নিতে পারে না, সেখানে না বলে টাকা ফেরত দিয়ে দেয়।' },
      { title: 'ভূমিকা কী দেখবে, সার্ভার ঠিক করে', body: 'পর্দা নয়। ক্রয়মূল্য আর মার্জিন সেলসম্যানের সেশনে যেকোনোভাবে খোলা হলেও পৌঁছায় না।' },
      { title: 'আপনার খাতা আপনারই', body: 'প্রতিটি তালিকা CSV-তে নেওয়া যায়। কোনো আটকে রাখা নেই, চলে গেলেও কিছু নেই।' },
    ],
  },

  steps: {
    kicker: 'শুরু করা',
    title: 'আজ সন্ধ্যাতেই ব্যবহার শুরু',
    items: [
      { n: '০১', title: 'দোকানের কথা বলুন', body: 'নাম, ঠিকানা, দেওয়ালে টাঙানো ড্রাগ লাইসেন্স নম্বর, আর কাউন্টারে কে থাকেন।' },
      { n: '০২', title: 'আমরা চালু করে দিই', body: 'আপনার তালিকা, সাপ্লায়ার, তাক। সাধারণত একই দিনে। চাইলে একটি কলে সব করে দেব।' },
      { n: '০৩', title: 'শুরুর স্টক গুনুন', body: 'তাক ধরে ধরে, বা একবারে সব মিলিয়ে। স্ক্রিন যা বলছে আর গোনা যা বলছে — পার্থক্য লেখা থাকবে।' },
      { n: '০৪', title: 'দিন শুরু করুন', body: 'বাক্সের ক্যাশ গুনুন, কাউন্টার বাছুন, বিক্রি শুরু করুন। প্রতিটি বিলে যিনি করেছেন তার নাম থাকবে।' },
    ],
  },

  screens: {
    kicker: 'পর্দাগুলো',
    title: 'এখানকার প্রতিটি পর্দাই কাউন্টারের জন্য বানানো',
    items: [
      { name: 'বিলিং স্ক্রিন', note: 'পুরো স্ক্রিন, কোনো মেনু নেই। পর্দাটাই বিল।' },
      { name: 'স্টক', note: 'যা বিক্রি করেন আর কত বাকি — সাথে নিকটতম মেয়াদ রঙে দেখানো।' },
      { name: 'মাল কেনা', note: 'একটি ডেলিভারি, লাইনে লাইনে, যে কাগজ থেকে টাইপ হয়েছে তার সামনে।' },
      { name: 'সাপ্লায়ার', note: 'তারিখ অনুযায়ী হিসাব, প্রতিটি লাইনের পরে বাকি।' },
      { name: 'বাকি খাতা', note: 'প্রতি কাস্টমারে একটি লাইন, বাকি হিসাব করা লাইন থেকেই।' },
      { name: 'রিপোর্ট', note: 'এই মাস বনাম গত মাসের একই দিনগুলো, একটি অনুরোধে।' },
    ],
  },

  voices: {
    kicker: 'কাউন্টার থেকে',
    title: 'ট্রায়াল শেষ হওয়ার পর দোকান যা বলে',
    note: 'এগুলো ট্রায়াল ডিজাইন থেকে লেখা উদাহরণ, কোনো গ্রাহকের নামে দেওয়া উদ্ধৃতি নয়।',
    items: [
      {
        quote:
          'যেটা আশা করিনি, সেটা হলো গোনা। মাসের পর মাস ধরে কেউ একটা পুরো তাক হাঁটিয়ে নিয়েছিল, তাও বেরিয়ে এল। খাতায় দেখা গেল কোন দিন থেকে শুরু হয়েছিল আর কার কাউন্টারে।',
        name: 'ফার্মেসির মালিক',
        where: 'ধানমন্ডি, ঢাকা · ২টি কাউন্টার',
      },
      {
        quote:
          'আমার সেলসম্যান অনেক বিক্রি করেন, তবুও সে কী দামে কিনি সেটা জানতে পারে না। শুধু এটার জন্যেই সাবস্ক্রিপশন সার্থক।',
        name: 'দুই কাউন্টারের দোকানের মালিক',
        where: 'উত্তরা, ঢাকা',
      },
      {
        quote:
          'সন্ধ্যা সাতটায় ওয়াইফাই চলে যায় বেশিরভাগ দিন। ট্রায়ালের তিন সপ্তাহে একদিনও দোকান বন্ধ করতে হয়নি। আগের সফটওয়্যারে নয় দিন বন্ধ ছিল।',
        name: 'ফার্মাসিস্ট',
        where: 'মিরপুর, ঢাকা',
      },
      {
        quote:
          'যে প্রিন্টারটা আগে থেকেই ছিল, সেটাতেই ছাপে। এটাই আমাদের পুরো সিদ্ধান্ত ছিল — নতুন হার্ডওয়্যার কিনব না।',
        name: 'ঔষধের দোকানের মালিক',
        where: 'বগুড়া',
      },
    ],
  },

  how: {
    kicker: 'কীভাবে কাজ করে',
    title: 'আজ সন্ধ্যার মধ্যেই {brand}-এ বিক্রি',
    lede: 'কিছু ইনস্টল করতে হয় না, নতুন হার্ডওয়্যারও লাগে না। তিনটি ধাপ — মাঝেরটা আমরাই করে দিই।',
    cta: 'ফ্রি ট্রায়াল শুরু করুন',
    steps: [
      {
        tag: '২ মিনিট',
        title: 'দোকানের তথ্য দিন',
        body: 'সাইন আপ করুন, অথবা কল বুক করুন। দোকানের নাম, ড্রাগ লাইসেন্স নম্বর আর কয়টি কাউন্টার।',
      },
      {
        tag: 'সেদিনই',
        title: 'কাউন্টার আমরা সাজিয়ে দিই',
        body: 'জাতীয় তালিকা থেকে আপনার ঔষধের লিস্ট, শুরুর স্টক আর প্রিন্টারের মাপ — আপনার সাথে কলে বসেই।',
      },
      {
        tag: '১৪ দিন ফ্রি',
        title: 'বিল কাটা শুরু করুন',
        body: 'যে কম্পিউটার আছে তাতেই বিলিং স্ক্রিন খুলুন। ট্রায়ালের পরে রাখলে তবেই টাকা দেবেন।',
      },
    ],
  },

  pricing: {
    kicker: 'দাম',
    title: 'প্রতি বিল নয়, প্রতি দোকান',
    lede: 'দোকান প্রতি মাসে একটি দাম। প্রতি বিলে কোনো ফি নেই — যখন খুশি ছেড়ে দিতে পারেন।',
    cta: 'ফ্রি শুরু করুন',
    ctaNote: '১৪ দিন, কার্ড লাগে না। চালু করে দেব।',
    compareCta: 'পূর্ণ তুলনা দেখুন',
    plans: [
      {
        name: 'ট্রায়াল',
        price: 'ফ্রি',
        period: '১৪ দিনের জন্য',
        blurb: 'পুরো দোকান, কিছুই বাদ দেওয়া হয়নি। এভাবেই দোকান সিদ্ধান্ত নেয়।',
        cta: 'ট্রায়াল শুরু করুন',
        highlight: false,
        features: [
          'সব ফিচার, একটাও বাদ নয়',
          'আপনার সবগুলো বিলিং কাউন্টার',
          'প্রতিটা কাউন্টারের জন্য একটা লগইন',
          'সীমাহীন বিল',
          'আমরা চালু করে দিই',
          'তথ্য প্রথম দিন থেকেই CSV-তে নেওয়া যায়',
        ],
      },
      {
        name: 'Pharmacy Basic',
        price: '৳১,৫০০',
        period: 'প্রতি মাস',
        blurb: 'এক দোকান, এক বিলিং স্ক্রিন, দুইজন। এককাউন্টার দোকানের যা দরকার সব।',
        cta: 'Basic-এ শুরু করুন',
        highlight: true,
        badge: 'বেশিরভাগ দোকান এখান থেকেই শুরু করে',
        features: [
          'ট্রায়ালের সবকিছু',
          'একটি আউটলেট',
          'একটি বিলিং স্ক্রিন',
          'দুইজন ইউজার — মালিক ও একজন সেলসম্যান',
          'সম্পূর্ণ স্টক, ব্যাচ, মেয়াদ ও FEFO',
          'মাল কেনা, সাপ্লায়ার ও তাদের খাতা',
          'বাকি খাতা ও এসএমএস মনে করিয়ে দেওয়া',
          'সীমাহীন বিল ও কাস্টমার',
          '৫৮মিমি, ৮০মিমি বা যেকোনো প্রস্থে থার্মাল প্রিন্ট',
          'অফলাইনেও চলে',
        ],
      },
      {
        name: 'Pharmacy Plus',
        price: '৳৩,০০০',
        period: 'প্রতি মাস',
        blurb: 'একাধিক বিলিং স্ক্রিন ও স্টাফ — সারাদিন ব্যস্ত দোকানের জন্য।',
        cta: 'Plus-এ শুরু করুন',
        highlight: false,
        features: [
          'Basic-এর সবকিছু',
          'একাধিক বিলিং স্ক্রিন',
          'ভূমিকাসহ দশজন পর্যন্ত ইউজার',
          'একাধিক কাউন্টার ও দিনে একাধিক শিফট',
          'মাল কেনা, সাপ্লায়ারের খাতা ও বিবরণী',
          'অর্ডার: কার কাছে কী চাইতে হবে',
          'পূর্ণ রিপোর্ট ও CSV এক্সপোর্ট',
          'অগ্রাধিকারসহ সরাসরি সহায়তা',
        ],
      },
    ],
    footnote:
      'দাম টাকায়, ভ্যাট বাদে। প্রতি মাসে বিকাশ, নগদ বা ব্যাংকে দিন, যখন খুশি ছেড়ে দিন — আপনার তথ্য আপনার সাথেই যাবে।',
  },

  faq: {
    kicker: 'প্রশ্ন',
    title: 'দোকান আসলে যা জিজ্ঞেস করে',
    lede: 'বদলানোর আগে দোকানমালিকেরা যা জিজ্ঞেস করেন, তার সোজা উত্তর — একটি বিষয় বেছে নিন, বা সবগুলো পড়ুন।',
    topicsLabel: 'বিষয় অনুযায়ী প্রশ্ন',
    topics: {
      all: 'সব',
      start: 'শুরু করা',
      counter: 'কাউন্টারে',
      stock: 'স্টক',
      trust: 'তথ্য ও নিরাপত্তা',
    },
    helpTitle: 'আরও কিছু জানার আছে?',
    helpText: 'একটি কলে জিজ্ঞেস করুন। আপনার মতো সাজানো একটি দোকানে বিশ মিনিট — প্রথম বিলটা আপনি নিজেই করবেন।',
    items: [
      {
        q: 'সত্যিই ফ্রি ট্রায়াল আছে?',
        a: 'হ্যাঁ — চৌদ্দ দিন, সব ফিচার, কার্ড ছাড়াই। আমরা দোকানটা আপনার জন্য চালু করে দিই, কোনো সেটআপ নির্দেশনা পাঠিয়ে নয় — কাউন্টার নতুন সিস্টেম শিখতে ব্যবসা থামাতে পারে না।',
      },
      {
        q: 'কম্পিউটার আর প্রিন্টার কিনতে হবে?',
        a: 'না। দোকানে যে মেশিন আছে সেটাতেই ব্রাউজারে চলে, আর কাউন্টারের যে থার্মাল প্রিন্টার আছে সেটাতেই ছাপে — ৮০মিমি, ৫৮মিমি, বা আপনি যে প্রস্থ টাইপ করবেন। বেশিরভাগ দোকান ঘরে যা আছে তা দিয়েই শুরু করে।',
      },
      {
        q: 'ইন্টারনেট চলে গেলে কী হয়?',
        a: 'বিলিং স্ক্রিন বিক্রি চালিয়ে যায়। বিল আগে মেশিনে লেখা হয়, লাইন এলে পাঠানো হয়; একই বিল দুবার যেতে পারে না। স্লিপ নম্বর ছাড়াই ছাপে এবং সেটি কাগজে লেখা থাকে — নম্বর দিতে পারে শুধু আপনার দোকান, আর তা এখনো বলা হয়নি।',
      },
      {
        q: 'আমার সেলসম্যান কি দেখতে পাবে আমি কী দামে কিনি?',
        a: 'না। সেলসম্যান বিক্রি করতে পারেন, ফেরত নিতে পারেন, নিজের কাউন্টার বন্ধ করতে পারেন। ক্রয়মূল্য, মার্জিন, ক্রয় খরচ বা অন্যের দিনের হিসাব তিনি দেখতে পান না। এটা সার্ভার ঠিক করে, তাই পর্দা বোঝালেও বেরোয় না।',
      },
      {
        q: 'পুরনো নোটবইটা কি নেওয়া যাবে?',
        a: 'হ্যাঁ। প্রতি নিয়মিত কাস্টমার ওঠে আসে তার পুরনো বাকিসহ, আগের জের হিসেবে চুক্তে, আর খাতা সেইদিন থেকেই চলে। নোটবই নিয়ে আসুন বা একটা আনুমানিক তালিকা — একটি কলে আমরা এক ঘণ্টার কাজ।',
      },
      {
        q: 'গোটো স্ট্রিপ না, পিস অনুযায়ী বিক্রি করা যায়?',
        a: 'যায়, আর এটাই প্রথম কাজ। কাস্টমার সারাদিন দশটার স্ট্রিপ থেকে চারটা ট্যাবলেট কেনেন। স্টক পিসে কমে, মাল কেনা বক্স বা পাতায় লেখা হয়, দাম MRP থেকে ভাগ করে নামে।',
      },
      {
        q: 'মেয়াদের ব্যাপারটা কি সামলানো হয়?',
        a: 'বিক্রি হয় যে ব্যাচের মেয়াদ আগে শেষ হবে তা থেকেই। রিপোর্ট বলে কী আগামী মাসে ও কী তিন মাসে শেষ হবে, তার দাম কত, আর কোম্পানিকে ফেরতটি ঋণাত্মক মাল কেনা নয় — নিজস্ব কাগজ হিসেবে যায়।',
      },
      {
        q: 'একাধিক শাখার দোকান হলে?',
        a: 'হ্যাঁ। শাখা পাতা থেকে নতুন শাখা খুলুন — প্রতিটির নিজের স্টক, কাউন্টার, ক্যাশ আর বিক্রি থাকে, আর কাস্টমারের বাকি ও সাপ্লায়ার সব শাখার জন্য একই। ওপরের সুইচার দিয়ে শাখা বদলান, স্টাফকে নিজের শাখায় সীমিত রাখা যায়, আর ট্রান্সফার দিয়ে এক শাখা থেকে আরেক শাখায় মাল যায়। অতিরিক্ত শাখায় মাসে কত বাড়বে, খোলার আগেই দেখানো হয়।',
      },
      {
        q: 'বাংলায় আছে?',
        a: 'পুরো কাউন্টার বাংলায়, এই ওয়েবসাইটও। উপরে দুই অক্ষরের বোতাম — পতাকা নয়, কারণ এক কাউন্টারে কেউ বাংলা চান আর মালিকের ল্যাপটপে কেউ না। শনাক্তকারী — বিল নম্বর, ব্যাচ নম্বর, ফোন নম্বর — ইচ্ছাকৃতভাবে ল্যাটিন অঙ্কেই থাকে।',
      },
      {
        q: 'চলে গেলে আমার তথ্য কী হবে?',
        a: 'যে পর্দায় তালিকা দেখা যায়, সেখান থেকেই প্রতিটি খাতা CSV-তে নেওয়া যায়: বিক্রি, স্টক, সাপ্লায়ার, খাতা, সব লেজার। কিছু আটকে রাখা হয় না, আর পরে নিয়ে কোনো ঝগড়াঝগড়ি হয় না।',
      },
      {
        q: 'ব্যবহার করতে ড্রাগ লাইসেন্স লাগে?',
        a: 'বিলে আপনার দোকানের লাইসেন্স নম্বর ছাপে, কারণ ঔষধের দোকানের একটা আছে। সফটওয়্যার লাইসেন্সপ্রাপ্ত নয় এবং হয়ও না, আর কোনো জায়গায় এমন দাবিও করে না।',
      },
      {
        q: 'চালু করতে কত সময় লাগে?',
        a: 'সাধারণত একই দিনে। দোকানের নাম, ঠিকানা, ড্রাগ লাইসেন্স নম্বর, প্রথম সাপ্লায়ারগুলো আর শুরুর স্টক গোনা দরকার। তারপর ক্যাশ গুনে কাউন্টার বাছুন, আর দিন শুরু করুন।',
      },
    ],
  },

  cta: {
    kicker: 'যখন প্রস্তুত',
    title: 'আপনার কাউন্টার ব্যবসার জন্য খোলা',
    lede:
      'চৌদ্দ দিন, সব ফিচার, কার্ড ছাড়া। দোকানের কথা বলুন, সন্ধ্যার আগেই স্টক গোনা শুরু করে দেব।',
    primary: 'ফ্রি ট্রায়াল শুরু করুন',
    secondary: 'লাইভ ডেমো বুক করুন',
    tertiary: 'অথবা শুধু লগ ইন করুন',
    points: ['আমরা চালু করে দিই', 'তথ্য CSV-তে নেওয়া যায়', 'প্রতি বিলে ফি নেই'],
  },

  demo: {
    title: 'নিজের কাউন্টারেই দেখুন',
    lede:
      'বিশ মিনিট, একটি কলে, আপনার মতো একটি দোকান সেট করে — আপনার ধরনের তাক, আপনার ধরনের টাকা নেওয়া। আপনি একটি বিল কুট করবেন, কিছু ফেরত নেবেন, একটি তাক গুনবেন আর দিন বন্ধ করবেন — আর যা খুশি জিজ্ঞেস করতে পারবেন।',
    screen: {
      kicker: 'আসল জিনিসটা',
      title: 'স্ক্রিনটা চলছে — হ্যাঁ বলার আগেই',
      body:
        'এটাই আসল বিলিং স্ক্রিন — একই সারি, একই কী, একই প্রিন্টার। কিবোর্ডে F2 চাপুন, খোঁজা জ্বলে উঠবে। এটা পণ্যের ছবি নয়; এটাই পণ্য।',
    },
    steps: {
      eyebrow: 'কলটা',
      title: 'বিশ মিনিট, আপনার মতো একটি দোকানে',
      item: [
        { n: '০১', title: 'এক মিনিটে বুক করে ফেলুন', body: 'একটি নাম, একটি ইমেইল, দোকানের কথা। কলটাতে কেউ আপনাকে কিছু বিক্রি করবে না।' },
        { n: '০২', title: 'আপনার কাউন্টার সেট করে ফোন', body: 'আপনার ধরনের তাক, আপনার ধরনের টাকা নেওয়া — ডেমোর ডেমো নয়, আসল জিনিসটাতেই হাত পাকাবেন।' },
        { n: '০৩', title: 'আপনিই চালান', body: 'একটি বিল করুন, একটি ফেরত নিন, একটি তাক গুনুন, দিন বন্ধ করুন। বিশ মিনিটের জন্য এটা আপনার কাউন্টার।' },
        { n: '০৪', title: 'যা খুশি জিজ্ঞেস করুন, তারপর ঠিক করুন', body: 'ঘরে কার্ড নেই, চুক্তিও নেই কোনোখানে। পছন্দ হলে চৌদ্দদিনের ট্রায়াল সেদিনই চালু।' },
      ],
    },
    book: {
      eyebrow: 'কলটা বুক করুন',
      title: 'দোকানের কথা বলুন',
      lede:
        'একটি নাম আর একটি ফোন নম্বরই যথেষ্ট। বাকিটা এজন্য, যাতে কলটা আপনার ধরনের কাউন্টারে শুরু হয় — আপনার তাক, আপনার টাকা নেওয়ার নিয়ম — আমাদেরটায় নয়।',
      rights: [
        'বিশ মিনিট, আর আপনিই কাউন্টার চালাবেন',
        'কার্ড নেই, ইনস্টলের কিছু নেই',
        'পছন্দ হলে ট্রায়ালই সেদিন',
      ],
      trialLink: 'কলটা বাদ দিয়ে সরাসরি ফ্রি ট্রায়াল শুরু করুন',
    },
    form: {
      name: 'আপনার নাম',
      email: 'ইমেইল',
      phone: 'মোবাইল নম্বর',
      shop: 'দোকানের নাম',
      staff: 'কাউন্টারে কতজন কাজ করেন',
      size: 'দিনে আনুমানিক কতগুলো বিল',
      message: 'কলের আগে কিছু সেট করে রাখতে চাইলে',
      submit: 'ডেমো বুক করুন',
      sending: 'পাঠানো হচ্ছে…',
      success: 'বুক হয়েছে। এক কর্মদিবসের মধ্যে আমরা ফোন করব।',
      error: 'এটি পাঠানো যায়নি। ইমেইলে লিখে পাঠান।',
      options: {
        staff: ['শুধু আমি', 'দুই-তিনজন', 'চার-পাঁচজন', 'ছয় বা তার বেশি'],
        size: ['৫০-এর কম', '৫০ – ১৫০', '১৫০ – ৪০০', '৪০০ বা তার বেশি'],
      },
    },
  },

  auth: {
    login: {
      title: 'দোকানে লগ ইন',
      lede: 'আপনার কাউন্টার, স্টক আর খাতা — যেমন রেখে গিয়েছিলেন।',
      email: 'ইমেইল',
      password: 'পাসওয়ার্ড',
      submit: 'লগ ইন',
      working: 'লগ ইন হচ্ছে…',
      forgot: 'পাসওয়ার্ড ভুলে গেছেন?',
      noAccount: 'অ্যাকাউন্ট নেই?',
      startHere: 'ফ্রি ট্রায়াল শুরু করুন',
      demo: 'শুরু করার আগে দেখতে চান?',
      bookDemo: 'ডেমো বুক করুন',
      error: 'এটি কাজ করেনি।',
      rights: 'কাউন্টারের মেশিন সবার ব্যবহৃত হয়, তাই লগ আউট করা দরকার। আপনার প্রোফাইলে দেখা যাবে অ্যাকাউন্টটি কোথায় কোথায় খোলা আছে।',
    },
    register: {
      title: 'ফ্রি ট্রায়াল শুরু করুন',
      lede: 'তিনটা ছোট ধাপ। সবগুলো কাউন্টার আমরাই চালু করে দেব — ১৪ দিন ফ্রি, কার্ড লাগে না।',
      stepOf: 'ধাপ {n}/{total}',
      steps: {
        shop: 'আপনার দোকান',
        you: 'আপনার পরিচয়',
        secure: 'পাসওয়ার্ড ও শেষ',
      },
      shopName: 'দোকানের নাম',
      shopPlaceholder: 'যেমন: জননী ফার্মেসি',
      counters: 'কয়টা বিলিং কাউন্টার?',
      countersHint: 'যতগুলো কম্পিউটারে বা মেশিনে বিল ছাপা হয়।',
      exact: 'ঠিক কয়টা?',
      fewer: 'একটা কম',
      more: 'একটা বেশি',
      counterOne: '{n}টি কাউন্টার',
      counterMany: '{n}টি কাউন্টার',
      outlets: 'কয়টা শাখা?',
      branchOne: '{n}টি শাখা',
      branchMany: '{n}টি শাখা',
      licence: 'ড্রাগ লাইসেন্স নং (ঐচ্ছিক)',
      plan: {
        kicker: 'আপনার প্ল্যান',
        basic: 'এক কাউন্টারের দোকানের জন্য।',
        plus: '২ থেকে ৫টি কাউন্টারের জন্য।',
        custom: 'বাড়তি কাউন্টারের দাম সেটআপ কলে আপনার সাথে বসে ঠিক করব।',
        trial: '১৪ দিন ফ্রি, আপনার সবগুলো কাউন্টারে',
      },
      yourName: 'আপনার নাম',
      phone: 'মোবাইল নম্বর',
      phoneHint: 'দোকান চালু করতে এই নম্বরে কল দেব।',
      email: 'ইমেইল',
      password: 'পাসওয়ার্ড',
      confirm: 'পাসওয়ার্ড আবার লিখুন',
      review: 'একবার মিলিয়ে নিন',
      edit: 'বদলান',
      terms: 'আমি শর্তাবলী ও গোপনীয়তা নীতিতে সম্মত',
      next: 'পরের ধাপ',
      back: 'পেছনে',
      submit: 'দোকান তৈরি করুন',
      working: 'তৈরি হচ্ছে…',
      haveAccount: 'অ্যাকাউন্ট আগে থেকেই আছে?',
      signIn: 'লগ ইন',
      successTitle: 'দোকান তৈরি হয়েছে',
      successBody:
        'আপনার তথ্য পেয়েছি, দোকানটা চালু করে দেব — সাধারণত একই দিনে। কিছু ইনস্টল করার নেই, কার্ড লাগে না: চালু হলে {email} ঠিকানায় সাইন-ইন পাবেন।',
      nextTitle: 'এরপর যা হবে',
      nextSteps: ['আজই আমরা দেখে নেব', 'কল করে আপনার {n} চালু করে দেব', 'বিক্রি শুরু করুন'],
      required: 'এটা পূরণ করুন।',
      badPhone: '০১ দিয়ে শুরু ১১ সংখ্যার মোবাইল নম্বর দিন।',
      badEmail: 'ইমেইলটা ঠিক মনে হচ্ছে না।',
      passwordHint: 'কমপক্ষে ৮ অক্ষর',
      error: 'এটি কাজ করেনি।',
      mismatch: 'দুটি পাসওয়ার্ড মিলছে না।',
      needTerms: 'চালিয়ে যেতে শর্তাবলীতে সম্মত হতে হবে।',
    },
  },

  pages: {
    meta: {
      features: {
        title: 'ফিচার — কাউন্টারের প্রতিটি বোর্ড',
        description:
          'বিলিং স্ক্রিন, তাক, মাল কেনা, বাকি খাতা, রিপোর্ট আর অফলাইন বিক্রি — বাংলাদেশের ঔষধের দোকান যা দিয়ে চলে, সব এক জায়গায়।',
      },
      pricing: {
        title: 'দাম — প্রতিটি বিলে নয়, প্রতি দোকানে',
        description:
          'মাসে একটি দাম, গোটা দোকান খোলা: সীমাহীন বিল, সীমাহীন কাস্টমার, প্রতিটি ফিচার। Basic ৳১,৫০০, Plus ৳৩,০০০। বিনামূল্যে ১৪ দিনের ট্রায়াল।',
      },
      faq: {
        title: 'প্রশ্ন ও উত্তর',
        description:
          'বাংলাদেশের ফার্মেসি আসলে যে প্রশ্নগুলো করে: ট্রায়াল, প্রিন্টার, অফলাইন বিক্রি, ঔষধের তালিকা, খাতা, আর চলে গেলে কী হয়।',
      },
      demo: {
        title: 'লাইভ ডেমো বুক করুন',
        description:
          'আপনার দোকানের মতো করে সাজানো একটি দোকানের সাথে বিশ মিনিটের কল — একটি বিল, একটি ফেরত, একটি তাক গোনা আর দিন শেষ করবেন।',
      },
      login: {
        title: 'দোকানে প্রবেশ করুন',
        description:
          'আপনার দোকানের হিসাবে প্রবেশ করুন। শেয়ার করা কাউন্টার মেশিন শিফট শেষে সাইন আউট করা উচিত।',
      },
      register: {
        title: 'বিনামূল্যের ট্রায়াল শুরু করুন',
        description:
          'চৌদ্দ দিন, সব ফিচার, কোনো কার্ড নেই। দোকানের কথা বলুন, আমরা চালু করে দিই।',
      },
      contact: {
        title: 'যোগাযোগ করুন',
        description: 'যারা এটি বানাচ্ছেন তাদের লিখুন। এক কার্যদিবসের মধ্যে সত্যিকারের উত্তর।',
      },
      status: {
        title: 'সিস্টেম স্ট্যাটাস',
        description: 'Dawai এখন ঠিকমতো চলছে কি? প্ল্যাটফর্মের প্রতিটি অংশ, আর আমরা যা ঠিক করছি।',
      },
      legal: {
        title: 'আইনি',
        description: '{brand}-এর পরিষেবার শর্তাবলি, গোপনীয়তা নীতি ও ফেরত নীতি।',
      },
    },

    features: {
      kicker: 'ফিচার',
      title: 'এক কাউন্টার, ছয়টি বোর্ড',
      lede:
        'একটি ঔষধের দোকান আসলে যা দিয়ে চলে, যেভাবে দোকান চালায় সেভাবেই: বিক্রি করুন, গুনুন, কিনুন, বাকি রাখুন, দেখুন — আর লাইন চলে গেলেও বিক্রি চালিয়ে যান।',
      modules: {
        kicker: 'বোর্ডগুলো',
        title: 'ছয়টি পর্দা, একটি কাউন্টার',
        lede: 'প্রতিটি বোর্ড একটি কাজ, আর যেকোনো বোর্ডের সংখ্যাগুলো আসে একই হিসাব থেকে।',
      },
      deep: {
        kicker: 'আরেকটু কাছে',
        title: 'যে বিষয়গুলো আসল হিসাব',
        lede: 'ফার্মেসির সফটওয়্যার আর ক্যাশ মেশিনের পার্থক্য এই তালিকাতেই।',
      },
    },

    status: {
      kicker: 'স্ট্যাটাস',
      title: 'Dawai কি চলছে?',
      lede: 'প্ল্যাটফর্মের প্রতিটি অংশ, এই মুহূর্তে, আর আমরা যা ঠিক করছি। পেজটি প্রতি মিনিটে নিজে থেকে দেখে নেয়।',
      overall: {
        operational: 'সবকিছু ঠিকমতো চলছে',
        degraded: 'কিছু জিনিস ধীরে চলছে',
        maintenance: 'পরিকল্পিত রক্ষণাবেক্ষণ',
        outage: 'কিছু একটা বন্ধ আছে',
        unreachable: 'এই মুহূর্তে Dawai-তে পৌঁছানো যাচ্ছে না',
      },
      state: { operational: 'চলছে', degraded: 'ধীর', maintenance: 'রক্ষণাবেক্ষণ', outage: 'বন্ধ' },
      incident: { investigating: 'খতিয়ে দেখছি', identified: 'কারণ পাওয়া গেছে', monitoring: 'ঠিক হয়েছে, নজর রাখছি', resolved: 'সমাধান হয়েছে' },
      open: 'এখন চলছে',
      recent: 'গত দুই সপ্তাহ',
      none: 'গত দুই সপ্তাহে কোনো সমস্যা হয়নি।',
      started: 'শুরু',
      resolvedAt: 'সমাধান',
      checked: 'দেখা হয়েছে',
      offlineNote: 'সংযোগ না থাকলেও যে বিল করেন তা কাউন্টারে জমা থাকে, সংযোগ ফিরলেই পাঠানো হয়।',
    },
    contact: {
      kicker: 'যোগাযোগ',
      title: 'যিনি এটি বানাচ্ছেন তার সঙ্গে কথা বলুন',
      lede: 'এক কার্যদিবসের মধ্যে সত্যিকারের উত্তর। দোকান খোলা থাকলে, কেউ কাজ করছেনই।',
      response: 'প্রতিটি বার্তার উত্তর আমরা এক কার্যদিবসের মধ্যে দিই।',
      direct: {
        title: 'সরাসরি লিখুন',
        lede: 'যেকোনো কিছুর জন্য — দাম, বাগ, একটি ধারণা, অভিযোগ।',
      },
      form: {
        emailInstead: 'ইমেইলে লিখুন',
        name: 'আপনার নাম',
        email: 'ইমেইল',
        message: 'আমরা কীভাবে সাহায্য করতে পারি?',
        submit: 'বার্তাটি পাঠান',
        sending: 'পাঠানো হচ্ছে…',
        success: 'পেয়েছি। এক কার্যদিবসের মধ্যে ফিরতি চিঠি পাবেন।',
        error: 'পাঠানো হলো না। অনুগ্রহ করে সরাসরি ইমেইলে লিখুন।',
      },
    },

    legal: {
      kicker: 'আইনি',
      updated: 'সর্বশেষ হালনাগাদ',
      terms: {
        title: 'পরিষেবার শর্তাবলি',
        lede: '{brand} ব্যবহারের জন্য আপনার ও আমাদের মধ্যে চুক্তি।',
        items: [
          {
            h: 'হিসাব আপনার',
            t: 'হিসাব আপনার কাছেই থাকে; আমরা পরিষেবা দিই। আপনার লগইন, আপনার দোকানের তথ্য, আপনার স্টাফের তালিকা — যেকোনো সময় CSV-এ নিয়ে নিতে পারবেন এবং চলে গেলে সঙ্গে নিয়ে যেতে পারবেন।',
          },
          {
            h: 'সাবস্ক্রিপশনে যা আছে',
            t: 'প্রতি মাসে প্রতি দোকানে এক দাম — গোটা দোকান: সীমাহীন বিল, সীমাহীন কাস্টমার আর প্রাইসিং পেজের প্রতিটি ফিচার। কোনো বিলের ওপর আলাদা দাম নেই, কোনো ফিচার আলাদা অ্যাড-অন নয়।',
          },
          {
            h: 'ট্রায়াল',
            t: 'চৌদ্দ দিনের বিনামূল্যের ট্রায়াল — সব ফিচার, কোনো কার্ড নেই। শেষ হলে দোকান আপনি বেছে নেওয়া প্ল্যানে চলতে থাকে; চালিয়ে না গেলে আপনার তথ্য নব্বই দিন পর্যন্ত রপ্তানি করা যাবে।',
          },
          {
            h: 'আপনার তথ্য আপনার',
            t: 'আমরা আপনার তথ্য বিক্রি বা ভাড়া দিই না। এটি ব্যবহৃত হয় সফটওয়্যার চালাতে, কাজ রাখতে ও উন্নত করতে। অ্যাকাউন্ট মুছলে তথ্য নব্বই দিনের মধ্যে মুছে যায়।',
          },
          {
            h: 'কাউন্টার হলো ফার্মেসি',
            t: '{brand} একটি বিলিং ও হিসাবের সরঞ্জাম। এটি ঠিক করে না কোনো কাস্টমার কী ঔষধ নেবে, প্রেসক্রিপশন লেখে না, আর এটি চিকিৎসা পরামর্শও নয়।',
          },
          {
            h: 'ফি ও পেমেন্ট',
            t: 'প্ল্যান প্রতি দোকানে মাসিক অগ্রিম ধার্য হয়।',
          },
          {
            h: 'চলে যাওয়া',
            t: 'যেকোনো সময় বাতিল করতে পারেন; বিলিং থামে পরিশোধিত সময়ের শেষে। বাতিলের পর নব্বই দিন পর্যন্ত CSV রপ্তানি চালু থাকে।',
          },
          {
            h: 'এই চুক্তির পরিবর্তন',
            t: 'আমরা শর্ত হালনাগাদ করতে পারি। গুরুত্বপূর্ণ পরিবর্তন প্রয়োগের কমপক্ষে ত্রিশ দিন আগে সাইটে ও ইমেইলে জানানো হয়।',
          },
        ],
      },
      privacy: {
        title: 'গোপনীয়তা নীতি',
        lede: 'আমরা কী সংগ্রহ করি, কী করি, আর কী কখনোই করি না।',
        items: [
          {
            h: 'আমরা যা সংগ্রহ করি',
            t: 'যা আপনি টাইপ করেন: দোকানের প্রোফাইল, ড্রাগ লাইসেন্স নম্বর, স্টাফের নাম, কাস্টমার ও তাদের বাকি, কেনা ও বিল। সাথে প্রয়োজনীয় কারিগরি বিষয় — ব্রাউজার, ভাষা, নিরাপত্তার জন্য একটি আইপি ঠিকানা।',
          },
          {
            h: 'আমরা যা করি',
            t: 'আপনি যে সফটওয়্যার চালাতে দিচ্ছেন তা চালানোর কাজে লাগি। না জিজ্ঞেস করে কোম্পানির কেউ কোনো দোকানের হিসাব দেখে না, আর কোম্পানির বাইরে কারও সঙ্গে কিছু শেয়ার হয় না।',
          },
          {
            h: 'বাকি খাতা ও এসএমএস',
            t: 'খাতার জন্য SMS রিমাইন্ডার চালু করলে বার্তাটি আপনার দোকানের নামে যায়। কাস্টমারের নম্বর শুধু আপনি ঠিক করা রিমাইন্ডারের জন্যই ব্যবহৃত হয়।',
          },
          {
            h: 'যা আমরা কখনোই করি না',
            t: 'আমরা তথ্য বিক্রি করি না, ভাড়া দিই না, বিজ্ঞাপনদাতার হাতে দিই না। আপনার কাস্টমারকে বিজ্ঞাপন দিতে আপনার বিল পড়ি না।',
          },
          {
            h: 'যেখানে থাকে',
            t: 'দোকান তৈরি করার সময় আপনি যেটি বেছে নিয়েছেন সেই অঞ্চলে তথ্য থাকে; ব্যাকআপ শুধু দুর্যোগ উদ্ধারের জন্য রাখা হয়।',
          },
          {
            h: 'অফলাইন বিল',
            t: 'লাইন ছাড়া লেখা বিল কাউন্টার মেশিনে থাকে যতক্ষণ লাইন ফেরে, তারপর একবার পাঠানো হয়। একই বিল কখনো দুবার পোস্ট হতে পারে না।',
          },
          {
            h: 'মুছে ফেলার অধিকার',
            t: 'চাইলে অ্যাকাউন্ট বন্ধ হবে আর তথ্য নব্বই দিনের মধ্যে মুছে যাবে। তার আগে CSV-এ নামিয়ে নিন।',
          },
          {
            h: 'পরিবর্তন',
            t: 'গুরুত্বপূর্ণ কিছু প্রয়োগের অন্তত ত্রিশ দিন আগে জানানো হয়।',
          },
        ],
      },
      refund: {
        title: 'ফেরত নীতি',
        lede: 'কখন আপনার টাকা ফেরত পাবেন, আর কখন পাবেন না।',
        items: [
          {
            h: 'যা ফেরত পাওয়া যায়',
            t: 'বিল করতে না দেওয়ার মতো কোনো ত্রুটিতে সফটওয়্যার অচল হলে এবং আমরা সাত দিনের মধ্যে ঠিক বা বদলে দিতে না পারলে, মাসের বাকি অংশ ফেরত পান।',
          },
          {
            h: 'যা ফেরত পাবেন না',
            t: 'ভুল এন্ট্রি, বাতিল বিল, অথবা পর্দার সতর্কতার বিরুদ্ধে লেখা তথ্য ফেরতযোগ্য নয়; ট্রায়াল তো বিনামূল্যেই।',
          },
          {
            h: 'যেভাবে চাইবেন',
            t: 'সাবস্ক্রিপশনের মধ্যে ইমেইল করুন। দোকানের বিল যেভাবে ধরা হয় সেভাবে, দশ কার্যদিবসের মধ্যে ফেরত মিটিয়ে দিই।',
          },
          {
            h: 'বাতিল',
            t: 'বাতিল করলে পরের পেমেন্ট থামে; চলতি মাস ফেরত হয় না, কারণ তা আপনি ইতিমধ্যে ব্যবহার করেছেন।',
          },
          {
            h: 'হিসাব মিল',
            t: 'বিলিং ত্রুটিতে কোনো দোকান বেশি টাকা দিলে পার্থক্যটি দশ কার্যদিবসের মধ্যে ফেরত দিই এবং কী ঘটেছিল তা জানাই।',
          },
        ],
      },
    },
  },

  footer: {
    blurb:
      '{brand} — বিলিং স্ক্রিন, স্টক, খাতা আর হিসাব — বাংলাদেশের ঔষধের দোকানের জন্য।',
    product: 'পণ্য',
    company: 'প্রতিষ্ঠান',
    resources: 'সহায়তা',
    legal: 'আইনি',
    terms: 'সেবার শর্তাবলী',
    privacy: 'গোপনীয়তা নীতি',
    refund: 'ফেরতের নীতি',
    rights: 'সর্বস্বত্ব সংরক্ষিত।',
    poweredBy: '{name} দ্বারা পরিচালিত',
  },
};

/**
 * A gap in `bn` is legal at compile time on purpose — the runtime falls back to
 * English key by key — and an array is allowed to be shorter than the one it
 * translates, because a list that is one entry short is a gap, not a bug.
 */
export type DeepPartial<T> = T extends string
  ? T
  : T extends readonly (infer U)[]
    ? readonly DeepPartial<U>[]
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

/*
 * The brand is written `{brand}` in the copy and stamped in once, here, from
 * `siteConfig.name` — so renaming the product is one line in `lib/site.ts`
 * rather than a search through both languages.
 */
function stamp<T>(value: T): T {
  if (typeof value === 'string') return value.replaceAll('{brand}', siteConfig.name) as T;
  if (Array.isArray(value)) return value.map(stamp) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stamp(v)])) as T;
  }
  return value;
}

const dictionaries: Record<Lang, Dictionary | DeepPartial<Dictionary>> = {
  en: stamp(en),
  bn: stamp(bn),
};

export type { Lang };
export { dictionaries };

/**
 * Resolves a dotted path against a language, falling back to English the moment
 * a key is missing, and to the last segment's own value if there is none.
 *
 * The two-step fallback is the whole point of a keyed dictionary: a Bangla page
 * with one English word in it is readable, and a Bangla page with a blank where
 * a word should be is broken.
 */
export function translate(lang: Lang, path: string): string {
  const read = (dict: unknown): string | undefined => {
    let cur: unknown = dict;
    for (const key of path.split('.')) {
      if (cur === null || typeof cur !== 'object') return undefined;
      cur = (cur as Record<string, unknown>)[key];
    }
    return typeof cur === 'string' ? cur : undefined;
  };

  const primary = read(dictionaries[lang]);
  if (primary !== undefined) return primary;
  const fallback = read(dictionaries.en);
  if (fallback !== undefined) return fallback;
  return path.split('.').pop() ?? path;
}

/** A bound translator, so a component takes `t` and not `lang` as well. */
export function makeT(lang: Lang) {
  return (path: string) => translate(lang, path);
}

/* ------------------------------------------------------------------ lists --
 *
 * `translate` deliberately returns `undefined` for anything that is not a
 * string, because a component that asked for a list and got a fragment of one
 * has a bug in it. So lists get their own two readers, and both of them apply
 * the same rule the file already argues for: a gap in `bn` is filled from `en`
 * key by key, never left as a hole.
 */

function readAt(dict: unknown, path: string): unknown {
  let cur: unknown = dict;
  for (const key of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A missing string, or a missing key inside a list entry, comes from English. */
function fill(value: unknown, fallback: unknown): unknown {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const fb = Array.isArray(fallback) ? fallback : [];
    return value.map((v, i) => fill(v, fb[i]));
  }
  if (isPlainObject(value) && isPlainObject(fallback)) {
    const out: Record<string, unknown> = {};
    for (const k of new Set([...Object.keys(fallback), ...Object.keys(value)])) {
      out[k] = fill(value[k], fallback[k]);
    }
    return out;
  }
  return value === undefined ? fallback : value;
}

/** A list of strings, e.g. `announce`, `hero.proof`, `khata.points`. */
export function tList(lang: Lang, path: string): string[] {
  const enList = readAt(dictionaries.en, path);
  if (!Array.isArray(enList)) return [];
  const own = readAt(dictionaries[lang], path);
  if (!Array.isArray(own)) return enList as string[];
  return (own as unknown[]).map((v, i) => fill(v, enList[i])) as string[];
}

/** A list of objects, e.g. `counter.keymap`, `pricing.plans`, `faq.items`. */
export function tItems<T>(lang: Lang, path: string): T[] {
  const enList = readAt(dictionaries.en, path);
  if (!Array.isArray(enList)) return [];
  const own = readAt(dictionaries[lang], path);
  if (!Array.isArray(own)) return enList as T[];
  return (own as unknown[]).map((v, i) => fill(v, enList[i])) as T[];
}

/** One entry of a list, by index. Cheaper than `tItems` when you want one. */
export function tAt<T>(lang: Lang, path: string, index: number): T {
  return tItems<T>(lang, path)[index];
}
