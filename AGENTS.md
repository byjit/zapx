# Project Overview

Zapx - allows developers to monetize APIs on a per-request basis using the x402 payment protocol with custodial aggregation.

# Coding Guidelines
- Write elegant, clean, and maintainable code.
- Ensure a good directory structure and modularity.
- Add explanatory comments to the code where necessary.
- Use meaningful variable and function names relevant to the language.
- Use consistent naming conventions.
- When working on the frontend, ensure responsiveness and a beautiful, consistent UI.
- When working on the backend, ensure efficient code that follows best practices for security and performance.
- When working on the database, ensure the schema is well defined and follows best practices for data integrity and performance.
- Do not delete any files or code to fix errors; ask the user for clarification if unsure.
- Apply the following principles in all code you generate:
    - **DRY (Don't Repeat Yourself):** Abstract repeated logic into functions or modules to avoid duplication.
    - **YAGNI (You Aren't Gonna Need It):** Only implement features and code that are currently required; avoid speculative additions.
    - **SOLID Principles:**
        - *Single Responsibility:* Each module/class/function should have one clear responsibility.
        - *Open/Closed:* Code should be open for extension but closed for modification.
        - *Liskov Substitution:* Subtypes must be substitutable for their base types without altering correctness.
        - *Interface Segregation:* Prefer small, specific interfaces over large, general ones.
        - *Dependency Inversion:* Depend on abstractions, not concrete implementations.
- Write clean, maintainable, and modular code that adheres to these principles.
- Add comments where necessary for clarity, but avoid excessive commenting.
- Structure code into smaller, modular files and follow best practices.
- Do not repeat yourself; keep solutions simple.

## Tech stack

- **TanStack Router** - File-based routing with full type safety
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **shadcn/ui** - Reusable UI components
- **Express** - Fast, unopinionated web framework
- **tRPC** - End-to-end type-safe APIs
- **Node.js** - Runtime environment
- **Drizzle** - TypeScript-first ORM
- **Neon Postgres** - Serverless PostgreSQL database
- **Authentication** - Better-Auth
- **Turborepo** - Optimized monorepo build system
- **PNPM (Package Manager)** - pnpm for efficient package management
- **Ultracite** - Code quality, linting and consistency tool
- **Supertest** - Testing framework for backend
- **AI SDK v6** - For AI implementation


## Project Structure

```
turborepo-boilerplate/
├── apps/
|   ...
│   ├── web/         # Frontend application (React + TanStack Router)
│   └── server/      # Backend API (Express, TRPC)
├── packages/
|   ...
│   ├── api/         # API layer / business logic
│   ├── auth/        # Authentication configuration & logic
│   ├── db/          # Database schema & queries
│   ├── env/          # Environment variables
│   └── services/     # Shared Business logic & services (e.g., email service, notification service)
```

## Development

- The browser runs on `http://localhost:3001`
- The API server runs on `http://localhost:3000`


## Available Scripts

- `pnpm dev`: Start all applications in development mode
- `pnpm build`: Build all applications
- `pnpm check-types`: Check TypeScript types across all apps
- `pnpm dev:web`: Start only the web application
- `pnpm dev:server`: Start only the server
- `pnpm db:sync`: Generate and apply schema migrations to the database
- `pnpm email-preview`: Preview emails

## NOTES

- When db schema is changed, run `pnpm db:sync` to sync the changes to the database.
- The `/docs` folder is the place for all documentation related to the development of the project.
- When working on the frontend, keep the UI consistent with the rest of the app. And use shadcn + tailwind css as much as possible.
- Use `httpErrors.<name>()` to throw typed HTTP errors (e.g., `httpErrors.unauthorized()`) from middleware or routes. Import the helper from `./src/utils/http-error` and pass a custom message or options when needed.
- The public landing page is inside `apps/web/src/routes/index.tsx` file.
- Use the `apps/web/src/components/logo.tsx` component whenever a logo is needed.
- The shadcn web UI components are inside `apps/web/src/components/ui/` folder.
- The AI components are inside `apps/web/src/components/ai-elements/` folder.
- Normally you can use the `x402-payments` skill to learn more about x402 implementation. But if you need more detailed information, you can also fetch the respective documentation from `docs/x402-full-documentation.txt` file.


## Tests

- For testing backend use Supertest.
- No need to write tests for frontend.
