// @vitest-environment node
import { expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { createUser, resetUserPassword } from '@/lib/server/store';
import { AUTH_COOKIE, createSessionToken, hashPassword } from '@/lib/server/security';
import { requestUser } from '@/lib/server/http';

it('rejects the pre-reset cookie and accepts the newly issued session without exposing password material', async () => {
  const user = await createUser({email:`reset-${crypto.randomUUID()}@example.invalid`,passwordHash:await hashPassword('before-reset'),inviteCode:'test'});
  const before = createSessionToken(user);
  const request = (token: string) => new NextRequest('https://example.invalid/api/projects',{headers:{cookie:`${AUTH_COOKIE}=${token}`}});
  expect((await requestUser(request(before)))?.id).toBe(user.id);
  await resetUserPassword(user.id,await hashPassword('after-reset'));
  expect(await requestUser(request(before))).toBeNull();
  const after = createSessionToken(user);
  expect((await requestUser(request(after)))?.id).toBe(user.id);
  const payload = JSON.parse(Buffer.from(after.split('.')[0],'base64url').toString());
  expect(payload).not.toHaveProperty('passwordHash');
  expect(payload).not.toHaveProperty('inviteCode');
  expect(payload.credential).toMatch(/^[a-f0-9]{64}$/);
});

it('requires legacy unbound sessions to sign in again', async () => {
  const user = await createUser({email:`legacy-${crypto.randomUUID()}@example.invalid`,passwordHash:'test',inviteCode:'test'});
  const {id,email,name,role}=user;
  const token=createSessionToken({id,email,name,role});
  expect(await requestUser(new NextRequest('https://example.invalid/api/projects',{headers:{cookie:`${AUTH_COOKIE}=${token}`}}))).toBeNull();
});
