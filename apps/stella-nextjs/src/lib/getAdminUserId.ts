'use server';

import { cookies } from 'next/headers';
import { getAdminMe } from './stellaAdminApi';

const COOKIE_NAME = 'stella_admin_user_id';
const MAX_AGE = 60 * 60 * 24; // 24 hours

export async function getAdminUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const cached = cookieStore.get(COOKIE_NAME);

  if (cached?.value) {
    return cached.value;
  }

  const result = await getAdminMe();

  if (!result.data?.id) {
    return null;
  }

  const adminUserId: string = result.data.id;

  cookieStore.set(COOKIE_NAME, adminUserId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE,
    sameSite: 'lax',
    path: '/',
  });

  return adminUserId;
}
