export const CHANNEL_PRIORITIES = [
  { value: "low", label: "Low", percentage: 30 },
  { value: "high", label: "High", percentage: 70 },
] as const;

export type ChannelPriority = (typeof CHANNEL_PRIORITIES)[number]["value"];
export type ZonePriority = ChannelPriority;

export function getChannelPriorityOption(priority: ChannelPriority) {
  switch (priority) {
    case "low":
      return CHANNEL_PRIORITIES[0];
    case "high":
      return CHANNEL_PRIORITIES[1];
  }
}

export function normalizeZonePriority(priority: unknown): ZonePriority {
  switch (priority) {
    case "high":
    case "High":
      return "high";
    case "low":
    case "Low":
    case "medium":
    case "Medium":
    case "Standard":
      return "low";
    default:
      throw new Error(`Unsupported saved zone priority: ${String(priority)}.`);
  }
}

export function formatZonePriority(priority: ZonePriority) {
  const option = getChannelPriorityOption(priority);
  return `${option.label} priority · ${option.percentage}%`;
}