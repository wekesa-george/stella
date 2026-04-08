import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { getLogtoContext } from "@logto/next/server-actions";
import { logtoConfig } from "@/app/logto";
import { ClientWrapper } from "@/components/layout/ClientWrapper";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = await getLogtoContext(logtoConfig);

  return (
    <ClientWrapper>
      <div className="flex h-screen overflow-hidden">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content Area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Topbar */}
          <Topbar isAuthenticated={isAuthenticated} />

          {/* Page Content */}
          <main className="flex-1 overflow-y-auto p-4 md:p-6" style={{ backgroundColor: 'var(--color-background)' }}>
            {children}
          </main>
        </div>
      </div>
    </ClientWrapper>
  );
}
