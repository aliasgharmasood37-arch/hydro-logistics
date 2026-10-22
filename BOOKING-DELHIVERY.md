# Booking on Delhivery — the second courier

**Only three reasons to be on this page:**

1. **XpressBees answered `Destination Pincode Not Servicable.`** — then Delhivery is the only
   option and you do not need to ask.
2. **Ali said Delhivery** for that order.
3. The parcel is **already on Delhivery** — a cancel, a rebook, a return, a label.

Anything else goes on XpressBees. If you are here because XpressBees looked inconvenient, go
back to `BOOKING-XPRESSBEES.md`.

---

## ⚠ The one difference that matters

**The Delhivery booking tool has no dry run. It books the moment it runs.**

```
node scripts/_book1.mjs 2153                  # THIS BOOKS. There is no preview.
node scripts/_book1.mjs 2153 30 20 15         # with the carton, in cm
```

XpressBees shows you the plan first; Delhivery does not. So the order has to be checked
**before** the command, not after. Ask Claude to do the three checks below and read them out,
then book. Never let it run `_book1.mjs` as a "let's see what it says" step.

Claude must not use `flow1.mjs` or `batch30.mjs` for a real booking — they still carry the old
money logic and have no bad-address gate.

---

## The three checks, before the command

**1 · Is the pincode actually bookable?**

```
node scripts/_pin.mjs <pincode>
```

Every flag can read green and the pincode can still be blocked. What decides it is the
**remarks** field: empty means serviceable, **`Embargo`** means refused no matter how green the
rest looks. This is not theoretical — order #1637 looked perfect and the booking failed on it.

**2 · What will it cost?** Delhivery quotes air and surface separately (`md=E` is air, `md=S` is
surface, origin always 400010). Ask for both and use surface unless Ali says otherwise. Two
things to know:

- the **COD fee is the greater of ₹40 and 2%** of the collected amount, not a flat 2%;
- the quote is **provisional**. The hub re-weighs every parcel and has re-billed **8% to 55%
  higher, every single time**. So the quote is a floor, not a price.

**3 · Is it already booked?** Delhivery **does not reject a duplicate order id.** It silently
creates a second shipment and charges for it — this happened twice in one day. Claude checks the
order reference first, and also checks the *status* of anything it finds: a **cancelled**
shipment still occupies the reference, which is why a rebooking goes out as `2153-R`.

---

## Everything else is the same as XpressBees

The money rules, the box rules, the bad-address gate, COD verification, Amazon never being
booked, the landmark in the address, finishing the job in the same run (label, Shopify
fulfilment, Ledger row, Multipack sheet) — all identical. `BOOKING-XPRESSBEES.md` covers them,
and `playbooks/AWB.md` in the project root is the full reference.

Two Delhivery-specific traps worth knowing, because they look like success:

- **A `201` response means "queued", not "accepted".** The result has to be read back.
- **Failures come back as HTTP 200.** What matters is the **per-package status**, not the
  top-level "success" field. Claude knows this; you will see it quoting a per-package status
  back to you, and that is the one to trust.

---

## Cancel, rebook, labels

```
node scripts/cancelmulti.mjs <waybill>        # cancels the shipment AND the Shopify fulfilment
```

A cancelled waybill's reference stays taken, so the rebooking uses `2153-R`.

**Labels: Delhivery's own PDF is always A4**, which is wrong for the 4×6 thermal printer. Ask
Claude for the 4×6 version — there is a renderer for it. Do not print the A4 one.

---

## When a parcel never gets collected

A pickup that fails four times auto-closes on day five or six and **the full freight is credited
back**. The waybill can still be revived. If you see a parcel sitting at "not picked" for days,
raise it rather than rebooking it — a rebooking spends money the refund was about to return.
