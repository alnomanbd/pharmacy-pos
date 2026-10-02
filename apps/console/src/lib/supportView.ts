import { platformApi } from '../api';
import { BRAND } from '../brand';

/**
 * Opens a shop's own app, read-only, as one of its users.
 *
 * The tab is opened *before* the request, on the click itself: a window opened
 * after an `await` has lost the click that allowed it, and a browser is within
 * its rights to block it as a pop-up. It starts blank and is pointed at the
 * shop app once the one-time code is back, with its `opener` cut so the shop
 * app cannot reach back into the console.
 *
 * Resolves to the shop's name, or throws with the API's reason; a tab that
 * never got its address is closed again.
 */
export async function openSupportView(shopId: string, userId: string): Promise<string> {
  const tab = window.open('about:blank', '_blank');
  try {
    const session = await platformApi.impersonateShopUser(shopId, userId);
    const url = `${BRAND.shopUrl}/support/claim?c=${encodeURIComponent(session.code)}`;
    if (tab) {
      tab.opener = null;
      tab.location.href = url;
    } else {
      // Blocked anyway: this tab, then. The console session survives on its own origin.
      window.location.assign(url);
    }
    return session.viewing.shop.name;
  } catch (e) {
    tab?.close();
    throw e;
  }
}
