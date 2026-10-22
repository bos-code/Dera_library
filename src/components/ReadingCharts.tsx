import { memo, useEffect, useMemo, useRef } from "react";
import { ScrollView, View } from "react-native";
import Svg, { Circle, Rect, Text as SvgText } from "react-native-svg";
import { buildCalendar, heatLevel } from "@/lib/readingStats";
import { font, useTheme } from "@/theme";

const CELL = 13;
const GAP = 3;
const STEP = CELL + GAP;
const LEFT = 28;
const TOP = 18;
const WEEKDAYS = ["", "Mon", "", "Wed", "", "Fri", ""];

/**
 * GitHub-style year of reading: one square per day, coloured by how much of the daily goal was read.
 * Scrolls horizontally and opens on the current week. Tap a day to select it.
 */
function ReadingHeatmapImpl({
  totals,
  goalMs,
  now,
  selectedKey,
  onSelect,
}: {
  totals: Map<string, number>;
  goalMs: number;
  now: number;
  selectedKey?: string | null;
  onSelect?: (key: string) => void;
}) {
  const t = useTheme();
  const scroll = useRef<ScrollView>(null);
  const calendar = useMemo(() => buildCalendar(now), [now]);
  const width = LEFT + calendar.weeks.length * STEP;
  const height = TOP + 7 * STEP;
  const todayKey = calendar.weeks[calendar.weeks.length - 1].find(
    (d) => !d.future && d.ts <= now && d.ts + 86_400_000 > now,
  )?.key;

  useEffect(() => {
    const id = setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 0);
    return () => clearTimeout(id);
  }, []);

  return (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      // Screen readers get a summary; individual days are reachable with the previous/next day buttons.
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Reading calendar for the last 12 months: read on ${[...totals.values()].filter((ms) => ms > 0).length} days. Use the previous and next day buttons to hear each day.`}
    >
      <Svg width={width} height={height}>
        {calendar.months.map((m) => (
          <SvgText
            key={`${m.label}-${m.column}`}
            x={LEFT + m.column * STEP}
            y={11}
            fontSize={10}
            fontFamily={font.sansSemi}
            fill={t.textMuted}
          >
            {m.label}
          </SvgText>
        ))}
        {WEEKDAYS.map((label, i) =>
          label ? (
            <SvgText key={label} x={0} y={TOP + i * STEP + 10} fontSize={9} fontFamily={font.sans} fill={t.textFaint}>
              {label}
            </SvgText>
          ) : null,
        )}
        {calendar.weeks.map((week, w) =>
          week.map((day, d) => {
            if (day.future) return null;
            const level = heatLevel(totals.get(day.key) ?? 0, goalMs);
            const selected = day.key === selectedKey;
            const today = day.key === todayKey;
            return (
              <Rect
                key={day.key}
                x={LEFT + w * STEP}
                y={TOP + d * STEP}
                width={CELL}
                height={CELL}
                rx={3}
                fill={t.heat[level]}
                stroke={selected ? t.text : today ? t.primary : t.border}
                strokeWidth={selected || today ? 1.5 : level === 0 ? 0.5 : 0}
                onPress={onSelect ? () => onSelect(day.key) : undefined}
              />
            );
          }),
        )}
      </Svg>
    </ScrollView>
  );
}

export const ReadingHeatmap = memo(ReadingHeatmapImpl);

export function HeatLegend() {
  const t = useTheme();
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
      accessible
      accessibilityLabel="Colour scale: less to more reading"
    >
      <Svg width={5 * 15} height={13}>
        {t.heat.map((c, i) => (
          <Rect
            key={c + i}
            x={i * 15}
            y={0}
            width={12}
            height={12}
            rx={3}
            fill={c}
            stroke={t.border}
            strokeWidth={i === 0 ? 0.5 : 0}
          />
        ))}
      </Svg>
    </View>
  );
}

/** Daily goal progress ring. */
export function GoalRing({ progress, size = 96, stroke = 10 }: { progress: number; size?: number; stroke?: number }) {
  const t = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.surfaceAlt} strokeWidth={stroke} fill="none" />
      {p > 0 ? (
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={t.primary}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * p} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      ) : null}
    </Svg>
  );
}
