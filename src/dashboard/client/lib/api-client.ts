/**
 * Typed fetch wrapper for all dashboard API endpoints.
 * Base URL defaults to window.location.origin (same host).
 */

export interface GraphNode {
  id: string;
  name: string;
  kind: string;
  filePath: string;
  centrality: number;
  community: number;
  isDangerZone: boolean;
  x?: number;
  y?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: string;
}

export interface GraphApiResponse {
  status: 'ok';
  data: {
    nodes: GraphNode[];
    edges: GraphEdge[];
    communities: Record<string, number>;
    dangerZones: string[];
  };
}

export interface StatusApiResponse {
  status: 'ok';
  data: {
    nodeCount: number;
    edgeCount: number;
    communityCount: number;
    bootstrapDate: string | null;
    isBootstrapped: boolean;
  };
}

export interface ConventionsApiResponse {
  status: 'ok';
  data: {
    generated: string;
    files: Record<
      string,
      Array<{
        name: string;
        adoption_pct: number;
        confidence: string;
        category: string;
        compliance: number;
        color: 'green' | 'yellow' | 'red';
      }>
    >;
  };
}

export interface ReadinessApiResponse {
  status: 'ok';
  data: {
    current: {
      overall_grade: string;
      overall_percent: number;
      convention_coverage: number;
      type_safety: number;
      test_coverage_proxy: number;
      import_graph_health: number;
    } | null;
    history: Array<{
      timestamp: string;
      overall_percent: number;
      convention_coverage: number;
      type_safety: number;
      test_coverage_proxy: number;
      import_graph_health: number;
    }>;
  };
}

export interface BlastRadiusApiResponse {
  status: 'ok';
  data: {
    file: string;
    direction: 'forward' | 'reverse';
    rings: Record<
      number,
      Array<{
        name: string;
        risk: string;
        inDegree: number;
        community: number;
      }>
    >;
    totalAffected: number;
  };
}

export interface ReviewApiResponse {
  status: string;
  data?: Record<string, unknown>;
  error?: string;
  code?: string;
  message?: string;
}

export interface ImpactApiResponse {
  status: string;
  data?: {
    totalAffected?: number;
    total_affected?: number;
    maxRisk?: string;
    max_risk?: string;
    [key: string]: unknown;
  };
  error?: string;
  code?: string;
  message?: string;
}

export interface ApiClient {
  fetchGraph(): Promise<GraphApiResponse>;
  fetchConventions(): Promise<ConventionsApiResponse>;
  fetchReadiness(): Promise<ReadinessApiResponse>;
  fetchBlastRadius(
    file: string,
    direction?: 'forward' | 'reverse',
  ): Promise<BlastRadiusApiResponse>;
  fetchStatus(): Promise<StatusApiResponse>;
  postReview(filePaths: string[], branch?: string): Promise<ReviewApiResponse>;
  postImpact(filePaths: string[], maxHops?: number): Promise<ImpactApiResponse>;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (response.status >= 400) {
    let errorBody: Record<string, unknown>;
    try {
      errorBody = await response.json() as Record<string, unknown>;
    } catch {
      errorBody = { message: response.statusText };
    }
    throw Object.assign(new Error((errorBody.message as string) || `HTTP ${response.status}`), {
      status: response.status,
      body: errorBody,
    });
  }
  return response.json() as Promise<T>;
}

export function createApiClient(): ApiClient {
  const baseUrl = window.location.origin;

  return {
    fetchGraph() {
      return request<GraphApiResponse>(`${baseUrl}/api/graph`);
    },

    fetchConventions() {
      return request<ConventionsApiResponse>(`${baseUrl}/api/conventions`);
    },

    fetchReadiness() {
      return request<ReadinessApiResponse>(`${baseUrl}/api/readiness`);
    },

    fetchBlastRadius(file: string, direction: 'forward' | 'reverse' = 'forward') {
      return request<BlastRadiusApiResponse>(
        `${baseUrl}/api/blast-radius/${encodeURIComponent(file)}?direction=${direction}`,
      );
    },

    fetchStatus() {
      return request<StatusApiResponse>(`${baseUrl}/api/status`);
    },

    postReview(filePaths: string[], branch?: string) {
      return request<ReviewApiResponse>(`${baseUrl}/api/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_paths: filePaths, branch }),
      });
    },

    postImpact(filePaths: string[], maxHops?: number) {
      return request<ImpactApiResponse>(`${baseUrl}/api/impact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_paths: filePaths, max_hops: maxHops }),
      });
    },
  };
}
