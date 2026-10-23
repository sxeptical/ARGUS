export function summarizeValues(values: readonly number[]) {
  return {
    latest: values[values.length - 1],
    average: Math.round(
      values.reduce((sum, value) => sum + value, 0) / values.length,
    ),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

export function MiniTrend({
  values,
  barClass,
  titleUnit = "",
  rounded = false,
}: {
  values: readonly number[];
  barClass: string;
  titleUnit?: string;
  rounded?: boolean;
}) {
  const recent = values.slice(-24);
  const min = Math.min(...recent);
  const max = Math.max(...recent);
  const range = max - min;

  return (
    <div className="flex h-8 items-end gap-0.5 border border-line bg-paper px-1 py-1">
      {recent.map((value, index) => {
        const height = range === 0 ? 50 : 18 + ((value - min) / range) * 82;
        return (
          <div
            key={`${index}-${value}`}
            className={`w-full min-w-0 opacity-80 ${rounded ? "rounded-t" : ""} ${barClass}`}
            style={{ height: `${height}%` }}
            title={`${value}${titleUnit}`}
          />
        );
      })}
    </div>
  );
}
