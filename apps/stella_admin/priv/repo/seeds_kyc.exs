# Script for populating the database with test KYC records. You can run it as:
#
#     mix run priv/repo/seeds_kyc.exs

alias StellaAdmin.Repo
alias StellaAdmin.Auth.{User, KycRecord}

IO.puts("Creating test KYC records...")

# Get existing users to attach KYC records to
users = Repo.all(User) |> Enum.take(8)

if Enum.empty?(users) do
  IO.puts("❌ No users found! Please run seeds_users.exs first.")
  System.halt(1)
end

# KYC Record 1 - Pending, Basic Level
%KycRecord{}
|> KycRecord.changeset(%{
  user_id: Enum.at(users, 0).id,
  status: :pending,
  level: :basic,
  provider: "Onfido",
  provider_reference_id: "onfido_#{:rand.uniform(100000)}",
  document_type: "passport",
  document_country: "US",
  document_number: "P12345678",
  document_expiry: ~D[2028-06-15],
  document_path: "/uploads/kyc/documents/passport_001.pdf",
  passport_photo_path: "/uploads/kyc/photos/selfie_001.jpg",
  submitted_first_name: "Sarah",
  submitted_last_name: "Chen",
  submitted_phone: "+1-555-0101",
  submitted_country: "US",
  submitted_city: "San Francisco",
  verification_score: Decimal.new("0.95"),
  risk_rating: "low",
  extracted_metadata: %{
    document_mrz: "P<USACHEN<<SARAH<<<<<<<<<<<<<<<<<<<<<<<",
    document_issuer: "United States Department of State"
  },
  validation_details: %{
    face_match_score: 0.96,
    document_authenticity: "verified",
    liveness_check: "passed"
  },
  submitted_at: DateTime.utc_now() |> DateTime.add(-2, :day),
  metadata: %{}
})
|> Repo.insert!()

# KYC Record 2 - Pending, Standard Level
%KycRecord{}
|> KycRecord.changeset(%{
  user_id: Enum.at(users, 1).id,
  status: :pending,
  level: :standard,
  provider: "Jumio",
  provider_reference_id: "jumio_#{:rand.uniform(100000)}",
  document_type: "drivers_license",
  document_country: "CA",
  document_number: "DL987654321",
  document_expiry: ~D[2027-12-31],
  document_path: "/uploads/kyc/documents/dl_002.pdf",
  passport_photo_path: "/uploads/kyc/photos/selfie_002.jpg",
  submitted_first_name: "Michael",
  submitted_last_name: "Torres",
  submitted_phone: "+1-555-0102",
  submitted_country: "CA",
  submitted_city: "Toronto",
  verified_name: "Michael Torres",
  verified_dob: ~D[1988-03-15],
  verified_address: %{
    street: "123 Main St",
    city: "Toronto",
    province: "ON",
    postal_code: "M5H 2N2",
    country: "CA"
  },
  verification_score: Decimal.new("0.92"),
  risk_rating: "low",
  extracted_metadata: %{
    license_class: "G",
    restrictions: "none"
  },
  validation_details: %{
    face_match_score: 0.94,
    document_authenticity: "verified",
    address_verified: true
  },
  submitted_at: DateTime.utc_now() |> DateTime.add(-1, :day),
  metadata: %{}
})
|> Repo.insert!()

# KYC Record 3 - In Review, Enhanced Level
%KycRecord{}
|> KycRecord.changeset(%{
  user_id: Enum.at(users, 2).id,
  status: :in_review,
  level: :enhanced,
  provider: "Onfido",
  provider_reference_id: "onfido_#{:rand.uniform(100000)}",
  document_type: "passport",
  document_country: "GB",
  document_number: "GB7894561230",
  document_expiry: ~D[2029-09-20],
  document_path: "/uploads/kyc/documents/passport_003.pdf",
  passport_photo_path: "/uploads/kyc/photos/selfie_003.jpg",
  submitted_first_name: "Emma",
  submitted_last_name: "Wilson",
  submitted_phone: "+1-555-0103",
  submitted_country: "GB",
  submitted_city: "London",
  verified_name: "Emma Wilson",
  verified_dob: ~D[1992-07-22],
  verified_address: %{
    street: "45 Baker Street",
    city: "London",
    postal_code: "NW1 6XE",
    country: "GB"
  },
  verification_score: Decimal.new("0.98"),
  risk_rating: "very_low",
  extracted_metadata: %{
    nationality: "British",
    place_of_birth: "London, UK"
  },
  validation_details: %{
    face_match_score: 0.97,
    document_authenticity: "verified",
    pep_check: "clear",
    sanctions_check: "clear",
    adverse_media: "clear"
  },
  submitted_at: DateTime.utc_now() |> DateTime.add(-3, :hour),
  metadata: %{
    enhanced_due_diligence: true,
    source_of_funds: "employment"
  }
})
|> Repo.insert!()

# KYC Record 4 - Pending, Basic Level (Low Score)
%KycRecord{}
|> KycRecord.changeset(%{
  user_id: Enum.at(users, 3).id,
  status: :pending,
  level: :basic,
  provider: "Jumio",
  provider_reference_id: "jumio_#{:rand.uniform(100000)}",
  document_type: "national_id",
  document_country: "KR",
  document_number: "KR123456789",
  document_expiry: ~D[2026-05-10],
  document_path: "/uploads/kyc/documents/national_id_004.pdf",
  passport_photo_path: "/uploads/kyc/photos/selfie_004.jpg",
  submitted_first_name: "James",
  submitted_last_name: "Park",
  submitted_phone: "+1-555-0104",
  submitted_country: "KR",
  submitted_city: "Seoul",
  verification_score: Decimal.new("0.72"),
  risk_rating: "medium",
  extracted_metadata: %{},
  validation_details: %{
    face_match_score: 0.75,
    document_authenticity: "needs_review",
    quality_issues: ["blurry_photo", "glare_on_document"]
  },
  submitted_at: DateTime.utc_now() |> DateTime.add(-5, :hour),
  notes: "Document quality issues detected - needs manual review",
  metadata: %{}
})
|> Repo.insert!()

# KYC Record 5 - In Review, Standard Level
%KycRecord{}
|> KycRecord.changeset(%{
  user_id: Enum.at(users, 5).id,
  status: :in_review,
  level: :standard,
  provider: "Onfido",
  provider_reference_id: "onfido_#{:rand.uniform(100000)}",
  document_type: "passport",
  document_country: "IN",
  document_number: "IN45678912",
  document_expiry: ~D[2027-11-30],
  document_path: "/uploads/kyc/documents/passport_005.pdf",
  passport_photo_path: "/uploads/kyc/photos/selfie_005.jpg",
  submitted_first_name: "Alex",
  submitted_last_name: "Kumar",
  submitted_phone: "+1-555-0107",
  submitted_country: "IN",
  submitted_city: "Mumbai",
  verified_name: "Alex Kumar",
  verified_dob: ~D[1990-11-08],
  verification_score: Decimal.new("0.89"),
  risk_rating: "low",
  extracted_metadata: %{
    nationality: "Indian"
  },
  validation_details: %{
    face_match_score: 0.91,
    document_authenticity: "verified"
  },
  submitted_at: DateTime.utc_now() |> DateTime.add(-6, :hour),
  metadata: %{}
})
|> Repo.insert!()

# KYC Record 6 - Approved, Enhanced Level (Historical)
%KycRecord{}
|> KycRecord.changeset(%{
  user_id: Enum.at(users, 4).id,
  status: :approved,
  level: :enhanced,
  provider: "Onfido",
  provider_reference_id: "onfido_#{:rand.uniform(100000)}",
  document_type: "passport",
  document_country: "MX",
  document_number: "MX789456123",
  document_expiry: ~D[2028-08-15],
  document_path: "/uploads/kyc/documents/passport_006.pdf",
  passport_photo_path: "/uploads/kyc/photos/selfie_006.jpg",
  submitted_first_name: "Maria",
  submitted_last_name: "Garcia",
  submitted_phone: "+1-555-0105",
  submitted_country: "MX",
  submitted_city: "Mexico City",
  verified_name: "Maria Garcia",
  verified_dob: ~D[1985-10-12],
  verified_address: %{
    street: "Av. Reforma 123",
    city: "Mexico City",
    postal_code: "06600",
    country: "MX"
  },
  verification_score: Decimal.new("0.96"),
  risk_rating: "low",
  extracted_metadata: %{
    nationality: "Mexican"
  },
  validation_details: %{
    face_match_score: 0.95,
    document_authenticity: "verified",
    pep_check: "clear",
    sanctions_check: "clear"
  },
  submitted_at: DateTime.utc_now() |> DateTime.add(-5, :day),
  reviewed_at: DateTime.utc_now() |> DateTime.add(-4, :day),
  reviewed_by: nil,
  notes: "All checks passed. Enhanced due diligence completed.",
  metadata: %{
    enhanced_due_diligence: true
  }
})
|> Repo.insert!()

# KYC Record 7 - Rejected (Historical)
%KycRecord{}
|> KycRecord.changeset(%{
  user_id: Enum.at(users, 6).id,
  status: :rejected,
  level: :basic,
  provider: "Jumio",
  provider_reference_id: "jumio_#{:rand.uniform(100000)}",
  document_type: "drivers_license",
  document_country: "FR",
  document_number: "FR123456",
  document_expiry: ~D[2025-12-31],
  document_path: "/uploads/kyc/documents/dl_007.pdf",
  passport_photo_path: "/uploads/kyc/photos/selfie_007.jpg",
  submitted_first_name: "Sophie",
  submitted_last_name: "Martin",
  submitted_phone: "+1-555-0108",
  submitted_country: "FR",
  submitted_city: "Paris",
  verification_score: Decimal.new("0.45"),
  risk_rating: "high",
  extracted_metadata: %{},
  validation_details: %{
    face_match_score: 0.52,
    document_authenticity: "failed",
    issues: ["poor_quality", "document_expired", "face_mismatch"]
  },
  submitted_at: DateTime.utc_now() |> DateTime.add(-3, :day),
  reviewed_at: DateTime.utc_now() |> DateTime.add(-2, :day),
  reviewed_by: nil,
  rejection_reason: "Document appears to be expired and face match score is below threshold. Please resubmit with a valid, current ID document and clearer selfie photo.",
  metadata: %{}
})
|> Repo.insert!()

# KYC Record 8 - Pending, Enhanced Level (VIP User)
%KycRecord{}
|> KycRecord.changeset(%{
  user_id: Enum.at(users, 7).id,
  status: :pending,
  level: :enhanced,
  provider: "Onfido",
  provider_reference_id: "onfido_#{:rand.uniform(100000)}",
  document_type: "passport",
  document_country: "CN",
  document_number: "CN987654321",
  document_expiry: ~D[2030-01-15],
  document_path: "/uploads/kyc/documents/passport_008.pdf",
  passport_photo_path: "/uploads/kyc/photos/selfie_008.jpg",
  submitted_first_name: "David",
  submitted_last_name: "Lee",
  submitted_phone: "+1-555-0106",
  submitted_country: "CN",
  submitted_city: "Shanghai",
  verified_name: "David Lee",
  verified_dob: ~D[1982-05-20],
  verified_address: %{
    street: "No. 1000 Century Avenue",
    city: "Shanghai",
    postal_code: "200120",
    country: "CN"
  },
  verification_score: Decimal.new("0.99"),
  risk_rating: "very_low",
  extracted_metadata: %{
    nationality: "Chinese",
    place_of_birth: "Shanghai, China"
  },
  validation_details: %{
    face_match_score: 0.99,
    document_authenticity: "verified",
    pep_check: "clear",
    sanctions_check: "clear",
    adverse_media: "clear",
    wealth_verification: "verified"
  },
  submitted_at: DateTime.utc_now() |> DateTime.add(-30, :minute),
  metadata: %{
    enhanced_due_diligence: true,
    vip_applicant: true,
    source_of_wealth: "business ownership",
    estimated_net_worth: "> $1M"
  }
})
|> Repo.insert!()

IO.puts("✅ Created 8 test KYC records successfully!")
IO.puts("")
IO.puts("KYC Records breakdown:")
IO.puts("- Pending: 4 (including 1 VIP, 1 with quality issues)")
IO.puts("- In Review: 2")
IO.puts("- Approved: 1 (historical)")
IO.puts("- Rejected: 1 (historical)")
IO.puts("")
IO.puts("Level distribution:")
IO.puts("- Basic: 3")
IO.puts("- Standard: 2")
IO.puts("- Enhanced: 3")
IO.puts("")
IO.puts("Providers:")
IO.puts("- Onfido: 5")
IO.puts("- Jumio: 3")
