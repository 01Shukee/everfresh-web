import { MenuBrowser } from "./MenuBrowser";
import type { OrderingPublic, PublicItem } from "./types";

export function OrderFoodView({ body }: { body: { categories: { id: string; name: string }[]; items: PublicItem[]; ordering: OrderingPublic } }) {
  return (
    <>
      <section className="food dark orderhead"><div className="wrap">
        <span className="lab chipl">Order Food</span>
        <h1 className="serif big">Hot, ripe, <span className="mk">just-made.</span></h1>
        <p className="panelp">Pick your dishes, then choose delivery or pickup at checkout. You can order now or schedule for later.</p>
      </div></section>
      <section className="wrap sec menuwrap"><MenuBrowser categories={body.categories} items={body.items} ordering={body.ordering} /></section>
    </>
  );
}
