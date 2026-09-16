import type { Mode, SessionConfig } from '../core/session';

export type Route =
  | { name: 'home' }
  | { name: 'setup'; mode: Mode; prefill?: Partial<SessionConfig> }
  | { name: 'run'; config: SessionConfig }
  | { name: 'report'; sessionId: string }
  | { name: 'analytics' }
  | { name: 'review' }
  | { name: 'facts' }
  | { name: 'settings' }
  | { name: 'help' };

export const HOME: Route = { name: 'home' };
