'use client';

import { useEffect, useState } from 'react';
import { useSocketAuth } from '@/hooks/useSocketAuth';
import { disconnectSocket } from '@/lib/phoenixSocket';
import { getWebSocketToken } from '@/lib/tradingEngineApi';

const LOG_PREFIX = '[SocketProvider]';

/**
 * Wrap this around any part of the app that needs real-time Phoenix channel data.
 * Pass the WebSocket token fetched server-side.
 */
export function SocketProvider({
  token,
  children,
}: {
  token: string | null;
  children: React.ReactNode;
}) {
  useSocketAuth(token);

  useEffect(() => {
    return () => {
      console.log(LOG_PREFIX, 'SocketProvider unmounting — disconnecting');
      disconnectSocket();
    };
  }, []);

  return <>{children}</>;
}

/**
 * Self-fetching variant — fetches the WS token client-side via server action.
 * Use this in the root layout to avoid server-side Logto errors.
 */
export function SocketProviderWithAuth({
  children,
}: {
  children: React.ReactNode;
}) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    console.log(LOG_PREFIX, 'Fetching WS token...');
    getWebSocketToken()
      .then((t) => {
        console.log(LOG_PREFIX, t ? 'WS token received' : 'WS token is null (will connect anonymously)');
        setToken(t);
      })
      .catch((err) => {
        console.error(LOG_PREFIX, 'WS token fetch failed:', err);
      });

    return () => {
      console.log(LOG_PREFIX, 'SocketProviderWithAuth unmounting — disconnecting');
      disconnectSocket();
    };
  }, []);

  useSocketAuth(token);
  return <>{children}</>;
}
