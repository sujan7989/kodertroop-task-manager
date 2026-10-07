# KoderTroop Task Manager

A production-quality, full-stack task management application built for the KoderTroop assessment. Features a GraphQL API backed by MongoDB, Redis caching, and Elasticsearch full-text search, with a modern React + TypeScript frontend.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend | React + TypeScript | 18.x / 5.x |
| Build Tool | Vite | 5.x |
| Styling | Tailwind CSS | 3.x |
| GraphQL Client | Apollo Client | 3.x |
| Routing | React Router | 7.x |
| Icons | Lucide React | 1.x |
| Backend | Node.js + Express | 18+ / 4.x |
| API Layer | Apollo Server + GraphQL | 3.x / 16.x |
| Database | MongoDB + Mongoose | 8.x |
| Cache | Redis | 4.x client |
| Search | Elasticsearch | 8.x client |
| Auth | JSON Web Tokens (JWT) | 9.x |

---

## Project Structure

```
task/
├── client/                         # React + Vite frontend
│   ├── src/
│   │   ├── components/             # Reusable UI components
│   │   │   ├── EmptyState.tsx      # Empty list display
│   │   │   ├── LoadingSpinner.tsx  # Animated spinner
│   │   │   ├── Navbar.tsx          # Sticky top navigation
│   │   │   ├── Pagination.tsx      # Page prev/next controls
│   │   │   ├── PriorityBadge.tsx   # Colored priority chip
│   │   │   ├── SearchBar.tsx       # Debounced search input
│   │   │   ├── TaskCard.tsx        # Individual task row
│   │   │   └── TaskModal.tsx       # Create/edit modal form
│   │   ├── contexts/
│   │   │   ├── AuthContext.tsx     # JWT session + user state
│   │   │   └── ToastContext.tsx    # Global toast notifications
│   │   ├── graphql/
│   │   │   ├── auth.ts             # Auth mutations + ME query
│   │   │   ├── client.ts           # Apollo Client setup
│   │   │   └── tasks.ts            # Task queries + mutations
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx       # Main task management page
│   │   │   ├── Login.tsx           # Sign-in page
│   │   │   └── Register.tsx        # Sign-up page
│   │   ├── types/
│   │   │   ├── auth.ts             # Auth TypeScript types
│   │   │   └── task.ts             # Task TypeScript types
│   │   └── App.tsx                 # Router + providers
│   ├── .env                        # Frontend env vars
│   └── package.json
│
└── server/                         # Express + Apollo Server backend
    ├── src/
    │   ├── config/
    │   │   ├── database.ts         # MongoDB connection
    │   │   └── index.ts            # Centralized config from .env
    │   ├── errors/
    │   │   └── AppError.ts         # Custom error hierarchy
    │   ├── graphql/
    │   │   ├── formatError.ts      # Apollo error formatter
    │   │   └── typeDefs.ts         # GraphQL schema
    │   ├── middleware/
    │   │   ├── auth.ts             # JWT extraction + context builder
    │   │   └── errorHandler.ts     # Express error handler
    │   ├── models/
    │   │   ├── Task.ts             # Mongoose Task schema
    │   │   └── User.ts             # Mongoose User schema
    │   ├── resolvers/
    │   │   └── index.ts            # All GraphQL resolvers
    │   ├── services/
    │   │   ├── authService.ts      # Register / login logic
    │   │   ├── cacheService.ts     # Redis get/set/invalidate
    │   │   ├── elasticsearchClient.ts # ES connection
    │   │   ├── redisClient.ts      # Redis connection
    │   │   ├── searchService.ts    # ES index + search
    │   │   └── taskService.ts      # Task CRUD + pagination
    │   ├── types/index.ts          # Shared server types
    │   ├── utils/
    │   │   ├── jwt.ts              # Sign + verify tokens
    │   │   └── logger.ts           # Structured logger
    │   └── index.ts                # Server entry point
    ├── .env                        # Server env vars
    └── package.json
```

---

## Prerequisites

You need the following installed and running:

| Service | Version | Download |
|---|---|---|
| Node.js | >= 18.x | https://nodejs.org |
| MongoDB | >= 6.x | https://www.mongodb.com/try/download/community |
| Redis | >= 7.x | https://redis.io/download (Windows: https://github.com/tporadowski/redis/releases) |
| Elasticsearch | >= 8.x | https://www.elastic.co/downloads/elasticsearch |

---

## Setup & Installation

### Step 1 — Install Dependencies

```bash
# Backend
cd server
npm install

# Frontend (separate terminal)
cd client
npm install
```

### Step 2 — Configure Environment Variables

**Server** — `server/.env` is already pre-configured for local development:

```env
PORT=4000
NODE_ENV=development

MONGODB_URI=mongodb://localhost:27017/kodertroop

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

ELASTICSEARCH_NODE=http://localhost:9200
ELASTICSEARCH_USERNAME=
ELASTICSEARCH_PASSWORD=

JWT_SECRET=dev-jwt-secret-change-me-before-production-abc123xyz789
JWT_EXPIRES_IN=7d
```

**Client** — `client/.env` is already pre-configured:

```env
VITE_API_URL=http://localhost:4000
VITE_GRAPHQL_URL=http://localhost:4000/graphql
```

### Step 3 — Start External Services

**MongoDB:**
```bash
mongod
# or if installed as a service, it may already be running
```

**Redis:**
```bash
redis-server
# Windows: run redis-server.exe from your Redis install directory
```

**Elasticsearch:**
```bash
# Linux/Mac
./bin/elasticsearch

# Windows
.\bin\elasticsearch.bat
```

> **Elasticsearch 8 note:** Security is enabled by default. Either:
> - Add `xpack.security.enabled: false` to `config/elasticsearch.yml` (easiest for local dev), or
> - Set `ELASTICSEARCH_USERNAME` and `ELASTICSEARCH_PASSWORD` in `server/.env`
>
> The server handles ES being unavailable gracefully — tasks still work, only search is disabled.

### Step 4 — Run Development Servers

```bash
# Terminal 1 — Backend (port 4000)
cd server
npm run dev

# Terminal 2 — Frontend (port 5173)
cd client
npm run dev
```

Open **http://localhost:5173** in your browser.

GraphQL Playground: **http://localhost:4000/graphql**
Health check: **http://localhost:4000/health**

---

## Available Scripts

### Backend (`/server`)

```bash
npm run dev        # Start dev server with hot-reload
npm run build      # Compile TypeScript → dist/
npm run start      # Run compiled production build
npm run typecheck  # Validate types without emitting
```

### Frontend (`/client`)

```bash
npm run dev        # Vite dev server with HMR (port 5173)
npm run build      # Type-check + Vite production build
npm run preview    # Preview the production build
npm run typecheck  # Validate types without emitting
```

---

## GraphQL API Reference

### Queries

```graphql
# Get paginated task list (Redis-cached for default params)
getTasks(page: Int, limit: Int, filter: TaskFilter): PaginatedTasks!

# Full-text search via Elasticsearch
searchTasks(query: String!): [Task!]!

# Get current authenticated user
me: User

# Health check
_health: Health!
```

### Mutations

```graphql
# Auth
register(input: RegisterInput!): AuthPayload!
login(input: LoginInput!): AuthPayload!

# Tasks (all require authentication)
createTask(input: CreateTaskInput!): Task!
updateTask(id: ID!, input: UpdateTaskInput!): Task!
deleteTask(id: ID!): Boolean!
```

### Types

```graphql
type Task {
  id: ID!
  title: String!
  description: String!
  completed: Boolean!
  userId: ID!
  priority: TaskPriority!   # low | medium | high
  dueDate: String           # ISO 8601 date string
  createdAt: String!
  updatedAt: String!
}

type PaginatedTasks {
  tasks: [Task!]!
  totalCount: Int!
  page: Int!
  limit: Int!
  totalPages: Int!
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
}
```

---

## Features

### Core
- ✅ User registration and login with JWT
- ✅ Create, read, update, delete tasks
- ✅ Mark tasks as completed
- ✅ Full-text search by title and description (Elasticsearch)
- ✅ Task list caching with Redis (10-minute TTL, per-user keys)
- ✅ Cache invalidation on every mutation
- ✅ Real-time ES index sync on create/update/delete

### Bonus Features Implemented
- ✅ **Task priority levels** — high / medium / low with color-coded badges
- ✅ **Due dates** — optional date picker, overdue highlighting
- ✅ **Pagination** — server-side with `page` + `limit` params
- ✅ **Filter by completion status** — All / Active / Completed
- ✅ **Filter by priority** — All / High / Medium / Low
- ✅ **Sort** — Newest, Oldest, Title A→Z, Priority High→Low, Priority Low→High

### UI Highlights
- Dark theme with Tailwind CSS custom design tokens
- Glassmorphism-style cards and modals
- Responsive layout (mobile + desktop)
- Sticky navigation with task stats counter
- Debounced search (300ms) with live results
- Toast notifications for all actions
- Loading states and empty states

---

## Architecture Decisions

### Why Apollo Server 3 (not 4)?
Apollo Server 3 integrates cleanly with Express via `applyMiddleware`, making it straightforward to layer custom Express middleware (CORS, health check, error handlers) alongside GraphQL. Apollo Server 4 requires a different integration pattern. This project targets Express 4 compatibility.

### Why Redis cache only for the default page?
Caching every combination of `(page, limit, filter)` would require complex cache key management and cause high memory usage. The strategy caches the full unfiltered task list for a user on the default fetch (page 1, limit 20, no filter), then serves filtered/paginated views from that cache. All other queries hit MongoDB directly. This balances cache hit rate with implementation simplicity.

### Why re-fetch from MongoDB for cache population?
When a paginated result triggers a cache fill, the service fetches the complete unfiltered user task list to store — not just the current page. This ensures the cache always reflects the true complete list, so subsequent cache hits can be paginated in memory without serving stale partial data.

### Why Elasticsearch multi_match with bool/filter?
The `bool.filter` clause scopes results to the authenticated user's tasks before scoring (no relevance for the filter condition), while `bool.must` + `multi_match` scores against `title` and `description` fields. This ensures users only see their own tasks in search results and relevance ranking applies only to text matching.

### Why graceful degradation for Redis and Elasticsearch?
Both services are wrapped in try/catch throughout. If Redis is down, every operation falls through to MongoDB — no data loss or crashes. If Elasticsearch is down, `getTasks` still works; only `searchTasks` returns an error. This makes the app resilient to infrastructure issues in development.

### Why TypeScript strict mode everywhere?
`strict: true` plus `noUnusedLocals` and `noUnusedParameters` catches entire classes of bugs at compile time. The cost is more upfront type annotation; the benefit is zero runtime surprises from type mismatches.

---

## Password Requirements

Registration enforces:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter  
- At least one digit

---

## Security Notes

- JWT tokens are signed with HS256 and expire in 7 days (configurable via `JWT_EXPIRES_IN`)
- Passwords are hashed with bcrypt at 12 rounds
- All task mutations/queries verify ownership — users can only access their own tasks
- The `Authorization: Bearer <token>` header is parsed on every request
- Missing or invalid tokens return `UNAUTHENTICATED` GraphQL errors, not 401 HTTP errors (GraphQL convention)
