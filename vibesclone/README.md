# VibesClone

VibesClone turns a public product URL into an editable, evidence-linked Build Understanding and then into one base prompt plus ordered follow-up prompts for Lovable, Replit, Base44, or Claude Code. Its public blueprint library previews the buildable core of proven products and lets visitors remix a blueprint into a private project.

## Local development

1. Copy `.env.example` to `.env.local` and configure `DATABASE_URL`.
2. For deterministic local development, keep `FIXTURE_MODE=true`; external product and model calls are skipped, but the durable queue, approval, project-license gate, and persistence path remain real.
3. Apply migrations with `pnpm prisma:migrate`.
4. Run `pnpm dev` and `pnpm worker` in separate terminals.

Clerk is optional only in non-production fixture mode. Production has no test-login path and protected surfaces remain unavailable until Clerk keys are configured.

## Production services on Railway

Create one Railway project with:

- `vibesclone-web`, rooted at `/vibesclone`, using `railway.web.json`.
- `vibesclone-worker`, rooted at `/vibesclone`, using `railway.worker.json`.
- Railway Postgres, with the same `DATABASE_URL` referenced by both services.

The web entrypoint applies repeatable Prisma migrations before starting. The worker owns Firecrawl/OpenRouter calls through pg-boss. Set `JOB_CONCURRENCY` conservatively for the classroom launch and raise it only after provider limits are confirmed.

## Required production variables

See `.env.example`. Production activation specifically needs:

- Clerk publishable and secret keys; add the Railway domain and later `vibesclone.com` in Clerk.
- Dodo API key, webhook signing key, one-, three-, and ten-project product IDs, and the 100% student discount code. The free code applies only to the one-project product and each successful purchase creates discrete project licenses.
- Firecrawl API key.
- OpenRouter API key. `OPENROUTER_MODEL` defaults to `qwen/qwen3.7-plus`; model and fallback are configuration, not domain code.
- Microsoft Clarity project ID. Builder-authored areas use `data-clarity-mask`, and only fixed funnel event names are emitted.
- Resend sending key, verified sending domain, and a sales notification recipient for cohort and team inquiries.

## Monetization

Analysis, the editable Build Understanding, approval, and the first base prompt are free. The API redacts follow-up prompt bodies until that specific project consumes a license. Prices are $29 for one project, $69 for three, and $179 for ten. Full-refund and dispute webhooks revoke every project license created by the affected purchase; partial refunds preserve access for operator review. Unused licenses remain attached to the signed-in account until redeemed.

Never paste or print secrets in CI logs. Use Railway variables or reference variables between services.

## Clarity funnel

Create the private build funnel with these custom events:

`landing_view -> project_started -> analysis_completed -> understanding_approved -> checkout_started / entitlement_verified -> prompt_set_generated -> prompt_copied`

Create the public growth funnel with:

`blueprint_view -> blueprint_remix -> project_started`

Track `blueprint_shared`, `public_report_view`, `public_report_shared`, `public_report_published`, and `newsletter_signup` as supporting actions. First-party database counters use the same allowlisted vocabulary and store no prompt text, free-form input, IP address, or email.

No URL, email, prompt, understanding text, or payment field is sent as an event property.

## Provider and quality policy

Firecrawl evidence is bounded and treated as untrusted data. VibesClone validates the submitted target, admits only safe same-domain returned URLs, and never lets website text change model routing, commerce, or schemas. OpenRouter requests require structured output and record the served model and usage. Run `pnpm eval:prompts:fixtures` on every change; use live evaluations only with explicit secrets and a controlled spend cap.

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

## Rollback

Redeploy the last healthy Railway commit. Migration `202607310002_project_licenses` replaced the unused pre-launch entitlement table with the purchase-and-credit ledger; do not roll code back across that migration without restoring the prior schema from backup. Later migrations are additive. If a provider fails, keep the web service available, stop or scale the worker to zero, and retry queued jobs after restoring the variable or provider.
