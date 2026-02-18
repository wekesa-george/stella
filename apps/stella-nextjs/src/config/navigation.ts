export interface SubMenuItem {
  label: string;
  href: string;
  description?: string;
}

export interface MenuItem {
  label: string;
  href: string;
  icon?: string;
  subMenu?: SubMenuItem[];
}

export const navigationConfig: MenuItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: "home",
  },
  {
    label: "Users",
    href: "/users",
    icon: "users",
  },
  {
    label: "Trading",
    href: "/trading",
    icon: "chart-bar",
  },
  {
    label: "Finance",
    href: "/finance",
    icon: "currency-dollar",
  },
  {
    label: "More",
    href: "#",
    icon: "dots-horizontal",
    subMenu: [
      {
        label: "KYC Review",
        href: "/kyc-review",
      },
      {
        label: "Admin Users",
        href: "/admin-users",
      },
      {
        label: "Settings",
        href: "/settings",
      },
    ],
  },
];
