# The day

Written for: Zahra. This is the running order. Everything in it is explained in the other
files; this one is just *when*.

---

## 1. Morning — the parts list arrives (10:00 IST)

An Excel called **Parts to Ready** lands in your email, from the Hydro Customs account. It is
every part that a paid order is waiting on, grouped by bike, with the team's own names for the
parts.

**The "Ready" column is the only thing you change.** Type how many of each part is *finished
and packed-ready*.

**It will not be empty.** A number already in a cell is stock you reported before that has
**not shipped yet**, carried over so you do not retype the same counts every morning.

> **Correct it to the true count. Do not add to it.**
> If it says `3` and there are still 3 on the shelf, leave it. If two went out in a parcel
> yesterday, change it to `1`. If the stock is gone, clear the cell.

Change nothing else in the file — the **SKU** column is what ties your count to an order.

## 2. Send it back

**Reply to that email with the filled file attached**, to **aliasgharmasood37@gmail.com**.
(Or send the file to **@Hydro_AWB_bot** on Telegram, if you have the bot — same result.)

Within a minute or two you get the **response sheet** back by email, and Ali gets it on
Telegram too.

## 3. Read the response sheet

Sections, in this order:

| Section | What it is |
|---|---|
| **REMOVE THE AWB — part-paid** | The customer paid the ₹49/₹99 token. **Book these.** The rider collects the balance shown |
| **REMOVE THE AWB — fully prepaid** | Already paid in full. **Book these.** Collect nothing |
| **CALL TO CONFIRM — COD** | Parts are made but the customer has not confirmed. **Never booked from this list.** They need the verification call first |
| **MULTIPACK — all parts ready, needs the packed carton** | Every part is made. One row per product, so you know what goes in the box. Pack it, **measure the carton**, then book it with those dimensions |
| **MULTIPACK — parts ready, COD not verified** | As above, but the call has to happen first |
| **MULTIPACK ADVICE — make these parts** | The orders that are only a part or two short, closest first, with `→ MAKE 2 x winglet` lines. **This is what to tell the workshop to build next** — each one releases a whole paid order |
| **SHORT — waiting on stock** | Single-item orders with the part not made yet |
| **⚠ BAD ADDRESS** | The address is known to be incomplete. Ring and fix it first; if you decide to ship anyway, Claude will spell out the cost and ask you to confirm — `CLAUDE.md` §3 |
| **TOTALS** | Freight and COD for the whole list |

## 4. Book them

**Nothing in that sheet is booked yet.** The sheet is a list, not an instruction that has been
carried out.

Book them through Claude Code, one or several at a time:

```
book 2301 2302          (from the prepaid / part-paid sections)
book 2304 40 30 20      (a multipack, with the carton you measured)
```

> **Do not reply "GO" to the Telegram bot to book a batch.** That path still books on
> **Delhivery**, and XpressBees is the default courier. Book from your folder instead, which
> uses XpressBees. If Ali asks you to use GO, that is his call.

Work the **part-paid and prepaid** sections first, then the multipacks you have cartons for.

## 5. The call sheets — twice a day

Open the **RTO & Urgent Call Sheet** and work your three columns (`Called?`, reason/outcome,
action). Details in `TRACKING-AND-STATUS.md`.

- **`Urgent`** first — those parcels are still live and can be saved.
- **`Bad Address`** next — ring, take the real address, type it into the sheet. It goes onto the
  order by itself at **2pm and 10pm**. Do not edit the order yourself.
- **`RTO`** — prepaid and part-paid parcels that came back. Each one is a question that needs
  asking; a parcel that was paid for and still returned usually has a reason worth knowing.

## 6. Before you close

- Every order you booked: label printed (**4×6**, not A4), AWB read back, fulfilment in Shopify.
- Any multipack you booked: its rows are **off** the Multipack Box Sizes sheet.
- Any custom order you booked: its row on the **Custom And Offline Orders** sheet has the AWB.
- Anything waiting on Ali: one message with the order, the problem, and the one question.

---

## What to tell Ali about, unasked

- a parcel stuck at "not picked" for more than two days;
- a **lost or damaged** parcel — the claim window is **72 hours** from the last scan;
- `Wallet balance is low` on either courier — bookings stop until it is recharged;
- a part on the **MULTIPACK ADVICE** list that keeps appearing day after day;
- anything the response sheet puts under **BAD ADDRESS** or **NOT SHIPPING**.
