# KRYNO Cloudflare WAF Baseline

Use this as the staging baseline before any public paid launch.

## DNS

- `api-staging.kryno.example` -> backend hosting origin, proxied through Cloudflare.
- `media-staging.kryno.example` -> R2 public bucket/custom domain, proxied through Cloudflare.
- Do not expose the origin hostname publicly if the host supports private ingress or origin allowlisting.

## SSL/TLS

- SSL/TLS mode: Full strict.
- Always Use HTTPS: enabled.
- HSTS: enabled after staging is verified.
- Minimum TLS version: TLS 1.2.

## Managed Rules

- Cloudflare Managed Ruleset: enabled.
- OWASP Core Ruleset: start in simulate/log mode, then switch tuned rules to block.
- Bot Fight Mode or Super Bot Fight Mode: enabled if available.

## Custom Rules

Apply these as WAF custom rules or equivalent rate limits.

### Block API From Non-Expected Methods

Block requests to `/api/*` with methods outside:

- `GET`
- `POST`
- `PUT`
- `DELETE`
- `OPTIONS`

### Auth Abuse Challenge

Challenge requests matching:

- path starts with `/api/auth/`
- threat score is high, or country/ASN is outside expected launch regions, or request rate is abnormal

### Upload Abuse

Challenge or block requests matching:

- path is `/api/social/media` or `/api/attachments/upload`
- request body exceeds expected upload size tier
- user-agent is empty or known automation
- extension indicators include `.php`, `.asp`, `.jsp`, `.sh`, `.bat`, `.cmd`, `.exe`, `.dll`

### Search/Scraping

Rate limit:

- `/api/users/search`
- `/api/social/feed`
- `/api/social/stories`
- `/media/*`

Recommended starting values:

- authenticated API search: 60 requests/minute/IP
- feed/story list: 120 requests/minute/IP
- media: 600 requests/minute/IP with bot rules enabled

### WebSocket Relay

Protect:

- `/api/messages/ws`

Rules:

- allow WebSocket upgrade only over HTTPS/WSS
- rate limit connection attempts per IP
- challenge high-risk IPs before allowing relay traffic

## Cache Rules

- `/api/*`: bypass cache.
- `/media/*`: cache public social media with immutable/static media policy.
- Never cache authenticated API responses.

## Origin Protection

- If hosting supports it, allow only Cloudflare IP ranges to reach the backend origin.
- Keep database, Redis, SMTP, and LiveKit credentials private in host secret manager.

## Validation

After Cloudflare is configured:

```powershell
cd C:\Users\ankit\Downloads\movies\Balti\project\kryno-fresh\backend
npm.cmd run security:staging-check
```

Then manually verify:

- `/api/health` returns `200`.
- `/api/ready` returns `200`.
- API responses include security headers.
- WAF logs show test traffic.
- Upload attempts for unsupported files are rejected before or by backend.
