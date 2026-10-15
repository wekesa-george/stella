'use server';

import { cache } from 'react';
import { getAdminMe } from './stellaAdminApi';

async function fetchAdminUserId(): Promise<string | null> {
  const result = await getAdminMe();
  const data = result.data as any;

  if (!data?.id) {
    return null;
  }

  return data.id;
}

// React cache() deduplicates calls within the same request/render
export const getAdminUserId = cache(fetchAdminUserId);
