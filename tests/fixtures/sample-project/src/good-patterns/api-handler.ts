/**
 * API handler demonstrating modern conventions.
 * - Named exports only
 * - async/await
 * - Arrow function exports
 * - Named imports
 */

import { UserService, UserError } from "./user-service.js";

interface ApiResponse<T> {
  status: number;
  data?: T;
  error?: string;
}

interface ApiRequest {
  method: string;
  path: string;
  body?: unknown;
  params?: Record<string, string>;
}

export const handleCreateUser = async (
  req: ApiRequest,
  service: UserService,
): Promise<ApiResponse<unknown>> => {
  try {
    const { name, email } = req.body as { name: string; email: string };
    const user = await service.createUser({ name, email });
    return { status: 201, data: user };
  } catch (err) {
    if (err instanceof UserError) {
      return { status: 400, error: err.message };
    }
    return { status: 500, error: "Internal server error" };
  }
};

export const handleGetUser = async (
  req: ApiRequest,
  service: UserService,
): Promise<ApiResponse<unknown>> => {
  try {
    const id = req.params?.id;
    if (!id) {
      return { status: 400, error: "Missing user ID" };
    }
    const user = await service.getUser(id);
    return { status: 200, data: user };
  } catch (err) {
    if (err instanceof UserError) {
      return { status: 404, error: err.message };
    }
    return { status: 500, error: "Internal server error" };
  }
};

export const handleListUsers = async (
  _req: ApiRequest,
  service: UserService,
): Promise<ApiResponse<unknown>> => {
  const users = await service.listUsers();
  return { status: 200, data: users };
};
