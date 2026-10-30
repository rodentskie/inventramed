# InventraMed

Development of a Collaborative Digital Medicine Inventory System

## Overview

InventraMed is a medicine inventory system that keeps track of medicines and monitors their expiration dates. Each record holds key details such as the medicine's name, quantity, and expiration date.

Medicine information is encoded with a barcode generator, and scanning is handled directly through the app — no physical barcode scanner is required.

## Expiration Monitoring

The system checks every medicine in the inventory against its expiration date and classifies it into one of three statuses:

- **Safe** — the medicine is far from its expiration date
- **Near Expiry** — the medicine is nearing its expiration date
- **Expired** — the medicine is expired or no longer safe to consume

When a medicine becomes near expiry or expired, users are alerted through:

- **In-app notifications** — alerts shown in the InventraMed app
- **SMS notifications** — text messages sent to registered mobile numbers through a GSM module

## Architecture

- **Server** — hosts the InventraMed application: inventory management, barcode scanning, expiration checks, and in-app notifications.
- **SMS worker (Raspberry Pi 3 Model B)** — a lightweight worker that fetches near-expiry and expired medicines from the server and sends SMS notifications through the USB GSM module.

## Hardware Components

- Raspberry Pi 3 Model B — runs the SMS worker
- USB GSM module (with an active SIM card) — sends SMS notifications
- Power supply for the Raspberry Pi
- MicroSD card — holds the Raspberry Pi's operating system and worker
