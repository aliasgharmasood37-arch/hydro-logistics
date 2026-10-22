# Booking on XpressBees — the normal way

**XpressBees is the default courier** (Ali, 2026-10-16). Every parcel goes here unless he names
Delhivery, or XpressBees cannot reach the pincode.

One command does the whole thing — find the order, check the money, quote the tiers, book,
save the label, fulfil in Shopify, write the Ledger:

```
node scripts/xb-book.mjs 2153                 # dry run — changes nothing
node scripts/xb-book.mjs 2153 --go            # books it
```

With a carton you measured, in centimetres:

```
node scripts/xb-book.mjs 1980 30 20 15        # dry run
node scripts/xb-book.mjs 1980 30 20 15 --go
```

The full reference, with every field and every trap that has cost money, is
`XPRESSBEES-API.md` **Part A** in the project root. This file is the operator's version.

---

## What to say

| Say | What Claude runs |
|---|---|
| `book 2153` · `awb 2153` · `remove the AWB for 2153` | `xb-book.mjs 2153`, dry run, then `--go` |
| `book 2153 2154 2155` | One at a time, carrying on past a failure |
| `book 1980 box 30 20 15` | With that carton (cm) |
| `book 1980 dims in inches 12 8 6` | Converts ×2.54, states both |
| `quote the freight for 2153` | The dry run only |
| `is 788104 serviceable?` | `xb-quote.mjs` — answers before you commit |
| `book 2153 by air` | Lets the Air tier compete. Surface otherwise, always |
| `give me the label for 2153` | The PDF saved at booking, in `labels/` |
| `cancel the shipment for 2153` | Cancels the waybill and the Shopify fulfilment |

---

## The ten things the tool checks, and what it means when it stops

**1 · The order.** Must exist in Shopify and have exactly one open unfulfilled card. It stops
on a cancelled order, on an **Amazon** order (those ship through Amazon Easy Ship — booking one
sends the parcel twice), and on an order that **already carries a tracking number**.

**2 · COD has to be verified.** Fully paid, part-paid (the ₹49/₹99 token received), or tagged
`✅ COD-Verified` / `COD Verified by Call`. An untagged COD order **stops** and asks you. Shipping it
anyway is your call, but an unconfirmed COD parcel is the most likely one to come straight
back as an RTO — the confirmation call is cheaper than the return freight.

**3 · The money.** Two different numbers, and they must not be mixed up:

| On the Shopify order page | Goes to XpressBees as |
|---|---|
| **Total** | the declared value (`order_amount`) |
| **Balance** | the amount the rider collects (`collectable_amount`) |
| Balance is zero | booked **prepaid**, collect nothing |

A part-paid order collects **only the balance**. Over-declaring the value on a COD parcel costs
real money — the COD fee is the greater of ₹34 and 1.8% of the declared value.

**4 · The box and the weight.** In priority order: the carton you typed → the product's own
saved dimensions → the catalogue. Centimetres. **Never rounded, never padded, never
consolidated into a standard box** — that was measured at +26% freight on every order.

XpressBees takes **whole centimetres only**, so a converted or decimal measurement is sent as
the **nearest** whole cm (not rounded up — that can push the parcel into the next price slab),
and Claude will tell you both numbers.

**Chargeable weight = whichever is bigger:** the real weight, or L×B×H÷5000. For these products
it is almost always the box. That is why the carton matters more than the part.

**More than one unit is a multipack** and needs the carton the parcel was actually packed in —
from the Multipack Box Sizes sheet, or measured. It will not guess one.

**5 · The address.** Name, address, landmark, city, state, 6-digit pincode, 10-digit mobile. It
stops on anything missing. The **landmark** matters — half these addresses have no house number
and it is what the rider navigates by.

**5a · Bad Address.** If the order is tagged `Bad Address` **and** the address does not score
complete, the tool refuses and prints the address as it stands, what is missing, and the
customer's phone.

**This one is yours to decide** (Ali, 2026-10-22) — but you will always be asked first, with
the cost spelled out: a failed delivery on a bad address is **~₹250 plus the outbound freight**,
and the customer still has no parcel. The better answer is usually to **ring the number and
take the real address** before booking. If you say ship it, it books with `--bad-address-ok`
and the report records that you authorised it.

Two things to know: the tag alone does not mean the address is bad — a few tagged orders are
perfectly complete and book normally. And **the tag can never be removed** (an app on the store
puts it back within ten seconds), so its absence never means "fixed".

**6 · Not already booked.** Shopify tracking, then Delhivery by order reference. Every booking
sends `unique_order_number: "yes"`, which is the only thing stopping XpressBees creating a
second parcel for the same order — it has no way to search by order number at all.

**7 · The price.** It quotes the real box against the tiers and takes the **cheapest surface**
one. Leaving the tier blank has cost ₹617 instead of ₹371 on a single parcel. Air only when Ali
asks.

**8 · Book. 9 · Read it back.** Booked only when the courier returns a waybill **and** tracking
answers for it. If the call times out, the order is looked up before any retry.

**10 · Finish the job, same run.** Label saved to `labels/`, Shopify fulfilment created with the
XpressBees tracking link (the customer gets Shopify's shipping email), Ledger row written. A
multipack's rows come **off** the Multipack Box Sizes sheet the same turn — a booked order left
sitting on that sheet gets measured, re-asked and re-booked.

---

## When it fails

| Message | What it means | What to do |
|---|---|---|
| `Destination Pincode Not Servicable.` | XpressBees does not reach there | Delhivery — `BOOKING-DELHIVERY.md`. No need to ask |
| `Wallet balance is low.` | The XpressBees wallet is empty. **Nothing was booked** | Tell Ali to recharge, then book again. Safe to retry |
| `Order number already in use.` | Already booked once under that reference — including a **cancelled** one, which stays taken | Rebook under a new reference (`2153-R`) |
| `The Package Length field must contain an integer.` | A decimal box slipped through | Nearest whole cm |
| `Consignee name is required` | The Shopify address is incomplete | Fix the address first |
| `Unable to cancel` | The rider already collected it | Ali decides on an RTO in the dashboard |

The courier's HTTP codes are unreliable — a validation error has come back as a 404. What counts
is the `status` field in the reply, which is why Claude reads it back rather than trusting the
call.

---

## Cancel, and rebook

```
node scripts/xb-cancel.mjs <awb>              # dry run
node scripts/xb-cancel.mjs <awb> --go
```

Cancelling before pickup is clean: the freight goes back to the wallet, and the Shopify
fulfilment is cancelled too. After pickup it refuses, and it becomes an RTO request on the
dashboard — Ali's decision.

**There is no way to edit a booked shipment.** Changing anything — the COD amount included —
means cancel and rebook, which is a new waybill and a dead label. And the old reference stays
taken, so the rebooking goes out as `2153-R`.

---

## What you get back

For each order: the customer, city and pincode · the products · the box, the dead weight, the
volumetric weight, the chargeable one and which dominates · the payment mode and the exact
amount to collect · the tier and its price · **the AWB and its tracking link, read back from
the courier** · confirmation the label, fulfilment, ledger and sheets are done · anything
skipped and why.

Check the amount to collect and the box against the parcel in front of you before you let it go
on the rider's scan.
