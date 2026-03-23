/**
 * User service demonstrating modern TypeScript conventions.
 * - Named exports (no default export)
 * - async/await (no .then chains)
 * - Custom error class extending Error
 * - Named imports
 * - Explicit return types
 * - Interface definitions
 */

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export interface UserCreateInput {
  name: string;
  email: string;
}

export class UserError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "UserError";
  }
}

export class UserService {
  private users: Map<string, User> = new Map();
  private events: EventEmitter = new EventEmitter();

  async createUser(input: UserCreateInput): Promise<User> {
    const existing = await this.findByEmail(input.email);
    if (existing) {
      throw new UserError("Email already in use", "DUPLICATE_EMAIL");
    }

    const user: User = {
      id: randomUUID(),
      name: input.name,
      email: input.email,
      createdAt: new Date(),
    };

    this.users.set(user.id, user);
    this.events.emit("user:created", user);
    return user;
  }

  async getUser(id: string): Promise<User> {
    const user = this.users.get(id);
    if (!user) {
      throw new UserError("User not found", "NOT_FOUND");
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | undefined> {
    for (const user of this.users.values()) {
      if (user.email === email) {
        return user;
      }
    }
    return undefined;
  }

  async listUsers(): Promise<User[]> {
    return Array.from(this.users.values());
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.getUser(id);
    this.users.delete(id);
    this.events.emit("user:deleted", user);
  }
}

export function createUserService(): UserService {
  return new UserService();
}
