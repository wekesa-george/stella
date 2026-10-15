'use client';

import { useEffect, useRef } from 'react';
import { setSocketToken } from '@/lib/phoenixSocket';

const LOG_PREFIX = '[useSocketAuth]';

/**
 * Hook to authenticate the Phoenix socket with a Logto access token.
 * Call this once at the app/layout level.
 *
 * This hook does NOT disconnect on cleanup — the socket is a singleton
 * that should persist across page navigations. Disconnection only happens
 * when the token changes (handled by setSocketToken) or on full unmount
 * of the SocketProvider.
 */
export function useSocketAuth(token: string | null) {
  const prevToken = useRef<string | null>(null);

  useEffect(() => {
    if (token && token !== prevToken.current) {
      console.log(LOG_PREFIX, 'Setting socket token');
      setSocketToken(token);
      prevToken.current = token;
    } else if (!token) {
      console.log(LOG_PREFIX, 'No token available — socket will connect anonymously');
    }
  }, [token]);
}
