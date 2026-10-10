/** Ordinary binary dnd5e conditions shared with configured-condition alias validation. */
export const NATIVE_LIFECYCLE_STATUS_DEFINITIONS = {
  blinded: { label: '目盲', sourceNames: ['blinded', '目盲', '致盲'] },
  frightened: { label: '恐慌', sourceNames: ['frightened', '恐慌', '恐惧'] },
  poisoned: { label: '中毒', sourceNames: ['poisoned', '中毒'] },
  paralyzed: { label: '麻痹', sourceNames: ['paralyzed', '麻痹', '瘫痪'] },
  charmed: { label: '魅惑', sourceNames: ['charmed', '魅惑'] },
  deafened: { label: '耳聋', sourceNames: ['deafened', '耳聋'] },
  grappled: { label: '受擒', sourceNames: ['grappled', '受擒'] },
  incapacitated: { label: '失能', sourceNames: ['incapacitated', '失能'] },
  invisible: { label: '隐形', sourceNames: ['invisible', '隐形'] },
  petrified: { label: '石化', sourceNames: ['petrified', '石化'] },
  prone: { label: '倒地', sourceNames: ['prone', '倒地'] },
  restrained: { label: '束缚', sourceNames: ['restrained', '束缚'] },
  stunned: { label: '震慑', sourceNames: ['stunned', '震慑'] },
  unconscious: { label: '昏迷', sourceNames: ['unconscious', '昏迷'] },
} as const;
