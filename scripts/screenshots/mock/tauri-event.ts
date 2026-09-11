// Stand-in for `@tauri-apps/api/event`: listeners hear what the fake backend emits.
import { subscribe } from "./backend";

export type UnlistenFn = () => void;

export async function listen<T>(event: string, cb: (e: { event: string; id: number; payload: T }) => void): Promise<UnlistenFn> {
  return subscribe(event, cb as (e: { event: string; id: number; payload: unknown }) => void);
}
