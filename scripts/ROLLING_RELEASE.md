# Rolling image release contract

The controller manages only the Coolify Docker Image app
`emmze606u6pn9zxpdyzpj80s` (gamedev.trebeljahr.com), source `trebeljahr/gamedev`
on `main`, image `ghcr.io/trebeljahr/gamedev`. Every push to `main` builds a
full-SHA-tagged candidate and records its digest in a
`release-<sha>-<run>-<attempt>` artifact. Building does not move `latest`.

`GAMEDEV_ROLLOUT_MODE` is a repository variable. Unset means builds only.
`manual` permits a **Build & Release** dispatch with operation `deploy`,
`target_sha`, `image_digest` and `expected_current_digest`. `automatic` also
releases every push whose build succeeds. Repository and ref guards and one
workflow concurrency group serialize the controller. Operation `verify` only
checks the requested full SHA at https://gamedev.trebeljahr.com.

## Build identity

The Docker build requires `DEPLOYMENT_ID` to be the full source commit. It embeds
that identity in `/version.json` and the homepage `build-commit` metadata. Next's
`deploymentId` uses the same commit for client/server version skew handling.
The runtime must serve `/version.json` with `Cache-Control: no-store`.

## Drain and health check

The image waits 20 seconds on SIGTERM while failing only loopback health probes.
Set Coolify health checks to `/`, interval 2 seconds, timeout 5 seconds, 5 retries
and a start period long enough for boot. The runtime has curl for Coolify's
in-container probe. Container names and host port mappings must remain unset.
Coolify stops the old container with a 30-second deadline, which covers the drain.

## Provider binding

The controller signs one hook with the app's bundle: `COOLIFY_BASE_URL`,
`COOLIFY_RESOURCE_UUID`, `COOLIFY_DEPLOY_REPOSITORY`, `COOLIFY_DEPLOY_BRANCH`
and `COOLIFY_DEPLOY_SECRET`. Each value must name the fixed app above, or the run
stops before any request. Tags are written with the workflow's own package
token. The controller never receives a Coolify API token.

Coolify's manual webhook selects apps by `git_repository` and branch. For each
one it then checks the signature against that app's own secret, auto-deploy, and
the watch path. The Image app therefore needs `git_repository`
`trebeljahr/gamedev`, branch `main`, watch path `.hatchkit/deploy-webhook`,
auto-deploy on and image tag `latest`. Hatchkit leaves Coolify's placeholder
`coollabsio/coolify` on Docker Image apps, and Coolify 4.0.0-beta.469 has no
form field for the repository there.

Change these in order: the Coolify binding, then the `COOLIFY_DEPLOY_REPOSITORY`
secret, then the variable. In any other order `latest` moves, the hook matches
no app and the journal stays closed.

The stopped legacy app names the same repository and branch, so Coolify answers
for it too. Its auto-deploy is off, so that answer is a refusal. The controller
requires exactly one queued deployment, and it must be the Image app's. Never
turn the legacy app's auto-deploy on while the Image app serves.

## Release, verification and recovery

Before promotion, the controller hashes the target manifest bytes and config,
checks Linux amd64 and the full OCI revision, matches the full-SHA tag to the
reviewed digest, and verifies the public baseline against current `latest`. It
copies the reviewed manifest bytes to `latest`, reads back the digest, and sends
one signed hook. A read-back that still shows the previous manifest is repeated
for four seconds, because a registry read can lag its write. Queue acceptance
must identify this app and one deployment UUID.

Public verification requires the homepage and uncached `/version.json` to name
the same full commit for 16 consecutive samples, 2 seconds apart. It waits up to
nine minutes for that, because the old build keeps answering until the new image
is pulled, started and the old container has drained. This is HTTP evidence;
`http-verified` is not a claim that the Coolify job finished or that the old
container retired. Inspect the exact Coolify deployment for that.

`rolling-started` and `rolling-verified` must both agree with current `latest`
before another run can mutate anything. A crash, unknown hook outcome, external
tag writer, or failed public check leaves the journal closed. The rollout
artifact records the previous digest and the returned deployment UUID. After any
hook attempt, failure never triggers another hook or tag rewrite. Inspect and
settle that exact queue before rollback or journal reconciliation; old HTML does
not prove a queued job stopped. Pre-hook failures may restore the previous tag
while keeping the journal closed.

## First controller release

`latest` must hold the digest the Image app serves before its tag field changes
from the digest pin to `latest`. Then set `manual` and deploy a distinct
candidate with the served digest as `expected_current_digest`. That run creates
the two journal tags; an already-serving no-op does not. Set `automatic` only
after the run ends `http-verified` and the Coolify deployment shows Success.

## Rollback

Dispatch `deploy` with the earlier commit, its build digest and the current
`latest` digest. Every build since `68dae74` keeps its full-SHA tag.

`docker-compose.yml` is the retained legacy rollback file, for the case where
the Image app itself cannot serve. Its literal digest is the image observed
running before migration. Do not retag that digest or replace the file's image
with `latest`. The stopped Compose app `sqfl8zi2uuwni5cflrmzxwax`
(`gamedev-legacy-compose`) has its Git source pinned to
`68dae74143a9665f992f49a3ee71cb35647027ec`, whose Compose file holds that
digest. Never redeploy the legacy app while the Image app serves.

## Downloads

Model and pack ZIP downloads redirect to immutable objects on the asset origin
(`showcase/scripts/DOWNLOADS.md`). The app never owns the byte stream, so a
download continues after the drain and the container's retirement. The build
checks every referenced object before it publishes an image.

## Validation

`node --test scripts/release.test.mjs scripts/rolling-release.test.mjs` covers
build identity, the drain, fixed scope, digest and revision disagreement,
architecture, baseline drift, latched failures, ambiguous hooks, the legacy
app's refusal and registry redirect limits. `node scripts/verify-release.mjs
<full-sha>` runs the public checks alone. A successful webhook response alone
never proves a release finished.
