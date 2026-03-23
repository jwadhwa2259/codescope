/**
 * Type declarations for graphology ecosystem packages that lack proper
 * ESM exports fields in their package.json.
 *
 * These packages use CJS-style publishing without "exports" field,
 * which causes issues under moduleResolution: NodeNext. The runtime
 * works fine (Node.js CJS resolution finds them), but TypeScript
 * can't resolve the types for subpath imports or default CJS exports.
 */

declare module "graphology-metrics/centrality/degree" {
  import type Graph from "graphology-types";

  interface DegreeCentralityOptions {
    nodeCentralityAttribute?: string;
  }

  type DegreeCentralityMapping = { [node: string]: number };

  interface IDegreeCentralityBase {
    (graph: Graph, options?: DegreeCentralityOptions): DegreeCentralityMapping;
    assign(graph: Graph, options?: DegreeCentralityOptions): void;
  }

  export const degreeCentrality: IDegreeCentralityBase;
  export const inDegreeCentrality: IDegreeCentralityBase;
  export const outDegreeCentrality: IDegreeCentralityBase;
}

declare module "graphology-communities-louvain" {
  import type Graph from "graphology-types";
  import type { Attributes, EdgeMapper } from "graphology-types";

  type RNGFunction = () => number;
  type PointerArray = Uint8Array | Uint16Array | Uint32Array | Float64Array;

  interface LouvainOptions<
    NodeAttributes extends Attributes = Attributes,
    EdgeAttributes extends Attributes = Attributes,
  > {
    nodeCommunityAttribute?: string;
    getEdgeWeight?:
      | keyof EdgeAttributes
      | EdgeMapper<number, NodeAttributes, EdgeAttributes>
      | null;
    fastLocalMoves?: boolean;
    randomWalk?: boolean;
    resolution?: number;
    rng?: RNGFunction;
  }

  type LouvainMapping = { [node: string]: number };

  interface DetailedLouvainOutput {
    communities: LouvainMapping;
    count: number;
    deltaComputations: number;
    dendrogram: Array<PointerArray>;
    modularity: number;
    moves: Array<Array<number>> | Array<number>;
    nodesVisited: number;
    resolution: number;
  }

  interface ILouvain {
    (graph: Graph, options?: LouvainOptions): LouvainMapping;
    assign(graph: Graph, options?: LouvainOptions): void;
    detailed(graph: Graph, options?: LouvainOptions): DetailedLouvainOutput;
  }

  const louvain: ILouvain;
  export default louvain;
}

declare module "graphology-traversal" {
  import type Graph from "graphology-types";

  type TraversalCallback = (
    node: string,
    attr: Record<string, unknown>,
    depth: number
  ) => boolean | void;

  export function bfs(graph: Graph, callback: TraversalCallback): void;
  export function bfsFromNode(
    graph: Graph,
    node: string,
    callback: TraversalCallback
  ): void;
  export function dfs(graph: Graph, callback: TraversalCallback): void;
  export function dfsFromNode(
    graph: Graph,
    node: string,
    callback: TraversalCallback
  ): void;
}
