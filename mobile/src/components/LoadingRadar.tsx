import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { colors } from '../theme/colors';

type Props = {
  /** Match RN ActivityIndicator: small ≈ 20, large ≈ 36. */
  size?: 'small' | 'large' | number;
  /** Accent for rings / arm (default brand green). */
  color?: string;
  style?: ViewStyle;
};

/**
 * Brand radar mark as a loading spinner — concentric rings stay put,
 * the scout arm spins continuously (same footprint as ActivityIndicator).
 */
export function LoadingRadar({ size = 'small', color, style }: Props) {
  const dim =
    typeof size === 'number' ? size : size === 'large' ? 36 : 20;
  const spin = useRef(new Animated.Value(0)).current;
  const accent = color || colors.accent;
  const ink = colors.ink;
  const c = dim / 2;
  const r = dim * 0.38;
  const stroke = Math.max(1, dim * 0.06);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1100,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View
      style={[styles.wrap, { width: dim, height: dim }, style]}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
    >
      <Svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`} style={StyleSheet.absoluteFill}>
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
      </Svg>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ rotate }] },
        ]}
      >
        <Svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`}>
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
        </Svg>
      </Animated.View>
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
