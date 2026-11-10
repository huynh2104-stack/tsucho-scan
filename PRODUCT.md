# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Accountants, tax-office staff and small-business bookkeepers in Japan. Many are in their fifties and sixties, work on Windows desktops at 1366 to 1920 pixels wide under office daylight, and hold the physical passbook next to the screen. Japanese is the first language of the product; Vietnamese and English stay available. (Inferred from the repository and the owner's brief; the owner was away and could not answer an interview.)

## Purpose

Turn photos and PDFs of Japanese bank passbooks (通帳) into checked Excel or CSV ledgers. A vision model reads each page, then an engine recomputes every balance line by line. The product's real job is not reading: it is showing a human exactly which lines still need a human, next to the printed page.

Mechanism in one sentence: every row's printed balance is recomputed from the row above, so the ledger proves itself and only the broken links need a person.

## Workflow

Open a case, add images or a PDF, scan, review the flagged rows against the photo, confirm, export. People work one page at a time and repeat this often; speed of review matters more than first impressions, yet the first demo decides whether a Japanese company takes the product seriously.

## Product truth to preserve

- Column names stay in the passbook's own Japanese (摘要, 差引残高, お預り金額) in every language.
- Yellow means a person must look; green means the machine corrected it. These two match the Excel file.
- A balance-chain pass proves arithmetic only. It does not prove that no row is missing or that a description was read correctly. The interface must keep saying so.
- Note rows (繰越 and similar) are not transactions.
- Sample passbooks scan without calling the model and cost nothing.
- Everything must survive a keyboard-only reviewer: n/p, Ctrl+Enter, Ctrl+Z.
- Font scale option exists for older eyes and must keep working.

## Constraints

- Next.js 16 static export, React 19, Tailwind 4, served by FastAPI. The server has 512 MB of RAM.
- This repository is public. No client names, contact names or real account numbers in code or docs.
- No invented endorsements, customers, certifications, accuracy figures or accounting integrations.

## Voice

Plain, exact, polite Japanese business language (です・ます). Say what happened and what to do next. No exclamation marks, no cleverness, no emoji.

## Brand commitments

- Name: 通帳スキャン (Tsucho Scan). The marketing site uses an ink and cobalt palette with a vermilion (朱) brand accent. Keep the product recognisably the same company.
- The owner rejected the previous app look as generic and "smelling of AI". Quality of craft is itself the sales argument here.
