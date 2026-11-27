import { apiFetch } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import type {
  AllocationPriority,
  AllocationRequest,
  AllocationSummary,
} from './types';

const ENDPOINT = '/api/v1/system-allocation/calculate';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAllocationPriority(value: unknown): value is AllocationPriority {
  return value === 'high' || value === 'low';
}

export function isAllocationSummary(value: unknown): value is AllocationSummary {
  if (
    !isRecord(value) ||
    !isRecord(value.battery) ||
    !isRecord(value.budgets) ||
    !Array.isArray(value.rooms) ||
    value.rooms.length === 0
  ) {
    return false;
  }

  const battery = value.battery;
  const batteryNumberFields = [
    'voltage',
    'capacityAh',
    'totalWh',
    'usableWh',
    'availableNowWh',
    'runtimeBudgetWh',
    'reservedSafeZoneWh',
    'maxDepthOfDischarge',
    'inverterEfficiency',
    'initialSocPercent',
    'runtimeBasisSocPercent',
    'finalProjectedSocPercent',
  ];
  if (
    batteryNumberFields.some(
      (field) =>
        typeof battery[field] !== 'number' ||
        !Number.isFinite(battery[field]),
    ) ||
    typeof battery.isTheoreticalEstimate !== 'boolean'
  ) {
    return false;
  }

  const budgets = value.budgets;
  const budgetNumberFields = [
    'highWeightPercent',
    'lowWeightPercent',
    'E_high',
    'E_low',
    'totalAllocatedWh',
  ];
  if (
    budgetNumberFields.some(
      (field) =>
        typeof budgets[field] !== 'number' ||
        !Number.isFinite(budgets[field]),
    ) ||
    !value.rooms.every(
      (room) =>
        isRecord(room) &&
        typeof room.channel === 'number' &&
        Number.isInteger(room.channel) &&
        typeof room.roomName === 'string' &&
        typeof room.watts === 'number' &&
        Number.isFinite(room.watts) &&
        room.watts > 0 &&
        isAllocationPriority(room.priority) &&
        typeof room.startDate === 'string' &&
        typeof room.startTime === 'string' &&
        typeof room.energyWh === 'number' &&
        Number.isFinite(room.energyWh) &&
        typeof room.runtimeHours === 'number' &&
        Number.isFinite(room.runtimeHours) &&
        typeof room.runtimeHHMM === 'string' &&
        typeof room.startAt === 'string' &&
        Number.isFinite(Date.parse(room.startAt)) &&
        typeof room.shutoffAt === 'string' &&
        Number.isFinite(Date.parse(room.shutoffAt)),
    )
  ) {
    return false;
  }

  if (value.concurrentPhases !== undefined) {
    if (!isRecord(value.concurrentPhases)) return false;
    const phases = value.concurrentPhases;
    const phaseNumberFields = [
      'lowRuntimeHours',
      'highTotalHours',
      'concurrentHours',
      'highSoloHours',
      'highEnergyUsedConcurrentWh',
      'highEnergyRemainingWh',
    ];
    if (
      typeof phases.lowShutoffTime !== 'string' ||
      typeof phases.highShutoffTime !== 'string' ||
      phaseNumberFields.some(
        (field) =>
          typeof phases[field] !== 'number' ||
          !Number.isFinite(phases[field]),
      )
    ) {
      return false;
    }
  }
  return true;
}

export async function requestSystemAllocation(
  allocation: AllocationRequest,
): Promise<AllocationSummary> {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(`Could not verify the signed-in session: ${error.message}`);
  }
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new Error('Sign in before calculating a system allocation.');
  }

  const response = await apiFetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(allocation),
  });
  const responseBody: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      isRecord(responseBody) && typeof responseBody.error === 'string'
        ? responseBody.error
        : `System allocation request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  if (!isRecord(responseBody) || !isAllocationSummary(responseBody.summary)) {
    throw new Error('The backend returned an invalid system allocation summary.');
  }
  return responseBody.summary;
}
