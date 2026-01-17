export const DEFAULT_SCALE_SCORE_VALUES = [-1, -0.75, 0.75, 1];

export const getScaleScore = (optionIndex: number, optionCount: number) => {
  if (optionCount === DEFAULT_SCALE_SCORE_VALUES.length) {
    const mapped = DEFAULT_SCALE_SCORE_VALUES[optionIndex];
    if (typeof mapped === 'number') return mapped;
  }
  return optionIndex + 1;
};

export const getScaleRangeFromCount = (optionCount: number) => {
  if (optionCount === DEFAULT_SCALE_SCORE_VALUES.length) {
    return {
      min: DEFAULT_SCALE_SCORE_VALUES[0],
      max: DEFAULT_SCALE_SCORE_VALUES[DEFAULT_SCALE_SCORE_VALUES.length - 1],
    };
  }
  const safeCount = optionCount > 0 ? optionCount : 1;
  return { min: 1, max: safeCount };
};

export const getScorePercentage = (score: number, min: number, max: number) => {
  if (max === min) return 0;
  const raw = ((score - min) / (max - min)) * 100;
  if (!Number.isFinite(raw)) return 0;
  return Math.round(Math.min(100, Math.max(0, raw)));
};
