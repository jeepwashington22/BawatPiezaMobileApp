import Paho from "paho-mqtt";
import { DeviceEventEmitter } from "react-native";
import { apiFetch } from "./api";
import { describeApiFailure } from "./network";
import { notifySystemAllocationEnded } from "./push-notifications";
import { supabase } from "./supabase";
import {
  clearSystemAllocationStatus,
  markSystemAllocationRequiresNewPlan,
  SYSTEM_ALLOCATION_FORCE_STOP_REQUESTED,
  SYSTEM_ALLOCATION_FORCE_STOPPED,
  type SystemAllocationRoomStatus,
} from "./system-allocation-status";

type StopTarget = Pick<SystemAllocationRoomStatus, "channel" | "roomName">;

const inFlightAllocationCommands = new Set<Promise<void>>();

export function trackSystemAllocationCommand(
  command: Promise<unknown>,
): void {
  const settledCommand = command.then(
    () => undefined,
    () => undefined,
  );
  inFlightAllocationCommands.add(settledCommand);
  void settledCommand.then(() => inFlightAllocationCommands.delete(settledCommand));
}

async function waitForInFlightAllocationCommands(): Promise<void> {
  await Promise.all([...inFlightAllocationCommands]);
}

async function sendHubCommand(
  hubId: string,
  accessToken: string,
  command: Record<string, unknown>,
): Promise<void> {
  let response: Response;
  try {
    response = await apiFetch(
      `/api/v1/telemetry/commands/${encodeURIComponent(hubId)}`,
      {
        method: "POST",
        timeoutMs: 10_000,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(command),
      },
    );
  } catch (error) {
    throw new Error(
      describeApiFailure(
        error,
        "Could not reach the BawatPieza API to send the hub command.",
      ),
    );
  }
  if (response.ok) return;

  const result = await response.json().catch(() => null) as {
    message?: string;
    error?: string;
  } | null;
  throw new Error(
    result?.message || result?.error || `Hub command failed (${response.status}).`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function sendSystemAllocationStopCommands(
  hubId: string,
  channels: StopTarget[],
  onCommandsSent?: () => void,
): Promise<void> {
  const uniqueChannels = [
    ...new Map(channels.map((channel) => [channel.channel, channel])).values(),
  ];
  if (!hubId.trim() || uniqueChannels.length === 0) {
    throw new Error("No allocation room channels are available to stop.");
  }

  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(`Could not verify the signed-in session: ${sessionError.message}`);
  }
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Your session expired. Please sign in again.");

  await new Promise<void>((resolve, reject) => {
    const client = new Paho.Client(
      "broker.hivemq.com",
      8884,
      `app-alloc-stop-${Math.random().toString(16).substring(2, 8)}`,
    );
    let settled = false;
    let commandsSent = false;
    let telemetryReceivedAfterStop = false;
    const confirmedOffChannels = new Set<number>();
    const telemetryTopic = `bawatpieza/devices/${hubId}/telemetry`;
    const timeout = setTimeout(() => {
      const missing = uniqueChannels
        .filter((channel) => !confirmedOffChannels.has(channel.channel))
        .map((channel) => channel.roomName)
        .join(", ");
      finish(
        new Error(
          telemetryReceivedAfterStop
            ? `The hub did not confirm these rooms off: ${missing}. Check the relay wiring and telemetry.`
            : "Stop commands were sent, but no hub telemetry arrived. Check the hub connection and MQTT status.",
        ),
      );
    }, 30_000);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (client.isConnected()) client.disconnect();
      if (error) reject(error);
      else resolve();
    };
    const maybeFinish = () => {
      if (
        commandsSent &&
        uniqueChannels.every((channel) =>
          confirmedOffChannels.has(channel.channel),
        )
      ) {
        finish();
      }
    };

    client.onConnectionLost = () => {
      finish(new Error("Hub connection was lost before stop commands were delivered."));
    };
    client.onMessageArrived = (message) => {
      if (!commandsSent || message.destinationName !== telemetryTopic) return;
      try {
        const payload: unknown = JSON.parse(message.payloadString);
        if (!isRecord(payload)) return;
        telemetryReceivedAfterStop = true;
        uniqueChannels.forEach((channel) => {
          if (payload[`ch${channel.channel}_on`] === false) {
            confirmedOffChannels.add(channel.channel);
          } else {
            confirmedOffChannels.delete(channel.channel);
          }
        });
        maybeFinish();
      } catch (error) {
        console.warn(
          "[system-allocation] Ignoring invalid relay stop confirmation:",
          error,
        );
      }
    };
    client.connect({
      useSSL: true,
      keepAliveInterval: 20,
      onSuccess: () => {
        try {
          client.subscribe(telemetryTopic);
          void Promise.all(
            uniqueChannels.map((channel) =>
              sendHubCommand(hubId, accessToken, {
                command: "room_relay",
                channel: channel.channel,
                state: false,
              }),
            ),
          )
            .then(() => {
              commandsSent = true;
              onCommandsSent?.();
              maybeFinish();
            })
            .catch((error: unknown) => {
              finish(
                error instanceof Error
                  ? error
                  : new Error("Could not send relay stop commands to the hub."),
              );
            });
        } catch (error) {
          finish(
            error instanceof Error
              ? error
              : new Error("Could not send relay stop commands."),
          );
        }
      },
      onFailure: () =>
        finish(new Error("Could not connect to the hub to stop allocation.")),
    });
  });
}

export async function forceStopSystemAllocation(
  hubId: string,
  channels: StopTarget[],
  onCommandsSent?: () => void,
): Promise<void> {
  DeviceEventEmitter.emit(SYSTEM_ALLOCATION_FORCE_STOP_REQUESTED, hubId);
  await waitForInFlightAllocationCommands();
  await sendSystemAllocationStopCommands(hubId, channels, onCommandsSent);
  await markSystemAllocationRequiresNewPlan(hubId);
  await clearSystemAllocationStatus(hubId);
  DeviceEventEmitter.emit(SYSTEM_ALLOCATION_FORCE_STOPPED, hubId);

  void notifySystemAllocationEnded(
    hubId,
    `${Date.now()}-manual-force-stop`,
    "force_stop",
  ).catch((error: unknown) => {
    console.error("[system-allocation] Force-stop notification failed:", error);
  });
}
