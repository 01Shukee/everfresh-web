
"use client";

import {
  CaptionsUploadButton,
  UploadButton,
  VideoUploadButton,
} from "./shared";
import { useCallback, useEffect, useState } from "react";
import { VARIANTS } from "@/config/vocational";
import { decimalToKobo, formatNaira } from "@/lib/money";
import {
  parseCourses,
  parseCurriculum,
  parseFees,
  parseLines,
  serializeCourses,
  serializeCurriculum,
  serializeFees,
} from "@/lib/voc-text";

const api = async (url: string, method = "GET", body?: unknown) => {
  const r = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (r.status === 401) {
    location.reload();
    throw new Error("Signed out");
  }

  return {
    ok: r.ok,
    json: await r.json().catch(() => ({})),
  };
};

const label = (s: string) => s.replace(/_/g, " ");

type Sub = "applications" | "programmes" | "institute" | "media";

export function AdminVoc() {
  const [sub, setSub] = useState<Sub>("applications");

  return (
    <div>
      <nav className="admin-tabs sub" aria-label="Vocational sections">
        {(
          ["applications", "programmes", "institute", "media"] as Sub[]
        ).map((s) => (
          <button
            key={s}
            className={sub === s ? "on" : ""}
            aria-pressed={sub === s}
            onClick={() => setSub(s)}
          >
            {s === "applications"
              ? "Applications and invoices"
              : s === "institute"
                ? "Institute details"
                : s === "programmes"
                  ? "Programmes and fees"
                  : "Photos, videos, testimonials"}
          </button>
        ))}
      </nav>

      {sub === "applications" && <Applications />}
      {sub === "programmes" && <Programmes />}
      {sub === "institute" && <Institute />}
      {sub === "media" && <Media />}
    </div>
  );
}

function Applications() {
  const [list, setList] = useState<any[] | null>(null);
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [det, setDet] = useState<any>(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = await api(
      `/api/admin/voc/applications${status ? `?status=${status}` : ""}`
    );
    if (r.ok) setList(r.json.applications);
  }, [status]);

  const loadDet = useCallback(async (ref: string) => {
    const r = await api(`/api/admin/voc/applications/${ref}`);
    if (r.ok) setDet(r.json);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (open) loadDet(open);
    else setDet(null);
  }, [open, loadDet]);

  const act = async (
    fn: () => Promise<{ ok: boolean; json: any }>,
    successMessage: string
  ) => {
    const r = await fn();
    setMsg(r.ok ? successMessage : r.json.error ?? "The action could not be completed.");

    if (open) await loadDet(open);
    await load();

    return r;
  };

  const [lines, setLines] = useState("tuition | Tuition | \n");
  const [due, setDue] = useState("");
  const [terms, setTerms] = useState("");
  const [pay, setPay] = useState({
    amount: "",
    ref: "",
    note: "",
  });

  const makeInvoice = async () => {
    const out: {
      kind: string;
      label: string;
      amountKobo: number;
    }[] = [];

    for (const line of parseLines(lines)) {
      const [kind, lab, amount] = line.split("|").map((x) => x.trim());
      const kobo = decimalToKobo(amount);

      if (kobo === null) {
        setMsg(
          `Invoice line "${line}" is incomplete. Use: category | description | amount in naira.`
        );
        return;
      }

      out.push({
        kind,
        label: lab,
        amountKobo: kobo,
      });
    }

    await act(
      () =>
        api(`/api/admin/voc/applications/${open}/invoices`, "POST", {
          lines: out,
          dueDate: due || undefined,
          paymentTerms: terms || undefined,
        }),
      "Draft invoice created."
    );
  };

  const changeStatus = (
    nextStatus: string,
    confirmation: string,
    successMessage: string
  ) => {
    if (!confirm(confirmation)) return;

    void act(
      () =>
        api(`/api/admin/voc/applications/${det.ref}`, "PATCH", {
          status: nextStatus,
        }),
      successMessage
    );
  };

  return (
    <section aria-labelledby="av">
      <div className="bar">
        <h2 id="av" className="serif">
          Student applications
        </h2>

        <label className="inl">
          <span className="sr">Filter applications</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">All applications</option>
            {[
              "draft",
              "awaiting_payment",
              "submitted",
              "under_review",
              "admitted",
              "not_admitted",
              "waitlisted",
              "withdrawn",
            ].map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>

        <button className="pill ghost sm" onClick={load}>
          Refresh
        </button>
      </div>

      {msg && (
        <p className="alert" role="status">
          {msg}
        </p>
      )}

      {!list ? (
        <p role="status">Loading applications…</p>
      ) : list.length === 0 ? (
        <div className="empty">
          <p className="serif empty-title">No applications found.</p>
        </div>
      ) : (
        <ul className="orders">
          {list.map((a) => (
            <li key={a.ref}>
              <button
                className="orow"
                aria-expanded={open === a.ref}
                onClick={() =>
                  setOpen(open === a.ref ? null : a.ref)
                }
              >
                <b>{a.ref}</b>
                <span>{a.name}</span>
                <span>{a.duration}</span>
                <span className="tag">{label(a.status)}</span>
                <span className={`tag pay-${a.paymentStatus}`}>
                  Application fee: {label(a.paymentStatus)}
                </span>
                <span className="small">{a.programme}</span>
              </button>

              {open === a.ref && det && (
                <div className="odetail">
                  <div>
                    <b>Student information</b>

                    <p>
                      {det.details.fullName}
                      <br />
                      {det.details.phone}
                      <br />
                      {det.details.email}
                      <br />
                      {det.details.address}
                      {det.details.dob ? (
                        <>
                          <br />
                          Date of birth: {det.details.dob}
                        </>
                      ) : null}
                    </p>

                    {det.details.education && (
                      <p>Previous education: {det.details.education}</p>
                    )}

                    {det.details.emergencyName && (
                      <p>
                        Emergency contact: {det.details.emergencyName},{" "}
                        {det.details.emergencyPhone}
                      </p>
                    )}

                    {det.details.additional && (
                      <p>Additional information: {det.details.additional}</p>
                    )}

                    <b>
                      {det.programme}, {det.duration}
                      {det.course ? ` · ${det.course}` : ""}
                    </b>

                    <div className="acts">
                      {det.status === "submitted" && (
                        <button
                          className="pill sm"
                          onClick={() =>
                            void act(
                              () =>
                                api(
                                  `/api/admin/voc/applications/${det.ref}`,
                                  "PATCH",
                                  { status: "under_review" }
                                ),
                              "Application moved to review."
                            )
                          }
                        >
                          Start review
                        </button>
                      )}

                      {det.payment.status === "paid" &&
                        ["submitted", "under_review", "waitlisted"].includes(
                          det.status
                        ) && (
                          <>
                            <button
                              className="pill sm"
                              onClick={() =>
                                changeStatus(
                                  "admitted",
                                  `Accept ${det.details.fullName} into ${det.programme}? This will create the school-fees invoice and send an admission email.`,
                                  "Student accepted. The invoice and admission email will be processed."
                                )
                              }
                            >
                              Accept student
                            </button>

                            {det.status !== "waitlisted" && (
                              <button
                                className="pill ghost sm"
                                onClick={() =>
                                  changeStatus(
                                    "waitlisted",
                                    "Place this application on the waiting list?",
                                    "Application added to the waiting list."
                                  )
                                }
                              >
                                Add to waiting list
                              </button>
                            )}

                            <button
                              className="pill ghost sm"
                              onClick={() =>
                                changeStatus(
                                  "not_admitted",
                                  "Decline this application? The applicant's status will be updated.",
                                  "Application declined."
                                )
                              }
                            >
                              Decline
                            </button>
                          </>
                        )}

                      {det.status === "not_admitted" && (
                        <button
                          className="pill sm"
                          onClick={() =>
                            void act(
                              () =>
                                api(
                                  `/api/admin/voc/applications/${det.ref}`,
                                  "PATCH",
                                  { status: "under_review" }
                                ),
                              "Application reopened for review."
                            )
                          }
                        >
                          Reopen review
                        </button>
                      )}

                      {!["withdrawn", "admitted"].includes(det.status) && (
                        <button
                          className="pill ghost sm"
                          onClick={() =>
                            changeStatus(
                              "withdrawn",
                              "Withdraw this application? This action cannot be undone from the dashboard.",
                              "Application withdrawn."
                            )
                          }
                        >
                          Withdraw application
                        </button>
                      )}
                    </div>

                    {det.payment.status !== "paid" ? (
                      <p className="small">
                        The application-form fee has not yet been verified.
                        You can review the application, but admission decisions
                        are available after payment is confirmed.
                      </p>
                    ) : (
                      <p className="small">
                        Accepting a student automatically creates the
                        school-fees invoice and sends an admission email.
                      </p>
                    )}
                  </div>

                  <div>
                    <b>
                      Application-form fee: {label(det.payment.status)}
                    </b>

                    <ul className="small">
                      {det.payment.attempts.map((x: any) => (
                        <li key={x.reference}>
                          {x.reference}: {x.status}
                          {x.chargeId ? ` (${x.chargeId})` : ""}
                          {x.error ? ` – ${x.error}` : ""}
                        </li>
                      ))}
                    </ul>

                    <b>Receipts</b>
                    <ul className="small">
                      {det.receipts.map((r: any) => (
                        <li key={r.number}>
                          <a
                            href={`/api/admin/voc/receipts/${r.number}/pdf`}
                            target="_blank"
                            rel="noopener"
                          >
                            {r.number}
                          </a>{" "}
                          {formatNaira(r.amountKobo)} (
                          {r.kind === "application_fee"
                            ? "application fee"
                            : r.invoiceNumber}
                          )
                        </li>
                      ))}

                      {det.receipts.length === 0 && <li>No receipts yet.</li>}
                    </ul>

                    <b>Application history</b>
                    <ul className="small notes">
                      {det.notes.map((n: string, i: number) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <b>School-fees invoices</b>

                    {det.invoices.map((i: any) => (
                      <div key={i.number} className="inv">
                        <header>
                          <b>{i.number}</b>
                          <span className="tag">
                            {i.state.replace("_", " ")}
                          </span>
                        </header>

                        <p className="small">
                          Total {formatNaira(i.totals.totalKobo)} · paid{" "}
                          {formatNaira(i.totals.paidKobo)} ·{" "}
                          <b>
                            outstanding{" "}
                            {formatNaira(i.totals.outstandingKobo)}
                          </b>
                        </p>

                        <div className="acts">
                          <a
                            className="linkbtn"
                            href={`/api/admin/voc/invoices/${i.number}/pdf`}
                            target="_blank"
                            rel="noopener"
                          >
                            View PDF
                          </a>

                          {i.state === "draft" && (
                            <button
                              className="pill sm"
                              onClick={() =>
                                act(
                                  () =>
                                    api(
                                      `/api/admin/voc/invoices/${i.number}`,
                                      "PUT",
                                      { action: "issue" }
                                    ),
                                  "Invoice issued."
                                )
                              }
                            >
                              Issue invoice
                            </button>
                          )}

                          {(i.state === "draft" ||
                            (i.state === "unpaid" &&
                              i.payments.length === 0)) && (
                            <button
                              className="pill ghost sm"
                              onClick={() =>
                                confirm("Void this invoice?") &&
                                act(
                                  () =>
                                    api(
                                      `/api/admin/voc/invoices/${i.number}`,
                                      "PUT",
                                      { action: "void" }
                                    ),
                                  "Invoice voided."
                                )
                              }
                            >
                              Void invoice
                            </button>
                          )}
                        </div>

                        {(i.state === "unpaid" ||
                          i.state === "part_paid") && (
                          <form
                            className="inl-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              const k = decimalToKobo(pay.amount);

                              if (k === null) {
                                setMsg("Enter a valid payment amount in naira.");
                                return;
                              }

                              void act(
                                () =>
                                  api(
                                    `/api/admin/voc/invoices/${i.number}/payments`,
                                    "POST",
                                    {
                                      amountKobo: k,
                                      reference: pay.ref,
                                      note: pay.note,
                                    }
                                  ),
                                "Payment recorded and receipt issued."
                              );
                            }}
                          >
                            <div className="field">
                              <label>Record payment (₦)</label>
                              <input
                                value={pay.amount}
                                onChange={(e) =>
                                  setPay({ ...pay, amount: e.target.value })
                                }
                                placeholder="Amount received"
                              />
                            </div>

                            <div className="field">
                              <label>Bank or teller reference</label>
                              <input
                                value={pay.ref}
                                onChange={(e) =>
                                  setPay({ ...pay, ref: e.target.value })
                                }
                                placeholder="Payment reference"
                              />
                            </div>

                            <button className="pill sm">Record payment</button>
                          </form>
                        )}
                      </div>
                    ))}

                    <div className="field">
                      <label htmlFor="il">
                        New invoice lines
                      </label>
                      <textarea
                        id="il"
                        rows={4}
                        value={lines}
                        onChange={(e) => setLines(e.target.value)}
                      />
                      <p className="hint">
                        Enter one item per line in this format:
                        <br />
                        tuition | Tuition | 150000
                        <br />
                        accommodation | Hostel | 50000
                        <br />
                        other | Materials | 10000
                      </p>
                    </div>

                    <div className="grid-f2">
                      <div className="field">
                        <label htmlFor="id">Due date</label>
                        <input
                          id="id"
                          type="date"
                          value={due}
                          onChange={(e) => setDue(e.target.value)}
                        />
                      </div>

                      <div className="field">
                        <label htmlFor="it">Payment terms</label>
                        <input
                          id="it"
                          value={terms}
                          onChange={(e) => setTerms(e.target.value)}
                          placeholder="Example: Pay within 14 days"
                        />
                      </div>
                    </div>

                    <button className="pill sm" onClick={makeInvoice}>
                      Create draft invoice
                    </button>

                    <p className="small">
                      The application-form fee is separate and is never added
                      to the school-fees invoice.
                    </p>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Programmes() {
  const [vid, setVid] = useState<string>(VARIANTS[0].id);
  const [f, setF] = useState<any>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api(`/api/admin/voc/content/${vid}`).then((r) => {
      const c = r.json;

      setF({
        open: c.open,
        published: c.published,
        summary: c.summary ?? "",
        intakeNote: c.intakeNote ?? "",
        courses: serializeCourses(c.courses),
        choose: String(c.choose ?? 0),
        curriculum: serializeCurriculum(c.curriculum),
        requirements: c.requirements.join("\n"),
        benefits: c.benefits.join("\n"),
        fees: serializeFees(c.fees),
        acc:
          c.accommodation.available === null
            ? ""
            : String(c.accommodation.available),
        accNote: c.accommodation.note ?? "",
      });
    });

    setMsg("");
  }, [vid]);

  if (!f) return <p role="status">Loading programme details…</p>;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();

    const co = parseCourses(f.courses);
    const cu = parseCurriculum(f.curriculum);
    const fe = parseFees(f.fees);

    if (!co.ok) return setMsg(co.error);
    if (!cu.ok) return setMsg(cu.error);
    if (!fe.ok) return setMsg(fe.error);

    const r = await api(`/api/admin/voc/content/${vid}`, "PUT", {
      open: f.open,
      published: f.published,
      summary: f.summary,
      intakeNote: f.intakeNote,
      courses: co.value,
      choose: Math.max(0, Math.floor(Number(f.choose) || 0)),
      curriculum: cu.value,
      requirements: parseLines(f.requirements),
      benefits: parseLines(f.benefits),
      fees: fe.value.map((x) => ({ ...x, amountKobo: x.amountKobo })),
      accommodation: {
        available:
          f.acc === "" ? null : f.acc === "true",
        note: f.accNote,
      },
    });

    setMsg(r.ok ? "Programme details saved." : r.json.error ?? "Could not save.");
  };

  const T = (
    k: string,
    l: string,
    rows = 3,
    hint?: string
  ) => (
    <div className="field">
      <label htmlFor={k}>{l}</label>
      <textarea
        id={k}
        rows={rows}
        value={f[k]}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
      />
      {hint && <p className="hint">{hint}</p>}
    </div>
  );

  return (
    <section aria-labelledby="pv">
      <h2 id="pv" className="serif">
        Programmes and fees
      </h2>

      <div className="field">
        <label htmlFor="vsel">Programme option</label>
        <select
          id="vsel"
          value={vid}
          onChange={(e) => {
            setF(null);
            setVid(e.target.value);
          }}
        >
          {VARIANTS.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}, {v.durationLabel}
            </option>
          ))}
        </select>
      </div>

      {msg && <p className="alert" role="status">{msg}</p>}

      <form className="adminform" onSubmit={save}>
        <div className="checks">
          <label className="check">
            <input
              type="checkbox"
              checked={f.published}
              onChange={(e) =>
                setF({ ...f, published: e.target.checked })
              }
            />
            Show details on the website
          </label>

          <label className="check">
            <input
              type="checkbox"
              checked={f.open}
              onChange={(e) =>
                setF({ ...f, open: e.target.checked })
              }
            />
            Accepting applications
          </label>
        </div>

        {T("summary", "Programme overview", 3)}
        {T("intakeNote", "Intake or start-date note", 1)}

        {T(
          "courses",
          "Courses (one per line: Name | description)",
          5,
          "Add [choice] if students must choose this course. Add [price=150000] to set its price in naira."
        )}

        <div className="field">
          <label htmlFor="choose">
            How many optional courses must the applicant choose?
          </label>
          <input
            id="choose"
            type="number"
            min={0}
            max={10}
            value={f.choose}
            onChange={(e) =>
              setF({ ...f, choose: e.target.value })
            }
          />
          <p className="hint">
            Enter 0 if students do not need to choose any additional courses.
          </p>
        </div>

        {T("curriculum", "Curriculum", 6, "Use # before a module title, then - before each topic.")}
        {T("requirements", "Admission requirements (one per line)", 4)}
        {T("benefits", "Programme benefits (one per line)", 3)}

        {T(
          "fees",
          "Programme fees",
          8,
          "Enter one fee per line: Label | tuition/accommodation/other | amount in naira | note. Use [hostel], [day], [yearly] or [graduation] when applicable."
        )}

        <div className="grid-f2">
          <div className="field">
            <label htmlFor="acc">Accommodation</label>
            <select
              id="acc"
              value={f.acc}
              onChange={(e) =>
                setF({ ...f, acc: e.target.value })
              }
            >
              <option value="">Not stated</option>
              <option value="true">Accommodation available</option>
              <option value="false">Accommodation not offered</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="accNote">Accommodation note</label>
            <input
              id="accNote"
              value={f.accNote}
              onChange={(e) =>
                setF({ ...f, accNote: e.target.value })
              }
            />
          </div>
        </div>

        <button className="pill sm">Save programme details</button>
      </form>
    </section>
  );
}

function Institute() {
  const [f, setF] = useState<any>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api("/api/admin/voc/institute").then((r) =>
      setF({
        name: r.json.name ?? "",
        address: r.json.address ?? "",
        phones: (r.json.phones ?? []).join("\n"),
        note: r.json.note ?? "",
      })
    );
  }, []);

  if (!f) return <p role="status">Loading institute details…</p>;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();

    const r = await api("/api/admin/voc/institute", "PUT", {
      name: f.name,
      address: f.address,
      phones: parseLines(f.phones),
      note: f.note,
    });

    setMsg(r.ok ? "Institute details saved." : r.json.error ?? "Could not save.");
  };

  const I = (k: string, l: string, hint?: string) => (
    <div className="field">
      <label htmlFor={`i-${k}`}>{l}</label>
      <input
        id={`i-${k}`}
        value={f[k]}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
      />
      {hint && <p className="hint">{hint}</p>}
    </div>
  );

  return (
    <section aria-labelledby="ih">
      <h2 id="ih" className="serif">
        Institute details
      </h2>

      <p className="hint">
        These details appear at the bottom of emails and PDFs sent to students.
      </p>

      {msg && <p className="alert" role="status">{msg}</p>}

      <form className="adminform" onSubmit={save}>
        {I("name", "Institute name")}
        {I("address", "Institute address")}

        <div className="field">
          <label htmlFor="i-phones">
            Admissions phone numbers (one per line)
          </label>
          <textarea
            id="i-phones"
            rows={4}
            value={f.phones}
            onChange={(e) =>
              setF({ ...f, phones: e.target.value })
            }
          />
        </div>

        {I("note", "Additional information (optional)")}

        <button className="pill sm">Save institute details</button>
      </form>
    </section>
  );
}

function Media() {
  const [kind, setKind] = useState<
    "portfolio" | "video" | "testimonial"
  >("portfolio");

  const [items, setItems] = useState<any[]>([]);
  const [f, setF] = useState<any>({});
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = await api(`/api/admin/voc/media/${kind}`);
    if (r.ok) setItems(r.json.items);
  }, [kind]);

  useEffect(() => {
    load();
    setF({});
    setMsg("");
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();

    if (kind === "video" && !f.src) {
      setMsg("Please choose and upload a video before saving.");
      return;
    }

    const payload =
      kind === "video"
        ? { ...f, title: f.title?.trim() || "Training video" }
        : f;

    const r = await api(`/api/admin/voc/media/${kind}`, "POST", {
      ...payload,
      published: !!f.published,
      permission: !!f.permission,
    });

    setMsg(
      r.ok
        ? "Your item has been added."
        : r.json.error ?? "Could not add this item."
    );

    if (r.ok) setF({});
    await load();
  };

  const toggle = async (i: any) => {
    const r = await api(
      `/api/admin/voc/media/${kind}/${i.id}`,
      "PUT",
      { ...i, published: !i.published }
    );

    setMsg(
      r.ok
        ? "Website display setting updated."
        : r.json.error ?? "Could not update this item."
    );

    await load();
  };

  const I = (k: string, l: string) => (
    <div className="field">
      <label htmlFor={`m-${k}`}>{l}</label>
      <input
        id={`m-${k}`}
        value={f[k] ?? ""}
        onChange={(e) =>
          setF({ ...f, [k]: e.target.value })
        }
      />
    </div>
  );

  return (
    <section aria-labelledby="mv">
      <h2 id="mv" className="serif">
        Photos, videos and testimonials
      </h2>

      <p className="hint">
        Add photos of student work, training videos or student testimonials.
        You can save videos without captions or descriptions.
      </p>

      <div className="seg" role="radiogroup" aria-label="Content type">
        {(
          ["portfolio", "video", "testimonial"] as const
        ).map((k) => (
          <label
            key={k}
            className={kind === k ? "on" : ""}
          >
            <input
              type="radio"
              name="mk"
              checked={kind === k}
              onChange={() => setKind(k)}
            />
            {k === "portfolio"
              ? "Portfolio photos"
              : k === "video"
                ? "Training videos"
                : "Testimonials"}
          </label>
        ))}
      </div>

      {msg && <p className="alert" role="status">{msg}</p>}

      <form className="adminform" onSubmit={save}>
        <div className="grid-f">
          {kind === "portfolio" && (
            <>
              <div className="field">
                <label htmlFor="m-kind">Photo category</label>
                <select
                  id="m-kind"
                  value={f.kind ?? ""}
                  onChange={(e) =>
                    setF({ ...f, kind: e.target.value })
                  }
                >
                  <option value="">Choose a category</option>
                  <option value="project">Completed project</option>
                  <option value="student">Student work</option>
                  <option value="instructor">Instructor demonstration</option>
                  <option value="facility">Training facility</option>
                </select>
              </div>

              {I("title", "Photo title")}
              {I("imageUrl", "Photo path or URL")}

              <div className="field">
                <UploadButton
                  onUploaded={(u) =>
                    setF((current: any) => ({
                      ...current,
                      imageUrl: u,
                    }))
                  }
                />
              </div>

              {I("imageAlt", "Describe the photo")}
              {I("caption", "Photo caption (optional)")}
            </>
          )}

          {kind === "video" && (
            <>
              <div className="field">
                <label>Choose your video</label>

                <VideoUploadButton
                  onUploaded={(u) =>
                    setF((current: any) => ({
                      ...current,
                      src: u,
                    }))
                  }
                />

                {f.src && (
                  <p className="hint" role="status">
                    Video uploaded successfully.{" "}
                    <a
                      href={f.src}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Preview video
                    </a>
                  </p>
                )}

                <p className="hint">
                  Select an MP4 or WebM video from your computer.
                  You do not need to paste a video link.
                </p>
              </div>

              <div className="field">
                <label htmlFor="m-title">
                  Video title (optional)
                </label>
                <input
                  id="m-title"
                  value={f.title ?? ""}
                  onChange={(e) =>
                    setF({ ...f, title: e.target.value })
                  }
                  placeholder="Example: Cake decorating practical"
                />
              </div>

              <div className="field">
                <label htmlFor="m-description">
                  Description (optional)
                </label>
                <textarea
                  id="m-description"
                  rows={2}
                  value={f.description ?? ""}
                  onChange={(e) =>
                    setF({ ...f, description: e.target.value })
                  }
                  placeholder="Add a short explanation if you want."
                />
              </div>

              <div className="field">
                <label>Captions (optional)</label>

                <CaptionsUploadButton
                  onUploaded={(u) =>
                    setF((current: any) => ({
                      ...current,
                      captions: u,
                    }))
                  }
                />

                {f.captions && (
                  <p className="hint" role="status">
                    Captions uploaded.{" "}
                    <a
                      href={f.captions}
                      target="_blank"
                      rel="noreferrer"
                    >
                      View captions file
                    </a>
                  </p>
                )}

                <p className="hint">
                  You can skip captions and add them later.
                </p>
              </div>

              <div className="field">
                <label htmlFor="m-poster">
                  Preview image URL (optional)
                </label>
                <input
                  id="m-poster"
                  value={f.poster ?? ""}
                  onChange={(e) =>
                    setF({ ...f, poster: e.target.value })
                  }
                  placeholder="Paste an image link if available."
                />
              </div>
            </>
          )}

          {kind === "testimonial" && (
            <>
              {I("name", "Student or customer's name")}
              {I("relation", "Relationship (for example, past student)")}

              <div className="field">
                <label htmlFor="m-quote">Testimonial</label>
                <textarea
                  id="m-quote"
                  rows={3}
                  value={f.quote ?? ""}
                  onChange={(e) =>
                    setF({ ...f, quote: e.target.value })
                  }
                />
              </div>

              <label className="check">
                <input
                  type="checkbox"
                  checked={!!f.permission}
                  onChange={(e) =>
                    setF({ ...f, permission: e.target.checked })
                  }
                />
                I have permission to publish this testimonial.
              </label>
            </>
          )}
        </div>

        <label className="check">
          <input
            type="checkbox"
            checked={!!f.published}
            onChange={(e) =>
              setF({ ...f, published: e.target.checked })
            }
          />
          Show this item on the website
        </label>

        <div className="acts">
          <button className="pill sm">
            {kind === "video"
              ? "Save video"
              : kind === "portfolio"
                ? "Add photo"
                : "Add testimonial"}
          </button>
        </div>
      </form>

      {items.length === 0 ? (
        <div className="empty">
          <p className="serif empty-title">
            Nothing added yet.
          </p>
        </div>
      ) : (
        <table className="atable">
          <thead>
            <tr>
              <th>Item</th>
              <th>Website display</th>
              <th>
                <span className="sr">Actions</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>
                  <b>{i.title ?? i.name}</b>
                  {i.kind ? ` · ${i.kind}` : ""}
                </td>

                <td>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={i.published}
                      onChange={() => toggle(i)}
                      aria-label={`Show ${i.title ?? i.name} on the website`}
                    />
                  </label>
                </td>

                <td>
                  <button
                    className="linkbtn"
                    onClick={async () => {
                      if (
                        confirm(
                          "Delete this item permanently?"
                        )
                      ) {
                        await api(
                          `/api/admin/voc/media/${kind}/${i.id}`,
                          "DELETE"
                        );
                        await load();
                      }
                    }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
