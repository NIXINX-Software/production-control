# ADR — One deployment per product, isolated customer backends (2026-11-23)

## Approved architecture
- **ONE GitHub repository and ONE Vercel project/deployment per application/product**, not per company.
- **Many authenticated custom hostnames**: `{company}.{application}.nixinx.app`. Example only: `htl.inventory-control.nixinx.app`, `htw.inventory-control.nixinx.app`. The final app slug must be confirmed before configuring DNS; do not silently change between `supply`, `suply`, and `inventory-control`.
- Each company owns an isolated Firebase project and data. The hostname is an untrusted lookup key, NOT authorization.
- NIXINX Control is the authoritative registry of exact hostnames, tenant IDs, product IDs, license/entitlement, Firebase project IDs and **references** to per-tenant server secrets. A public client manifest may contain Firebase Web config, never a service account.
- On each server request: validate the exact request hostname; resolve Control registry with authenticated service-to-service access; confirm the returned hostname, company, product, license, and Firebase credential project match; instantiate/use the **named Firebase Admin app for that client only**; verify the Firebase user token with that client's Firebase Auth, and authorize role/resource against that client's Firestore. Deny by default and never fall back to HTL.
- On the browser, resolve the public Firebase Web config for the **same authenticated hostname** before initializing Firebase Auth; reject unknown domains. Never use a hardcoded shared `NEXT_PUBLIC_FIREBASE_PROJECT_ID` for tenants.
- A name editable in Company Settings is DISPLAY metadata only and cannot change company identity.
- NIXINX Control licenses/suspension will be enforced server-side independently of client UI.

## Verified current code / release block
At baseline `main` SHA `2a72d6c`, the app has global `src/lib/firebase.ts`, `pc-server.ts db()` and a single Firebase Auth; they **cannot safely multiplex unrelated Firebase projects by hostname**. NIXINX Control's current `/api/entitlements` uses a **Control Firebase user ID token** and tenant membership and is NOT a production service-to-service registry API. Its FDV explicitly lists service-to-service authentication as pending.

**Do not merge PR #12** (single-company-per-deployment), reconfigure the connected production Vercel project, remove HTL credentials, or assign customer DNS until request-scoped Firebase Admin, client Auth bootstrap, tenant lookup, and license checks have passed end-to-end tests.

## This PR — phase A
- Defines product-specific hostname parsing, strict tenant registry response validation and credential/project binding.
- Provides explicit, **not-yet-wired** named Firebase Admin/Browser factories using tenant-specific projects and secret references, rejecting project mismatch before initialization. No default Firebase Admin project.
- Denies unrecognized or mismatched domains/tenant records; tests 100 customer hostnames from one product.
- Adds no live domain routing, Firebase switching, Control API calls, secret retrieval, deployments or production variable changes.
- This phase alone is NOT end-to-end tenant isolation; this is intentionally not exposed as a working multi-tenant API.

## Required implementation before first preview / release
1. Define and implement an authenticated **NIXINX Control S2S tenant lookup** contract, with short lived/rotatable service credentials, license state, product modules, cache/revocation.
2. Provision tenant Firebase secret references in authorized secret storage with least-privilege access; do not store a hundred service-account keys in the Vercel env list.
3. Refactor **all** PC and Operations server endpoints, background utilities, report/export/evidence storage, and Firebase Admin Auth to use an explicit per-request tenant context; unit test cross-host, cross-document-ID and cross-project attacks.
4. Refactor client Firebase initialization and authentication, Company Settings and report views for the resolved tenant. No static `htl` fallback in shared deployment.
5. Configure wildcard hostname/domain routing and certificate/DNS after the product slug is approved; preview with non-production isolated tenant backends.
6. Establish release gates and protect `main`: current workflow `.github/workflows/vercel-htl-production.yml` deploys on push to main and still points to client Vercel credentials; DO NOT merge until obsolete deploy workflow is disabled/retargeted under approved release plan, and Git integration auto-deploy behavior is gated.
7. Execute tests, review/merge, stage, run end-to-end license and Firebase isolation tests, then explicitly authorize promotion to production. Preserve HTL records and rollback.
8. Document in FDV/Charter/MMIC. The Vercel project `nixinx-projects/production-control` is linked to source but currently has zero deployments. Old client's project stays until new service has passed validation and switch-over.

## Invariants
- No per-tenant copies of the repository or project.
- No anonymous hostname inference selecting unrestricted Firestore.
- No browser-controlled Firebase credentials used by server.
- No change to legacy Firebase data, production hosting or variables as part of this PR.
