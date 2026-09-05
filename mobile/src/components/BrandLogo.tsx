import { Image, StyleSheet, Text, View, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { colors } from '../theme/colors';

type Size = 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<Size, number> = {
  sm: 28,
  md: 40,
  lg: 56,
  xl: 80,
};

type Props = {
  size?: Size;
  /** Show "Bet Scout" wordmark beside the mark */
  showWordmark?: boolean;
  /** Stack wordmark under the mark */
  stacked?: boolean;
  /** Replaces default tagline under the wordmark */
  tagline?: string | null;
  /** Hide tagline (use when status is shown on its own row). */
  hideTagline?: boolean;
  style?: ViewStyle;
};

/**
 * Vector radar + ball mark — matches app icon (#0b1014 shell, #2dd4a8 accent).
 * Use anywhere in the UI; PNG assets in assets/images/ are for OS icon + splash.
 */
export function BrandLogo({
  size = 'md',
  showWordmark = false,
  stacked = false,
  tagline = 'Odds · tips · edge',
  hideTagline = false,
  style,
}: Props) {
  const dim = SIZES[size];
  const mark = <LogoMark size={dim} />;
  const showTag = !hideTagline && !stacked && !!tagline;

  if (!showWordmark) {
    return <View style={style}>{mark}</View>;
  }

  return (
    <View style={[styles.row, stacked && styles.stacked, style]}>
      {mark}
      <View style={[stacked ? styles.textStack : styles.textInline, !stacked && styles.textShrink]}>
        <Text style={[styles.wordmark, sizeWordmark(size)]} numberOfLines={1}>
          Bet Scout
        </Text>
        {showTag ? (
          <Text style={styles.tagline} numberOfLines={1}>
            {tagline}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Raster mark — use when SVG is not needed (e.g. share sheets). */
export function BrandLogoImage({
  size = 'md',
  style,
}: {
  size?: Size;
  style?: ImageStyle;
}) {
  const dim = SIZES[size];
  return (
    <Image
      source={require('../../assets/images/logo-mark-sm.png')}
      style={[{ width: dim, height: dim, borderRadius: dim * 0.22 }, style]}
      accessibilityLabel="Bet Scout"
    />
  );
}

function LogoMark({ size }: { size: number }) {
  const s = size;
  const c = s / 2;
  const r = s * 0.38;
  const accent = colors.accent;
  const ink = colors.ink;
  const stroke = Math.max(1.2, s * 0.04);

  return (
    <View
      style={[
        styles.markWrap,
        {
          width: s,
          height: s,
          borderRadius: s * 0.22,
        },
      ]}
    >
      <Svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
        <Circle
          cx={c}
          cy={c}
          r={r}
          stroke={accent}
          strokeWidth={stroke}
          fill="none"
          opacity={0.35}
        />
        <Circle
          cx={c}
          cy={c}
          r={r * 0.65}
          stroke={accent}
          strokeWidth={stroke * 0.9}
          fill="none"
          opacity={0.55}
        />
        <Circle
          cx={c}
          cy={c}
          r={r * 0.32}
          stroke={accent}
          strokeWidth={stroke * 0.8}
          fill="none"
          opacity={0.85}
        />
        <Line
          x1={c}
          y1={c}
          x2={c + r * 0.92}
          y2={c - r * 0.55}
          stroke={accent}
          strokeWidth={stroke * 1.1}
          strokeLinecap="round"
          opacity={0.9}
        />
        <Path d={footballPath(c, c, s * 0.11)} fill={ink} opacity={0.95} />
        <Path
          d={footballPath(c, c, s * 0.11)}
          stroke={accent}
          strokeWidth={stroke * 0.6}
          fill="none"
          opacity={0.7}
        />
      </Svg>
    </View>
  );
}

function footballPath(cx: number, cy: number, radius: number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    pts.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
  }
  return `M ${pts.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`;
}

function sizeWordmark(size: Size): TextStyle {
  const map: Record<Size, number> = { sm: 15, md: 18, lg: 22, xl: 28 };
  return { fontSize: map[size] };
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  stacked: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
  },
  textStack: { alignItems: 'center' },
  textInline: { gap: 2 },
  textShrink: { flex: 1, minWidth: 0 },
  wordmark: {
    color: colors.ink,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  tagline: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  markWrap: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
});
