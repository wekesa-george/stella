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
    subMenu: [
      { label: "Mission Critical", href: "/dashboard/mission-critical", description: "Real-time operations overview" },
      { label: "Mission Control", href: "/dashboard/mission-control", description: "Platform command center" },
      { label: "Bot Fleet", href: "/dashboard/bot-fleet", description: "Bot management & monitoring" },
      { label: "Strategies", href: "/dashboard/strategies", description: "Strategy configurations" },
      { label: "Alerts", href: "/dashboard/alerts", description: "System alerts & notifications" },
      { label: "Operations Log", href: "/dashboard/incidents", description: "Incident audit log & shifts" },
      { label: "Infrastructure", href: "/dashboard/infra", description: "System health & metrics" },
    ],
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
        label: "Backtesting",
        href: "/backtesting",
        description: "Strategy backtesting with VectorBT",
      },
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
