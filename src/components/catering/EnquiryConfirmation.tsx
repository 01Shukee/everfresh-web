"use client";
import { useEffect, useState } from "react";
import { formatNaira } from "@/lib/money";

export interface EnquiryView { ref: string; name: string; phone: string; email: string | null; eventType: string; eventDate: string; location: string; guests: number; style: string | null; menu: string | null; dietary: string | null; budgetKobo: number | null; additional: string | null; whatsapp: { configured: boolean; url: string | null; message: string; truncated: boolean; openedAt: string | null } }
const long = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return `${d} ${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1]} ${y}`; };

export function EnquiryConfirmation({ v, token, auto }: { v: EnquiryView; token: string; auto: boolean }) {
  const [count, setCount] = useState(auto && v.whatsapp.url ? 3 : 0); const [copied, setCopied] = useState(false); const [opened, setOpened] = useState(!!v.whatsapp.openedAt);
  const record = () => { setOpened(true); try { fetch(`/api/catering/enquiries/${v.ref}/whatsapp-opened`, { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) }); } catch { /* best effort */ } };
  useEffect(() => { if (count <= 0 || !v.whatsapp.url) return; const t = setTimeout(() => { if (count === 1) { record(); location.assign(v.whatsapp.url!); } setCount(count - 1); }, 1000); return () => clearTimeout(t); }, [count]); // eslint-disable-line
  const copy = async () => { try { await navigator.clipboard.writeText(v.whatsapp.message); setCopied(true); } catch { setCopied(false); } };
  const rows: [string, string | null][] = [["Name", v.name], ["Phone", v.phone], ["Email", v.email], ["Event type", v.eventType], ["Event date", long(v.eventDate)], ["Location", v.location], ["Guests", String(v.guests)], ["Catering style", v.style], ["Preferred menu", v.menu], ["Dietary requirements", v.dietary], ["Estimated budget", v.budgetKobo === null ? null : formatNaira(v.budgetKobo)], ["Additional information", v.additional]];
  return (
    <div className="enqconf">
      <div className="paybox ok" role="status"><b className="serif">Your request is saved</b><span>Reference <b>{v.ref}</b>. We have kept your details on our system.</span></div>
      <h2 className="serif">Next: send it to us on WhatsApp</h2>
      {v.whatsapp.configured && v.whatsapp.url ? (<>
        <ol className="steps"><li>Tap <b>Open WhatsApp</b>. Your message is already written.</li><li>In WhatsApp, <b>press Send</b>. The message is only transmitted when you do.</li><li>Keep your reference <b>{v.ref}</b>.</li></ol>
        {count > 0 && <p className="hint" role="status">Opening WhatsApp in {count}&hellip; <button className="linkbtn" onClick={() => setCount(0)}>Cancel</button></p>}
        <div className="acts"><a className="pill wa" href={v.whatsapp.url} target="_blank" rel="noopener" onClick={record}>Open WhatsApp <span className="dot" aria-hidden="true">&rarr;</span></a><button className="pill ghost" onClick={copy}>{copied ? "Message copied" : "Copy message"}</button></div>
        <p className="alert" role="note"><b>Opening WhatsApp does not send your request.</b> We can't tell whether you pressed Send, so please make sure the message shows as sent in your chat.{opened && " You've already opened WhatsApp from this page."}</p>
        <h3 className="lab green">Your message</h3><pre className="bubble">{v.whatsapp.message}</pre>{v.whatsapp.truncated && <p className="hint">Long text was shortened in the message only. Your full request is saved under {v.ref}.</p>}
      </>) : (<><div className="alert" role="alert"><b>WhatsApp isn&rsquo;t set up on this site yet.</b> Your request is saved under reference <b>{v.ref}</b>, but you can&rsquo;t send it from here. Please contact us directly and quote the reference.</div><button className="pill ghost" onClick={copy}>{copied ? "Message copied" : "Copy request text"}</button><pre className="bubble">{v.whatsapp.message}</pre></>)}
      <h3 className="lab green">Request details</h3><dl className="dl rows">{rows.filter(([, x]) => x).map(([k, x]) => <div key={k} className="dlrow"><dt>{k}</dt><dd>{x}</dd></div>)}</dl>
      <p className="small dim0">Bookmark this page to see these details again. A quotation is prepared from the information above; this page is not a booking or a price.</p>
    </div>
  );
}
