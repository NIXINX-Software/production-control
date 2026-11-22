# Production Control — single-client deployment
One source repository, one Vercel project per licensed company, one Firebase project per company. The application cannot switch companies at runtime.
## Configuration
- NEXT_PUBLIC_PC_SITE_ID: existing HTL uses htl; HTW uses htw; HTFT uses htft. New clients use a stable lowercase identifier.
- NEXT_PUBLIC_PC_SITE_NAME: display name (required for new identifiers).
- NEXT_PUBLIC_PC_SITE_URL: canonical HTTPS URL; set for each new deployment.
- Existing NEXT_PUBLIC_FIREBASE_* and FIREBASE_SERVICE_ACCOUNT_KEY: use ONLY the designated customer's Firebase, including Authentication and Storage. The server already verifies the service account project matches the public project ID.
- Preserve existing server environment variables and access rules. Provision the appropriate portal_users roles and site grants in each customer's own backend.
For backward compatibility, missing site configuration defaults to htl; never rely on this default for an additional installation. Explicitly set the ID, name and URL before its first deploy.
## Migration
Do not migrate, rename or delete HTL collections or historical documents. Existing siteIds arrays remain intact; new catalog entries use only the configured site. Verify HTL's actual environment, lint, build, regression tests and negative cross-site API requests before production. Transfer the Vercel project only after validation; verify DNS, authentication authorized domains, secrets, storage and deployment identity. Repository visibility, Vercel credentials and Firebase configuration are not changed by this PR.
## Domains
Software: client.application.nixinx.app (example: htl.inventory-control.nixinx.app). Management Information domains under nixinx.site are separate. No DNS changes in this PR.
