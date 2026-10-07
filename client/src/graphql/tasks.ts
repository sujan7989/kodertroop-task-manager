import { gql } from '@apollo/client';

const TASK_FIELDS = `
  id
  title
  description
  completed
  userId
  priority
  dueDate
  createdAt
  updatedAt
`;

export const GET_TASKS_QUERY = gql`
  query GetTasks($page: Int, $limit: Int, $filter: TaskFilter) {
    getTasks(page: $page, limit: $limit, filter: $filter) {
      tasks {
        ${TASK_FIELDS}
      }
      totalCount
      page
      limit
      totalPages
      hasNextPage
      hasPreviousPage
    }
  }
`;

export const SEARCH_TASKS_QUERY = gql`
  query SearchTasks($query: String!) {
    searchTasks(query: $query) {
      ${TASK_FIELDS}
    }
  }
`;

export const CREATE_TASK_MUTATION = gql`
  mutation CreateTask($input: CreateTaskInput!) {
    createTask(input: $input) {
      ${TASK_FIELDS}
    }
  }
`;

export const UPDATE_TASK_MUTATION = gql`
  mutation UpdateTask($id: ID!, $input: UpdateTaskInput!) {
    updateTask(id: $id, input: $input) {
      ${TASK_FIELDS}
    }
  }
`;

export const DELETE_TASK_MUTATION = gql`
  mutation DeleteTask($id: ID!) {
    deleteTask(id: $id)
  }
`;
