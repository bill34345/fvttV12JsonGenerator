import { DAE_VERSION, MIDI_QOL_VERSION } from "./constants";

type ModuleMap = { get(id: string): { active?: boolean; version?: string } | undefined };

export interface MidiAdapterStatus {
  enabled: boolean;
  reason: "absent" | "unsupported-midi-version" | "unsupported-dae-version" | "ready-for-runtime-validation";
}

/**
 * The MIDI-QOL integration is deliberately isolated. Its source was not in the
 * configured locked cache, so this module never registers an inferred MIDI hook.
 * Lab validation may supply the exact event contract before enabling this adapter.
 */
export function inspectMidiAdapter(modules: ModuleMap): MidiAdapterStatus {
  const midi = modules.get("midi-qol");
  if (!midi?.active) return { enabled: false, reason: "absent" };
  if (midi.version !== MIDI_QOL_VERSION) return { enabled: false, reason: "unsupported-midi-version" };
  const dae = modules.get("dae");
  if (dae?.active && dae.version !== DAE_VERSION) return { enabled: false, reason: "unsupported-dae-version" };
  return { enabled: true, reason: "ready-for-runtime-validation" };
}
