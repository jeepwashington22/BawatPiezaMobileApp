export const CHANNEL_PRIORITIES = [
  { value: "low", label: "Low", percentage: 15 },
  { value: "medium", label: "Medium", percentage: 25 },
  { value: "high", label: "High", percentage: 40 },
] as const;

export type ChannelPriority = (typeof CHANNEL_PRIORITIES)[number]["value"];
export type ZonePriority = ChannelPriority | "High" | "Standard";

export function getChannelPriorityOption(priority: ChannelPriority) {
  switch (priority) {
    case "low":
      return CHANNEL_PRIORITIES[0];
    case "medium":
      return CHANNEL_PRIORITIES[1];
    case "high":
      return CHANNEL_PRIORITIES[2];
  }
}

export function formatZonePriority(priority: ZonePriority) {
  if (priority === "Standard") return "Standard priority";

  const option = getChannelPriorityOption(
    priority === "High" ? "high" : priority,
  );
  return `${option.label} priority · ${option.percentage}%`;
}