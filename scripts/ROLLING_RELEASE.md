# Rolling release adoption

The main workflow builds a full-SHA-tagged image and records its digest in a
release artifact. It does not update `latest`, invoke a deployment hook, or
enable automatic releases. `workflow_dispatch` with operation `verify` only
checks the requested full SHA at https://gamedev.trebeljahr.com.

The Docker build requires `DEPLOYMENT_ID` to be the full source commit. It embeds
that identity in `/version.json` and the homepage `build-commit` metadata. Next's
`deploymentId` uses the same commit for client/server version skew handling.
The runtime must serve `/version.json` with `Cache-Control: no-store`.

The image waits 20 seconds on SIGTERM while failing only loopback health probes.
Set Coolify health checks to `/`, interval 2 seconds, timeout 5 seconds, 5 retries
and a start period long enough for boot. The runtime has curl for Coolify's
in-container probe. Container names and host port mappings must remain unset.
The first adoption cannot add graceful shutdown to the old running image.

`docker-compose.yml` is the retained legacy rollback file. Its literal digest
is the image observed running before migration. Do not retag that digest or
replace the file's image with `latest`. Before migrating, pin the legacy Coolify
Git source to the full candidate commit containing this file and read it back.
Validate that exact commit's Compose file still contains this digest.

Use Hatchkit's explicit `--image <service>=<repository>@sha256:<candidate>` with
`--keep-live-tag --rollback-commit <candidate-source-sha>` so the new Image app
uses the new image while legacy rollback retains the old one. The CLI refuses
missing or changed source commit pins. It records source and replacement refs;
these are configuration evidence, not proof of a running container digest.
Inspect the exact Coolify deployment and running RepoDigest before accepting
cutover. Keep automatic hooks disabled until a second release proves rolling
behavior, then add the guarded controller with the new app's fixed UUID.

Validation: `node --test scripts/release.test.mjs`; `node scripts/verify-release.mjs
<full-sha>`. The latter requires 16 consecutive matching version and HTML samples,
separated by 2 seconds. A successful webhook response alone never proves a
release finished.

## Download verification gate

The model-download endpoint proxies upstream asset bodies. The pack ZIP endpoint
fetches a pack's models and streams a generated archive. Either request can
outlast Coolify's 30-second stop deadline. The drain tests verify bounded accepted
requests; they do not certify uninterrupted large downloads. Keep automatic
rollouts disabled until a realistic long-download cutover passes or those
responses move to resumable delivery that survives a web-container replacement.
