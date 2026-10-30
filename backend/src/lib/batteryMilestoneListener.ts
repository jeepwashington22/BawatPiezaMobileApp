import mqtt from 'mqtt';
import { supabase } from './supabase.js';

const TELEMETRY_TOPIC = 'bawatpieza/devices/+/telemetry';
const BATTERY_MILESTONES = new Set([20, 50, 95, 100]);

type BatteryTelemetry = {
  bat_pct?: unknown;
  bat_v?: unknown;
  power_mode?: unknown;
};

function readNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function notifyDeviceUsers(
  hubId: string,
  percentage: 20 | 100,
): Promise<void> {
  const { data: pairings, error: pairingError } = await supabase
    .from('device_pairings')
    .select('user_id')
    .eq('hub_id', hubId);
  if (pairingError) {
    console.error('[battery-milestones] failed to find device owner', pairingError);
    return;
  }

  const { data: grants, error: grantError } = await supabase
    .from('device_access')
    .select('user_id')
    .eq('hub_id', hubId);
  if (grantError) {
    console.error('[battery-milestones] failed to find shared users', grantError);
    return;
  }

  const userIds = [
    ...new Set([
      ...(pairings ?? []).map(({ user_id }) => user_id),
      ...(grants ?? []).map(({ user_id }) => user_id),
    ]),
  ];
  if (userIds.length === 0) return;

  const isLow = percentage === 20;
  const { error: notificationError } = await supabase
    .from('notifications')
    .insert(
      userIds.map((userId) => ({
        user_id: userId,
        type: isLow ? 'battery_low' : 'battery_full',
        title: isLow ? 'Battery low — switching to Grid' : 'Battery is full',
        body: isLow
          ? 'Battery charge reached 20%. The device is switching to Grid power.'
          : 'Battery charge reached 100%.',
      })),
    );
  if (notificationError) {
    console.error('[battery-milestones] failed to notify device users', notificationError);
  }
}

export function startBatteryMilestoneListener(): () => void {
  const client = mqtt.connect('mqtt://broker.hivemq.com:1883', {
    clientId: `bawatpieza-battery-${Math.random().toString(16).slice(2, 10)}`,
    reconnectPeriod: 5_000,
    connectTimeout: 10_000,
  });
  const lastPercentageByHub = new Map<string, number>();
  const lastStoredMilestoneByHub = new Map<string, number>();
  const pendingMilestones = new Set<string>();
  const lastGridCommandAtByHub = new Map<string, number>();

  client.on('connect', () => {
    client.subscribe(TELEMETRY_TOPIC, (error) => {
      if (error) {
        console.error('[battery-milestones] failed to subscribe to telemetry', error);
        return;
      }
      console.log('[battery-milestones] subscribed to hub telemetry');
    });
  });

  client.on('error', (error) => {
    console.error('[battery-milestones] MQTT connection error', error);
  });

  client.on('message', (topic, payload) => {
    const topicMatch = /^bawatpieza\/devices\/([^/]+)\/telemetry$/.exec(topic);
    if (!topicMatch) return;
    const hubId = topicMatch[1];
    if (!hubId) return;

    let telemetry: BatteryTelemetry;
    try {
      telemetry = JSON.parse(payload.toString()) as BatteryTelemetry;
    } catch (error) {
      console.error('[battery-milestones] invalid telemetry JSON', error);
      return;
    }

    const percentage = readNumber(telemetry.bat_pct);
    if (percentage === null || !Number.isInteger(percentage)) return;

    if (percentage === 20 && telemetry.power_mode !== 'grid' && client.connected) {
      const now = Date.now();
      const lastCommandAt = lastGridCommandAtByHub.get(hubId) ?? 0;
      if (now - lastCommandAt >= 15_000) {
        lastGridCommandAtByHub.set(hubId, now);
        client.publish(
          `bawatpieza/devices/${hubId}/commands`,
          JSON.stringify({ command: 'force_grid' }),
          (publishError) => {
            if (publishError) {
              lastGridCommandAtByHub.delete(hubId);
              console.error(
                '[battery-milestones] failed to switch device to Grid',
                publishError,
              );
            }
          },
        );
      }
    } else if (telemetry.power_mode === 'grid') {
      lastGridCommandAtByHub.delete(hubId);
    }

    const previousPercentage = lastPercentageByHub.get(hubId);
    lastPercentageByHub.set(hubId, percentage);
    if (!BATTERY_MILESTONES.has(percentage)) return;
    if (
      previousPercentage === percentage &&
      lastStoredMilestoneByHub.get(hubId) === percentage
    ) {
      return;
    }

    const pendingKey = `${hubId}:${percentage}`;
    if (pendingMilestones.has(pendingKey)) return;
    pendingMilestones.add(pendingKey);

    const voltage = readNumber(telemetry.bat_v);
    void (async () => {
      try {
        const { error } = await supabase
          .from('battery_level_milestones')
          .insert({
            hub_id: hubId,
            battery_percentage: percentage,
            battery_voltage: voltage,
            reached_at: new Date().toISOString(),
          });
        if (error) {
          console.error('[battery-milestones] failed to store milestone', error);
          return;
        }
        lastStoredMilestoneByHub.set(hubId, percentage);
        if (percentage === 20 || percentage === 100) {
          await notifyDeviceUsers(hubId, percentage);
        }
      } catch (error) {
        console.error('[battery-milestones] failed to write milestone', error);
      } finally {
        pendingMilestones.delete(pendingKey);
      }
    })();
  });

  return () => {
    client.end();
  };
}
