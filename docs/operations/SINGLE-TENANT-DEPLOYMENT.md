# Production Control — single-company deployment

One repository, one Vercel project and one separate Firebase project per licensed company. Never select a Firebase project using a request parameter, browser storage, or hostname provided by the caller. The application binds to the deployment configuration.

## Existing HTL installation

Keep current Firebase environment variables, credentials, collections, document IDs, historical site IDs, and routes. When both new site variables are missing the compatibility default is `htl / Hot Tacos Leamington`. Set both explicitly for future deployments. This change does not migrate or seed data.

## New installation

Configure `NEXT_PUBLIC_PC_SITE_ID` (stable lower-case identifier, e.g. htw), `NEXT_PUBLIC_PC_SITE_NAME`, `NEXT_PUBLIC_PC_APP_URL` (e.g. https://htw.inventory-control.nixinx.app), and `NEXT_PUBLIC_PC_SUPER_ADMIN_EMAILS` (comma-separated permitted emails for that company, never a password). Configure all existing Firebase client variables, the corresponding server-only `FIREBASE_SERVICE_ACCOUNT_KEY`, correction code, indexes, storage bucket, Auth authorized domains and portal user roles in that client's own Firebase project. The service account project ID must match the public Firebase project ID. Do not copy HTL credentials to another installation. Explicitly configure the site and admin identity before the first production build.

Site ID is fixed at build/deployment time, not a user choice. Operational, catalog and report requests for another company are rejected; legacy arrays are preserved internally on edits. Existing export schemas are unchanged. The showroom remains synthetic and is not a production data source.

## Release gate

Run lint, production build and the isolated regression tests; verify HTL's records and all flows against the existing configuration without writing test data to production. Validate denial of foreign site IDs and backend credentials mismatch. Do not merge if verification fails. Vercel transfer, DNS, project privacy and commercial license enforcement are separate stages; existing workflows and production configuration remain unchanged.
