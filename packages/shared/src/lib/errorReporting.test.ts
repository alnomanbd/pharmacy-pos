import { describe, it, expect, vi, beforeAll } from 'vitest';
import { installErrorReporting, reportClientError } from './errorReporting';

const fetchMock = vi.fn(() => Promise.resolve(new Response('{}')));

beforeAll(() => {
  vi.stubGlobal('fetch', fetchMock);
  installErrorReporting('shop');
});

const bodies = () => fetchMock.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string));

describe('reporting a browser crash', () => {
  it('sends the message, the stack and the page without its query', () => {
    window.history.pushState({}, '', '/till?q=napa');
    reportClientError(new TypeError('x is undefined'));
    const [b] = bodies();
    expect(b).toMatchObject({ app: 'shop', message: 'x is undefined', path: '/till' });
    expect(b.stack).toContain('TypeError');
  });

  it('sends the same fault once a page, and ignores the browser’s own noise', () => {
    const before = fetchMock.mock.calls.length;
    reportClientError(new TypeError('x is undefined'));
    reportClientError(new Error('ResizeObserver loop completed with undelivered notifications.'));
    const ext = new Error('boom');
    ext.stack = 'Error: boom\n    at chrome-extension://abc/content.js:1:1';
    reportClientError(ext);
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it('stops at ten a page, so a loop cannot flood the server', () => {
    for (let i = 0; i < 30; i++) reportClientError(new Error(`fault ${i}`));
    expect(fetchMock.mock.calls.length).toBe(10);
  });
});
