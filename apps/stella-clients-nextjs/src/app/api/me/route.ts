import { NextResponse } from "next/server";

// This route will verify JWT and return user claims
// TODO: Implement actual JWT verification with Logto
export async function GET() {
  // Mock user data for now
  const user = {
    id: "user_123",
    email: "user@example.com",
    tier: "stella_unum",
    kyc_status: "approved",
    has_connected_exchange: true,
    has_allocated_capital: true,
    onboarding_complete: true,
  };

  return NextResponse.json(user);
}
