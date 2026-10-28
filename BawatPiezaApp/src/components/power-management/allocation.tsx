import { Pressable, ScrollView, View } from "react-native";
import { useEffect, useRef, useState } from "react";
import { AppText as Text } from "../app-text";
import { Ionicons } from "@expo/vector-icons";
import Paho from "paho-mqtt";
import { scale } from "../glass-ui";
import { type Mode, type ThemeColors } from "../../theme";
import { styles } from "./styles";
import { SectionLabel, ActionButton, ZoneCard } from "./shared";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";
import {
  getChannelPriorityOption,
  type ChannelPriority,
} from "../../lib/device-priority";

type ConfiguredChannel = {
  channel: number;
  roomName: string;
  priority: ChannelPriority;
};

const RESERVED_POOL_PERCENTAGE = 20;
const USABLE_POOL_PERCENTAGE = 100 - RESERVED_POOL_PERCENTAGE;
const START_TIME_OPTIONS = ["Now", "6:00 PM", "7:00 PM", "8:00 PM", "9:00 PM"];

function isChannelPriority(value: unknown): value is ChannelPriority {
  return value === "low" || value === "medium" || value === "high";
}

function formatPercentage(value: number) {
  return Number(value.toFixed(1)).toString();
}

export function Allocation({
  c,
  mode,
  batteryPct,
  batteryV,
  telemetryConnection,
}: {
  c: ThemeColors;
  mode: Mode;
  batteryPct: number | null;
  batteryV: number | null;
  telemetryConnection: "connecting" | "live" | "offline";
}) {
  const [channels, setChannels] = useState<ConfiguredChannel[]>([]);
  const [activeChannel, setActiveChannel] = useState<number | null>(null);
  const [allocs, setAllocs] = useState<Record<number, number>>({});
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [channelError, setChannelError] = useState("");
  const [startTime, setStartTime] = useState("Now");
  const [allocationStatus, setAllocationStatus] = useState("");
  const allocationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allocationClientRef = useRef<Paho.Client | null>(null);

  useEffect(() => {
    return () => {
      if (allocationTimerRef.current) clearTimeout(allocationTimerRef.current);
      if (allocationClientRef.current?.isConnected()) {
        allocationClientRef.current.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadChannels = async () => {
      setLoadingChannels(true);
      setChannelError("");
      try {
        const hubId = await AsyncStorage.getItem("bawatpieza_hub_id");
        if (!hubId) {
          if (!cancelled) setChannels([]);
          return;
        }

        const { data, error } = await supabase
          .from("device_setups")
          .select("setup_payload")
          .eq("hub_id", hubId)
          .maybeSingle();
        if (error) {
          throw new Error(`Could not load configured channels: ${error.message}`);
        }

        const rawChannels = data?.setup_payload?.channels;
        if (!Array.isArray(rawChannels)) {
          if (!cancelled) setChannels([]);
          return;
        }

        const configuredChannels: ConfiguredChannel[] = rawChannels.flatMap(
          (entry: unknown) => {
            if (typeof entry !== "object" || entry === null) return [];
            const channelData = entry as {
              channel?: unknown;
              priority_status?: unknown;
              rooms?: unknown;
            };
            if (
              typeof channelData.channel !== "number" ||
              !Number.isInteger(channelData.channel)
            ) {
              return [];
            }
            const rooms = Array.isArray(channelData.rooms)
              ? channelData.rooms
              : [];
            const firstRoom = rooms[0];
            const roomName =
              typeof firstRoom === "object" &&
              firstRoom !== null &&
              "name" in firstRoom &&
              typeof firstRoom.name === "string" &&
              firstRoom.name.trim()
                ? firstRoom.name.trim()
                : `Room Channel ${channelData.channel}`;

            return [
              {
                channel: channelData.channel,
                roomName,
                priority: isChannelPriority(channelData.priority_status)
                  ? channelData.priority_status
                  : "medium",
              },
            ];
          },
        );

        if (!cancelled) {
          setChannels(configuredChannels);
          setActiveChannel((current) =>
            configuredChannels.some((channel) => channel.channel === current)
              ? current
              : (configuredChannels[0]?.channel ?? null),
          );
          setAllocs((current) =>
            Object.fromEntries(
              configuredChannels.map((channel) => [
                channel.channel,
                current[channel.channel] ?? 0,
              ]),
            ),
          );
        }
      } catch (error) {
        console.error("[power-management] Channel setup load failed:", error);
        if (!cancelled) {
          setChannels([]);
          setChannelError(
            error instanceof Error
              ? error.message
              : "Could not load configured channels.",
          );
        }
      } finally {
        if (!cancelled) setLoadingChannels(false);
      }
    };

    void loadChannels();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasBatteryReading = batteryPct !== null;
  const totalPool = hasBatteryReading
    ? Number(((batteryPct / 100) * 24).toFixed(1))
    : 0;
  const usablePool = (totalPool * USABLE_POOL_PERCENTAGE) / 100;
  const totalPriorityWeight = channels.reduce(
    (total, channel) =>
      total + getChannelPriorityOption(channel.priority).percentage,
    0,
  );
  const channelShares = new Map(
    channels.map((channel) => {
      const priorityWeight = getChannelPriorityOption(
        channel.priority,
      ).percentage;
      const sharePercentage =
        totalPriorityWeight > 0
          ? (priorityWeight / totalPriorityWeight) * USABLE_POOL_PERCENTAGE
          : 0;
      return [
        channel.channel,
        {
          percentage: sharePercentage,
          hours: (usablePool * sharePercentage) / USABLE_POOL_PERCENTAGE,
        },
      ];
    }),
  );
  const effectiveAllocs = Object.fromEntries(
    channels.map((channel) => [
      channel.channel,
      Math.min(
        allocs[channel.channel] ?? 0,
        channelShares.get(channel.channel)?.hours ?? 0,
      ),
    ]),
  );

  const totalAssigned = Object.values(effectiveAllocs).reduce(
    (total, assigned) => total + assigned,
    0,
  );
  const remaining = Math.max(0, usablePool - totalAssigned);
  const progressPct =
    usablePool > 0 ? (totalAssigned / usablePool) * 100 : 0;

  const setAssignedHours = (val: number) => {
    if (activeChannel === null) return;
    const channelShare = channelShares.get(activeChannel)?.hours ?? 0;
    const currentAssigned = effectiveAllocs[activeChannel] ?? 0;
    const maxAllowed = Math.min(channelShare, remaining + currentAssigned);
    setSystemAllocated(false);
    setAllocs((prev) => ({
      ...prev,
      [activeChannel]: Math.max(0, Math.min(val, maxAllowed)),
    }));
  };
  const allocateByPriority = () => {
    setAllocs(
      Object.fromEntries(
        channels.map((channel) => [
          channel.channel,
          channelShares.get(channel.channel)?.hours ?? 0,
        ]),
      ),
    );
    setSystemAllocated(true);
  };
  const getNextStartAt = () => {
    const now = Date.now();
    if (startTime === "Now") return { at: now, delay: 0 };
    const match = startTime.match(/^(\d+):00 (AM|PM)$/);
    if (!match) return null;
    const hour12 = Number(match[1]);
    const hour = match[2] === "PM" ? (hour12 % 12) + 12 : hour12 % 12;
    const next = new Date();
    next.setHours(hour, 0, 0, 0);
    if (next.getTime() <= now) next.setDate(next.getDate() + 1);
    return { at: next.getTime(), delay: next.getTime() - now };
  };
  const sendAllocationCommands = async () => {
    const hubId = await AsyncStorage.getItem("bawatpieza_hub_id");
    if (!hubId) throw new Error("Paired hub is unavailable.");
    const channelsToPower = channels.filter(
      (channel) => (channelShares.get(channel.channel)?.hours ?? 0) > 0,
    );
    if (channelsToPower.length === 0) {
      throw new Error("No configured channels are available for allocation.");
    }

    await new Promise<void>((resolve, reject) => {
      const client = new Paho.Client(
        "broker.hivemq.com",
        8884,
        `app-allocation-${Math.random().toString(16).substring(2, 8)}`,
      );
      allocationClientRef.current = client;
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        allocationClientRef.current = null;
        if (client.isConnected()) client.disconnect();
        if (error) reject(error);
        else resolve();
      };

      client.onConnectionLost = () => {
        finish(new Error("Allocation connection was lost before powering bulbs."));
      };
      client.connect({
        useSSL: true,
        keepAliveInterval: 20,
        onSuccess: () => {
          try {
            const topic = `bawatpieza/devices/${hubId}/commands`;
            const commands = [
              { command: "force_battery" },
              ...channelsToPower.map((channel) => {
                const share = channelShares.get(channel.channel);
                return {
                  command: "room_relay",
                  channel: channel.channel,
                  state: true,
                  allocation_pct: Number((share?.percentage ?? 0).toFixed(1)),
                  duration_minutes: Math.max(
                    1,
                    Math.round((share?.hours ?? 0) * 60),
                  ),
                };
              }),
            ];
            commands.forEach((command) => {
              const message = new Paho.Message(JSON.stringify(command));
              message.destinationName = topic;
              client.send(message);
            });
            finish();
          } catch (error) {
            finish(
              error instanceof Error
                ? error
                : new Error("Could not send allocation commands."),
            );
          }
        },
        onFailure: () =>
          finish(new Error("Could not connect to the hub for allocation.")),
      });
    });
  };
  const startSystemAllocation = () => {
    const scheduledStart = getNextStartAt();
    if (scheduledStart === null) {
      setAllocationStatus("Choose a valid allocation start time.");
      return;
    }
    allocateByPriority();
    if (allocationTimerRef.current) clearTimeout(allocationTimerRef.current);

    const run = () => {
      setAllocationStatus("Powering configured channel bulbs...");
      void sendAllocationCommands()
        .then(() => setAllocationStatus("Battery allocation is now powering the channel bulbs."))
        .catch((error: unknown) => {
          console.error("[power-management] Allocation command failed:", error);
          setSystemAllocated(false);
          setAllocationStatus(
            error instanceof Error
              ? error.message
              : "Could not power the channel bulbs.",
          );
        });
    };

    if (scheduledStart.delay === 0) {
      run();
    } else {
      allocationTimerRef.current = setTimeout(run, scheduledStart.delay);
      setAllocationStatus(
        `Allocation scheduled for ${new Date(scheduledStart.at).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })}.`,
      );
    }
  };
  const selectedChannel =
    channels.find((channel) => channel.channel === activeChannel) ?? null;
  const selectedShare = selectedChannel
    ? channelShares.get(selectedChannel.channel)
    : undefined;
  const wantedHours = selectedShare?.hours ?? 0;
  const assignedHours =
    activeChannel === null ? 0 : (effectiveAllocs[activeChannel] ?? 0);
  const [selectedBattery, setSelectedBattery] = useState(false);
  const [systemAllocated, setSystemAllocated] = useState(false);

  return (
    <>
      <View
        style={[
          styles.poolCard,
          { backgroundColor: c.surface, borderColor: c.line },
        ]}
      >
        <View style={styles.rowBetween}>
          <View>
            <View style={styles.poolHeading}>
              <View
                style={[styles.poolIcon, { backgroundColor: c.accentSoft }]}
              >
                <Ionicons
                  name="layers-outline"
                  size={scale(20)}
                  color={c.accent}
                />
              </View>
              <View>
                <Text style={[styles.poolTitle, { color: c.text }]}>
                  Available Battery Pool
                </Text>
                <Text style={[styles.poolSubtitle, { color: c.muted }]}>
                  80% USABLE · 20% SAFE RESERVE
                </Text>
              </View>
            </View>
            <Text style={[styles.poolNote, { color: c.muted }]}>
              {hasBatteryReading
                ? `Battery array is ${Math.floor(batteryPct)}% full`
                : telemetryConnection === "offline"
                  ? "Battery telemetry is offline"
                  : "Fetching live battery availability..."}
              {"\n"}
              {batteryV !== null
                ? `${batteryV.toFixed(1)}V live voltage`
                : "Voltage unavailable"}
              {"\n"}
              {hasBatteryReading
                ? `${usablePool.toFixed(1)}h allocatable · ${(totalPool - usablePool).toFixed(1)}h reserved`
                : "20% held as a safe reserve"}
              {"\n"}
              60,000mAh nominal capacity
            </Text>
          </View>

          <Text style={[styles.poolValue, { color: c.text }]}>
            {hasBatteryReading ? `~${totalPool}h` : "--h"}
            {"\n"}
            <Text style={[styles.poolValueUnit, { color: c.muted }]}>
              Stored
            </Text>
          </Text>
        </View>

        <View style={[styles.progress, { backgroundColor: c.surfaceMuted }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: c.orange,
                width: `${Math.min(100, progressPct)}%`,
              },
            ]}
          />
        </View>

        <View style={styles.progressLabels}>
          <Text style={[styles.progressText, { color: c.muted }]}>
            {hasBatteryReading
              ? `${Math.floor(progressPct)}% of usable pool assigned`
              : "Waiting for battery"}
          </Text>
          <Text style={[styles.progressText, { color: c.muted }]}>
            {hasBatteryReading
              ? `${remaining.toFixed(1)}h usable pool free`
              : "--h Still Free"}
          </Text>
        </View>

        <Text style={[styles.selectionLabel, { color: c.text }]}>
          Available Battery
        </Text>
        <Text style={[styles.selectionHint, { color: c.muted }]}>
          Select the connected battery array to allocate its available power.
        </Text>
        <View style={styles.batteryChoiceRow}>
          <Pressable
            onPress={() => {
              if (!hasBatteryReading) return;
              setSelectedBattery((selected) => !selected);
              setSystemAllocated(false);
            }}
            disabled={!hasBatteryReading}
            style={[
              styles.batteryChoice,
              {
                backgroundColor: selectedBattery ? c.accentSoft : c.surfaceMuted,
                borderColor: selectedBattery ? c.orange : c.line,
                opacity: hasBatteryReading ? 1 : 0.65,
              },
            ]}
            accessibilityRole="radio"
            accessibilityState={{
              selected: selectedBattery,
              disabled: !hasBatteryReading,
            }}
            accessibilityLabel={
              hasBatteryReading
                ? `Select battery array, ${Math.floor(batteryPct)} percent full`
                : "Battery array unavailable until live telemetry arrives"
            }
          >
            <Ionicons
              name={selectedBattery ? "radio-button-on" : "radio-button-off"}
              size={scale(18)}
              color={selectedBattery ? c.orange : c.muted}
            />
            <View style={styles.batteryChoiceCopy}>
              <Text style={[styles.batteryChoiceName, { color: c.text }]}>
                BATTERY ARRAY
              </Text>
              <Text style={[styles.batteryChoiceDetail, { color: c.muted }]}>
                {hasBatteryReading
                  ? `${Math.floor(batteryPct)}% available${batteryV !== null ? ` · ${batteryV.toFixed(1)}V` : ""}`
                  : telemetryConnection === "offline"
                    ? "Waiting for device connection"
                    : "Waiting for live battery telemetry"}
              </Text>
            </View>
          </Pressable>
        </View>

      <Text style={[styles.selectionLabel, { color: c.text }]}>
        Allocation start time
      </Text>
      <Text style={[styles.selectionHint, { color: c.muted }]}>
        Choose when the hub should switch to battery and power the configured bulbs.
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scheduleChoiceRow}
      >
        {START_TIME_OPTIONS.map((option) => (
          <Pressable
            key={option}
            onPress={() => setStartTime(option)}
            style={[
              styles.scheduleChoice,
              {
                backgroundColor:
                  startTime === option ? c.orange : c.surface,
                borderColor: startTime === option ? c.orange : c.line,
              },
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected: startTime === option }}
          >
            <Text
              style={[
                styles.scheduleChoiceText,
                { color: startTime === option ? "#FFFFFF" : c.text },
              ]}
            >
              {option}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

        <ActionButton
          label={
            selectedBattery
              ? "Let System Allocate from Battery Array"
              : "Select Available Battery to Continue"
          }
          disabled={!selectedBattery || !hasBatteryReading}
          onPress={startSystemAllocation}
        />

        <Text
          style={[styles.cardCopy, { color: c.muted, marginTop: scale(12) }]}
        >
          {systemAllocated
            ? allocationStatus ||
              "System allocation is using the connected battery array."
            : "Gives the most important rooms their full hours first, then splits what&apos;s left after you choose a battery."}
        </Text>
      </View>

      <View
        style={[
          styles.infoBand,
          { backgroundColor: c.surfaceMuted, borderColor: c.line },
        ]}
      >
        <Text style={[styles.noticeTitle, { color: c.orange }]}>
          Campus-Wide Power Allocation
        </Text>
        <Text style={[styles.cardCopy, { color: c.muted }]}>
          Assign each battery-powered zone its hours and start time — nothing
          changes on campus until you confirm.
        </Text>
      </View>

      <SectionLabel label="ALL ZONES" c={c} />
      <Text style={[styles.cardCopy, { color: c.muted }]}>
        Priority weights are scaled across configured channels to use up to
        {" "}{USABLE_POOL_PERCENTAGE}% of the pool. The remaining{" "}
        {RESERVED_POOL_PERCENTAGE}% stays in the safe reserve.
      </Text>

      {loadingChannels ? (
        <Text style={[styles.cardCopy, { color: c.muted }]}>
          Loading configured channels...
        </Text>
      ) : channelError ? (
        <Text style={[styles.cardCopy, { color: c.danger }]}>
          {channelError}
        </Text>
      ) : channels.length === 0 ? (
        <Text style={[styles.cardCopy, { color: c.muted }]}>
          No configured channels found for this device.
        </Text>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.zoneRow}
          >
              {channels.map((item) => {
                const active = activeChannel === item.channel;
                const priority = getChannelPriorityOption(item.priority);
                return (
                  <Pressable
                    key={item.channel}
                    onPress={() => setActiveChannel(item.channel)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${item.roomName}, channel ${item.channel}, ${priority.label} priority, ${formatPercentage(channelShares.get(item.channel)?.percentage ?? 0)} percent allocation`}
                    style={[
                      styles.zonePill,
                      {
                        backgroundColor: active ? c.orange : c.surface,
                        borderColor: c.line,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.zoneText,
                        { color: active ? "#FFFFFF" : c.text },
                      ]}
                      numberOfLines={1}
                    >
                      {item.roomName}
                    </Text>
                    <Text
                      style={[
                        styles.zoneSubText,
                        { color: active ? "#FFFFFF" : c.muted },
                      ]}
                    >
                      Channel {item.channel}
                    </Text>
                    <Text
                      style={[
                        styles.zonePriorityText,
                        { color: active ? "#FFFFFF" : c.orange },
                      ]}
                    >
                      {priority.label} ·{" "}
                      {formatPercentage(
                        channelShares.get(item.channel)?.percentage ?? 0,
                      )}
                      % share
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

          {selectedChannel ? (
            <>
              <ZoneCard
                c={c}
                mode={mode}
                zone={selectedChannel.roomName}
                channel={selectedChannel.channel}
                priority={selectedChannel.priority}
                allocationPct={selectedShare?.percentage ?? 0}
                wantedHours={wantedHours}
                assignedHours={assignedHours}
                setAssignedHours={setAssignedHours}
                remainingPool={remaining}
              />
              <ActionButton
                label="Confirm Allocation"
                disabled={!selectedBattery || !hasBatteryReading}
                onPress={() => setSystemAllocated(true)}
              />
            </>
          ) : null}
        </>
      )}
    </>
  );
}
