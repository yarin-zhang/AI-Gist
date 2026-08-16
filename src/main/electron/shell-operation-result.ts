export interface ShellOperationResult {
  success: boolean;
  error?: string;
}

function toShellOperationResult(error: string): ShellOperationResult {
  return error ? { success: false, error } : { success: true };
}

export async function openShellPath(
  path: string,
  openPath: (path: string) => Promise<string>
): Promise<ShellOperationResult> {
  return toShellOperationResult(await openPath(path));
}
