import Link from "next/link";
import Image from "next/image";

interface FooterProps {
  variant?: "default" | "minimal";
  showLogo?: boolean;
  className?: string;
}

export function Footer({
  variant = "default",
  showLogo = true,
  className = ""
}: FooterProps) {
  const currentYear = new Date().getFullYear();

  if (variant === "minimal") {
    return (
      <footer className={`py-6 ${className}`}>
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center gap-4">
            {showLogo && (
              <Image
                src="/stella.svg"
                alt="Stella Logo"
                width={120}
                height={32}
                className="h-6 w-auto opacity-60"
              />
            )}
            <p className="text-xs text-muted-foreground text-center tracking-wider">
              Your session is encrypted and secured by Logto OAuth2
            </p>
            <p className="text-xs text-muted-foreground/60 text-center">
              © {currentYear} Stella. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className={`border-t border-border/40 bg-card ${className}`}>
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
          {/* Brand Section */}
          <div className="space-y-4">
            {showLogo && (
              <Image
                src="/stella.svg"
                alt="Stella Logo"
                width={140}
                height={37}
                className="h-8 w-auto"
              />
            )}
            <p className="text-sm text-muted-foreground leading-relaxed">
              Advanced crypto trading platform with automated strategies and risk management.
            </p>
          </div>

          {/* Product Links */}
          <div>
            <h3 className="font-semibold text-sm text-foreground mb-4 uppercase tracking-wider">
              Product
            </h3>
            <ul className="space-y-3">
              <li>
                <Link
                  href="/dashboard"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Dashboard
                </Link>
              </li>
              <li>
                <Link
                  href="/trading"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Trading
                </Link>
              </li>
              <li>
                <Link
                  href="/kyc-review"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  KYC Review
                </Link>
              </li>
              <li>
                <Link
                  href="/settings"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Settings
                </Link>
              </li>
            </ul>
          </div>

          {/* Company Links */}
          <div>
            <h3 className="font-semibold text-sm text-foreground mb-4 uppercase tracking-wider">
              Company
            </h3>
            <ul className="space-y-3">
              <li>
                <Link
                  href="/about"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  About Us
                </Link>
              </li>
              <li>
                <Link
                  href="/careers"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Careers
                </Link>
              </li>
              <li>
                <Link
                  href="/blog"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Blog
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h3 className="font-semibold text-sm text-foreground mb-4 uppercase tracking-wider">
              Legal
            </h3>
            <ul className="space-y-3">
              <li>
                <Link
                  href="/privacy"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link
                  href="/security"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Security
                </Link>
              </li>
              <li>
                <Link
                  href="/compliance"
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  Compliance
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="pt-8 border-t border-border/40">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-xs text-muted-foreground">
              © {currentYear} Stella. All rights reserved.
            </p>
            <p className="text-xs text-muted-foreground">
              Secured by Logto OAuth2 • End-to-end encrypted
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
