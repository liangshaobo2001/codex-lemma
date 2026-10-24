import { getJson, postJson } from './shared';
export interface ReviewerSettings {
  independent: boolean;
  provider: string;
  model: string;
  contextWindow: number;
  effort: string;
}
export interface ReviewerStatus {
  saved: ReviewerSettings;
  active: ReviewerSettings;
  restartRequired: boolean;
  routingReady: boolean;
  error: string | null;
}
export const getReviewerSettings = () => getJson<ReviewerStatus>('/api/reviewer');
export const saveReviewerSettings = (settings: ReviewerSettings) =>
  postJson<ReviewerStatus>('/api/reviewer', settings);
