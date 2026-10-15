'use client';

import { createContext, useContext } from 'react';

interface AdminUserContextValue {
  adminUserId: string | null;
}

const AdminUserContext = createContext<AdminUserContextValue>({ adminUserId: null });

export function useAdminUser() {
  return useContext(AdminUserContext);
}

export function AdminUserProvider({
  adminUserId,
  children,
}: {
  adminUserId: string | null;
  children: React.ReactNode;
}) {
  return (
    <AdminUserContext.Provider value={{ adminUserId }}>
      {children}
    </AdminUserContext.Provider>
  );
}
