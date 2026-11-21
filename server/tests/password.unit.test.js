import { describe, expect, it } from 'vitest';
import { hashPassword, isStrongPassword, verifyPassword } from '../src/utils/password.js';
import { createResetToken, hashToken } from '../src/utils/tokens.js';

describe('password policy', () => {
  it.each([
    ['UnitTest@12345', true],
    ['Str0ng!Pass', true],
    ['short1!', false], // too short
    ['alllowercase1!', false], // no uppercase
    ['ALLUPPERCASE1!', false], // no lowercase
    ['NoNumbers!!', false], // no digit
    ['NoSymbols123', false], // no symbol
    [`A1!${'a'.repeat(70)}`, false], // over 72 chars
  ])('%s → %s', (pw, expected) => {
    expect(isStrongPassword(pw)).toBe(expected);
  });

  it('hashes and verifies without storing the plain text', async () => {
    const hash = await hashPassword('UnitTest@12345');
    expect(hash).not.toContain('UnitTest@12345');
    expect(await verifyPassword('UnitTest@12345', hash)).toBe(true);
    expect(await verifyPassword('Wrong@1234', hash)).toBe(false);
  });
});

describe('reset tokens', () => {
  it('stores only a sha256 hash of a 256-bit random token', () => {
    const { raw, hash } = createResetToken();
    expect(raw).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).toBe(hashToken(raw));
    expect(hash).not.toBe(raw);
  });
});
