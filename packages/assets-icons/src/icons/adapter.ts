import type { IconWorkflowPort } from '@fvtt-json-generator/workflows/icon-port';
import {
  iconReviewPathForOutput,
  mergeIconReviewReports,
  writeIconReviewReport,
} from './report';
import { iconWorkflowFingerprint } from './resources';
import { createIconResolutionSession } from './workflow';

export const iconWorkflowAdapter: Readonly<IconWorkflowPort> = Object.freeze({
  createResolutionSession: createIconResolutionSession,
  fingerprint: iconWorkflowFingerprint,
  mergeReviewReports: mergeIconReviewReports,
  reviewPathForOutput: iconReviewPathForOutput,
  writeReviewReport: writeIconReviewReport,
});
