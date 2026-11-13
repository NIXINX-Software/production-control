# NIXINX Operations — Incremento 1 / Procesos / Software Propio
Status: IMPLEMENTATION CANDIDATE / PREVIEW FIRST / NOT RELEASED TO PRODUCTION
Date: 2026-11-13. Owner: NIXINX. Repository: production-control.

## Product boundary
- Existing production, bag counting, existing KPI, forecasts, pc_* collections, and kitchen navigation remain untouched.
- New route /operations (direct URL during Preview); separate ops_* collections and evidence bucket.
- A company/site is a separate operational owner. There is NO global product master; HTL feta != HTW feta even if names are equal.
- Authorized cross-company totals are permitted only over explicitly selected and server-authorized companies in the SAME configured Firestore.
- Warehouse-to-production consumption or recipe deductions are NOT implemented. An ops_receipt records physical receipt evidence, not a final certified stock balance.

## First increment functional scope
- Purchases: supplier, date, amount in CAD cents, initial payment, remaining credit, due date and notes.
- Payment: post subsequent partial/full payment against purchase payable; amount cannot exceed balance.
- Bank: A PURCHASE ON CREDIT does not match a bank statement. Bank reconciliation attaches to later payment transactions. UI shows PENDING until bank-statement matching exists; cash has no matching bank transaction.
- Document: private image evidence + delivery/receipt/rejection state, with server-side audit.
- Catalogs: per-company suppliers, product masters (kg, L or units), presentations (g/kg/lb, mL/L, unit/portion) and normal-unit conversion; new presentation from existing product.
- Physical receipt: number of packs, chosen existing presentation, normalized amount and pending/partial/received state. Detailed stock ledger comes in later increment.
- Protected KPIs: totals from filtered purchases, pending proof and goods, outstanding debt. Public showroom MUST be synthetic.
- Source export: CSV for inspection only, not a certified incremental BigQuery integration.

## Preview safety
- GitHub branch -> PR -> Preview; NO merge to main without owner approval.
- GET and POST on /api/operations require valid Firebase Auth, active portal_users admin account AND opsSiteIds containing the requested company; UI filters never substitute backend authorization.
- Vercel Preview and local development use ONLY OPS_SANDBOX_SERVICE_ACCOUNT_KEY and OPS_SANDBOX_PROJECT_ID to access operations data. They do NOT use PC production Firestore for operations. They still check portal_users roles against current auth project. Do not put the production service account in OPS_SANDBOX_SERVICE_ACCOUNT_KEY.
- Preview uses OPS_SANDBOX_STORAGE_BUCKET for receipt images. Production uses OPS_EVIDENCE_BUCKET. Max file 8 MiB JPG/PNG/WebP with signature validation.
- If sandbox variables are absent, the secure live route fails closed and the UI provides functional in-memory DEMO; no writes to Firestore.
- Production route fails closed until OPS_PRODUCTION_ENABLED=true is explicitly configured on Vercel PRODUCTION after release/approval and review of rules, roles, storage, business process and regression.
- Required per-user permission in portal_users/{firebase_uid}: {active:true,role:'admin',opsSiteIds:['htl',...]} . This is an explicit new grant; never assume all locations authorized just because the role is admin.
- This permission is intentionally ADMIN-ONLY for pilot. Separate buyer/receiver/operator roles are a next increment; do NOT hand financial admin accounts to kitchen staff.

## Proposed Firestore source tables (collections)
| Collection | Grain | Primary relations |
| --- | --- | --- |
| ops_suppliers | supplier per site | siteId, id |
| ops_products | product master per site | siteId, id, unit |
| ops_presentations | commercial presentation per master | siteId, productId, packCount, packUnit, unitAmount |
| ops_purchases | one purchase/payable | siteId, supplierId, totalCents, paidCents, balanceCents, four independent process states |
| ops_payments | payment/abatement against payable | siteId, purchaseId, amountCents, method, reconciliationStatus |
| ops_receipts | one received product/presentation line | siteId, purchaseId, productId, presentationId, normalized amount |
| ops_documents | one private evidence object | siteId, purchaseId, storagePath, mime, sha256 |
| ops_audit | one transition/event | siteId, purchaseId, actor, action, createdAt |

## Planned DWH provider interface: NOT YET DEPLOYED
- Domain family: internal_processes / Procesos (candidate specialization restaurant_operations).
- Provider: NIXINX Software / Software Propio, component production-control/operations.
- For each table: tenant_id (must be mapped explicitly from site to legal entity), site_id, source id, event time, update watermark, contract version, amount and unit, source provenance, and quality flags.
- Historical evidence kept; never recalculate an old purchase line solely from a new presentation catalog value.
- Payment reconciliation: ops_bank_statement_lines and ops_payment_matches to be added, with many-to-many amount-allocation, traceable proof and no silent automatic match.
- Exports need incremental upsert, revisions/deletions, schema validation, idempotency, source authentication and commercial billing/tenant authorization before being called a DWH connector.
- Source data remains in client-owned Firestore/storage; NIXINX data engine maps to RAW->CORE->MART separately in client-paid BigQuery. Dashboard KPI definitions versioned and governed outside the UI.

## Preview acceptance test
1. /operations loads DEMO without Firebase or secrets and clearly marks it synthetic.
2. HTL purchase cannot appear as HTW purchase. HTL and HTW may be selected for permitted aggregates in demo.
3. $500 on credit creates $500 payable, no fabricated bank matching. $200 payment leaves $300, then $300 payment clears payable.
4. Feta 3 x 750 g = 2.25 kg. Same master supports 1 kg and 5 kg while retaining presentation-specific original values.
5. Upload photo (in sandbox mode), document handoff and physical receipt remain distinct.
6. Existing production/count screens and all pc_* data unaffected.
7. Preview denies Firestore Operations writes until sandbox account configured, and denies operations outside opsSiteIds.
8. Showroom is synthetic; CSV labeled non-certified.
9. Run npm ci, npm run lint, npm run build (Next 16 instructions in AGENTS.md apply).
10. Review license/control-plane requirements per NIXINX FDV before Go Live: backend-controlled revocation not certified by this increment.

## Rollback
Close PR and delete feat/ops-purchases-preview-20261113 branch; main and production unmodified.
Sandbox demo source data can be deleted only after reviewing that exact sandbox project/site collection.
