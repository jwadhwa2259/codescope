/**
 * Legacy code demonstrating anti-patterns.
 * - Default export
 * - .then() chains (no async/await)
 * - throw string literal (no custom error)
 * - Type alias instead of interface
 */

type UserData = {
  id: string;
  name: string;
  email: string;
};

type Config = {
  apiUrl: string;
  timeout: number;
};

type ResponseData = {
  success: boolean;
  data: unknown;
};

function fetchUser(id: string): Promise<UserData> {
  return fetch(`/api/users/${id}`)
    .then((response) => response.json())
    .then((data) => data as UserData)
    .catch((err) => {
      throw "Failed to fetch user: " + err;
    });
}

function updateUser(id: string, data: Partial<UserData>): Promise<ResponseData> {
  return fetch(`/api/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  })
    .then((response) => response.json())
    .then((result) => {
      if (!result.success) {
        throw "Update failed";
      }
      return result as ResponseData;
    });
}

function deleteUser(id: string): Promise<void> {
  return fetch(`/api/users/${id}`, { method: "DELETE" })
    .then((response) => {
      if (!response.ok) {
        throw "Delete failed";
      }
    });
}

export default class LegacyService {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  getUser(id: string): Promise<UserData> {
    return fetchUser(id);
  }

  updateUser(id: string, data: Partial<UserData>): Promise<ResponseData> {
    return updateUser(id, data);
  }

  deleteUser(id: string): Promise<void> {
    return deleteUser(id);
  }
}
