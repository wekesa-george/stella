"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Bell, Search, Menu, User } from "lucide-react";
import { navigationConfig, type MenuItem } from "@/config/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function Navbar() {
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  return (
    <nav className="border-b border-border/40 bg-card">
      <div className="container mx-auto px-3 sm:px-4 md:px-6">
        <div className="flex h-14 sm:h-16 items-center justify-between gap-2 sm:gap-4">
          {/* Left Section - Logo and Nav */}
          <div className="flex items-center gap-3 sm:gap-6">
            {/* Logo */}
            <Link href="/" className="flex items-center">
              <Image
                src="/stella.svg"
                alt="Stella Logo"
                width={120}
                height={32}
                className="h-6 sm:h-8 w-auto"
              />
            </Link>

            {/* Navigation Menu - Desktop */}
            <div className="hidden items-center gap-1 lg:flex">
              {navigationConfig.map((item) => (
                <NavigationItem key={item.label} item={item} />
              ))}
            </div>
          </div>

          {/* Center - Search Bar */}
          <div className="hidden flex-1 max-w-md lg:flex">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search..."
                className="w-full pl-9 bg-background border-border/40 focus-visible:ring-primary"
              />
            </div>
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Mobile Menu */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setShowMobileMenu(!showMobileMenu)}
            >
              <Menu className="h-4 sm:h-5 w-4 sm:w-5" />
            </Button>

            {/* Notifications */}
            <Button variant="ghost" size="icon" className="relative hidden sm:flex">
              <Bell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
            </Button>

            {/* Profile Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 border-border/40">
                <div className="flex items-center gap-2 p-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">Admin User</span>
                    <span className="text-xs text-muted-foreground">admin@stella.com</span>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Profile</DropdownMenuItem>
                <DropdownMenuItem>Settings</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive">Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {showMobileMenu && (
        <div
          className="fixed inset-0 bg-black/50 z-50 lg:hidden"
          onClick={() => setShowMobileMenu(false)}
        />
      )}

      {/* Mobile Menu Drawer */}
      <div
        className={cn(
          "fixed top-0 left-0 bottom-0 w-[280px] bg-card border-r border-border/40 z-50 transition-transform duration-300 lg:hidden",
          showMobileMenu ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex items-center justify-between p-4 border-b border-border/40">
          <Image
            src="/stella.svg"
            alt="Stella Logo"
            width={100}
            height={28}
            className="h-7 w-auto"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowMobileMenu(false)}
          >
            ✕
          </Button>
        </div>
        <div className="flex flex-col p-4 gap-2">
          {navigationConfig.map((item) => (
            <div key={item.label}>
              {item.subMenu ? (
                <div className="flex flex-col gap-1">
                  <div className="text-sm font-medium text-muted-foreground py-2">
                    {item.label}
                  </div>
                  {item.subMenu.map((subItem) => (
                    <Link
                      key={subItem.href}
                      href={subItem.href}
                      onClick={() => setShowMobileMenu(false)}
                      className="text-sm py-2 px-3 rounded hover:bg-accent transition-colors"
                    >
                      {subItem.label}
                    </Link>
                  ))}
                </div>
              ) : (
                <Link
                  href={item.href}
                  onClick={() => setShowMobileMenu(false)}
                  className="text-sm py-2 px-3 rounded hover:bg-accent transition-colors block"
                >
                  {item.label}
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
}

function NavigationItem({ item }: { item: MenuItem }) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const isActive = pathname?.startsWith(item.href) && item.href !== "#";

  if (item.subMenu) {
    return (
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              "gap-1 bg-transparent text-muted-foreground hover:bg-[rgba(0,229,160,0.12)] hover:text-foreground relative h-16 rounded-none border-b-2 border-transparent transition-all",
              isActive && "text-[#00e5a0] border-b-[#00e5a0] hover:text-[#00e5a0] bg-[rgba(0,229,160,0.08)] hover:bg-[rgba(0,229,160,0.15)]"
            )}
          >
            {item.label}
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                isOpen && "rotate-180"
              )}
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 border-border/40">
          {item.subMenu.map((subItem) => (
            <DropdownMenuItem key={subItem.href} asChild>
              <Link href={subItem.href} className="flex flex-col items-start">
                <span className="font-medium">{subItem.label}</span>
                {subItem.description && (
                  <span className="text-xs text-muted-foreground">
                    {subItem.description}
                  </span>
                )}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Button
      variant="ghost"
      className={cn(
        "bg-transparent text-muted-foreground hover:bg-[rgba(0,229,160,0.12)] hover:text-foreground relative h-16 rounded-none border-b-2 border-transparent transition-all",
        isActive && "text-[#00e5a0] border-b-[#00e5a0] hover:text-[#00e5a0] bg-[rgba(0,229,160,0.08)] hover:bg-[rgba(0,229,160,0.15)]"
      )}
      asChild
    >
      <Link href={item.href}>{item.label}</Link>
    </Button>
  );
}
