'use server';

import { signIn, signOut } from '@logto/next/server-actions';
import { logtoConfig } from './logto';

export async function handleSignInAction() {
  await signIn(logtoConfig, {
    redirectUri: `${logtoConfig.baseUrl}/callback`,
  });
}

export async function handleSignOutAction() {
  await signOut(logtoConfig, logtoConfig.baseUrl);
}
