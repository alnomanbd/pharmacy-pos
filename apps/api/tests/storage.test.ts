import { describe, it, expect } from 'vitest';
import { keys, organizationOfKey, assertAllowed, mimeTypeOfKey } from '../src/services/storage.service.js';

/**
 * These files are shop logos, staff photos and payment screenshots. The two
 * things that must never break are the folder scheme (so one shop's data can be
 * exported or deleted as a unit) and the tenancy carried in the key (so a file
 * is never served to the wrong shop).
 */

const ORG = '507f1f77bcf86cd799439011';
const OTHER = '507f1f77bcf86cd799439012';
const USER = '507f191e810c19729de860ea';

describe('upload folder scheme', () => {
  it('files everything a shop owns under that shop', () => {
    // Offboarding deletes one directory; export copies one directory. Both rely
    // on this prefix and nothing else.
    for (const key of [
      keys.orgLogo(ORG),
      keys.userPhoto(ORG, USER),
      keys.payment(ORG, 'abc123'),
    ]) {
      expect(key.startsWith(`org/${ORG}/`)).toBe(true);
    }
  });

  it('keeps the kinds in separate folders', () => {
    expect(keys.orgLogo(ORG)).toBe(`org/${ORG}/logo`);
    expect(keys.userPhoto(ORG, USER)).toBe(`org/${ORG}/users/${USER}/photo`);
    expect(keys.payment(ORG, 'p1')).toBe(`org/${ORG}/payments/p1`);
  });

  it('refuses an id that would climb out of its folder', () => {
    // An id reaches these from a URL parameter, so `../` in one would otherwise
    // write into another shop's directory.
    for (const nasty of ['../../etc', '..', '/', 'a/../../b']) {
      expect(() => keys.userPhoto(ORG, nasty)).toThrow();
    }
  });

  it('refuses an empty id rather than filing at the shop root', () => {
    expect(() => keys.payment(ORG, '')).toThrow();
  });
});

describe('tenancy carried in the key', () => {
  it('reports the owning shop', () => {
    expect(organizationOfKey(`org/${ORG}/logo/x.png`)).toBe(ORG);
    expect(organizationOfKey(`org/${ORG}/logo/x.png`)).not.toBe(OTHER);
  });

  it('reports platform-owned files as belonging to no shop', () => {
    expect(organizationOfKey('platform/x.png')).toBeNull();
  });

  it('does not read a shop id out of a key that only mentions one', () => {
    // The download route authorises on this, so a key that merely contains the
    // word "org" further along must not be read as owned by anyone.
    expect(organizationOfKey(`platform/org/${ORG}/x.png`)).toBeNull();
  });
});

describe('what may be uploaded', () => {
  it('accepts the image types a shop actually has', () => {
    for (const mimetype of ['image/png', 'image/jpeg', 'image/webp']) {
      expect(() => assertAllowed('image', { mimetype, size: 1000 })).not.toThrow();
    }
  });

  it('refuses anything executable, whatever it is called', () => {
    for (const mimetype of ['text/html', 'application/javascript', 'application/x-msdownload']) {
      expect(() => assertAllowed('image', { mimetype, size: 10 })).toThrow();
    }
  });

  it('takes a PDF as a document but not as an image', () => {
    expect(() => assertAllowed('document', { mimetype: 'application/pdf', size: 10 })).not.toThrow();
    expect(() => assertAllowed('image', { mimetype: 'application/pdf', size: 10 })).toThrow();
  });

  it('refuses a file over the limit', () => {
    expect(() => assertAllowed('image', { mimetype: 'image/png', size: 20 * 1024 * 1024 })).toThrow(
      /too large/i,
    );
  });
});

describe('serving', () => {
  it('names the type from the stored key', () => {
    expect(mimeTypeOfKey('org/x/logo/a.png')).toBe('image/png');
    expect(mimeTypeOfKey('org/x/payments/p/a.jpg')).toBe('image/jpeg');
    expect(mimeTypeOfKey('org/x/payments/p/a.pdf')).toBe('application/pdf');
  });

  it('falls back rather than guessing for an unknown extension', () => {
    expect(mimeTypeOfKey('org/x/a.bin')).toBe('application/octet-stream');
  });
});
