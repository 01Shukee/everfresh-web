import type { Category, MenuItem, Order } from "./types";

/** Storage contract. MemoryRepo (tests/dev) and PrismaRepo (PostgreSQL) both implement it. */
export interface Repo {
  listCategories(): Promise<Category[]>;
  getCategory(id: string): Promise<Category | null>;
  saveCategory(c: Category): Promise<void>;
  deleteCategory(id: string): Promise<void>;
  listItems(): Promise<MenuItem[]>;
  getItem(id: string): Promise<MenuItem | null>;
  saveItem(i: MenuItem): Promise<void>;
  deleteItem(id: string): Promise<void>;
  findOrderByKey(key: string): Promise<Order | null>;
  findOrderByNumber(n: string): Promise<Order | null>;
  findOrderByReference(ref: string): Promise<Order | null>;
  findOrderByChargeId(id: string): Promise<Order | null>;
  /** Insert; must throw UniqueViolation if idempotencyKey or orderNumber already exists. */
  createOrder(o: Order): Promise<void>;
  saveOrder(o: Order): Promise<void>;
  listOrders(opts?: { status?: string; limit?: number }): Promise<Order[]>;
  deleteOrder(id: string): Promise<void>;
  /** true if the event id is new (and is now recorded); false if already processed. */
  markEventSeen(id: string, type: string): Promise<boolean>;
  /** Forget an event id (used when processing failed, so the provider's retry is processed instead of being dropped as a duplicate). */
  unmarkEvent(id: string): Promise<void>;
  /** Run fn while holding an exclusive lock on key (serialises read-modify-write on one order/application/invoice/enquiry). Do not nest the same key. */
  withLock<T>(key: string, fn: () => Promise<T>): Promise<T>;
  /** Generic document store (vocational studies, content, media). docCreate throws UniqueViolation if the id exists. */
  docGet<T>(col: string, id: string): Promise<T | null>;
  docCreate(col: string, id: string, data: unknown): Promise<void>;
  docPut(col: string, id: string, data: unknown): Promise<void>;
  docList<T>(col: string): Promise<T[]>;
  docDelete(col: string, id: string): Promise<void>;
}
export class UniqueViolation extends Error {}

export class MemoryRepo implements Repo {
  private cats = new Map<string, Category>(); private items = new Map<string, MenuItem>();
  private orders = new Map<string, Order>(); private events = new Set<string>();
  private c = <T,>(v: T): T => structuredClone(v);
  async listCategories() { return [...this.cats.values()].sort((a, b) => a.sort - b.sort).map(this.c); }
  async getCategory(id: string) { const v = this.cats.get(id); return v ? this.c(v) : null; }
  async saveCategory(c: Category) { this.cats.set(c.id, this.c(c)); }
  async deleteCategory(id: string) { this.cats.delete(id); }
  async listItems() { return [...this.items.values()].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)).map(this.c); }
  async getItem(id: string) { const v = this.items.get(id); return v ? this.c(v) : null; }
  async saveItem(i: MenuItem) { this.items.set(i.id, this.c(i)); }
  async deleteItem(id: string) { this.items.delete(id); }
  private all() { return [...this.orders.values()]; }
  async findOrderByKey(k: string) { const v = this.all().find((o) => o.idempotencyKey === k); return v ? this.c(v) : null; }
  async findOrderByNumber(n: string) { const v = this.all().find((o) => o.orderNumber === n); return v ? this.c(v) : null; }
  async findOrderByReference(r: string) { const v = this.all().find((o) => o.attempts.some((a) => a.reference === r)); return v ? this.c(v) : null; }
  async findOrderByChargeId(id: string) { const v = this.all().find((o) => o.attempts.some((a) => a.chargeId === id)); return v ? this.c(v) : null; }
  async createOrder(o: Order) {
    if (this.all().some((x) => x.idempotencyKey === o.idempotencyKey || x.orderNumber === o.orderNumber)) throw new UniqueViolation("duplicate order");
    this.orders.set(o.id, this.c(o));
  }
  async saveOrder(o: Order) { this.orders.set(o.id, this.c(o)); }
  async deleteOrder(id: string) { this.orders.delete(id); }
  async listOrders(opts: { status?: string; limit?: number } = {}) {
    return this.all().filter((o) => !opts.status || o.status === opts.status).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, opts.limit ?? 100).map(this.c);
  }
  async markEventSeen(id: string) { if (this.events.has(id)) return false; this.events.add(id); return true; }
  async unmarkEvent(id: string) { this.events.delete(id); }
  private locks = new Map<string, Promise<unknown>>();
  async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve(); let release!: () => void; const gate = new Promise<void>((r) => (release = r)); const tail = prev.then(() => gate); this.locks.set(key, tail);
    await prev; try { return await fn(); } finally { release(); if (this.locks.get(key) === tail) this.locks.delete(key); }
  }
  private docs = new Map<string, unknown>();
  async docGet<T>(col: string, id: string) { const v = this.docs.get(`${col}/${id}`); return v === undefined ? null : (structuredClone(v) as T); }
  async docCreate(col: string, id: string, data: unknown) { const k = `${col}/${id}`; if (this.docs.has(k)) throw new UniqueViolation("duplicate doc"); this.docs.set(k, structuredClone(data)); }
  async docPut(col: string, id: string, data: unknown) { this.docs.set(`${col}/${id}`, structuredClone(data)); }
  async docList<T>(col: string) { return [...this.docs.entries()].filter(([k]) => k.startsWith(col + "/")).map(([, v]) => structuredClone(v) as T); }
  async docDelete(col: string, id: string) { this.docs.delete(`${col}/${id}`); }
}
