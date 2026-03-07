# Custom Domains & SSL

## Free Plan - Custom Domain Setup

Surge supports custom domains on the free (Student) plan.

### Step 1: Deploy to the custom domain

```bash
surge ./dist mydomain.com
```

Or with a subdomain:

```bash
surge ./dist app.mydomain.com
```

### Step 2: Configure DNS

Add a CNAME record at the domain's DNS provider:

| Type | Name | Value |
|---|---|---|
| CNAME | `@` or subdomain | `na-west1.surge.sh` |

For apex domains (no subdomain), some DNS providers require an ALIAS or ANAME record instead of CNAME. Common providers:

- **Cloudflare**: Use CNAME flattening (works automatically)
- **Namecheap**: Use CNAME with `@`
- **GoDaddy**: Use CNAME with `@`
- **Route53**: Use ALIAS record

### Step 3: Wait for propagation

DNS changes can take up to 48 hours but usually propagate within minutes. Verify:

```bash
dig mydomain.com CNAME +short
# Should return: na-west1.surge.sh
```

Or:

```bash
nslookup mydomain.com
```

## SSL / HTTPS

### Free plan (*.surge.sh subdomains)

SSL is automatic for `*.surge.sh` domains. No setup needed.

### Free plan (custom domains)

Basic SSL can be provisioned:

```bash
surge encrypt mydomain.com
```

### Professional plan ($30/mo)

- Custom SSL certificates
- Force HTTPS redirects
- Upload your own `.pem` file:

```bash
surge ssl mydomain.com /path/to/cert.pem
```

## DNS Management

Surge has built-in DNS management for domains using Surge's nameservers:

```bash
# View DNS records
surge dns mydomain.com

# Add a record
surge dns mydomain.com add CNAME www na-west1.surge.sh

# Remove a record
surge dns mydomain.com rem <record-id>
```

## Multiple Domains

Deploy the same site to multiple domains:

```bash
surge ./dist primary-domain.com
surge ./dist secondary-domain.surge.sh
```

Each is an independent deployment that can be updated separately.
