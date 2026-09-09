import { SquircleSurface } from "@/components/ui/squircle";

type ChartTooltipProps = {
  readonly active?: boolean;
  readonly label?: string | number;
  readonly payload?: readonly {
    readonly name?: string | number;
    readonly value?: string | number | readonly (string | number)[];
    readonly color?: string;
  }[];
};

export function ChartTooltip({ active, label, payload }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <SquircleSurface radius="control" className="bg-black/70 border border-white/20 p-3 text-white">
      <p>{label}</p>
      {payload.map((entry, index) => (
        <p key={index} style={{ color: entry.color }}>
          {entry.name}: {Array.isArray(entry.value) ? entry.value.join(" ~ ") : entry.value}
        </p>
      ))}
    </SquircleSurface>
  );
}
