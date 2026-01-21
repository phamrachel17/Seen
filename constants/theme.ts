/**
 * Seen App Color Palette - "Vintage Paper & Ink"
 */
export const Colors = {
  // Core palette
  paper: '#EEE4D3',      // Main background
  dust: '#C4BFAF',       // Secondary backgrounds, borders
  ink: '#2C3E50',        // Navy accent
  handwriting: '#1E1E1E', // Primary text
  stamp: '#802F1D',      // Primary accent (logo, CTAs)
  settledTea: '#C98540', // Secondary accent

  // Semantic aliases
  background: '#EEE4D3',
  backgroundSecondary: '#C4BFAF',
  text: '#1E1E1E',
  textSecondary: '#2C3E50',
  textMuted: '#6B6560',
  accent: '#802F1D',
  accentSecondary: '#C98540',
  navy: '#2C3E50',

  // UI elements
  border: '#C4BFAF',
  borderLight: '#E0D9CC',
  cardBackground: '#F5EFE6',

  // Tab bar
  tabIconDefault: '#6B6560',
  tabIconSelected: '#802F1D',

  // Stars
  starFilled: '#C98540',
  starEmpty: '#C4BFAF',

  // Status
  white: '#FFFFFF',
  black: '#000000',
  error: '#B34040',
  success: '#4A7C59',
};

/**
 * Typography - Custom Fonts
 * Libre Baskerville: Elegant serif for titles/headings
 * Inter: Clean sans-serif for body text
 */
export const Fonts = {
  // Display - Libre Baskerville (for titles, headings)
  serif: 'LibreBaskerville_400Regular',
  serifMedium: 'LibreBaskerville_400Regular',
  serifSemiBold: 'LibreBaskerville_700Bold',
  serifBold: 'LibreBaskerville_700Bold',
  serifItalic: 'LibreBaskerville_400Regular_Italic',
  serifBoldItalic: 'LibreBaskerville_700Bold',

  // Sans - Inter (for body, labels)
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemiBold: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
};

export const FontSizes = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 18,
  '2xl': 22,
  '3xl': 28,
  '4xl': 36,
  '5xl': 48,
  '6xl': 56,
};

export const FontWeights = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

/**
 * Spacing scale
 */
export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
};

/**
 * Border radius
 */
export const BorderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};
