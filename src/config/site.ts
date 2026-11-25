// Single source for fixed business contact details.
export const site = {
  name: "Everfresh",
  legalName: "Everfresh Creations Ltd",
  tagline: "Always Fresh…",
  applicationFeeNaira: 5000,

  contact: {
    phone: "+234 816 742 6348" as string | null,
    whatsappDigits: "2348167426348" as string | null,

    vocationalPhone: "+234 703 688 5789" as string | null,
    vocationalWhatsappDigits: "2347036885789" as string | null,

    email: "everfreshvocationalinst@gmail.com" as string | null,

    address: null as string | null,
    hours: null as string | null,
    city: null as string | null,
    social: null as string | null,
  },
};

export const showPlaceholders =
  process.env.NEXT_PUBLIC_SHOW_PLACEHOLDERS !== "false";

export const nav = [
  { label: "Home", href: "/" },
  { label: "Order Food", href: "/order-food", cta: true },
  { label: "Vocational Studies", href: "/vocational-studies" },
  { label: "Event Catering", href: "/event-catering" },
  { label: "About Us", href: "/about" },
  { label: "Contact Us", href: "/contact" },
];