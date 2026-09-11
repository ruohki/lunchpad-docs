// Stand-in for `@tauri-apps/api/core`: every command goes to the fake backend.
import { handle } from "./backend";

export async function invoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  return handle(cmd, args) as T;
}

export function convertFileSrc(path: string): string {
  return path;
}
