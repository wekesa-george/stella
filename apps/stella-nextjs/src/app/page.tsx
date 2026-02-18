"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.push("/dashboard");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#080c10]">
      <div className="text-center">
        <div className="font-mono text-[#8fa3b8] text-sm">Redirecting to dashboard...</div>
      </div>
    </div>
  );
}
