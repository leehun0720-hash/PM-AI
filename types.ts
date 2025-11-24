export interface RiskItem {
  id: string;
  type: 'Financial' | 'Physical' | 'Legal';
  description: string;
  probability: number; // 1-5
  impact: number; // 1-5
  confidence: number; // 1-5
  recommendation: string;
}

export interface FinancialData {
  normalizedNOI: number;
  nonRecurringAdjustment: number;
  marketManagementFeeImpact: number;
  walt: number;
  tenantConcentration: number;
}

export interface PhysicalData {
  hvacRUL: number;
  roofRUL: number;
  immediateCostToCure: number;
  sacScore: number; // 1-4
}

export interface LegalData {
  sndaFlag: boolean;
  camCapRisk: 'High' | 'Low' | 'None';
  terminationRisk: boolean;
}

export interface AnalysisResult {
  propertyName: string;
  summary: string;
  financial: FinancialData;
  physical: PhysicalData;
  legal: LegalData;
  risks: RiskItem[];
}

export enum AppState {
  IDLE,
  ANALYZING,
  COMPLETE,
  ERROR
}