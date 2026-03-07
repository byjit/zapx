# CI/CD Integration

## Authentication for CI/CD

All CI/CD pipelines need two environment variables:

| Variable | Value |
|---|---|
| `SURGE_LOGIN` | Your email address |
| `SURGE_TOKEN` | Your surge token |

Generate a token locally:

```bash
surge token
```

Store both as secrets/environment variables in your CI/CD provider.

## GitHub Actions

```yaml
name: Deploy to Surge
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - run: npx surge ./dist ${{ vars.SURGE_DOMAIN }}
        env:
          SURGE_LOGIN: ${{ secrets.SURGE_LOGIN }}
          SURGE_TOKEN: ${{ secrets.SURGE_TOKEN }}
```

### Preview deploys on PRs

```yaml
name: Preview Deploy
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - name: Deploy preview
        run: |
          DOMAIN="pr-${{ github.event.number }}-myproject.surge.sh"
          npx surge ./dist $DOMAIN
          echo "Preview: https://$DOMAIN" >> $GITHUB_STEP_SUMMARY
        env:
          SURGE_LOGIN: ${{ secrets.SURGE_LOGIN }}
          SURGE_TOKEN: ${{ secrets.SURGE_TOKEN }}
```

## GitLab CI

```yaml
deploy:
  image: node:20
  stage: deploy
  script:
    - npm ci
    - npm run build
    - npx surge ./dist $SURGE_DOMAIN
  only:
    - main
  variables:
    SURGE_LOGIN: $SURGE_LOGIN
    SURGE_TOKEN: $SURGE_TOKEN
```

## Teardown on PR Close

Clean up preview deployments when PRs are merged or closed:

```yaml
name: Teardown Preview
on:
  pull_request:
    types: [closed]

jobs:
  teardown:
    runs-on: ubuntu-latest
    steps:
      - run: npx surge teardown pr-${{ github.event.number }}-myproject.surge.sh
        env:
          SURGE_LOGIN: ${{ secrets.SURGE_LOGIN }}
          SURGE_TOKEN: ${{ secrets.SURGE_TOKEN }}
```
