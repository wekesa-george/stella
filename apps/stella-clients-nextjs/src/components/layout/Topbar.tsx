"use client";

import { Bell, Search, User, LogOut } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { handleSignInAction, handleSignOutAction } from "@/app/actions";

interface TopbarProps {
  isAuthenticated?: boolean;
}

export function Topbar({ isAuthenticated = false }: TopbarProps) {
  const [showSearch, setShowSearch] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleSignIn = async () => {
    await handleSignInAction();
  };

  const handleSignOut = async () => {
    await handleSignOutAction();
  };

  // Click outside to close menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    if (showUserMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showUserMenu]);

  return (
    <header className="flex items-center justify-between border-b border-border/40 bg-card px-6 gap-4 sticky top-0 z-10" style={{ height: '52px' }}>
      {/* Left Section - Breadcrumb */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Portal</span>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-xs font-semibold text-foreground">Dashboard</span>
      </div>

      {/* Center - Search */}
      <div className="flex items-center gap-4 flex-1 max-w-sm">
        {showSearch ? (
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search..."
              className="w-full bg-muted/50 border border-border/40 rounded-md pl-9 pr-4 py-2 text-sm outline-none focus:border-primary transition-colors"
              autoFocus
              onBlur={() => setShowSearch(false)}
            />
          </div>
        ) : (
          <button
            onClick={() => setShowSearch(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 border border-border/40 hover:border-primary transition-colors text-sm text-muted-foreground w-full max-w-xs"
          >
            <Search className="h-4 w-4" />
            <span className="hidden sm:inline">Search...</span>
          </button>
        )}
      </div>

      {/* Right Section - Actions */}
      <div className="flex items-center gap-3">
        {isAuthenticated ? (
          <>
            {/* Notifications */}
            <button
              className="relative rounded-md p-2 hover:bg-muted transition-colors"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5 text-muted-foreground" />
              {/* Notification Badge */}
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary" />
            </button>

            {/* User Avatar & Menu */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 rounded-md p-2 hover:bg-muted transition-colors"
                aria-label="User menu"
              >
                <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
              </button>

              {/* Dropdown Menu */}
              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-48 rounded-md border border-border/40 bg-card shadow-lg overflow-hidden z-50">
                  <div className="p-2">
                    <button
                      onClick={handleSignOut}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-muted rounded-md transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <button
            onClick={handleSignIn}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Sign In
          </button>
        )}
      </div>
    </header>
  );
}
