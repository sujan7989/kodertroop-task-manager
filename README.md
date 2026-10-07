# KoderTroop Task Manager

A full-stack task management application built with Node.js, Express, GraphQL, MongoDB, Redis, Elasticsearch, and React.js.

---

## Live Demo

- **Frontend:** http://localhost:5173
- **GraphQL API:** http://localhost:4000/graphql
- **Health Check:** http://localhost:4000/health

---

## Tech Stack

### Backend
| Technology | Version | Purpose |
|---|---|---|
| Node.js | 18+ | Runtime environment |
| Express | 4.x | HTTP server framework |
| Apollo Server | 3.x | GraphQL server |
| GraphQL | 16.x | API query language |
| MongoDB | 6+ | Primary database |
| Mongoose | 8.x | MongoDB ODM |
| Redis | 4.x (client) | Task list caching |
| Elasticsearch | 8/9.x | Full-text search |
| JSON Web Tokens | 9.x | Authentication |
| bcryptjs | 2.x | Password hashing |
| TypeScript | 7.x | Type safety |

### Frontend
| Technology | Version | Purpose |
|---|---|---|
| React.js | 18.x | UI framework |
| TypeScript | 5.x | Type safety |
| Vite | 5.x | Build tool |
| Apollo Client | 3.x | GraphQL client |
| React Router | 7.x | Client-side routing |
| Tailwind CSS | 3.x | Styling |
| Lucide React | 1.x | Icons |

---

## Features

### Core (Required)
- ✅ User registration and login with JWT authentication
- ✅ Create, Read, Update, Delete tasks
- ✅ Mark tasks as completed
- ✅ MongoDB storage with Mongoose ODM
- ✅ Redis caching — cache-first reads, 10-minute TTL, per-user cache keys, invalidation on every mutation
- ✅ Elasticsearch full-text search on task title and description
- ✅ Elasticsearch index sync on every create, update, delete
- ✅ GraphQL API: `getTasks`, `createTask`, `updateTask`, `deleteTask`, `searchTasks`
- ✅ Context API for authentication state management
- ✅ User-specific tasks — each user sees only their own tasks
- ✅ Responsive UI with TailwindCSS
- ✅ Filter tasks by completion status (All / Active / Completed)

### Bonus (Optional — All Implemented)
- ✅ Server-side pagination on task list
- ✅ Task priority levels — High, Medium, Low with color-coded badges
- ✅ Filter and sort by priority
- ✅ Task due dates with overdue highlighting
- ✅ 5 sort options — Newest, Oldest, Title A→Z, Priority High→Low, Priority Low→High

---

## Project Structure

```
kodertroop-task-manager/
├── client/                          # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── EmptyState.tsx       # Empty list display
│   │   │   ├── LoadingSpinner.tsx   # Animated loading
│   │   │   ├── Navbar.tsx           # Top navigation with progress bar
│   │   │   ├── Pagination.tsx       # Page controls
│   │   │   ├── PriorityBadge.tsx    # Color-coded priority chip
│   │   │   ├── SearchBar.tsx        # Debounced Elasticsearch search
│   │   │   ├── TaskCard.tsx         # Individual task display
│   │   │   └── TaskModal.tsx        # Create / edit task form
│   │   ├── contexts/
│   │   │   ├── AuthContext.tsx      # JWT session management (Context API)
│   │   │   └── ToastContext.tsx     # Global toast notifications
│   │   ├── graphql/
│   │   │   ├── auth.ts              # Auth mutations + ME query
│   │   │   ├── client.ts            # Apollo Client + auth link
│   │   │   └── tasks.ts             # Task queries and mutations
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx        # Main task management page
│   │   │   ├── Login.tsx            # Sign-in page
│   │   │   └── Register.tsx         # Sign-up page
│   │   └── types/
│   │       ├── auth.ts              # Auth TypeScript interfaces
│   │       └── task.ts              # Task TypeScript interfaces
│   ├── .env                         # Frontend environment variables
│   ├── tailwind.config.js
│   └── package.json
│
└── server/                          # Node.js backend
    ├── src/
    │   ├── config/
    │   │   ├── database.ts          # MongoDB connection
    │   │   └── index.ts             # Environment config
    │   ├── errors/
    │   │   └── AppError.ts          # Custom error classes
    │   ├── graphql/
    │   │   ├── formatError.ts       # Apollo error formatter
    │   │   └── typeDefs.ts          # GraphQL schema definition
    │   ├── middleware/
    │   │   ├── auth.ts              # JWT extraction + context builder
    │   │   └── errorHandler.ts      # Express error handler
    │   ├── models/
    │   │   ├── Task.ts              # Mongoose Task schema
    │   │   └── User.ts              # Mongoose User schema
    │   ├── resolvers/
    │   │   └── index.ts             # All GraphQL resolvers
    │   ├── services/
    │   │   ├── authService.ts       # Registration + login logic
    │   │   ├── cacheService.ts      # Redis get / set / invalidate
    │   │   ├── elasticsearchClient.ts  # ES connection
    │   │   ├── redisClient.ts       # Redis connection
    │   │   ├── searchService.ts     # ES index + search
    │   │   └── taskService.ts       # Task CRUD + pagination
    │   ├── utils/
    │   │   ├── jwt.ts               # Sign + verify JWT tokens
    │   │   └── logger.ts            # Structured console logger
    │   └── index.ts                 # Server entry point
    ├── .env                         # Server environment variables
    ├── .env.example                 # Environment variable template
    └── package.json
```

---

## Prerequisites

Install and run these services before starting:

| Service | Version | Download |
|---|---|---|
| Node.js | >= 18.x | https://nodejs.org |
| MongoDB | >= 6.x | https://www.mongodb.com/try/download/community |
| Redis | >= 5.x | https://github.com/tporadowski/redis/releases (Windows) |
| Elasticsearch | >= 8.x | https://www.elastic.co/downloads/elasticsearch |

---

## Setup & Installation

### Step 1 — Clone the repository

```bash
git clone https://github.com/sujan7989/kodertroop-task-manager.git
cd kodertroop-task-manager
```

### Step 2 — Install dependencies

```bash
# Backend
cd server
npm install

# Frontend
cd ../client
npm install
```

### Step 3 — Configure environment variables

**Backend** — `server/.env` (copy from `.env.example`):

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

JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d
```

**Frontend** — `client/.env`:

```env
VITE_API_URL=http://localhost:4000
VITE_GRAPHQL_URL=http://localhost:4000/graphql
```

### Step 4 — Start external services

**MongoDB** (Windows — runs as a service after install, auto-starts):
```bash
# Verify it is running
Get-Service -Name MongoDB
```

**Redis** (Windows — runs as a service after install):
```bash
# Verify it is running
redis-cli ping
# Expected: PONG
```

**Elasticsearch** (Windows — must be started manually):
```bash
# Important: add this line to config/elasticsearch.yml first:
# xpack.security.enabled: false

# Then start:
D:\elasticsearch\elasticsearch-9.5.5\bin\elasticsearch.bat

# Verify (in a new terminal, after ~60 seconds):
curl http://localhost:9200
# Expected: { "tagline": "You Know, for Search" }
```

> **Note:** Elasticsearch takes 30–60 seconds to fully start. The app works without it (tasks still load) — only search is unavailable until ES is ready.

### Step 5 — Start the application

```bash
# Terminal 1 — Backend (port 4000)
cd server
npm run dev

# Terminal 2 — Frontend (port 5173)
cd client
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## Environment Variables Reference

### Server

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | Express server port |
| `NODE_ENV` | `development` | Environment mode |
| `MONGODB_URI` | — | MongoDB connection string |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | _(empty)_ | Redis password (leave blank for local) |
| `ELASTICSEARCH_NODE` | `http://localhost:9200` | Elasticsearch URL |
| `ELASTICSEARCH_USERNAME` | _(empty)_ | ES username (leave blank if security disabled) |
| `ELASTICSEARCH_PASSWORD` | _(empty)_ | ES password |
| `JWT_SECRET` | — | Secret key for signing JWT tokens |
| `JWT_EXPIRES_IN` | `7d` | Token expiry duration |

### Client

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend base URL |
| `VITE_GRAPHQL_URL` | GraphQL endpoint URL |

---

## GraphQL API Reference

### Queries

```graphql
# Get all tasks for the logged-in user (paginated, Redis-cached)
getTasks(page: Int, limit: Int, filter: TaskFilter): PaginatedTasks!

# Full-text search via Elasticsearch
searchTasks(query: String!): [Task!]!

# Get the currently authenticated user
me: User

# Server health check
_health: Health!
```

### Mutations

```graphql
# Register a new user
register(input: RegisterInput!): AuthPayload!

# Login with email and password
login(input: LoginInput!): AuthPayload!

# Create a new task (requires authentication)
createTask(input: CreateTaskInput!): Task!

# Update a task (requires authentication + ownership)
updateTask(id: ID!, input: UpdateTaskInput!): Task!

# Delete a task (requires authentication + ownership)
deleteTask(id: ID!): Boolean!
```

### GraphQL Types

```graphql
type Task {
  id: ID!
  title: String!
  description: String!
  completed: Boolean!
  userId: ID!
  priority: TaskPriority!    # low | medium | high
  dueDate: String            # ISO 8601 string, optional
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

type AuthPayload {
  token: String!
  user: User!
}
```

### Example GraphQL Queries

**Register:**
```graphql
mutation {
  register(input: {
    name: "John Doe"
    email: "john@example.com"
    password: "Secret@123"
  }) {
    token
    user { id name email }
  }
}
```

**Create a task:**
```graphql
mutation {
  createTask(input: {
    title: "Build the API"
    description: "Set up Apollo Server with Express"
    priority: high
    dueDate: "2026-11-30T00:00:00Z"
  }) {
    id title priority completed
  }
}
```

**Search tasks:**
```graphql
query {
  searchTasks(query: "Redis cache") {
    id title description priority
  }
}
```

---

## How Redis Caching Works

1. When `getTasks` is called, the server first checks Redis for key `tasks:user:<userId>`
2. **Cache hit** → returns data directly from Redis (fast)
3. **Cache miss** → fetches from MongoDB, stores result in Redis with **600-second TTL (10 minutes)**
4. On every `createTask`, `updateTask`, or `deleteTask` → cache is immediately **invalidated** for that user
5. Next `getTasks` call re-fetches from MongoDB and re-populates the cache

This means reads are fast (Redis) and data is always fresh after any write.

---

## How Elasticsearch Search Works

1. Every time a task is **created** → document is indexed in Elasticsearch
2. Every time a task is **updated** → document is re-indexed in Elasticsearch
3. Every time a task is **deleted** → document is removed from Elasticsearch
4. `searchTasks(query)` runs a **`multi_match`** query across both `title` and `description` fields
5. Results are scoped to the authenticated user via a `bool.filter` clause
6. If Elasticsearch is unavailable, the app degrades gracefully — tasks still load, only search returns an error

---

## Password Requirements

When registering, passwords must have:
- Minimum **8 characters**
- At least **one uppercase letter** (A–Z)
- At least **one lowercase letter** (a–z)
- At least **one number** (0–9)

Example valid password: `MyPass@123`

---

## Available Scripts

### Backend (`/server`)

```bash
npm run dev        # Start server (compiles TypeScript then runs with Node)
npm run build      # Compile TypeScript to dist/
npm run start      # Run compiled production build
npm run typecheck  # Validate TypeScript types without emitting
```

### Frontend (`/client`)

```bash
npm run dev        # Start Vite dev server on port 5173
npm run build      # Type-check + Vite production build
npm run preview    # Preview the production build locally
npm run typecheck  # Validate TypeScript types
```

---

## Architecture Decisions

### Why Apollo Server 3 with Express (not standalone)?
Apollo Server 3 integrates with Express via `applyMiddleware`, making it straightforward to add custom Express middleware like CORS, health check endpoints, and error handlers alongside GraphQL. This gives full control over the HTTP layer.

### Why Redis cache only for the default page fetch?
Caching every combination of `(page, limit, filter)` would create complex cache key management and high memory usage. The strategy caches the full unfiltered task list on the default fetch (page 1, no filter), then paginates in memory on cache hits. Filtered or non-default page queries bypass cache and go directly to MongoDB.

### Why Elasticsearch `multi_match` with `bool.filter`?
The `bool.filter` clause restricts results to the authenticated user's tasks before scoring (no scoring overhead on the ownership filter). The `bool.must` + `multi_match` then scores relevance across `title` and `description`. This ensures correctness (users only see their tasks) and relevance (best matches first).

### Why graceful degradation for Redis and Elasticsearch?
Both services wrap every operation in try/catch. If Redis is down, every request falls through to MongoDB — no data loss. If Elasticsearch is down, `getTasks` still works; only `searchTasks` returns a service unavailable error. This makes the app resilient to infrastructure issues.

### Why TypeScript strict mode on both client and server?
`strict: true` plus `noUnusedLocals` and `noUnusedParameters` catches entire classes of runtime bugs at compile time. Both server and client share the same TypeScript version (7.x) to avoid type-checking discrepancies between the IDE and the compiler.

### Why Vite instead of Create React App?
Vite provides significantly faster development server startup and HMR (Hot Module Replacement) compared to CRA. It also has better TypeScript support out of the box and produces smaller production bundles.

---

## Security

- All passwords hashed with **bcrypt** (12 salt rounds)
- JWT tokens signed with **HS256**, expire in **7 days**
- Every task mutation verifies **ownership** — users cannot modify other users' tasks
- Bearer token attached to every GraphQL request via Apollo Client auth link
- Missing or invalid tokens return `UNAUTHENTICATED` GraphQL errors
- Duplicate email registration returns `CONFLICT` error

---

## Deployment (Not Required for Assessment)

This project is designed to run locally. For production deployment:
- Use **MongoDB Atlas** instead of local MongoDB
- Use **Redis Cloud** or **AWS ElastiCache** instead of local Redis
- Use **Elastic Cloud** instead of local Elasticsearch
- Set `NODE_ENV=production` and use a strong `JWT_SECRET`
- Build the client: `npm run build` — serve the `dist/` folder via nginx or a CDN

---

## Author

**Sujan Kumar**
GitHub: https://github.com/sujan7989
Repository: https://github.com/sujan7989/kodertroop-task-manager
