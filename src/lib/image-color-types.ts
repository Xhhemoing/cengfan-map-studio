export interface ImageThemeDiagnostics {
  fallbackUsed?: boolean;
  reason?: string;
  foregroundCoverage?: number;
  subjectContrast?: number;
  edgeContrast?: number;
  grayscaleSeparation?: number;
  camouflageRisk?: number;
  neighborAdjusted?: boolean;
  neighborConflicts?: string[];
}

export interface ImageThemeResult {
  primaryColor: string | null;
  identityColor: string | null;
  supportingColor: string | null;
  backgroundColor: string;
  outlineColor: string;
  haloColor: string;
  confidence: number;
  diagnostics: ImageThemeDiagnostics;
}

export interface ImageThemeOptions {
  mapBaseColor?: string;
  posterBackground?: string;
}
