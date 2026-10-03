import { describe, it, expect } from 'vitest';
import { effectiveFeatures } from '../src/services/plan.service.js';

describe('plan features for one shop', () => {
  it('follows the plan when the shop has no setting of its own', () => {
    const f = effectiveFeatures({ onlineOrders: true }, null);
    expect(f.on.onlineOrders).toBe(true);
    expect(f.overridden.onlineOrders).toBe(false);
    expect(effectiveFeatures({ onlineOrders: false }, { onlineOrders: null }).on.onlineOrders).toBe(false);
  });

  it('lets the console give a feature to one shop, or take it away', () => {
    expect(effectiveFeatures({ onlineOrders: false }, { onlineOrders: true })).toMatchObject({
      on: { onlineOrders: true },
      overridden: { onlineOrders: true },
      plan: { onlineOrders: false },
    });
    expect(effectiveFeatures({ onlineOrders: true }, { onlineOrders: false }).on.onlineOrders).toBe(false);
  });
});
