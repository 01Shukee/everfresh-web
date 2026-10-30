// UNVERIFIED against a live database in this build (Prisma could not be installed). Run `npx prisma migrate dev` then the app.
import { Prisma, PrismaClient } from "@prisma/client";
import { UniqueViolation, type Repo } from "./repo";
import type { Category, MenuItem, Order, PaymentAttempt } from "./types";

const g = globalThis as unknown as { __prisma?: PrismaClient };
const db = g.__prisma ?? (g.__prisma = new PrismaClient());
const iso = (d: Date) => d.toISOString();
const asItem = (r: any): MenuItem => ({ ...r, variants: r.variants as any, addOnGroups: r.addOnGroups as any, createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt) });
const asOrder = (r: any): Order => ({
  ...r, customer: r.customer, fulfilment: r.fulfilment, lines: r.lines, paidAt: r.paidAt ? iso(r.paidAt) : null, createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt),
  attempts: (r.attempts as any[]).sort((a, b) => a.createdAt - b.createdAt).map((a): PaymentAttempt => ({ ...a, createdAt: iso(a.createdAt) })),
});
const inc = { attempts: true } as const;

export class PrismaRepo implements Repo {
  listCategories = async () => (await db.category.findMany({ orderBy: { sort: "asc" } })) as Category[];
  getCategory = async (id: string) => (await db.category.findUnique({ where: { id } })) as Category | null;
  saveCategory = async (c: Category) => { await db.category.upsert({ where: { id: c.id }, create: c, update: c }); };
  deleteCategory = async (id: string) => { await db.category.delete({ where: { id } }); };
  listItems = async () => (await db.menuItem.findMany({ orderBy: [{ sort: "asc" }, { name: "asc" }] })).map(asItem);
  getItem = async (id: string) => { const r = await db.menuItem.findUnique({ where: { id } }); return r ? asItem(r) : null; };
  saveItem = async (i: MenuItem) => {
    const data = { ...i, variants: i.variants as any, addOnGroups: i.addOnGroups as any, createdAt: new Date(i.createdAt), updatedAt: new Date(i.updatedAt) };
    await db.menuItem.upsert({ where: { id: i.id }, create: data, update: data });
  };
  deleteItem = async (id: string) => { await db.menuItem.delete({ where: { id } }); };

  private one = async (where: Prisma.OrderWhereInput) => { const r = await db.order.findFirst({ where, include: inc }); return r ? asOrder(r) : null; };
  findOrderByKey = (k: string) => this.one({ idempotencyKey: k });
  findOrderByNumber = (n: string) => this.one({ orderNumber: n });
  findOrderByReference = (ref: string) => this.one({ attempts: { some: { reference: ref } } });
  findOrderByChargeId = (id: string) => this.one({ attempts: { some: { chargeId: id } } });

  private row = (o: Order) => {
    const { attempts, ...r } = o;
    return { ...r, customer: r.customer as any, fulfilment: r.fulfilment as any, lines: r.lines as any, paidAt: r.paidAt ? new Date(r.paidAt) : null, createdAt: new Date(r.createdAt), updatedAt: new Date(r.updatedAt) };
  };
  async createOrder(o: Order) {
    try { await db.order.create({ data: { ...this.row(o), attempts: { create: o.attempts.map((a) => ({ ...a, createdAt: new Date(a.createdAt) })) } } }); }
    catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new UniqueViolation("duplicate order"); throw e; }
  }
  async saveOrder(o: Order) {
    const { id, ...data } = this.row(o);
    await db.$transaction([
      db.order.update({ where: { id }, data }),
      ...o.attempts.map((a) => { const row = { ...a, createdAt: new Date(a.createdAt) }; return db.paymentAttempt.upsert({ where: { reference: a.reference }, create: { ...row, orderId: id }, update: row }); }),
    ]);
  }
  async deleteOrder(id: string) { await db.$transaction([db.paymentAttempt.deleteMany({ where: { orderId: id } }), db.order.deleteMany({ where: { id } })]); }
  async listOrders(opts: { status?: string; limit?: number } = {}) {
    return (await db.order.findMany({ where: opts.status ? { status: opts.status } : {}, orderBy: { createdAt: "desc" }, take: opts.limit ?? 100, include: inc })).map(asOrder);
  }
  async markEventSeen(id: string, type: string) {
    try { await db.webhookEvent.create({ data: { id, type } }); return true; }
    catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false; throw e; }
  }

  /** Postgres advisory lock held for the duration of fn (released automatically when the transaction ends, even on crash). */
  async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    return db.$transaction(async (tx) => { await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`; return fn(); }, { timeout: 30_000, maxWait: 10_000 });
  }
  async unmarkEvent(id: string) { await db.webhookEvent.deleteMany({ where: { id } }); }

  async docGet<T>(col: string, id: string) { const r = await db.doc.findUnique({ where: { collection_id: { collection: col, id } } }); return r ? (r.data as T) : null; }
  async docCreate(col: string, id: string, data: unknown) {
    try { await db.doc.create({ data: { collection: col, id, data: data as any } }); }
    catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new UniqueViolation("duplicate doc"); throw e; }
  }
  async docPut(col: string, id: string, data: unknown) { await db.doc.upsert({ where: { collection_id: { collection: col, id } }, create: { collection: col, id, data: data as any }, update: { data: data as any } }); }
  async docList<T>(col: string) { return (await db.doc.findMany({ where: { collection: col }, orderBy: { createdAt: "asc" } })).map((r) => r.data as T); }
  async docDelete(col: string, id: string) { await db.doc.deleteMany({ where: { collection: col, id } }); }
}
