# Production Deployment (Docker + Nginx)

This repo includes a production deployment stack in `docker-compose.prod.yml`:

- `nginx`: public entrypoint on port `80`
- `web`: static frontend container (served by internal nginx)
- `server`: Express API container on internal port `8000`

Only the edge nginx service is exposed publicly. The app containers are private on the Docker network.

## 1) Prepare environment files

1. Copy the root production environment template:

```bash
cp .env.production.example .env
```

2. Set the real public domain in `.env`:

```env
PUBLIC_APP_URL=https://your-domain.com
ALLOW_OPENAPI=false
```

3. Ensure `apps/server/.env` exists and contains all required secrets.
   You can start from:

```bash
cp apps/server/.env.example apps/server/.env
```

## 2) Build and start containers

```bash
pnpm docker:prod:build
pnpm docker:prod:up
```

Or directly with docker compose:

```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

## 3) Verify deployment

```bash
curl -i http://localhost/health
```

Expected: HTTP `200` with JSON status payload.

## 4) Logs and shutdown

```bash
pnpm docker:prod:logs
pnpm docker:prod:down
```

## TLS / HTTPS

For production HTTPS, terminate TLS at your load balancer or ingress (recommended), or use the provided Nginx template:

1. Copy `infra/nginx/conf.d/default.https.conf.template` to `infra/nginx/conf.d/default.conf`.
2. Replace `your-domain.com` and `security@your-domain.com`.
3. Mount certificate/challenge paths in the `nginx` service if you are terminating TLS in-container:
   - `/etc/letsencrypt` for cert files
   - `/var/www/certbot` for ACME HTTP-01 challenge files

The HTTPS template is Let's Encrypt-ready and includes:
- HTTP to HTTPS redirect (except ACME challenge path)
- modern TLS defaults
- HSTS and expanded hardening headers

## Related docs

- Rate limiting design and operations: `docs/rate-limiting.md`

## security.txt

The project now includes `apps/web/public/.well-known/security.txt`.

Before release, update:
- `Contact` with your real security email
- `Canonical` and `Policy` with your public domain
- `Expires` to a future date (renew periodically)
