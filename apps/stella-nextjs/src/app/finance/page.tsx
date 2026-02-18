"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function FinancePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/finance/overview");
  }, [router]);

  return null;
}
