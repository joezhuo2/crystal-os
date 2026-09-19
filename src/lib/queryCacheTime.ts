import type { QueryClient } from "@tanstack/react-query";

/**
 * Applies a new gcTime to queries already in the cache.
 *
 * `setDefaultOptions` only reaches queries created afterwards, and React Query
 * only ever raises a cached query's gcTime, so switching performance mode on
 * would otherwise leave existing data on the five-minute window. Queries no
 * view is using restart their countdown with the new time.
 */
export function retimeCachedQueries(client: QueryClient, gcTime: number) {
  for (const query of client.getQueryCache().getAll()) {
    query.gcTime = gcTime;
    // scheduleGc is protected; it is the only way to restart an inactive
    // query's pending removal timer.
    if (query.getObserversCount() === 0) (query as unknown as { scheduleGc(): void }).scheduleGc();
  }
}
