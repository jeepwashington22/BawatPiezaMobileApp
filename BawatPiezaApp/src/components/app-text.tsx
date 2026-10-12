import type { ReactNode } from 'react';
import { StyleSheet, Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import { HEADING_THRESHOLD, useTheme } from '../theme';

/**
 * AppText — global body-text wrapper that enforces the user's font-size
 * preference (16 / 20 / 24) across the whole app.
 *
 * Drop-in replacement for RN `Text` (same props). Import it aliased:
 *   import { AppText as Text } from '../components/app-text';
 * so existing `<Text style={...}>` JSX needs zero changes.
 *
 * - Sizes below HEADING_THRESHOLD (18) scale proportionally against a 16px
 *   body baseline: picking 20px = 1.25x, 24px = 1.5x on body/label/caption.
 * - Sizes >= 18 (headings, display type) are left untouched.
 * - `fixed` opts a single node out of scaling (logos, badges).
 */
export type AppTextProps = TextProps & {
  children?: ReactNode;
  fixed?: boolean;
  style?: StyleProp<TextStyle>;
};

type Flat = { fontSize?: number; lineHeight?: number };

function flattenTextStyle(style: StyleProp<TextStyle>): Flat {
  if (!style) return {};
  // StyleSheet.flatten handles arrays / registered styles without deep generics.
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  if (!flat || typeof flat !== 'object') return {};
  const out: Flat = {};
  if (typeof flat.fontSize === 'number') out.fontSize = flat.fontSize;
  if (typeof flat.lineHeight === 'number') out.lineHeight = flat.lineHeight;
  return out;
}

export function AppText({ children, fixed, style, ...rest }: AppTextProps) {
  const { fs } = useTheme();

  if (fixed) {
    return (
      <Text style={style} {...rest}>
        {children}
      </Text>
    );
  }

  const { fontSize: designed, lineHeight: designedLH } = flattenTextStyle(style);
  const base = designed ?? 14;
  const scaled = fs(base);

  // Headings or Small choice (scale 1x): no override needed.
  if (scaled === base && designedLH === undefined) {
    return (
      <Text style={style} {...rest}>
        {children}
      </Text>
    );
  }

  const ratio = scaled / base;
  const scaledLH =
    designedLH !== undefined && base < HEADING_THRESHOLD
      ? Math.round(designedLH * ratio * 100) / 100
      : designedLH;

  return (
    <Text
      style={[style, { fontSize: scaled }, scaledLH !== undefined ? { lineHeight: scaledLH } : null]}
      {...rest}
    >
      {children}
    </Text>
  );
}
