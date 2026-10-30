import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { CartProvider } from "@/components/order/CartProvider";
import { CartDrawer } from "@/components/order/CartDrawer";
export const Shell = ({ children, s }: { children: React.ReactNode; s: any }) => (
  <CartProvider><a href="#main" className="skip">Skip to content</a><SiteHeader brand={{ name: s.business.name, emblemUrl: s.brand.emblemUrl }} /><main id="main">{children}</main><SiteFooter s={s} /><CartDrawer /></CartProvider>
);
