// Stub - TDD RED phase
export interface PythonResolveResult {
  modulePath: string | null;
  moduleName: string;
  isExternal: boolean;
  isRelative: boolean;
}

export function resolvePythonImport(
  _moduleName: string,
  _fromFile: string,
  _projectRoot: string,
  _isRelative?: boolean
): PythonResolveResult {
  throw new Error("Not implemented");
}
