# HTL-first release decision — 2026-11-23

## Temporary scope approved
Deploy Production Control for **Hot Tacos Leamington (HTL) only** on the already linked NIXINX Vercel project `nixinx-projects/production-control`, reusing existing HTL Firebase with NO data migration, NO changes to its documents and NO simultaneous HTW/Cataleia tenant access.

This temporary single-tenant arrangement is not the final multi-tenant product. Do not create additional company Vercel projects as a future onboarding pattern. Multi-tenant [PR #14](https://github.com/NIXINX-Software/production-control/pull/14) is deferred until after the HTL release; it is NOT merged.

## Safe release specifics
- GitHub branch `feat/pc-single-tenant-20261121` is the HTL candidate (existing PR #12).
- `PC_TENANT` defaults to historical `htl / Hot Tacos Leamington` if both `NEXT_PUBLIC_PC_SITE_ID` and `NEXT_PUBLIC_PC_SITE_NAME` are absent. Do not configure only one of them.
- `FIREBASE_SERVICE_ACCOUNT_KEY` MUST be a server-side Secret for the **same** HTL Firebase project as `NEXT_PUBLIC_FIREBASE_PROJECT_ID`. No keys in GitHub documents or ChatGPT.
- Existing historical documents and membership IDs stay as-is, with server-side site restriction.
- Additional `PC_CORRECTION_CODE` is NOT an old environment variable; omission disables correction authorization but does not block ordinary operations. Do not invent a prior value or request its disclosure.
- On merge to main, NIXINX Vercel Git integration automatically builds/deploys; the old HTL GitHub Actions CLI workflows have been **removed** to prevent a second deploy to the previous client Vercel project.
- The original client Vercel project remains untouched until functional verification and explicit cutover.
- Only the new NIXINX Vercel default URL is used for pilot smoke testing; no customer domain or DNS migration during automated build.
- Preflight: PR tests, lint, Next.js build, project/branch, Production environment variable names/scopes, Firebase project ID match via server validation, and GitHub workflow target.
- Postflight: authenticated HTL read smoke test; superadmin Company Settings authorization; deny foreign site IDs; no cross-tenant access; confirm original client production still works. Avoid test writes to real Firebase until explicit approval.
- NIXINX Control commercial licensing remains deferred. This deployment must NOT claim Control enforcement.
- Rollback: revert the release commit on main to republish the last validated version of the *new NIXINX project*; do not delete HTL historical data or the previous client Vercel project.
