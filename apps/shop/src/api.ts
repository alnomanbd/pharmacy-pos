import api, { getData } from '@dawai/shared/api/client';
import { downloadBlob } from '@dawai/shared/api';
import { useLangStore } from '@dawai/shared/i18n/lang';
import type { SupportMessage, SupportThread } from '@dawai/shared/types';

/**
 * What the shop calls.
 *
 * The same axios instance every app here uses — `withCredentials`, the refresh
 * rotation and the retry all live in `@dawai/shared/api/client`, and the shop
 * talks to `/api` on its own origin so the session cookie stays host-only.
 *
 * Everything is under `/shop`, and every one of these is refused for an account
 * that did not buy the pharmacy — `requireModule` on the router, not a check in
 * the interface.
 */
export { api, getData };

/**
 * Where a shop actually buys from.
 *
 * Most pharmacies here never touch a manufacturer: the big ones order from a
 * company depot with the SR coming round to take it, smaller ones buy from a
 * wholesaler (usually Mitford), and the smallest buy a strip at a time from
 * the bigger shop down the road.
 */
export type SupplierKind = 'company' | 'distributor' | 'shop' | 'other';

export interface Supplier {
  _id: string;
  name: string;
  kind?: SupplierKind;
  repPhone?: string;
  contactPerson?: string;
  phone?: string;
  address?: string;
  repName?: string;
  repVisitDay?: number | null;
  note?: string;
  /** What the shop owes them: the whole account, not this month. */
  balance: number;
  isActive?: boolean;
}

export interface SupplierEntry {
  _id: string;
  entry: 'opening' | 'purchase' | 'payment' | 'purchase_return' | 'adjustment';
  /** Signed: positive is owed to the company, negative reduces it. */
  amount: number;
  balanceAfter: number;
  at: string;
  method?: string;
  reference?: string;
  note?: string;
  actorName?: string;
}

export interface SupplierStatement {
  supplier: Supplier;
  balance: number;
  openingForRange: number;
  entries: SupplierEntry[];
  /** What actually came in, so a ledger row can be opened as an invoice. */
  deliveries: {
    _id: string;
    invoiceNo: string;
    invoiceDate: string;
    lines: number;
    total: number;
    paidAmount: number;
    createdByName: string;
  }[];
  totals: { bought: number; paidOnInvoice: number };
}

/** One side of the owner's comparison: a stretch of days, totalled. */
export interface RangeTotals {
  bills: number;
  sales: number;
  cost: number;
  margin: number;
  marginPercent: number;
  due: number;
  averageBill: number;
  itemsSold: number;
  /** What came in off the companies' vans over the stretch. */
  cameIn: { count: number; value: number; pieces: number };
  /** What the shop itself cost to stand open. */
  expenses: number;
  /** Money in that is not a sale. */
  otherIncome?: number;
  /** Margin minus what the shop cost — the number "the month earned". */
  net: number;
}

/**
 * The owner's page, in one answer.
 *
 * `before` is the same number of days immediately before `range`, so every
 * figure on the screen has something honest to be compared against.
 */
export interface OwnerReport {
  range: { from: string; to: string; days: number; previousFrom: string; previousTo: string };
  now: RangeTotals;
  before: RangeTotals;
  byDay: { dayKey: string; sales: number; cost: number; margin: number; bills: number }[];
  topProducts: { _id: string; name: string; pieces: number; sales: number; margin: number }[];
  bySupplier: {
    _id: string;
    name: string;
    sales: number;
    cost: number;
    margin: number;
    marginPercent: number;
  }[];
  deadStock: {
    _id: string;
    name: string;
    strength: string;
    rackLabel: string;
    onHand: number;
    value: number;
  }[];
  /** What the stretch's spending was for, biggest first. */
  expenseCategories: { category: string; amount: number }[];
}

/** What the shop costs to stand open — one line out of the owner's month. */
export interface ShopExpense {
  _id: string;
  amount: number;
  category: ExpenseCategory;
  note: string;
  dayKey: string;
  createdAt: string;
}

export const EXPENSE_CATEGORIES = [
  'rent',
  'salary',
  'utility',
  'transport',
  'supplies',
  'other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Money in that is not a sale — see backend models/Income. */
export const INCOME_CATEGORIES = ['bonus', 'service', 'commission', 'rent', 'other'] as const;
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

export const INCOME_CATEGORY_LABEL: Record<string, string> = {
  bonus: 'Company bonus',
  service: 'Service charge',
  commission: 'Commission',
  rent: 'Rent received',
  other: 'Other income',
};

export interface ShopIncome {
  _id: string;
  amount: number;
  category: IncomeCategory;
  note: string;
  dayKey: string;
  createdByName?: string;
}

/** One line of the cash book — see backend shopAccounts.service. */
export interface BookLine {
  key: string;
  at: string;
  dayKey: string;
  /* A transfer is money changing pockets — neither in nor out of the shop. */
  direction: 'in' | 'out' | 'transfer';
  kind:
    | 'takings'
    | 'khata'
    | 'supplier'
    | 'expense'
    | 'income'
    | 'drawing'
    | 'capital'
    | 'refund'
    | 'bank_deposit'
    | 'bank_withdrawal';
  title: string;
  detail: string;
  amount: number;
  method?: string;
  /** A day's takings, split by how they were paid, and how many bills. */
  methods?: { method: string; amount: number }[];
  bills?: number;
}

export interface ShopAccounts {
  from: string;
  to: string;
  profit: {
    sales: number;
    /** What returns took off the sales. */
    returns: number;
    cost: number;
    margin: number;
    marginPercent: number;
    otherIncome: number;
    expenses: number;
    net: number;
    bills: number;
    onAccount: number;
  };
  cash: {
    in: number;
    out: number;
    net: number;
    inParts: { counter: number; khata: number; otherIncome: number; capital: number };
    outParts: { suppliers: number; expenses: number; drawings: number; refunds: number };
    transfers: { deposited: number; withdrawn: number };
    inByMethod: { method: string; amount: number }[];
    outByMethod: { method: string; amount: number }[];
  };
  position: {
    receivable: number;
    receivableFrom: number;
    payable: number;
    payableTo: number;
    stockValue: number;
    /** Deposits less withdrawals, all time. */
    bank: number;
  };
  book: {
    total: number;
    page: number;
    limit: number;
    lines: BookLine[];
    days: Record<string, { in: number; out: number }>;
  };
}

/** The owner's money, the bank, and refunds — see backend models/CashMove. */
export const CASH_MOVE_KINDS = ['drawing', 'capital', 'bank_deposit', 'bank_withdrawal'] as const;
export type CashMoveKind = (typeof CASH_MOVE_KINDS)[number] | 'refund';
export const CASH_MOVE_LABEL: Record<string, string> = {
  drawing: 'Owner took out',
  capital: 'Owner put in',
  bank_deposit: 'Into the bank',
  bank_withdrawal: 'Out of the bank',
  refund: 'Refund to a customer',
};

export interface CashMove {
  _id: string;
  kind: CashMoveKind;
  amount: number;
  note: string;
  reference: string;
  dayKey: string;
  createdByName: string;
  /** A refund's worth at the price sold; `amount` is only the cash part. */
  returnValue?: number;
}

export interface MonthRow {
  month: string;
  closed: boolean;
  snapshot: {
    range: { from: string; to: string };
    profit: ShopAccounts['profit'];
    cash: ShopAccounts['cash'];
    position: ShopAccounts['position'];
  } | null;
  countedCash: number | null;
  note: string;
  closedAt: string | null;
  closedByName: string;
  reopenedAt: string | null;
  reopenedByName: string;
  reopenReason: string;
}

export type ActivityGroup = 'sales' | 'money' | 'stock' | 'people' | 'signin' | 'setup' | 'bin';

export interface ActivityRow {
  _id: string;
  at: string;
  action: string;
  group: ActivityGroup;
  who: string;
  whoId: string;
  role: string;
  model: string;
  label: string;
  reason: string;
  ip: string;
}

export interface ActivityPage {
  from: string;
  to: string;
  total: number;
  page: number;
  limit: number;
  groups: Record<ActivityGroup, number>;
  people: { id: string; name: string; role: string; count: number; last: string }[];
  data: ActivityRow[];
}

/** What each spends on as a word, for the screens. */
export const EXPENSE_CATEGORY_LABEL: Record<string, string> = {
  rent: 'Rent',
  salary: 'Salary',
  utility: 'Utility',
  transport: 'Transport',
  supplies: 'Supplies',
  other: 'Other',
};

/**
 * The classified register of controlled drugs: who had them, on whose advice,
 * and which bill they went out on. Read-only on every screen — the lines are
 * made at the till, on the bill itself.
 */
export interface ControlTraceRow {
  _id: string;
  name: string;
  strength: string;
  qtyPieces: number;
  buyerName: string;
  buyerPhone: string;
  doctorName: string;
  billNo: string;
  soldAt: string;
  salesmanName: string;
}

export interface ControlTrace {
  from: string;
  to: string;
  count: number;
  pieces: number;
  rows: ControlTraceRow[];
}

/**
 * A list handed to a company, before any of it arrives.
 *
 * No prices on it: the rate is the company's to state on the invoice.
 */
/** The item behind an order line, as a single fetched order carries it. */
export interface OrderedProduct {
  _id: string;
  name: string;
  strength?: string;
  genericName?: string;
  companyName?: string;
  piecesPerStrip: number;
  stripsPerBox: number;
}

/** An order line's item id, whichever shape the line arrived in. */
export const lineProductId = (l: { product: string | OrderedProduct }) =>
  typeof l.product === 'string' ? l.product : l.product._id;

export interface ShopOrder {
  _id: string;
  supplier: string;
  supplierName: string;
  lines: {
    _id: string;
    /** An id on a list; the item itself when one order is fetched (for print). */
    product: string | OrderedProduct;
    name: string;
    onHandAtOrder: number;
    qtyPieces: number;
    /** What the delivery brought, bonus included; null if closed without one. */
    qtyReceived?: number | null;
    note?: string;
  }[];
  note?: string;
  status: 'open' | 'sent' | 'received' | 'cancelled';
  sentAt?: string | null;
  receivedAt?: string | null;
  /** The delivery it arrived on, when recorded from the order. */
  purchase?: string | null;
  closeReason?: string;
  createdBy?: string | null;
  createdByName?: string;
  createdAt: string;
}

/** A row the reorder levels put on the list before anybody edits it. */
export interface SuggestedLine {
  productId: string;
  name: string;
  strength: string;
  rackLabel: string;
  onHand: number;
  reorderLevel: number;
  piecesPerStrip: number;
  stripsPerBox: number;
  suggestPieces: number;
  lastSupplierId: string;
  lastSupplierName: string;
}

export interface ShopProduct {
  _id: string;
  name: string;
  genericName?: string;
  companyName?: string;
  strength?: string;
  dosageForm?: string;
  isMedicine: boolean;
  piecesPerStrip: number;
  stripsPerBox: number;
  mrpPerPiece: number;
  /** The shelf as a record, and what is printed on it. */
  rack?: string | null;
  rackLabel?: string;
  reorderLevel: number;
  prescriptionOnly?: boolean;
  /** A controlled drug: the till asks who it is going to, and the shop keeps
      the classified register. */
  controlled?: boolean;
  /** What the scanner reads off the pack; empty until somebody scans it. */
  barcode?: string;
  /** In pieces, across every batch. */
  onHand: number;
  stockValue: number;
  nearestExpiry: string | null;
  /** How many lots are on the shelf (list rows only). */
  lotCount?: number;
  /** The lot a search matched by its batch number, else the next to sell. */
  lot?: { batchNo: string; expiry: string | null; qtyOnHand: number; matched: boolean } | null;
}

export interface StockBatch {
  _id: string;
  product: string;
  batchNo: string;
  expiry: string | null;
  costPerPiece: number;
  mrpPerPiece: number;
  qtyOnHand: number;
  /** The invoice's date — when it came onto the shelf. */
  receivedAt?: string;
  supplier?: { _id: string; name: string } | null;
  purchase?: { _id: string; invoiceNo?: string; invoiceDate?: string } | null;
}

export interface PurchaseLine {
  _id?: string;
  product: string;
  name: string;
  batchNo: string;
  expiry: string | null;
  qtyPieces: number;
  bonusPieces: number;
  tradePricePerPiece: number;
  mrpPerPiece: number;
  discount: number;
  lineTotal: number;
}

export interface Purchase {
  _id: string;
  supplier: { _id: string; name: string } | string;
  invoiceNo: string;
  invoiceDate: string;
  lines: PurchaseLine[];
  subTotal: number;
  discount: number;
  vat: number;
  total: number;
  paidAmount: number;
  note?: string;
  createdByName?: string;
}

export interface Paged<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

/**
 * How a shelf decides what belongs on it.
 *
 * `form` is the syrup shelf and the ointment shelf; `company` is the shop that
 * racks by who made it, which is how the SR's order sheet reads; `manual` is a
 * shelf whose contents are whatever somebody put there. All three are how real
 * shops work, and the rule is only ever a suggestion.
 */
export type RackRule = 'form' | 'company' | 'manual';

export interface ShopRack {
  _id: string;
  name: string;
  rule: RackRule;
  match: string[];
  note?: string;
  isCold: boolean;
  sortOrder: number;
  items: number;
}

/** A medicine from the shared catalogue, as the product picker reads it. */
export interface CatalogueMedicine {
  _id: string;
  brandName: string;
  genericName: string;
  strength?: string;
  dosageForm?: string;
  packSize?: string;
  price?: number;
  company?: { name?: string } | string;
}

export interface StockCountLine {
  _id: string;
  name: string;
  batchNo: string;
  rackLabel: string;
  expiry: string | null;
  expected: number;
  /** Null until somebody has actually been to the shelf. Not the same as 0. */
  counted: number | null;
  costPerPiece: number;
}

export interface StockCount {
  _id: string;
  rackLabel: string;
  status: 'open' | 'applied' | 'abandoned';
  lines: StockCountLine[];
  startedAt: string;
  startedByName: string;
  appliedAt: string | null;
  appliedByName: string;
  shortPieces: number;
  extraPieces: number;
  valueDelta: number;
  note: string;
}

export interface StockCountSummary extends Omit<StockCount, 'lines' | 'note'> {
  lines: number;
  counted: number;
}

export const shopApi = {
  /* ---- companies ---- */
  suppliers: (q?: string) => getData<Supplier[]>(api.get('/shop/suppliers', { params: { q } })),
  createSupplier: (payload: Partial<Supplier> & { name: string; openingBalance?: number }) =>
    getData<Supplier>(api.post('/shop/suppliers', payload)),
  updateSupplier: (id: string, payload: Partial<Supplier>) =>
    getData<Supplier>(api.patch(`/shop/suppliers/${id}`, payload)),
  supplierLedger: (id: string, range?: { from?: string; to?: string }) =>
    getData<SupplierStatement>(api.get(`/shop/suppliers/${id}/ledger`, { params: range })),
  paySupplier: (
    id: string,
    payload: { amount: number; method?: string; reference?: string; note?: string; at?: string },
  ) => getData<{ balance: number }>(api.post(`/shop/suppliers/${id}/payments`, payload)),

  /* ---- where people stand ---- */
  counters: () => getData<ShopCounter[]>(api.get('/shop/counters')),
  createCounter: (payload: { name: string; note?: string; openingFloat?: number }) =>
    getData<ShopCounter>(api.post('/shop/counters', payload)),
  updateCounter: (id: string, payload: Record<string, unknown>) =>
    getData<ShopCounter>(api.patch(`/shop/counters/${id}`, payload)),

  /* ---- correcting a bill, and the rest of its life ---- */
  editSale: (
    id: string,
    payload: { customerName?: string; customerPhone?: string; note?: string; reason: string },
  ) => getData<Sale>(api.patch(`/shop/sales/${id}`, payload)),
  revertSale: (id: string, reason: string) =>
    getData<Sale>(api.post(`/shop/sales/${id}/revert`, { reason })),
  holdSale: (id: string, hold: boolean, reason?: string) =>
    getData<Sale>(api.post(`/shop/sales/${id}/hold`, { hold, reason })),
  deleteSale: (id: string, reason: string) =>
    getData<Sale>(api.delete(`/shop/sales/${id}`, { data: { reason } })),
  restoreSale: (id: string) => getData<Sale>(api.post(`/shop/sales/${id}/restore`)),

  /* ---- the bin ---- */
  trash: (kind?: string) => getData<BinItem[]>(api.get('/shop/trash', { params: { kind } })),
  binIt: (kind: string, id: string, reason: string) =>
    getData<{ kind: string; id: string }>(
      api.delete(`/shop/trash/${kind}/${id}`, { data: { reason } }),
    ),
  unbin: (kind: string, id: string) =>
    getData<{ kind: string; id: string }>(api.post(`/shop/trash/${kind}/${id}/restore`)),

  /* ---- counting the shelf ---- */
  counts: () => getData<StockCountSummary[]>(api.get('/shop/counts')),
  openCount: () => getData<{ count: StockCount | null }>(api.get('/shop/counts/open')),
  startCount: (rackId?: string) => getData<StockCount>(api.post('/shop/counts', { rackId })),
  count: (id: string) => getData<StockCount>(api.get(`/shop/counts/${id}`)),
  saveCount: (id: string, lines: { lineId: string; counted: number | null }[]) =>
    getData<StockCount>(api.patch(`/shop/counts/${id}`, { lines })),
  applyCount: (id: string, note?: string) =>
    getData<StockCount>(api.post(`/shop/counts/${id}/apply`, { note })),
  abandonCount: (id: string) => getData<{ status: string }>(api.post(`/shop/counts/${id}/abandon`)),

  /* ---- the shelves ---- */
  racks: () => getData<ShopRack[]>(api.get('/shop/racks')),
  createRack: (payload: {
    name: string;
    rule?: RackRule;
    match?: string[];
    note?: string;
    isCold?: boolean;
  }) => getData<ShopRack>(api.post('/shop/racks', payload)),
  updateRack: (id: string, payload: Record<string, unknown>) =>
    getData<ShopRack>(api.patch(`/shop/racks/${id}`, payload)),

  /* ---- what the shop sells ---- */
  products: (params?: {
    q?: string;
    lowStock?: boolean;
    /** `low`: at or below its level; `out`: none left; `expiring`: first lot soon. */
    status?: 'low' | 'out' | 'expiring';
    sort?: 'name' | 'onHand' | 'expiry' | 'value';
    rackId?: string;
    page?: number;
    limit?: number;
  }) =>
    getData<
      Paged<ShopProduct> & {
        /** Across everything the search and rack allow, whatever page this is. */
        summary?: {
          items: number;
          value: number;
          low: number;
          out: number;
          expiring: number;
          expiryDays: number;
        };
      }
    >(api.get('/shop/products', { params })),
  createProduct: (payload: Record<string, unknown>) =>
    getData<ShopProduct>(api.post('/shop/products', payload)),
  updateProduct: (id: string, payload: Record<string, unknown>) =>
    getData<ShopProduct>(api.patch(`/shop/products/${id}`, payload)),
  batches: (productId: string) =>
    getData<StockBatch[]>(api.get(`/shop/products/${productId}/batches`)),
  productLedger: (productId: string) =>
    getData<
      {
        _id: string;
        move: string;
        qtyDelta: number;
        balanceAfter: number;
        reason?: string;
        actorName?: string;
        createdAt: string;
      }[]
    >(api.get(`/shop/products/${productId}/ledger`)),

  /* ---- deliveries ---- */
  purchases: (params?: {
    supplierId?: string;
    q?: string;
    paid?: 'due' | 'paid';
    page?: number;
    limit?: number;
  }) =>
    getData<
      Paged<Purchase> & {
        /** This month in the shop's own calendar, whatever page is showing. */
        thisMonth?: { deliveries: number; total: number; paid: number };
      }
    >(api.get('/shop/purchases', { params })),
  purchase: (id: string) => getData<Purchase>(api.get(`/shop/purchases/${id}`)),
  createPurchase: (payload: Record<string, unknown>) =>
    getData<Purchase>(api.post('/shop/purchases', payload)),

  /* ---- stock ---- */
  expiry: (days = 90) =>
    getData<{
      days: number;
      expired: { rows: (StockBatch & { product: { name: string } })[]; value: number };
      soon: { rows: (StockBatch & { product: { name: string } })[]; value: number };
      /** Lots in stock with no expiry recorded. */
      undated: number;
    }>(api.get('/shop/stock/expiry', { params: { days } })),
  adjust: (payload: { batchId: string; qtyDelta: number; move: string; reason: string }) =>
    getData<{ batchId: string; onHand: number }>(api.post('/shop/stock/adjust', payload)),
  /** Expiry and breakage going back to the company, against the account. */
  returnToSupplier: (
    supplierId: string,
    payload: { lines: { batchId: string; pieces: number }[]; reason?: string; reference?: string },
  ) =>
    getData<{ supplier: string; credit: number; lines: { name: string; pieces: number }[] }>(
      api.post(`/shop/suppliers/${supplierId}/returns`, payload),
    ),

  /* ---- ordering, before any of it arrives ---- */
  orders: (params?: { status?: string; supplierId?: string; limit?: number }) =>
    getData<ShopOrder[]>(api.get('/shop/orders', { params })),
  order: (id: string) => getData<ShopOrder>(api.get(`/shop/orders/${id}`)),
  suggestOrder: (supplierId?: string) =>
    getData<SuggestedLine[]>(api.get('/shop/orders/suggest', { params: { supplierId } })),
  createOrder: (payload: {
    supplierId: string;
    note?: string;
    lines: { productId: string; qtyPieces: number; note?: string }[];
  }) => getData<ShopOrder>(api.post('/shop/orders', payload)),
  setOrderStatus: (id: string, payload: { status: 'sent' | 'received' | 'cancelled'; reason?: string }) =>
    getData<ShopOrder>(api.patch(`/shop/orders/${id}/status`, payload)),

  /* ---- what the owner asks at the end of a month ---- */
  ownerReport: (params?: { from?: string; to?: string }) =>
    getData<OwnerReport>(api.get('/shop/reports/owner', { params })),
  /** What came in today — the deliveries the evening screen counts. */
  todayReport: () =>
    getData<{ dayKey: string; cameIn: { count: number; value: number; pieces: number } }>(
      api.get('/shop/reports/today'),
    ),
  /** The shop's own running cost, over a range. */
  expenses: (params?: { from?: string; to?: string }) =>
    getData<{
      from: string;
      to: string;
      count: number;
      amount: number;
      data: ShopExpense[];
    }>(api.get('/shop/expenses', { params })),
  incomes: (params?: { from?: string; to?: string }) =>
    getData<{ from: string; to: string; count: number; amount: number; data: ShopIncome[] }>(
      api.get('/shop/incomes', { params }),
    ),
  createIncome: (payload: Record<string, unknown>) => getData<ShopIncome>(api.post('/shop/incomes', payload)),
  updateIncome: (id: string, payload: Record<string, unknown>) =>
    getData<ShopIncome>(api.patch(`/shop/incomes/${id}`, payload)),
  cashMoves: (params?: { from?: string; to?: string }) =>
    getData<{ from: string; to: string; data: CashMove[] }>(api.get('/shop/cash-moves', { params })),
  createCashMove: (payload: Record<string, unknown>) => getData<CashMove>(api.post('/shop/cash-moves', payload)),
  updateCashMove: (id: string, payload: Record<string, unknown>) =>
    getData<CashMove>(api.patch(`/shop/cash-moves/${id}`, payload)),
  months: () => getData<MonthRow[]>(api.get('/shop/months')),
  closeMonth: (month: string, payload: { countedCash?: number | null; note?: string }) =>
    getData<{ month: string; closed: boolean }>(api.post(`/shop/months/${month}/close`, payload)),
  reopenMonth: (month: string, reason: string) =>
    getData<{ month: string; closed: boolean }>(api.post(`/shop/months/${month}/reopen`, { reason })),
  activity: (params: { from?: string; to?: string; group?: string; who?: string; q?: string; page?: number; limit?: number }) =>
    getData<ActivityPage>(api.get('/shop/activity', { params })),
  accounts: (params: { from?: string; to?: string; page?: number; limit?: number }) =>
    getData<ShopAccounts>(api.get('/shop/accounts', { params })),
  createExpense: (payload: Record<string, unknown>) =>
    getData<ShopExpense>(api.post('/shop/expenses', payload)),
  updateExpense: (id: string, payload: Record<string, unknown>) =>
    getData<ShopExpense>(api.patch(`/shop/expenses/${id}`, payload)),

  /* ---- chasing the baki ---- */
  remindCustomer: (id: string) =>
    getData<{ sent: number }>(api.post(`/shop/customers/${id}/remind`),
  ),
  remindEveryone: (minBalance: number) =>
    getData<{ sent: number; skipped: { name: string; why: string }[] }>(
      api.post('/shop/customers/remind', { minBalance }),
    ),

  /* ---- the classified register of controlled drugs ---- */
  controlTrace: (params?: { from?: string; to?: string }) =>
    getData<ControlTrace>(api.get('/shop/control', { params })),

  /** The five things that get worse while nobody is looking. */
  attention: () =>
    getData<{
      expired: { batches: number; value: number };
      expiringSoon: { batches: number; value: number; days: number };
      toReorder: number;
      ordersWaiting: number;
      khata: { customers: number; owed: number };
    }>(api.get('/shop/reports/attention')),

  /* ---- a spreadsheet somebody can be given ---- */
  /**
   * Downloads one of the shop's exports.
   *
   * The server names the file — it knows the range that is in it — so the name
   * is taken off `Content-Disposition` rather than guessed here and left to
   * drift from what the file actually holds.
   */
  exportCsv: async (what: 'sales' | 'stock' | 'suppliers' | 'customers', params?: Record<string, string>) => {
    const res = await api.get(`/shop/export/${what}`, { params, responseType: 'blob' });
    const disposition = String(res.headers['content-disposition'] ?? '');
    const named = /filename="([^"]+)"/.exec(disposition)?.[1];
    downloadBlob(res.data as Blob, named || `${what}.csv`);
  },

  /* ---- the shared catalogue, for adding a product ---- */
  catalogue: (q: string) =>
    getData<Paged<CatalogueMedicine> | CatalogueMedicine[]>(
      api.get('/medicines', { params: { q, limit: 15 } }),
    ),
};

/** Money, the way a shop writes it. */
export const taka = (n: number) =>
  `৳${(Math.round((n || 0) * 100) / 100).toLocaleString('en-BD', { maximumFractionDigits: 2 })}`;

/**
 * A quantity in the words the shop uses.
 *
 * 230 pieces of a ten-in-a-strip medicine is "2 box 3 strip", and that is what
 * the person holding the box wants to read. Pieces alone are correct and
 * useless; both together are what a shelf check needs.
 */
export function packOf(pieces: number, p: { piecesPerStrip: number; stripsPerBox: number }) {
  const perStrip = Math.max(1, p.piecesPerStrip || 1);
  const perBox = Math.max(1, p.stripsPerBox || 1) * perStrip;
  const boxes = Math.floor(pieces / perBox);
  const strips = Math.floor((pieces % perBox) / perStrip);
  const loose = pieces % perStrip;

  if (perBox === 1) return `${pieces}`;
  const parts: string[] = [];
  if (boxes) parts.push(`${boxes} box`);
  if (strips) parts.push(`${strips} strip`);
  if (loose) parts.push(`${loose} pc`);
  return parts.join(' ') || '0';
}

/* ------------------------------------------------------------- the till -- */

export interface Shift {
  _id: string;
  userName: string;
  terminal?: string;
  openedAt: string;
  openingFloat: number;
  expectedCash: number;
  salesCount: number;
  salesTotal: number;
  cashTaken: number;
  digitalTaken: number;
  dueGiven: number;
}

/** What the till offers as somebody types: only what is on the shelf. */
export interface SellableProduct {
  _id: string;
  name: string;
  /** False for the syringes, baby food and soap on the same shelf — the lines
      that carry VAT where a shop charges any. */
  isMedicine?: boolean;
  genericName?: string;
  strength?: string;
  rack?: string;
  piecesPerStrip: number;
  stripsPerBox: number;
  mrpPerPiece: number;
  prescriptionOnly?: boolean;
  /** A controlled drug: the till asks who it is going to before it is sold. */
  controlled?: boolean;
  /** Set when this row carries a code; the till uses it to tell a scan from
      a search and put the scanned item straight on the bill. */
  barcode?: string;
  onHand: number;
  nearestExpiry: string | null;
}

export interface SaleLine {
  _id?: string;
  name: string;
  batchNo: string;
  qtyPieces: number;
  pricePerPiece: number;
  discount: number;
  lineTotal: number;
  returnedPieces?: number;
}

/** Who changed a bill after it was rung up, and what they said the reason was. */
export interface SaleHistory {
  _id?: string;
  at: string;
  action: 'edit' | 'void' | 'return';
  actorName: string;
  actorRole?: string;
  reason: string;
  totalBefore: number;
  totalAfter: number;
  note?: string;
}

export interface Sale {
  _id: string;
  billNo: string;
  soldAt: string;
  salesmanName: string;
  terminal?: string;
  customerName?: string;
  customerPhone?: string;
  lines: SaleLine[];
  subTotal: number;
  discount: number;
  vat?: number;
  vatPercent?: number;
  total: number;
  payments: { method: string; amount: number; reference?: string }[];
  paid: number;
  /** The note that was handed over, when it was bigger than the bill. */
  cashTendered?: number;
  /** And what went back with the customer. */
  changeGiven?: number;
  due: number;
  note?: string;
  status: 'completed' | 'returned' | 'void';
  /** Questioned, and not to be touched until somebody has finished looking. */
  onHold?: boolean;
  holdReason?: string;
  deletedAt?: string | null;
  deletedByName?: string;
  deleteReason?: string;
  history?: SaleHistory[];
}

/** One line of the shop's bin. */
export interface BinItem {
  /* `expense` was binned by the server and missing here, which left the bin
     page with no icon to draw for one — and a crash where the row should be. */
  kind: 'sale' | 'product' | 'customer' | 'supplier' | 'rack' | 'counter' | 'expense' | 'income' | 'cashmove';
  label: string;
  id: string;
  title: string;
  meta: string;
  deletedAt: string;
  deletedByName: string;
  reason: string;
}

export interface ShopCounter {
  _id: string;
  name: string;
  note?: string;
  openingFloat: number;
  paperWidthMm?: number | null;
  isActive?: boolean;
  /** On the POS's picker: who else has this counter open right now. */
  busyWith?: string | null;
  openShift?: {
    _id: string;
    userName: string;
    openedAt: string;
    salesCount: number;
    salesTotal: number;
    expectedCash: number;
  } | null;
  today?: { bills: number; total: number };
  /** The most recent day it closed, and how the count came out. */
  lastClosed?: {
    userName: string;
    closedAt: string;
    /** Counted minus expected: below zero is short. */
    difference: number;
    salesTotal: number;
    salesCount: number;
  } | null;
}

/** A row from the one box that finds anything in the shop. */
export interface ShopHit {
  kind: 'bill' | 'purchase' | 'product' | 'customer' | 'supplier' | 'batch';
  id: string;
  title: string;
  subtitle: string;
  to: string;
  amount?: number;
}

export interface ShopCustomer {
  _id: string;
  name: string;
  phone?: string;
  address?: string;
  note?: string;
  balance: number;
  creditLimit?: number;
  createdAt?: string;
}

/** A name on the Customers screen, with when their account last moved. */
export type BookRow = ShopCustomer & { lastAt?: string; lastEntry?: string };

/** Who somebody is on the book — never what they owe, which only rows move. */
export interface CustomerInput {
  name: string;
  phone?: string;
  address?: string;
  note?: string;
  creditLimit?: number;
}

/** A row on a regular's account. Positive means they owe more. */
export interface CustomerEntry {
  _id: string;
  entry: 'opening' | 'sale' | 'payment' | 'sale_return' | 'adjustment';
  amount: number;
  balanceAfter: number;
  at: string;
  method?: string;
  reference?: string;
  note?: string;
  actorName?: string;
}

export interface CustomerStatement {
  customer: ShopCustomer;
  balance: number;
  openingForRange: number;
  entries: CustomerEntry[];
  bills: {
    _id: string;
    billNo: string;
    soldAt: string;
    items: number;
    total: number;
    paid: number;
    due: number;
    status: 'completed' | 'returned';
    salesmanName: string;
  }[];
  totals: { bought: number; paidAtCounter: number; onAccount: number };
}

export interface BillRow {
  _id: string;
  billNo: string;
  soldAt: string;
  salesmanName: string;
  customerName?: string;
  customerPhone?: string;
  items: number;
  total: number;
  paid: number;
  due: number;
  status: 'completed' | 'returned' | 'void';
  onHold?: boolean;
  terminal?: string;
  wasOffline?: boolean;
  methods: string[];
}

export interface BillPage {
  from: string;
  to: string;
  page: number;
  pages: number;
  /** Bills per page, as the server paged them. */
  limit?: number;
  count: number;
  /** `returned`: what came back off these bills, at the price sold. */
  totals: { total: number; paid: number; due: number; returned?: number; margin?: number };
  /** How the money came in over the range, net of change; `due` left out. */
  byMethod?: { method: string; amount: number; bills: number }[];
  sales: BillRow[];
}

/** One thing the bell has to say — see till.service `stockAlerts`. */
export interface StockAlert {
  key: string;
  kind: 'expired' | 'expiring' | 'out' | 'low';
  productId: string;
  name: string;
  batchNo?: string;
  expiry?: string | null;
  qty: number;
  reorderLevel?: number;
}

export interface StockAlerts {
  /** How far ahead "expiring" looks. */
  days: number;
  /** The real totals; each list below is capped. */
  counts: Record<StockAlert['kind'], number>;
  expired: StockAlert[];
  expiring: StockAlert[];
  out: StockAlert[];
  low: StockAlert[];
}

export const tillApi = {
  alerts: () => getData<StockAlerts>(api.get('/till/alerts')),
  shift: () => getData<{ shift: Shift | null }>(api.get('/till/shift')),
  counters: () => getData<ShopCounter[]>(api.get('/till/counters')),
  searchAll: (q: string) => getData<ShopHit[]>(api.get('/till/search-all', { params: { q } })),
  voidSale: (id: string, reason: string) =>
    getData<Sale>(api.post(`/till/sales/${id}/void`, { reason })),
  openShift: (payload: { openingFloat?: number; terminal?: string; counterId?: string }) =>
    getData<Shift>(api.post('/till/shift/open', payload)),
  closeShift: (payload: { countedCash: number; note?: string }) =>
    getData<Shift & { difference: number; countedCash: number }>(
      api.post('/till/shift/close', payload),
    ),

  search: (q: string) => getData<SellableProduct[]>(api.get('/till/search', { params: { q } })),
  sell: (payload: Record<string, unknown>) => getData<Sale>(api.post('/till/sales', payload)),
  sale: (id: string) => getData<Sale>(api.get(`/till/sales/${id}`)),
  findBill: (billNo: string) => getData<Sale[]>(api.get('/till/sales', { params: { billNo } })),
  bills: (params: {
    from?: string;
    to?: string;
    q?: string;
    mine?: boolean;
    only?: 'due' | 'returned';
    page?: number;
  }) => getData<BillPage>(api.get('/till/bills', { params })),
  returnLines: (
    id: string,
    payload: { lines: { lineId: string; pieces: number }[]; reason?: string },
  ) =>
    getData<{
      billNo: string;
      refund: number;
      /** Cash out of the box. */
      cashBack: number;
      /** Taken off what they owed, when the bill was on account. */
      againstDue: number;
      status: string;
    }>(api.post(`/till/sales/${id}/return`, payload)),

  day: (all = false) =>
    getData<{
      dayKey: string;
      count: number;
      total: number;
      /** What came back off the day's bills, at the price sold. */
      returned?: number;
      due: number;
      margin?: number;
      byMethod: Record<string, number>;
      sales: {
        _id: string;
        billNo: string;
        soldAt: string;
        salesmanName: string;
        customerName?: string;
        total: number;
        due: number;
        status: string;
        items: number;
      }[];
    }>(api.get('/till/day', { params: { all } })),

  customers: (q?: string) => getData<ShopCustomer[]>(api.get('/till/customers', { params: { q } })),
  /** The Customers screen: paged, filtered, with the whole book's figures. */
  customerBook: (params: {
    q?: string;
    show?: 'owing' | 'clear' | 'over';
    sort?: 'owed' | 'name' | 'recent';
    page?: number;
    limit?: number;
  }) =>
    getData<
      Paged<BookRow> & {
        summary: { customers: number; owing: number; owed: number; over: number };
      }
    >(api.get('/till/customers/book', { params })),
  customer: (id: string, range?: { from?: string; to?: string }) =>
    getData<CustomerStatement>(api.get(`/till/customers/${id}`, { params: range })),
  createCustomer: (payload: CustomerInput & { openingBalance?: number }) =>
    getData<ShopCustomer>(api.post('/till/customers', payload)),
  updateCustomer: (id: string, payload: Partial<CustomerInput>) =>
    getData<ShopCustomer>(api.patch(`/till/customers/${id}`, payload)),
  payCustomer: (id: string, payload: { amount: number; method?: string; note?: string }) =>
    getData<{ balance: number }>(api.post(`/till/customers/${id}/payments`, payload)),
};

/* ------------------------------------------------------------- the staff -- */

export interface StaffMember {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'admin' | 'pharmacist' | 'salesman';
  isActive: boolean;
  lastLoginAt?: string | null;
  /** Set while they have a counter open. */
  openShift: { terminal?: string; openedAt: string } | null;
  today: { total: number; count: number };
  /** The last thirty days, cancelled bills left out. */
  month?: { total: number; count: number };
  createdAt?: string;
}

export const staffApi = {
  list: () => getData<StaffMember[]>(api.get('/shop/staff')),
  create: (payload: {
    name: string;
    email: string;
    phone: string;
    role: 'pharmacist' | 'salesman';
    password: string;
  }) => getData<StaffMember>(api.post('/shop/staff', payload)),
  update: (
    id: string,
    payload: { name?: string; phone?: string; role?: 'pharmacist' | 'salesman'; isActive?: boolean },
  ) => getData<StaffMember>(api.patch(`/shop/staff/${id}`, payload)),
  setPassword: (id: string, password: string) =>
    getData<{ _id: string; name: string }>(api.post(`/shop/staff/${id}/password`, { password })),
};

/* ------------------------------------------------ asking for a medicine -- */

/**
 * A medicine the shared catalogue does not have yet, asked for by this shop.
 *
 * Dawai adds it to the catalogue — once, for every shop — and the request then
 * points at the new row, which the shop adds to its own list like any other.
 */
export type MedicineRequestStatus = 'pending' | 'added' | 'rejected';

export interface MedicineRequest {
  _id: string;
  organization: string | { _id: string; name: string };
  requestedBy: string | { _id: string; name: string } | null;
  brandName: string;
  genericName?: string;
  companyName?: string;
  strength?: string;
  dosageForm?: string;
  packSize?: string;
  note?: string;
  status: MedicineRequestStatus;
  /** Set once it is in the catalogue. */
  medicine: string | { _id: string; brandName: string; strength?: string; dosageForm?: string } | null;
  reviewedAt?: string | null;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MedicineRequestInput {
  brandName: string;
  genericName?: string;
  companyName?: string;
  strength?: string;
  dosageForm?: string;
  packSize?: string;
  note?: string;
}

export const medicineRequestsApi = {
  create: (payload: MedicineRequestInput) =>
    getData<MedicineRequest>(api.post('/shop/medicine-requests', payload)),
  /** This shop's own, newest first. */
  list: () => getData<MedicineRequest[]>(api.get('/shop/medicine-requests')),
  /** Only while it is still pending. */
  withdraw: (id: string) => getData<unknown>(api.delete(`/shop/medicine-requests/${id}`)),
};

/* -------------------------------------------------------------------- help -- */

export interface HelpArticleSummary {
  slug: string;
  category: string;
  title: string;
  titleBn?: string;
}
export interface HelpArticle extends HelpArticleSummary {
  body: string;
  bodyBn?: string;
  videoUrl?: string;
}

export const helpApi = {
  list: () => getData<HelpArticleSummary[]>(api.get('/shop/help')),
  get: (slug: string) => getData<HelpArticle>(api.get(`/shop/help/${encodeURIComponent(slug)}`)),
};

/* ---------------------------------------------------------- getting started -- */

/** The getting-started checklist, read from what the shop has done. */
export interface ShopSetup {
  steps: { key: string; label: string; href: string; done: boolean }[];
  done: number;
  total: number;
  dismissed: boolean;
}

export const onboardingApi = {
  get: () => getData<ShopSetup>(api.get('/shop/onboarding')),
  dismiss: () => getData<ShopSetup>(api.post('/shop/onboarding/dismiss', { dismissed: true })),
};

/* ---------------------------------------------------------- announcements -- */

/** A message from the Dawai team, shown across the top of the app. */
export interface ShopAnnouncement {
  _id: string;
  title: string;
  body: string;
  titleBn: string;
  bodyBn: string;
  tone: 'info' | 'warning' | 'success';
  linkLabel: string;
  linkUrl: string;
  dismissible: boolean;
  updatedAt: string;
}

export const announcementsApi = {
  /** What this shop should see now: live, and aimed at its plan. */
  list: () => getData<ShopAnnouncement[]>(api.get('/shop/announcements')),
};

/* ---------------------------------------------------------------- support -- */

/** The shop's conversations with the Dawai team. Open to every role. */
export const supportApi = {
  threads: () => getData<SupportThread[]>(api.get('/shop/support')),
  /** Threads with a reply this shop has not read — for the badge in the nav. */
  unread: () => getData<{ unread: number }>(api.get('/shop/support/unread')),
  open: (payload: { subject: string; body: string }) =>
    getData<{ thread: SupportThread; message: SupportMessage }>(api.post('/shop/support', payload)),
  thread: (id: string) =>
    getData<{ thread: SupportThread; messages: SupportMessage[] }>(api.get(`/shop/support/${id}`)),
  reply: (id: string, body: string) =>
    getData<SupportMessage>(api.post(`/shop/support/${id}/messages`, { body })),
};

/* ------------------------------------------------------- the shop's paper -- */

export interface ShopSettings {
  _id: string;
  shopName: string;
  shopNameBn?: string;
  address?: string;
  phone?: string;
  drugLicenceNo?: string;
  footer?: string;
  footerBn?: string;
  /** "80" and "58" are the two thermal rolls sold here; anything else is custom. */
  paperSize: '80' | '58' | 'custom';
  paperWidthMm: number;
  autoPrint: boolean;
  /** Ask before a bill is saved, with the figures on the dialog. On unless the
      shop turns it off. */
  confirmSale?: boolean;
  copies: number;
  printBangla: boolean;
  showSavings: boolean;
  /**
   * Off for most pharmacies, and that is the right answer here: medicine is
   * VAT-exempt in Bangladesh. The rate only bites on what the same counter
   * sells beside it — baby food, cosmetics, soap — and which lines those are is
   * decided by `isMedicine`, not by tagging two thousand products.
   */
  vatPercent?: number;
  vatOnMedicine?: boolean;
  /** The BIN, printed beside the drug licence. */
  vatBin?: string;

  /**
   * The A4 sheet, which is a different document from the till roll.
   *
   * It is filed, claimed against and sometimes stapled to a cheque, so the shop
   * gets a say in how it looks. Every field has a default that produces a
   * correct sheet — a shop that never opens this screen still gets one it can
   * hand over.
   */
  invoice?: {
    paper: 'A4' | 'A5';
    /** `#rrggbb`, and the band, the table head and the footer rule follow it. */
    accent: string;
    showLogo: boolean;
    showQr: boolean;
    showBatch: boolean;
    signatureLabel: string;
    terms: string;
  };
}

export const settingsApi = {
  /** Readable at the counter, because the counter is what prints. */
  get: () => getData<ShopSettings>(api.get('/till/settings')),
  save: (payload: Partial<ShopSettings>) =>
    getData<ShopSettings>(api.patch('/shop/settings', payload)),
};

/**
 * Opens one of the shop's PDFs in a tab.
 *
 * Fetched rather than linked, because every one of these is behind the session
 * and a plain `<a href>` arrives without it. The tab is opened *before* the
 * request in the click's own turn — a window opened in a promise is a window a
 * browser blocks as a pop-up.
 */
export async function openPdf(path: string) {
  const tab = window.open('', '_blank');
  try {
    /* The reader's language goes with the request: the owner's reports come
       back in it, and papers that leave the shop use it unless the shop has
       chosen Bangla for its paper already. */
    const lang = useLangStore.getState().lang;
    const res = await api.get(path, { responseType: 'blob', params: { lang } });
    const url = URL.createObjectURL(res.data as Blob);
    if (tab) tab.location.href = url;
    else window.open(url, '_blank');
    /* Revoked late: revoking it immediately leaves the new tab with nothing to
       load on a slow machine. */
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    tab?.close();
    throw err;
  }
}

/* ---------------------------------------------------------------- billing -- */

/** A plan as the billing page offers it. */
export interface SubscriptionPlan {
  key: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  limits: { outlets: number | null; terminals: number | null; shopUsers: number | null };
}

/** Where the shop stands: what it is on, until when, and what it would cost. */
export interface Subscription {
  /** Whether "Pay online" (SSLCommerz) is set up on this deployment. */
  onlinePayment?: boolean;
  plan: string;
  planName: string;
  status: 'pending' | 'active' | 'suspended';
  /** When the trial or the paid period runs out. */
  endsAt: string | null;
  daysLeft: number | null;
  expired: boolean;
  suspendedReason: string;
  pendingPayments: number;
  intendedPlan: string;
  plans: SubscriptionPlan[];
  payTo: { bkash: string; nagad: string; upay: string; rocket: string; bank: string };
  ownerName: string;
}

export interface SubscriptionPayment {
  _id: string;
  method: string;
  amount: number;
  plan: string;
  months: number;
  trxId?: string;
  status: 'pending' | 'verified' | 'rejected';
  rejectionReason?: string;
  coversUntil?: string | null;
  invoiceNo?: string;
  createdAt: string;
}

/**
 * The shop's own subscription. Reachable while the shop is read-only — this is
 * the page it uses to stop being read-only.
 */
export const billingApi = {
  subscription: () => getData<Subscription>(api.get('/billing')),
  payments: () => getData<SubscriptionPayment[]>(api.get('/billing/payments')),
  submit: (payload: {
    plan: string;
    months: number;
    amount: number;
    method: string;
    senderNumber?: string;
    trxId?: string;
    note?: string;
    couponCode?: string;
  }) =>
    getData<{ payment: SubscriptionPayment; expected: number; shortfall: number }>(
      api.post('/billing/payments', payload),
    ),
  /** What a discount code takes off this plan and these months, or why it will not. */
  coupon: (code: string, plan: string, months: number) =>
    getData<
      | { ok: true; code: string; discount: number; total: number; base: number; description: string }
      | { ok: false; reason: string }
    >(api.get('/billing/coupon', { params: { code, plan, months } })),
  /** Starts an online payment; the answer is the gateway page to send the browser to. */
  checkout: (payload: { plan: string; months: number; couponCode?: string }) =>
    getData<{ url: string; paymentId: string; amount: number }>(api.post('/billing/checkout', payload)),
  /** Whether to ask why the shop did not renew. */
  leaving: () => getData<{ ask: boolean; answered: { reason: string; note: string } | null }>(api.get('/billing/leaving')),
  tellLeaving: (reason: string, note?: string) => getData<unknown>(api.post('/billing/leaving', { reason, note })),
  /** This shop's referral code, and how many have signed up and paid through it. */
  referral: () => getData<{ code: string; signedUp: number; paying: number }>(api.get('/billing/referral')),
  /** A blob rather than a link, because the route needs the Authorization header. */
  invoice: (id: string) =>
    api.get(`/billing/payments/${id}/invoice`, { responseType: 'blob' }).then((r) => r.data as Blob),
  /** Everything the shop owns, as one JSON document. */
  exportAll: () => api.get('/billing/export', { responseType: 'blob' }).then((r) => r.data as Blob),
  attachReceipt: (paymentId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return getData<{ key: string }>(
      api.post(`/billing/payments/${paymentId}/receipt`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    );
  },
};
