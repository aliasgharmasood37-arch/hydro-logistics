# Custom and offline orders

A custom order is one that never went through the website — Ali takes it on a call, on
Instagram or on WhatsApp and dictates it to you. You create it in Shopify first, then book it
like any other parcel.

Say it the way he said it to you:

> `create an order for Rahul, 9359490050, <address>, R7 tank cover carbon, ₹2,699, ₹500 advance`

Claude builds the order, reads it back to you, and then you book it with `book 0050off`.

---

## The rules that are not obvious

**Take the product name and the price exactly as dictated.** Do not let it be "matched" to a
catalogue product that sounds the same. Many of these parts exist under near-identical names at
different prices, and the name you give prints on the order, the invoice, the packing slip and
the label for ever. If a word is clearly mistyped ("winmglety" → "winglet"), it gets fixed —
but Claude will tell you which wording it used.

**No new product is ever created in Shopify** for a custom order. It goes on as a one-off line
with that title and that price.

**The order id is the last four digits of the phone plus `off`.** `9359490050` → `0050off`. If
that id already exists, it becomes `0050off2`. That one id is used everywhere — Shopify, the
courier, the ledger — so the order can be found later.

**The customer has to be linked, not just the address.** Shopify does not create a customer from
a shipping address, and an order without one shows "No customer" — the name then exists only on
the address and nobody can find the order by phone. Claude links it using the phone in `+91`
form, plus the email if you have it.

**Never create one without a shipping address.** Three old orders have none, and there is now no
name anywhere in Shopify for them.

**The landmark goes in the address** (Ali's rule). When the customer's message has a `Landmark:`
line — "near Kali Mandir", "opposite Ajanta petrol pump" — it belongs in the address itself so
it prints on the label. Half these addresses have no house number; the landmark is what the
rider actually navigates by.

**Four things to confirm before booking** — ask Ali if you do not know:

1. Has the money actually arrived, and how much? (advance vs balance)
2. Is the AWB wanted now or later?
3. What box is it going in?
4. Is it one parcel or two? One order packed in two boxes ships as **two** shipments: the COD
   one collects the balance, and the second goes prepaid **at its real declared value** — never
   at ₹0.

---

## Replacements and free re-sends are never ₹0 orders

When a customer got the wrong or damaged item and a fresh parcel goes out at no charge:

- the Shopify order is created at the **full product price and marked paid**, so the balance is
  zero and it books prepaid;
- the courier gets the **full declared value**, collect nothing;
- it is tagged as a replacement, with the original order and waybill in the note.

**Never discount it to ₹0.** If the courier damages or loses that parcel, the claim is paid
against the declared value and the invoice — a ₹0 invoice is a ₹0 claim. "Free to the customer"
is not the same as "worthless in transit".

This has already been done the wrong way once: two replacements were created with a 100%
discount to keep the revenue reports clean, and Shopify **refuses** to remove a discount applied
at creation. Fixing it meant cancelling, deleting and recreating both orders. Get it right the
first time.

---

## After booking — the same turn, not later

A custom order is not finished when the waybill exists. It goes onto the **`Custom And Offline
Orders`** sheet **with its AWB**, immediately.

That sheet is what Ali reads when the customer rings. Its columns are: name · phone · parts ·
cod/prepaid/partial · address · advance · remaining · confirmed by · notes · AWB · 2nd AWB.

How it gets filled, and the traps Claude has to respect:

- the customer is matched **on the phone**. An existing row gets the new AWB in the AWB column,
  or in the **2nd AWB** column if the first is already used;
- **no cell Ali typed is ever blanked** — notes get appended to, never replaced;
- changed cells are highlighted **light blue** so he can see what moved;
- rows are written to an explicit range, never appended blindly — blank rows in the middle of
  that sheet make an append land mid-sheet and push his rows down.

**Before creating a custom order, check that sheet for an existing row** — it often already
holds an advance that was paid, which changes the amount the rider collects.

---

## Where the full version lives

`playbooks/AWB.md` §6 in the project root, and `XPRESSBEES-API.md` A5 for the booking side. Both
carry the exact field shapes and the past mistakes in full.
