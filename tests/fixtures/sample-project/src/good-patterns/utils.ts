/**
 * Utility functions demonstrating conventions.
 * - Named exports
 * - Function declarations (not arrow)
 * - Interface definitions
 * - Explicit return types
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface PaginationOptions {
  page: number;
  limit: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
}

export function validateEmail(email: string): ValidationResult {
  const errors: string[] = [];
  if (!email || email.trim().length === 0) {
    errors.push("Email is required");
  }
  if (email && !email.includes("@")) {
    errors.push("Email must contain @");
  }
  if (email && email.length > 254) {
    errors.push("Email exceeds maximum length");
  }
  return { valid: errors.length === 0, errors };
}

export function paginate<T>(
  items: T[],
  options: PaginationOptions,
): PaginatedResult<T> {
  const { page, limit } = options;
  const offset = options.offset ?? (page - 1) * limit;
  const total = items.length;
  const totalPages = Math.ceil(total / limit);
  const paginatedItems = items.slice(offset, offset + limit);
  return { items: paginatedItems, total, page, totalPages };
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]!;
}
