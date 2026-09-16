/**
 * Session configs for the one-click drills offered by the Analytics and Review screens.
 */
import { presetConfig, type SessionConfig } from '../../core/session';
import { newSessionSeed } from '../../core/rng';
import { getTemplate } from '../../core/registry';
import type { Settings } from '../../core/storage';

/** A ten-question drill on a single template, with the user's default answer mode and level. Null if the template is gone. */
export function templateDrillConfig(templateId: string, settings: Settings): SessionConfig | null {
  const t = getTemplate(templateId);
  if (!t) return null;
  return presetConfig('drill', newSessionSeed(), {
    templateIds: [templateId],
    count: 10,
    answerMode: settings.answerMode,
    level: settings.defaultLevel,
    module: t.module,
    topics: [t.topic],
  });
}
