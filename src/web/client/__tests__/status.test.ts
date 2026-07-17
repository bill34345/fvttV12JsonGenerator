import { describe, expect, it } from 'bun:test';
import { statusLabel } from '../App';

describe('Web job status labels', () => {
  it('shows needs_review as an explicit human-review state', () => {
    expect(statusLabel('needs_review')).toBe('待人工确认');
  });

  it('shows accepted intake creatures as accepted instead of pending', () => {
    expect(statusLabel('accepted')).toBe('已接受');
  });
});
