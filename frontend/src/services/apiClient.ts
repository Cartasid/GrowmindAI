/**
 * Centralized API client with proper error handling, validation, and retry logic.
 * All API calls should use this client instead of fetch directly.
 */

import { apiUrl } from "../api";

export interface ServiceError {
  code: string;
  message: string;
  details?: string;
  status?: number;
  timestamp?: string;
}

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: ServiceError };

/**
 * Validate response is proper JSON and matches expected type constraints
 */
function validateResponse(response: Response, data: unknown): { valid: boolean; error?: string } {
  if (!response.ok) {
    return { valid: false, error: `HTTP ${response.status}: ${response.statusText}` };
  }

  // Check for expected response type
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return { valid: false, error: "Invalid content-type, expected JSON" };
  }

  // Ensure data is object/array
  if (data === null || (typeof data !== "object" && !Array.isArray(data))) {
    return { valid: false, error: "Response body is not valid JSON object" };
  }

  return { valid: true };
}

/**
 * Parse error response from backend
 */
function parseErrorResponse(status: number, data: unknown): ServiceError {
  if (typeof data === "object" && data !== null && "detail" in data) {
    return {
      code: `HTTP_${status}`,
      message: String((data as { detail: unknown }).detail || "Unknown error"),
      status,
      timestamp: new Date().toISOString(),
    };
  }

  if (typeof data === "string") {
    return {
      code: `HTTP_${status}`,
      message: data,
      status,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    code: `HTTP_${status}`,
    message: "An unexpected error occurred",
    details: JSON.stringify(data),
    status,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Central API client with error handling and retry logic
 */
export class ApiClient {
  private baseUrl: string;
  private timeout: number = 30000;
  private retryAttempts: number = 2;
  private retryDelay: number = 1000;

  constructor(baseUrl: string = "") {
    this.baseUrl = baseUrl;
  }

  /**
   * Make a GET request
   */
  async get<T>(path: string): Promise<ServiceResult<T>> {
    return this.request<T>("GET", path, undefined);
  }

  /**
   * Make a POST request
   */
  async post<T>(path: string, body: unknown): Promise<ServiceResult<T>> {
    return this.request<T>("POST", path, body);
  }

  /**
   * Make a PUT request
   */
  async put<T>(path: string, body: unknown): Promise<ServiceResult<T>> {
    return this.request<T>("PUT", path, body);
  }

  /**
   * Make a DELETE request
   */
  async delete<T>(path: string): Promise<ServiceResult<T>> {
    return this.request<T>("DELETE", path, undefined);
  }

  /**
   * Core request method with error handling and retries
   */
  private async request<T>(
    method: string,
    path: string,
    body: unknown,
    attempt: number = 1
  ): Promise<ServiceResult<T>> {
    try {
      const fullUrl = apiUrl(path);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      try {
        const response = await fetch(fullUrl, {
          method,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Parse response body
        let data: unknown;
        try {
          data = await response.json();
        } catch {
          if (response.ok) {
            // If successful but can't parse JSON, that's okay
            data = null;
          } else {
            return {
              ok: false,
              error: {
                code: "PARSE_ERROR",
                message: "Failed to parse server response",
                status: response.status,
              },
            };
          }
        }

        // Validate response
        const validation = validateResponse(response, data);
        if (!validation.valid || !response.ok) {
          const error = parseErrorResponse(response.status, data);
          return { ok: false, error };
        }

        return { ok: true, data: (data as T) || ({} as T) };
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err) {
      // Handle network errors and retries
      if (err instanceof Error) {
        if (err.name === "AbortError") {
          return {
            ok: false,
            error: {
              code: "TIMEOUT",
              message: `Request timeout (${this.timeout}ms)`,
            },
          };
        }

        // Retry on network errors (except timeouts)
        if (attempt < this.retryAttempts && this.isRetryableError(err)) {
          await new Promise((resolve) => setTimeout(resolve, this.retryDelay * attempt));
          return this.request<T>(method, path, body, attempt + 1);
        }

        return {
          ok: false,
          error: {
            code: "NETWORK_ERROR",
            message: err.message || "Network request failed",
            details: err.toString(),
          },
        };
      }

      return {
        ok: false,
        error: {
          code: "UNKNOWN_ERROR",
          message: "An unexpected error occurred",
          details: String(err),
        },
      };
    }
  }

  /**
   * Check if error is retryable (network, not 4xx)
   */
  private isRetryableError(err: Error): boolean {
    // Retry for network-like errors
    return (
      err.message?.includes("fetch") ||
      err.message?.includes("network") ||
      err.message?.includes("Failed to")
    );
  }
}

// Export singleton instance
export const apiClient = new ApiClient();
