export const telHref = (phone: string) =>
  `tel:${phone.replace(/[^\d+]/g, "")}`;

export const waHref = (digits: string, message?: string) =>
  `https://wa.me/${digits}${
    message ? `?text=${encodeURIComponent(message)}` : ""
  }`;

export const niceDigits = (digits: string) =>
  digits.length === 13 && digits.startsWith("234")
    ? `+${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`
    : `+${digits}`;