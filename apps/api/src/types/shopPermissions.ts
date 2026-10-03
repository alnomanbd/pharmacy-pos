/**
 * What a person working in a shop may do.
 *
 * The same idea as the console's (types/permissions.ts): a role says who you
 * are, the permissions say what you may do. The owner (`admin`) holds all of
 * them, always. Everybody else holds the permissions of the role the owner
 * gave them — one of the two built in (Pharmacist, Salesman, which match what
 * those roles could always do), or one the shop made for itself: a Cashier
 * who sells and takes returns, a Store keeper who receives stock and counts
 * the shelves but never sees the till.
 *
 * Grouped as the owner thinks about the shop, which is how the Roles screen
 * shows them.
 */
export const SHOP_PERMISSION_GROUPS = [
  {
    key: 'counter',
    label: 'Counter',
    permissions: [
      { key: 'pos.sell', label: 'Sell at the POS', description: 'Open the till, ring up bills, and see their own bills' },
      { key: 'pos.discount', label: 'Give discounts', description: 'Take money off a bill at the till' },
      { key: 'sales.return', label: 'Take returns', description: 'Take items back against a bill and refund them' },
      { key: 'sales.cancel', label: 'Cancel any bill', description: 'Without this, only their own bill in the first minutes' },
      { key: 'sales.view_all', label: 'See every bill', description: 'Not just their own' },
      { key: 'sales.edit', label: 'Correct, hold or delete bills', description: 'Change a bill after it was rung up' },
      { key: 'online_orders.manage', label: 'Handle online orders', description: 'Confirm, bill and deliver customers’ orders' },
    ],
  },
  {
    key: 'customers',
    label: 'Customers',
    permissions: [
      { key: 'customers.manage', label: 'Manage customers and the baki khata', description: 'Add and edit customers, take baki payments, send reminders' },
      { key: 'customers.delete', label: 'Delete customers', description: 'Move a customer to the bin' },
    ],
  },
  {
    key: 'stock',
    label: 'Stock',
    permissions: [
      { key: 'stock.view', label: 'See the stock', description: 'The stock list, expiry and racks — with what things cost' },
      { key: 'stock.manage', label: 'Manage stock', description: 'Add and edit items, adjust, count the shelves, import' },
      { key: 'purchases.manage', label: 'Purchases and suppliers', description: 'Receive deliveries, pay and return to companies, order' },
      { key: 'transfers.manage', label: 'Send stock between branches', description: '' },
    ],
  },
  {
    key: 'money',
    label: 'Money',
    permissions: [
      { key: 'reports.view', label: 'See reports and the dashboard', description: 'Sales, margins, the day and the month' },
      { key: 'accounts.view', label: 'See the accounts', description: 'The cash book, expenses and income' },
      { key: 'accounts.manage', label: 'Record expenses, income and cash', description: '' },
      { key: 'accounts.close', label: 'Close and reopen a month', description: 'Locks a month’s figures' },
      { key: 'data.export', label: 'Export data', description: 'Download sales, stock and customers as files' },
    ],
  },
  {
    key: 'shop',
    label: 'The shop',
    permissions: [
      { key: 'settings.manage', label: 'Shop settings', description: 'The receipt, counters, payments, online orders, loyalty' },
      { key: 'staff.manage', label: 'Staff and roles', description: 'Add staff, set passwords, make roles — never more than they hold themselves' },
      { key: 'branches.manage', label: 'Branches', description: 'Open, rename and close branches' },
      { key: 'audit.view', label: 'Activity and the bin', description: 'Who did what, and restoring what was deleted' },
    ],
  },
] as const;

export type ShopPermission = (typeof SHOP_PERMISSION_GROUPS)[number]['permissions'][number]['key'];
export const SHOP_PERMISSIONS = SHOP_PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key)) as ShopPermission[];
export const ALL_SHOP_PERMISSIONS: ShopPermission[] = [...SHOP_PERMISSIONS];

/**
 * The two roles every shop has without making them, set to exactly what a
 * pharmacist and a salesman could always do — so nobody's access changed the
 * day roles arrived. The owner can copy one into a role of their own and
 * change it.
 */
export const BUILT_IN_SHOP_ROLES: Record<'pharmacist' | 'salesman', { name: string; description: string; permissions: ShopPermission[] }> = {
  pharmacist: {
    name: 'Pharmacist',
    description: 'Runs the shop day to day: stock, purchases, reports and the counter.',
    permissions: SHOP_PERMISSIONS.filter((p) => !['accounts.close', 'branches.manage', 'audit.view'].includes(p)),
  },
  salesman: {
    name: 'Salesman',
    description: 'Works the counter: sells, takes returns, looks after customers.',
    permissions: ['pos.sell', 'pos.discount', 'sales.return', 'customers.manage', 'online_orders.manage'],
  },
};

/**
 * Permissions that make a role a back-room one. A person given a custom role
 * with any of these is stored as a pharmacist, otherwise as a salesman — the
 * coarse role some older screens still read; what they may do is always the
 * permissions.
 */
export const BACK_ROOM: ShopPermission[] = ['stock.view', 'stock.manage', 'purchases.manage', 'reports.view', 'accounts.view', 'settings.manage', 'staff.manage'];
