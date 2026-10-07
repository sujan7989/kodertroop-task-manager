export const typeDefs = `#graphql
  type Query {
    _health: Health!
    me: User
    getTasks(page: Int, limit: Int, filter: TaskFilter): PaginatedTasks!
    searchTasks(query: String!): [Task!]!
  }

  type Mutation {
    _health: Health!
    register(input: RegisterInput!): AuthPayload!
    login(input: LoginInput!): AuthPayload!
    createTask(input: CreateTaskInput!): Task!
    updateTask(id: ID!, input: UpdateTaskInput!): Task!
    deleteTask(id: ID!): Boolean!
  }

  type Health {
    status: String!
    timestamp: String!
  }

  type User {
    id: ID!
    name: String!
    email: String!
    createdAt: String!
    updatedAt: String!
  }

  enum TaskPriority {
    low
    medium
    high
  }

  type Task {
    id: ID!
    title: String!
    description: String!
    completed: Boolean!
    userId: ID!
    priority: TaskPriority!
    dueDate: String
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

  input RegisterInput {
    name: String!
    email: String!
    password: String!
  }

  input LoginInput {
    email: String!
    password: String!
  }

  input TaskFilter {
    completed: Boolean
  }

  input CreateTaskInput {
    title: String!
    description: String!
    completed: Boolean
    priority: TaskPriority
    dueDate: String
  }

  input UpdateTaskInput {
    title: String
    description: String
    completed: Boolean
    priority: TaskPriority
    dueDate: String
  }
`;
