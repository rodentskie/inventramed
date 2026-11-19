## Project Overview

**InventraMed** is a collaborative digital medicine inventory system. It keeps an inventory of medicines and monitors their expiration dates, alerting the team through **in-app notifications** and **SMS** when medicines are nearing expiry or have expired.

No physical barcode scanner is used — medicines are registered with a generated barcode, and scanning happens directly through the web app (webcam/browser-based).

---

## Problem

Manual, paper-based (or spreadsheet-based) medicine inventory tracking makes it hard to:

- Know at a glance which medicines are close to or past their expiration date
- Keep inventory data consistent across multiple people managing stock
- Get alerted about expiring stock without having to open a dashboard

➡️ **InventraMed gives teams a shared, always-current view of medicine expiration status — and pushes alerts to them in the app and by SMS.**

---

## Users

| Persona         | Needs                                                                   |
| --------------- | ----------------------------------------------------------------------- |
| Inventory staff | Scan/register medicines via the web app, view expiration status         |
| Collaborator    | Shared, real-time visibility into inventory across the team             |
| Admin           | Manage medicine records, users, and SMS recipients                      |

---

## Core Features

### A) Medicine inventory management

- Register and manage medicines (name, barcode, batch number, quantity, expiration date)
- Barcode-based lookup — barcodes are generated per medicine, not read from a physical scanner
- Scanning is performed through the web app (browser-based)

### B) Expiration status

Each medicine's expiration status is computed from its expiration date:

- **Safe** — far from expiration
- **Near Expiry** — nearing expiration
- **Expired** — expired / no longer safe to consume

The day thresholds between statuses are to be defined.

### C) In-app notifications

- The web app notifies users when a medicine becomes near expiry or expired

### D) SMS notifications (worker, RabbitMQ and Raspberry Pi consumer)

- A **worker** on the server claims queued SMS from the app's worker API and publishes them to RabbitMQ
- A **consumer** on a **Raspberry Pi 3 Model B** sends each one through a **USB GSM module** (with an active SIM card) and publishes the result back
- The worker reports each result to the app. The Go apps are only an SMS gateway: all inventory data and business logic live in the Next.js app.
- Each daily digest is sent as **one single-part SMS** (160 GSM-7 characters)

---

## Architecture

```
┌──────────────────────────── Server ─────────────────────────────┐
│  Next.js app (apps/app)  ◄─HTTP─ worker/retry   ──► sms.send    │
│  - inventory + scanning  ◄─HTTP─ worker/success ◄── sms.success │
│  - expiration checks                                (RabbitMQ)  │
│  - in-app notifications                                         │
│  - worker API routes                                            │
│  PostgreSQL (Prisma)                                            │
└─────────────────────────────────────────────▲──────────┬────────┘
                                      publish │          │ consume
                            ┌─────────────────┴──────────▼──────┐
                            │ Raspberry Pi 3 Model B            │
                            │  consumer ──AT commands──► GSM    │
                            └───────────────────────────────────┘
```

- The Next.js app runs on a server and owns the database
- The worker reaches the app through Next.js API routes (endpoints for non-browser clients), and never touches the database
- The Pi and the server are on the same local network, so the Pi connects to RabbitMQ directly

---

## Tech Stack

| Category       | Choice                                            |
| -------------- | ------------------------------------------------- |
| Language       | TypeScript (Node.js 24.20.0)                      |
| Web app        | Next.js 16 (App Router)                           |
| UI             | Chakra UI                                         |
| State          | zustand                                           |
| Validation     | Zod                                               |
| Database       | PostgreSQL                                        |
| ORM            | Prisma (migrations via `prisma migrate`)          |
| Testing        | Jest + Testing Library                            |
| Monorepo       | Nx (`@nx/next`)                                   |
| SMS gateway    | Go (worker, consumer) + RabbitMQ                  |
| SMS hardware   | Raspberry Pi 3 Model B + USB GSM module           |

---

## Monorepo Structure

InventraMed is an Nx monorepo. Apps live under `apps/`.

```
apps/
├── app       # Next.js web app — inventory, barcode scanning, expiration checks, notifications, API routes
├── worker    # Go, on the server — retry (claim → sms.send) and success (sms.success → result)
└── consumer  # Go, on the Raspberry Pi — sms.send → GSM module → sms.success
libs/go/
├── mq        # RabbitMQ publisher and consumer
└── gsm       # SIM800C AT commands and GSM-7 body checks
```

---

## Data Model (Overview)

_To be defined as the schema is implemented (via Prisma migrations)._

- **Medicine** — name, barcode, batch number, quantity, expiration date, and derived expiration status (safe / near expiry / expired)
- **Notification** — in-app alerts for near-expiry and expired medicines
- **SMS recipient** — mobile numbers that receive SMS alerts

---

## Status

- 🚧 Early scaffold — Nx monorepo and Next.js app (`app`) are initialized; core features not yet implemented
