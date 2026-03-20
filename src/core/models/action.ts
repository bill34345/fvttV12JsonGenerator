export interface Damage {
  formula: string;
  type: string;
}

export interface ActionData {
  name: string;
  englishName?: string;
  type: "attack" | "save" | "utility";
  desc?: string; 
  
  attack?: {
    type: "mwak" | "rwak";
    toHit: number;
    range: string;
    reach?: string;
    damage: Damage[];
    versatile?: {
      formula: string;
    };
  };

  save?: {
    dc: number;
    ability: string;
    onSave?: string;
    onFail?: string;
  };

  recharge?: {
    value: number;
    charged: boolean;
  };
  
  target?: {
    value: number;
    type: string;
    units: string;
  };

  damage?: Damage[];
}
