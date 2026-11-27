export type AllocationPriority = 'high' | 'low';

export type AllocationRoomInput = {
  channel: number;
  roomName: string;
  watts: number;
  priority: AllocationPriority;
  startDate: string;
  startTime: string;
};

export type AllocationRequest = {
  hubId: string;
  rooms: AllocationRoomInput[];
  initialSocPercent: number;
  highPriorityWeight: number;
  inverterEfficiency: number;
  now?: string;
  timeZone?: string;
};

export type RoomAllocation = AllocationRoomInput & {
  energyWh: number;
  runtimeHours: number;
  runtimeHHMM: string;
  startAt: string;
  shutoffAt: string;
};

export type AllocationSummary = {
  battery: {
    voltage: number;
    capacityAh: number;
    totalWh: number;
    usableWh: number;
    availableNowWh: number;
    runtimeBudgetWh: number;
    reservedSafeZoneWh: number;
    maxDepthOfDischarge: number;
    inverterEfficiency: number;
    initialSocPercent: number;
    runtimeBasisSocPercent: number;
    isTheoreticalEstimate: boolean;
    finalProjectedSocPercent: number;
  };
  budgets: {
    highWeightPercent: number;
    lowWeightPercent: number;
    E_high: number;
    E_low: number;
    totalAllocatedWh: number;
  };
  rooms: RoomAllocation[];
  concurrentPhases?: {
    lowShutoffTime: string;
    highShutoffTime: string;
    lowRuntimeHours: number;
    highTotalHours: number;
    concurrentHours: number;
    highSoloHours: number;
    highEnergyUsedConcurrentWh: number;
    highEnergyRemainingWh: number;
  };
};
