import { expect, it } from 'vitest';

// deliberately failing: confirms CI blocks a broken test
it('fails on purpose', () => {
  expect(1).toBe(2);
});
