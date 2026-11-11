import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';

import { colors, spacing } from '@/theme/colors';
import { formatDayMonth } from '@/utils/dates';
import type { WeeklyMinutes } from '@/utils/walks';

const HEIGHT = 190;
const PADDING = { top: 14, right: 6, bottom: 26, left: 36 };

function niceTicks(maxValue: number) {
  const steps = [15, 30, 60, 90, 120, 180, 240, 300, 600, 900, 1200];
  const target = maxValue / 3;
  const step = steps.find((value) => value >= target) ?? Math.ceil(target / 300) * 300;
  const ticks: number[] = [];
  for (let value = 0; value <= maxValue; value += step) ticks.push(value);
  return ticks;
}

/** Gráfica de barras propia (react-native-svg): minutos por semana contra la meta semanal. */
export function WeeklyWalkChart({ data, weeklyGoal }: { data: WeeklyMinutes[]; weeklyGoal: number }) {
  const [width, setWidth] = useState(0);
  const chartWidth = Math.max(0, width - PADDING.left - PADDING.right);
  const chartHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const maxValue = Math.max(weeklyGoal, ...data.map((item) => item.minutes), 30) * 1.15;
  const slot = data.length ? chartWidth / data.length : 0;
  const barWidth = Math.min(26, slot * 0.6);
  const y = (value: number) => PADDING.top + chartHeight - (value / maxValue) * chartHeight;
  const ticks = niceTicks(maxValue);
  const summary = data
    .map((item) => `semana del ${formatDayMonth(item.weekStart)}: ${item.minutes} minutos`)
    .join(', ');

  return (
    <View>
      <View
        accessibilityLabel={`Minutos de paseo por semana. ${summary}.${weeklyGoal ? ` Meta semanal: ${weeklyGoal} minutos.` : ''}`}
        accessible
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={styles.chart}>
        {width > 0 ? (
          <Svg height={HEIGHT} width={width}>
            {ticks.map((tick) => (
              <G key={`tick-${tick}`}>
                <Line stroke={colors.border} strokeWidth={1} x1={PADDING.left} x2={width - PADDING.right} y1={y(tick)} y2={y(tick)} />
                <SvgText fill={colors.muted} fontSize={10} textAnchor="end" x={PADDING.left - 6} y={y(tick) + 3}>
                  {tick}
                </SvgText>
              </G>
            ))}
            {data.map((item, index) => {
              const x = PADDING.left + slot * index + (slot - barWidth) / 2;
              const barHeight = item.minutes > 0 ? Math.max(2, (item.minutes / maxValue) * chartHeight) : 0;
              const reached = weeklyGoal > 0 && item.minutes >= weeklyGoal;
              return (
                <G key={item.weekStart}>
                  <Rect
                    fill={reached ? colors.green : colors.secondary}
                    height={barHeight}
                    rx={4}
                    width={barWidth}
                    x={x}
                    y={PADDING.top + chartHeight - barHeight}
                  />
                  <SvgText fill={colors.muted} fontSize={9} textAnchor="middle" x={x + barWidth / 2} y={HEIGHT - 8}>
                    {formatDayMonth(item.weekStart)}
                  </SvgText>
                </G>
              );
            })}
            {weeklyGoal > 0 ? (
              <Line
                stroke={colors.primaryDark}
                strokeDasharray="6 4"
                strokeWidth={2}
                x1={PADDING.left}
                x2={width - PADDING.right}
                y1={y(weeklyGoal)}
                y2={y(weeklyGoal)}
              />
            ) : null}
          </Svg>
        ) : null}
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: colors.secondary }]} />
          <Text style={styles.legendText}>Minutos por semana</Text>
        </View>
        {weeklyGoal > 0 ? (
          <>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: colors.green }]} />
              <Text style={styles.legendText}>Meta cumplida</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={styles.legendLine} />
              <Text style={styles.legendText}>Meta: {weeklyGoal} min</Text>
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { height: HEIGHT },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.xs },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  legendSwatch: { borderRadius: 3, height: 10, width: 10 },
  legendLine: { borderColor: colors.primaryDark, borderStyle: 'dashed', borderTopWidth: 2, width: 16 },
  legendText: { color: colors.muted, fontSize: 12 },
});
