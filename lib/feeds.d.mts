import type { Case, FeedId, Results, Trial, Version, View } from "./types";
export interface Feed {
  id: FeedId;
  label: string;
  standard: string;
  carries: string;
  keys: string[];
}
export const FEEDS: Feed[];
export const FEED_IDS: FeedId[];
export const STATEMENT_KEYS: string[];
export function relevantFeeds(kase: Case): FeedId[];
export function feedsOfView(view: View): FeedId[];
export function isView(view: unknown): boolean;
export function feedKey(kase: Case, connected: FeedId[]): string;
export function viewFor(kase: Case, connected: FeedId[]): View;
export function partialFeedSets(kase: Case): FeedId[][];
export function recordForFeeds(kase: Case, connected: FeedId[]): Record<string, unknown>;
export function trialsForFeeds(results: Results, version: Version, kase: Case, connected: FeedId[]): Trial[];
