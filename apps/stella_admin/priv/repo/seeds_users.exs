# Script for populating the database with test users. You can run it as:
#
#     mix run priv/repo/seeds_users.exs
#
# Inside the script, you can read and write to any of your
# repositories directly:
#
#     StellaAdmin.Repo.insert!(%StellaAdmin.SomeSchema{})
#

alias StellaAdmin.Repo
alias StellaAdmin.Auth.User

# Clear existing test users (optional - comment out if you want to keep existing users)
# Repo.delete_all(User)

IO.puts("Creating test users...")

# Test User 1 - Active, Stella Unum, Verified
%User{}
|> User.changeset(%{
  logto_user_id: "logto_user_#{:rand.uniform(100000)}",
  email: "sarah.chen@example.com",
  phone: "+1-555-0101",
  username: "crypto_queen",
  status: :active,
  tier: :stella_unum,
  email_verified: true,
  phone_verified: true,
  referral_code: "SARAH2024",
  metadata: %{
    bio: "Experienced crypto trader specializing in BTC and ETH",
    trading_experience: "5 years"
  }
})
|> Repo.insert!()

# Test User 2 - Active, Stella Eon, Verified
%User{}
|> User.changeset(%{
  logto_user_id: "logto_user_#{:rand.uniform(100000)}",
  email: "michael.torres@example.com",
  phone: "+1-555-0102",
  username: "btc_master",
  status: :active,
  tier: :stella_eon,
  email_verified: true,
  phone_verified: true,
  referral_code: "MIKE2024",
  metadata: %{
    bio: "Bitcoin maximalist and day trader",
    trading_style: "Conservative"
  }
})
|> Repo.insert!()

# Test User 3 - Active, Stella One, Email Verified Only
%User{}
|> User.changeset(%{
  logto_user_id: "logto_user_#{:rand.uniform(100000)}",
  email: "emma.wilson@example.com",
  phone: "+1-555-0103",
  username: "eth_trader",
  status: :active,
  tier: :stella_one,
  email_verified: true,
  phone_verified: false,
  referral_code: "EMMA2024",
  metadata: %{}
})
|> Repo.insert!()

# Test User 4 - Pending Verification, Stella One, Not Verified
%User{}
|> User.changeset(%{
  logto_user_id: "logto_user_#{:rand.uniform(100000)}",
  email: "james.park@example.com",
  phone: "+1-555-0104",
  username: "sol_whale",
  status: :pending_verification,
  tier: :stella_one,
  email_verified: false,
  phone_verified: false,
  referral_code: "JAMES2024",
  metadata: %{}
})
|> Repo.insert!()

# Test User 5 - Suspended, Stella Unum, Verified
%User{}
|> User.changeset(%{
  logto_user_id: "logto_user_#{:rand.uniform(100000)}",
  email: "maria.garcia@example.com",
  phone: "+1-555-0105",
  username: "defi_maven",
  status: :suspended,
  tier: :stella_unum,
  email_verified: true,
  phone_verified: true,
  referral_code: "MARIA2024",
  metadata: %{
    suspension_reason: "Policy violation - automated trading"
  }
})
|> Repo.insert!()

# Test User 6 - Active, Stella Plenum, Fully Verified (VIP)
%User{}
|> User.changeset(%{
  logto_user_id: "logto_user_#{:rand.uniform(100000)}",
  email: "david.lee@example.com",
  phone: "+1-555-0106",
  username: "day_trader_pro",
  status: :active,
  tier: :stella_plenum,
  email_verified: true,
  phone_verified: true,
  referral_code: "DAVID2024",
  metadata: %{
    bio: "Professional day trader, high volume",
    vip_status: true
  }
})
|> Repo.insert!()

# Test User 7 - Active, Stella One, No Username
%User{}
|> User.changeset(%{
  logto_user_id: "logto_user_#{:rand.uniform(100000)}",
  email: "alex.kumar@example.com",
  phone: "+1-555-0107",
  username: nil,
  status: :active,
  tier: :stella_one,
  email_verified: true,
  phone_verified: false,
  referral_code: "ALEX2024",
  metadata: %{}
})
|> Repo.insert!()

# Test User 8 - Banned, Stella One
%User{}
|> User.changeset(%{
  logto_user_id: "logto_user_#{:rand.uniform(100000)}",
  email: "banned.user@example.com",
  phone: "+1-555-0108",
  username: "banned_account",
  status: :banned,
  tier: :stella_one,
  email_verified: true,
  phone_verified: true,
  referral_code: nil,
  metadata: %{
    ban_reason: "Multiple ToS violations"
  }
})
|> Repo.insert!()

# Test User 9 - Deactivated, Stella Unum
%User{}
|> User.changeset(%{
  logto_user_id: "logto_user_#{:rand.uniform(100000)}",
  email: "inactive.user@example.com",
  phone: "+1-555-0109",
  username: "old_account",
  status: :deactivated,
  tier: :stella_unum,
  email_verified: true,
  phone_verified: true,
  referral_code: nil,
  metadata: %{
    deactivation_date: "2025-12-01"
  }
})
|> Repo.insert!()

# Test User 10 - Active, Stella Eon, Locked Account
%User{}
|> User.changeset(%{
  logto_user_id: "logto_user_#{:rand.uniform(100000)}",
  email: "locked.user@example.com",
  phone: "+1-555-0110",
  username: "locked_acc",
  status: :active,
  tier: :stella_eon,
  email_verified: true,
  phone_verified: true,
  failed_login_count: 5,
  locked_until: DateTime.utc_now() |> DateTime.add(3600, :second),
  referral_code: "LOCKED2024",
  metadata: %{}
})
|> Repo.insert!()

IO.puts("✅ Created 10 test users successfully!")
IO.puts("")
IO.puts("Test users breakdown:")
IO.puts("- Active users: 6")
IO.puts("- Suspended: 1")
IO.puts("- Banned: 1")
IO.puts("- Deactivated: 1")
IO.puts("- Pending verification: 1")
IO.puts("")
IO.puts("Tier distribution:")
IO.puts("- Stella One: 4")
IO.puts("- Stella Unum: 3")
IO.puts("- Stella Eon: 2")
IO.puts("- Stella Plenum: 1")
