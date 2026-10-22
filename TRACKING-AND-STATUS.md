# "Where is it?" — tracking, failed deliveries, returns

Just ask, in whatever form you have it:

| Say | What you get |
|---|---|
| `where is 2153?` | Shopify first, then the courier that carries it: picked up or not, in transit, out for delivery, delivered, failed, returning |
| `is 2153 fulfilled?` | Whether the **AWB has been made** — that is what "fulfilled" means here. Not whether it arrived |
| `status 9876543210` | Every order on that phone number |
| `status <awb>` | Asked of both couriers, resolved back to its order |
| `where are 2153, 2154, 2160?` | All three in one go |
| `give me the label for 2153` | The saved 4×6 PDF |

Claude checks **Shopify first** and then whichever courier the fulfilment actually names, so it
never tracks a parcel on the wrong carrier.

---

## Three things that look like problems and are not

**Tracking never shows the address or the phone.** Both couriers strip them. That is deliberate
redaction, not a missing record — the address comes from Shopify.

**"Record not found" on a XpressBees waybill** that was booked through Shiprocket is normal. Our
panel does not own those waybills.

**An Amazon order sitting "unfulfilled" in Shopify for ever** is also normal. Amazon ships those
itself and never tells Shopify. Never book one, and never judge an Amazon parcel by Shopify.

---

## Failed deliveries

When a parcel cannot be delivered, the courier records a reason code. **The code decides what
happens next, not the sentence next to it** — the free-text explanation is unreliable, so Claude
will quote you the code.

Two patterns worth recognising straight away:

**`ST-102` before any delivery attempt** is not a failed delivery. It is the courier's own
address check firing seconds after the parcel was manifested, and it means **the address is
incomplete and has to be fixed before dispatch**. A phone call at that moment prevents the whole
return. After an attempt, the same code means the rider could not find the door.

**"Customer cancelled" after a single attempt is often not true.** 58% of our returns were
closed as customer cancellations, 56 of them after exactly one attempt. Where a cancellation
lands within an hour of one out-for-delivery scan, it gets flagged as a **fake-cancel suspect**.
Push those for redelivery and dispute them — do not write them up as the customer's doing.

---

## The two call sheets

Both are Google Sheets, both refill themselves, and **the last three columns of each belong to
whoever makes the calls — that is you.** Nothing automated ever writes or clears them.

**RTO & Urgent Call Sheet** — two tabs:

- **`RTO`** — every **prepaid or part-paid** parcel that came back. A customer who paid, even
  only the ₹49 token, confirmed they wanted it, so a return on one is a question that needs
  asking.
- **`Urgent`** — every **live** parcel with an open delivery problem. These can still be saved;
  the RTO tab is a post-mortem, this one is not. Where the sheet says `Customer` in "who fixes
  it", that is your call list. `Courier` and `Us` are Ali's.

**`Bad Address` tab** — the addresses that will fail if they go out as they stand. Ring the
customer, take the real address, and type it into the sheet. It goes onto the order by itself at
2pm and 10pm. Do not retype the address onto the order yourself.

Booking one of these before the address is fixed is **your decision** — Claude will stop, show
you what is missing and what a failed delivery costs, and wait for your yes. The cheap move is
almost always the phone call first.

Your three columns on each: `Called?`, the reason or outcome, and the action. Fill them in as
you go — they are the only record that a call happened.

---

## Lost or damaged parcels — 72 hours, and there is no API

If a parcel is lost in the network or arrives damaged, the claim has **72 hours from the last
scan**. After that the courier refuses to investigate. About ₹43,000 of claims have already
expired unnoticed.

Filing is **on the courier's portal only** — Main Menu → Disputes → Lost & Damages Claims → New
Claim — and it needs **two or more photos with the waybill visible**. Tell Ali the same day; the
clock is short and nothing automated can file it for you.
