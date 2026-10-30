// Single source for business details. null = not supplied yet; the UI shows a labelled placeholder.
export const site = {
  name: "Everfresh",
  legalName: "Everfresh Creations Ltd",
  tagline: "Always Fresh\u2026",
  applicationFeeNaira: 5000, // stated by the business; non-refundable, separate from tuition
  contact: {
    phone: "+2348135571152" as string | null, // supplied by the business "for now"; editable in Admin > Website
    email: null as string | null,
    address: null as string | null,
    whatsappDigits: "2348135571152" as string | null, // international format, digits only; supplied "for now"
    hours: null as string | null,
    city: null as string | null,
    social: null as string | null,
  },
};

export const showPlaceholders = process.env.NEXT_PUBLIC_SHOW_PLACEHOLDERS !== "false";

export const nav = [
  { label: "Home", href: "/" },
  { label: "Order Food", href: "/order-food", cta: true },
  { label: "Vocational Studies", href: "/vocational-studies" },
  { label: "Event Catering", href: "/event-catering" },
  { label: "About Us", href: "/about" },
  { label: "Contact Us", href: "/contact" },
];
