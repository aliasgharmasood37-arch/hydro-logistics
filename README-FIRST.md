# Start here — Zahra

Written for: Zahra Tinwala, taking over shipping for Hydro Customs.

You will be booking every parcel for the **online store** and for **custom (phone/DM) orders**.
You do it by talking to Claude Code in plain English. Claude runs the tools; you decide what
needs doing, read what it tells you, and check it looks right.

## Before anything works

**Two things go on your machine once.** Ten minutes with Ali, and never again:

- **Claude Code** — the window you type all of this into. He will sign you in.
- **Node 24 or newer** — what the tools are written in, from <https://nodejs.org> (take the
  **LTS** download). To check it took, say *"check node is installed"* once the folder is open.
  It has to report **v24** or higher; on anything older the booking tools will not start.

**Then the folder.** It is a private repository called **`hydro-logistics`**. Ali gives you the
link and adds your GitHub account to it. It holds the playbooks, the tools in `scripts/` and the
dimension lists — everything except the keys.

1. **Clone it** wherever you like on your machine. Claude Code will do it for you: paste the
   link and say *"clone this"*.
2. **Ask Ali for the `.env` file** and put it in the folder root, beside the `scripts` folder,
   named exactly **`.env`**. The keys are deliberately **not** in the repository, so a fresh
   clone arrives without them and nothing will run until that file is there. Windows hides
   known extensions, so check it did not save as `.env.txt` — every tool would then report no
   keys found.
3. Open **that folder** in Claude Code (not a folder above it).
4. First message of the day, so Claude loads your instructions: **"read CLAUDE.md"**.
5. Once, to prove the keys reach the couriers before a real parcel depends on it, say:
   *"quote the freight for a 30x20x10 box to 110001"*. A price list comes back within a few
   seconds and **nothing is booked**. If instead you see a key or login error, stop and tell
   Ali — do not start booking.

**When Ali fixes a tool or updates a playbook**, say *"git pull"* and you have it. That never
touches your `.env`.

Two things about it:

- **The `.env` file is the passwords.** Do not share the folder, email it on, or put it in a
  shared drive. If it ever leaks, tell Ali so the keys can be changed.
- **One key in there opens more than shipping.** The sheets — the Ledger, the Multipack box
  sizes, the call sheets — are reached through a server key that unfortunately also reaches
  every automation Ali has built, including the ones that message customers. **It is for the
  sheets and nothing else.** Claude knows this and will refuse anything else with it, even if
  you ask; that refusal is deliberate, not a fault. Anything beyond the sheets, send to Ali.
- **Do not edit the files in `scripts/`.** The folder is generated from Ali's main project — a
  change made here is lost the next time he rebuilds it, and his copy never gets the fix. If
  something in a tool is wrong, tell him.

## The five things you will say most

| Type this | What happens |
|---|---|
| `book 2153` or `remove the AWB for 2153` | Books that order on XpressBees. **"Remove the AWB" means MAKE the AWB** — it is how Ali says it |
| `book 1980 box 30 20 15` | Same, with the carton you measured, in centimetres |
| `quote the freight for 2153` | Price only, books nothing |
| `where is 2153?` / `is 2153 fulfilled?` | Tracking. "Fulfilled" here means "has the AWB been made" |
| `cancel the shipment for 2153` | Actually cancels it |

Order ids are the plain numbers from Shopify — `2153`. A custom order's id ends in `off`, like
`0050off` (the last four digits of the customer's phone).

## How a booking goes

Claude always runs it **twice**: once as a dry run that changes nothing and prints the plan, and
then for real. **Read the dry run.** Four things on it are worth your eyes every single time:

- **the box** — it must be the carton actually packed, never a rounded "about this big";
- **the chargeable weight** — the bigger of the real weight and length×breadth×height÷5000;
- **the payment mode and the amount to collect** — for a part-paid order this is the *balance*,
  not the full price;
- **the pincode and phone** — ten digits, and the landmark should be in the address.

If any of those look wrong, say so instead of saying go. It is free to fix before booking and
expensive after.

## The ones Claude will stop and ask you about

These five are **your decision** — you do not have to wait for Ali. But Claude will always
stop, tell you what is wrong and what it could cost, and wait for you to say yes:

- an order tagged **Bad Address** — the address is known to be incomplete;
- a **COD order with no verification tag** — nobody has confirmed it by phone yet;
- a **soft stop**, which usually means the line prices do not add up to the order total, so the
  amount to collect may be wrong;
- **Delhivery when XpressBees could also serve the pincode** — XpressBees is the default;
- a **multipack with no measured carton** on the sheet.

Read what it tells you before you answer. "Yes" here means *you are accepting that risk* — so
if the real answer is "let me go and measure it" or "let me ring the customer first", say that
instead. **Claude will never make up a carton size or a weight to get past one of these.**

Two things stay outside your hands, and Claude will say so:

- **Amazon orders** — they ship through Amazon themselves, so booking one sends the parcel
  twice. Not a risk to accept, just wrong;
- **cancelling a parcel the rider already collected** — the courier refuses it, and it becomes a
  Request RTO that only Ali can do in the dashboard.

## Your day

`logistics/DAILY-ROUTINE.md` is the running order: the morning parts email, which orders that
releases, the call sheets, and what to check before you close.

## The rest of the folder

| File | For |
|---|---|
| `CLAUDE.md` | Claude's instructions. Worth skimming once so you know what it will and will not do |
| `BOOKING-XPRESSBEES.md` | The normal booking, step by step, and what each number means |
| `BOOKING-DELHIVERY.md` | The second courier, and the only reasons to use it |
| `CUSTOM-ORDERS.md` | Creating an order Ali dictates, then shipping it |
| `TRACKING-AND-STATUS.md` | Answering "where is my parcel", failed deliveries, returns |
| `DAILY-ROUTINE.md` | The daily running order |

One habit worth keeping from day one: **never say a parcel is booked until Claude has read the
waybill back from the courier.** Everything else in this job can be corrected.
