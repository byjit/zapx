# surge-deploy

Deploy any website's build output to the web in seconds using [surge.sh](https://surge.sh).

Works with React, Vite, Vue, Next.js (static export), Astro, SvelteKit, Hugo, 11ty, plain HTML — anything that produces a build folder.

Skills follow the [Agent Skills](https://agentskills.io/) format.

## Installation

```bash
npx skills add aruntemme/surge-deploy
```

### Prerequisites

Surge CLI must be installed and authenticated on the machine:

```bash
npm install -g surge
surge login
```

This is a one-time setup. Authentication persists until you explicitly log out.

## Usage

Once installed, the skill is automatically available. Trigger it with:

```
/static-deploy
```

Or natural language:

```
deploy to surge
```
```
static deploy this project
```
```
push this to surge.sh
```

### What it does

1. Checks surge is installed and authenticated
2. Detects the build folder (or runs the build)
3. Handles SPA routing automatically (creates `200.html`)
4. Deploys to surge.sh
5. Saves the domain in `.surge-domain` so re-deploys go to the same URL

### Re-deploys

The skill remembers your domain per project via a `.surge-domain` file. Run `/static-deploy` again and it deploys to the same URL — no need to re-enter the domain.

## Supported Frameworks

| Framework | Build Output |
|-----------|-------------|
| Plain HTML/CSS/JS | Project root |
| React (CRA) | `./build` |
| Vite | `./dist` |
| Next.js (static) | `./out` |
| Astro | `./dist` |
| SvelteKit (static) | `./build` |
| Hugo | `./public` |
| 11ty | `./_site` |

## Compatible Agents

Works with any agent that supports the [Agent Skills](https://agentskills.io/) standard:

Claude Code, Cursor, GitHub Copilot, Codex, Windsurf, Cline, Amp, Goose, OpenCode, Roo Code, and more.

## Skill Structure

```
surge-deploy/
├── SKILL.md              # Agent instructions
├── scripts/
│   └── preflight.sh      # Pre-deploy validation
├── references/
│   ├── custom-domains.md  # Custom domain & SSL guide
│   └── ci-cd.md          # GitHub Actions, GitLab CI
└── examples/
    ├── deploy-react.sh    # React/Vite deploy script
    ├── deploy-static.sh   # Plain HTML deploy script
    └── github-action.yml  # GitHub Actions workflow
```

## Demo

This skill's landing page is created and hosted using surge-deploy itself:

[surge-deploy-skill.surge.sh](https://surge-deploy-skill.surge.sh)

## License

MIT
