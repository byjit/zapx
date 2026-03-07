# turborepo-boilerplate

This project was created with [Better-T-Stack](https://github.com/AmanVarshney01/create-better-t-stack), a modern TypeScript stack that combines React, TanStack Router, Express, TRPC, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
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

## Getting Started

First, install the dependencies:

```bash
pnpm install
```
## Database Setup

This project uses Neon Postgres with Drizzle ORM.

1. Create a Neon database at [console.neon.tech](https://console.neon.tech) and copy the connection string.

2. Add `DATABASE_URL` to your `.env` file in the `apps/server` directory:
```
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
```

3. Apply the schema to your database:
```bash
pnpm db:sync
```


Then, run the development server:

```bash
pnpm dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.
The API is running at [http://localhost:3000](http://localhost:3000).

## Production Deployment

Production deployment with Docker and Nginx is documented in [`docs/deployment.md`](docs/deployment.md).

Quick start:

```bash
cp .env.production.example .env
cp apps/server/.env.example apps/server/.env
pnpm docker:prod:build
pnpm docker:prod:up
```


## Project Structure

```
turborepo-boilerplate/
├── apps/
│   ├── web/         # Frontend application (React + TanStack Router)
│   └── server/      # Backend API (Express, TRPC)
├── packages/
│   ├── api/         # API layer / business logic
│   ├── auth/        # Authentication configuration & logic
│   ├── cache/        # Caching utilities
│   └── db/          # Database schema & queries
```

## TODOs

- add multi-tenancy, RBAC, Fine grained permission
- neon db setup
- make dashboard UI better
[-] better global error, 404 page
