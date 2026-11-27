import { describe, expect, it } from 'vitest';
import { withScheme } from './url';

describe('withScheme', () => {
  it('adds https to a bare host, even one starting with "http"', () => {
    expect(withScheme('acme.com')).toBe('https://acme.com');
    expect(withScheme('httpbin.org')).toBe('https://httpbin.org');
  });

  it('keeps an existing http or https scheme', () => {
    expect(withScheme('http://acme.com')).toBe('http://acme.com');
    expect(withScheme('https://acme.com/pricing')).toBe('https://acme.com/pricing');
  });
});
