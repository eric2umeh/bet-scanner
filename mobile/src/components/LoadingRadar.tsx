import { useEffect, useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';

import { colors } from '../theme/colors';

type Props = {
  /** Match RN ActivityIndicator: small ≈ 20, large ≈ 36. */
  size?: 'small' | 'large' | number;
  /** Accent for rings / arm (default brand green). */
  color?: string;
  style?: ViewStyle;
};

const PERIOD_MS = 1100;

/**
 * Brand radar mark as a loading spinner — rings stay put, scout arm spins.
 * Uses requestAnimationFrame (not RN Animated / CSS className) so it keeps
 * spinning on Expo web, Cancel buttons, and native.
 */
export function LoadingRadar({ size = 'small', color, style }: Props) {
  const dim =
    typeof size === 'number' ? size : size === 'large' ? 36 : 20;
  const [deg, setDeg] = useState(0);
  const accent = color || colors.accent;
  const ink = colors.ink;
  const c = dim / 2;
  const r = dim * 0.38;
  const stroke = Math.max(1, dim * 0.06);

  useEffect(() => {
    let raf = 0;
    const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const tick = (now: number) => {
      const t = (now - start) % PERIOD_MS;
      setDeg((t / PERIOD_MS) * 360);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <View
      style={[styles.wrap, { width: dim, height: dim }, style]}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
    >
      <Svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`}>
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
          opacity={0.8}
        />
        <Path d={hexPath(c, c, dim * 0.1)} fill={ink} opacity={0.95} />
        <G transform={`rotate(${deg} ${c} ${c})`}>
          <Line
            x1={c}
            y1={c}
            x2={c + r * 0.95}
            y2={c - r * 0.2}
            stroke={accent}
            strokeWidth={stroke * 1.15}
            strokeLinecap="round"
            opacity={0.95}
          />
        </G>
      </Svg>
    </View>
  );
}

function hexPath(cx: number, cy: number, radius: number): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    pts.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
  }
  return `M ${pts.map(([x, y]) => `${x} ${y}`).join(' L ')} Z`;
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
