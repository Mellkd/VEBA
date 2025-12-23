
export enum Rank {
  R1 = 'R1',
  R2 = 'R2',
  R3 = 'R3'
}

export interface AllianceMember {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  nameImage?: string | null; // Base64 image or null
  power: number; // in Millions
  level: number;
  rank: Rank;
  team1Power: number; // in Millions
  updatedAt: number;
}

export interface AllianceStats {
  totalMembers: number;
  lowPowerCount: number; // < 10.0M
  lowLevelCount: number; // < Sv.20
  totalAtRisk: number; // Combined unique count
}

export interface AllianceConfig {
  logo?: string | null;
  allianceName?: string;
}
