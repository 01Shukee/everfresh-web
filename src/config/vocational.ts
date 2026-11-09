// Vocational Studies configuration. Only facts supplied by the business are set here; everything else is null/empty.
export const VARIANTS = [
  { id: "regular-3y", programme: "regular", label: "Regular Programme", durationLabel: "3 years", months: 36 },
  { id: "intensive-1m", programme: "intensive", label: "Intensive Programme", durationLabel: "1 month", months: 1 },
  { id: "intensive-3m", programme: "intensive", label: "Intensive Programme", durationLabel: "3 months", months: 3 },
  { id: "intensive-6m", programme: "intensive", label: "Intensive Programme", durationLabel: "6 months", months: 6 },
  { id: "intensive-1y", programme: "intensive", label: "Intensive Programme", durationLabel: "1 year", months: 12 },
  { id: "intensive-special", programme: "intensive", label: "Intensive Programme", durationLabel: "Special courses", months: 0 },
] as const;
export type VariantId = (typeof VARIANTS)[number]["id"];
export const variantById = (id: unknown) => VARIANTS.find((v) => v.id === id);

export const vocConfig = {
  // N5,000 enquiry (application-form) fee: non-refundable. Paying it unlocks the curriculum. It is deducted from the school fees once the applicant is accepted.
  applicationFee: { kobo: 500_000, nonRefundable: true, creditedToTuition: true },
  paymentTerms: null as string | null, // PLACEHOLDER: institution's payment terms, printed on invoices when set
  nextSteps: "Wait for an email from us confirming your acceptance. Your school fees can be paid only after you are accepted." as string | null,
  // Required/optional fields. Only name, phone, email and address are required until the institution says otherwise.
  form: { dobRequired: false, educationRequired: false, emergencyContactRequired: false },
};