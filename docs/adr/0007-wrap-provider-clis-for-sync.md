# Wrap provider CLIs for sync

Push (and later pull) talk to a provider by shelling out to that provider's official CLI rather than calling the provider's REST API. The first provider, GitHub, is driven through the `gh` CLI (`gh secret set`, `gh variable set`); Vercel and Cloudflare will follow the same pattern through `vercel` and `wrangler`. The provider-CLI boundary is injectable so it can be mocked in tests.

## Considered options

- **Wrap the `gh` CLI (chosen).** GitHub Actions secrets must be encrypted client-side with the repository's public key using libsodium's sealed box. `gh secret set` performs that encryption, reuses the user's existing `gh auth login` session, and infers the repository from the git remote. Envolix therefore never bundles a crypto implementation and never handles a GitHub token — the two most security-sensitive surfaces stay out of our codebase. Envolix's value is the env-file-to-provider mapping (annotation interpretation, validation, push plan), not an API client.
- **Call the GitHub REST API directly (rejected).** This would force Envolix to own libsodium sealed-box encryption, discover and handle a token, and fetch the repository public key — more code and a security-sensitive surface we would have to get exactly right, for no user-facing benefit.

## Consequences

- `gh` must be installed and authenticated; push detects this and fails with a clear message before any network call.
- Every future provider is expected to have a usable official CLI. A provider without one would not fit this pattern and would force us to revisit this decision.
