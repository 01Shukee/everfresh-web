// Vocational Studies configuration. Only facts supplied by the business are set here; everything else is null/empty.
export const VARIANTS = [
  { id: "regular-3y", programme: "regular", label: "Regular Programme", durationLabel: "3 years", months: 36 },
  { id: "intensive-1m", programme: "intensive", label: "Intensive Programme", durationLabel: "1 month", months: 1 },
  { id: "intensive-3m", programme: "intensive", label: "Intensive Programme", durationLabel: "3 months", months: 3 },
  { id: "intensive-6m", programme: "intensive", label: "Intensive Programme", durationLabel: "6 months", months: 6 },
] as const;
export type VariantId = (typeof VARIANTS)[number]["id"];
export const variantById = (id: unknown) => VARIANTS.find((v) => v.id === id);

export const vocConfig = {
  // Stated by the business: N5,000, non-refundable, separate from tuition. Change only if the institution decides otherwise.
  applicationFee: { kobo: 500_000, nonRefundable: true, creditedToTuition: false },
  paymentTerms: null as string | null, // PLACEHOLDER: institution's payment terms, printed on invoices when set
  nextSteps: null as string | null, // PLACEHOLDER: what happens after an application is received (supplied by the institution)
  // Required/optional fields. Only name, phone, email and address are required until the institution says otherwise.
  form: { dobRequired: false, educationRequired: false, emergencyContactRequired: false },
};
