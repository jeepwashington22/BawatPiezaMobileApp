import { router } from "expo-router";
import { useState, useEffect, useRef } from "react";
import { Pressable, StyleSheet, View, ScrollView } from "react-native";
import { AppText as Text } from "./app-text";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Paho from "paho-mqtt";
import { useRouter, type Href } from "expo-router";

import { ScreenShell } from "./screen-shell";
import { Card, Glass, scale } from "./glass-ui";
import { fonts, useTheme, type Mode, type ThemeColors } from "../theme";
import { usePowerOverride } from "../hooks/use-power-override";

type Tab = "monitor" | "configure" | "allocation" | "override";

export function PowerManagementScreen() {
  const { colors: c, mode } = useTheme();
  const [tab, setTab] = useState<Tab>("monitor");
  const [batteryPct, setBatteryPct] = useState<number | null>(null);
  const [batteryV, setBatteryV] = useState<number | null>(null);

  // === LIVE MQTT TELEMETRY FOR 4S BATTERIES ===
  useEffect(() => {
    let activeClient: Paho.Client | null = null;

    const connectMqtt = async () => {
      try {
        const hubId = await AsyncStorage.getItem("bawatpieza_hub_id");
        if (!hubId) return;

        const clientId = `app-power-${Math.random().toString(16).substring(2, 8)}`;
        const client = new Paho.Client("broker.hivemq.com", 8884, clientId);

        client.onMessageArrived = (message: Paho.Message) => {
          try {
            const data = JSON.parse(message.payloadString);
            if (data.bat_pct !== undefined) setBatteryPct(Number(data.bat_pct));
            if (data.bat_v !== undefined) setBatteryV(Number(data.bat_v));
          } catch (error) {
            // ignore non-json
          }
        };

        client.connect({
          useSSL: true,
          onSuccess: () => {
            client.subscribe(`bawatpieza/devices/${hubId}/telemetry`);
          },
        });

        activeClient = client;
      } catch (error) {
        console.error("mqtt connection failed in power management");
      }
    };

    connectMqtt();

    return () => {
      if (activeClient?.isConnected()) {
        activeClient.disconnect();
      }
    };
  }, []);

  return (
    <ScreenShell scroll title="Power Management">
      <View style={[styles.tabs, { backgroundColor: c.surface }]}>
        {(["monitor", "configure", "allocation", "override"] as Tab[]).map(
          (item) => {
            const active = tab === item;

            return (
              <Pressable
                key={item}
                onPress={() => setTab(item)}
                style={[
                  styles.tab,
                  {
                    backgroundColor: active ? "transparent" : c.surfaceMuted,
                    borderColor: c.line,
                  },
                  active && styles.activeTab,
                ]}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                {active && (
                  <LinearGradient
                    colors={["#F9A84E", "#F59E0B"]}
                    style={StyleSheet.absoluteFill}
                  />
                )}
                <Text
                  style={[
                    styles.tabText,
                    { color: active ? "#FFFFFF" : c.muted },
                  ]}
                >
                  {item[0].toUpperCase()}
                  {item.slice(1)}
                </Text>
              </Pressable>
            );
          },
        )}
      </View>

      {tab === "monitor" && (
        <Monitor
          c={c}
          mode={mode}
          batteryPct={batteryPct}
          batteryV={batteryV}
        />
      )}
      {tab === "configure" && <Configure c={c} mode={mode} />}
      {tab === "allocation" && (
        <Allocation c={c} mode={mode} batteryPct={batteryPct} />
      )}
      {tab === "override" && <Override c={c} />}
    </ScreenShell>
  );
}

function Override({ c }: { c: ThemeColors }) {
  const { override, setOverride } = usePowerOverride();
  const options = [
    {
      value: "grid" as const,
      label: "Force Grid",
      icon: "flash-outline" as const,
      color: c.gridGreen,
    },
    {
      value: "battery" as const,
      label: "Force Battery",
      icon: "battery-charging-outline" as const,
      color: c.orange,
    },
    {
      value: "shutdown" as const,
      label: "Shutdown",
      icon: "power-outline" as const,
      color: c.danger,
    },
  ];

  return (
    <>
      <View
        style={[
          styles.overrideIntro,
          { backgroundColor: c.surface, borderColor: c.line },
        ]}
      >
        <View
          style={[styles.overrideIntroIcon, { backgroundColor: c.accentSoft }]}
        >
          <Ionicons
            name="flash-outline"
            size={scale(20)}
            color={override === "grid" ? c.gridGreen : c.orange}
          />
        </View>
        <View style={styles.overrideIntroCopy}>
          <Text style={[styles.overrideTitle, { color: c.text }]}>
            Power override
          </Text>
          <Text style={[styles.overrideCopy, { color: c.muted }]}>
            Choose which source should supply all zones right now.
          </Text>
        </View>
      </View>

      <SectionLabel label="SELECT POWER SOURCE" c={c} />
      <View style={styles.overrideOptions}>
        {options.map((option) => {
          const active = override === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => setOverride(option.value)}
              style={[
                styles.overrideOption,
                {
                  backgroundColor: active ? c.accentSoft : c.surface,
                  borderColor: active ? option.color : c.line,
                },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={option.label}
            >
              <Ionicons
                name={option.icon}
                size={scale(21)}
                color={option.color}
              />
              <Text style={[styles.overrideOptionText, { color: c.text }]}>
                {option.label}
              </Text>
              <Ionicons
                name={active ? "radio-button-on" : "radio-button-off"}
                size={scale(18)}
                color={active ? option.color : c.muted}
              />
            </Pressable>
          );
        })}
      </View>

      <View
        style={[
          styles.overrideStatus,
          { backgroundColor: c.surfaceMuted, borderColor: c.line },
        ]}
      >
        <View
          style={[
            styles.statusDot,
            {
              backgroundColor:
                override === "grid"
                  ? c.gridGreen
                  : override
                    ? c.orange
                    : c.muted,
            },
          ]}
        />
        <Text style={[styles.overrideStatusText, { color: c.muted }]}>
          {override === "grid"
            ? "Grid is supplying all zones."
            : override === "battery"
              ? "Battery is supplying all zones."
              : override === "shutdown"
                ? "Power is shut down for all zones."
                : "Automatic power selection is active."}
        </Text>
      </View>
    </>
  );
}

function Monitor({
  c,
  mode,
  batteryPct,
  batteryV,
}: {
  c: ThemeColors;
  mode: Mode;
  batteryPct: number | null;
  batteryV: number | null;
}) {
  const [enabled, setEnabled] = useState(true);
  const { override, usingGrid, openOverrides } = usePowerOverride();
  const forcingBattery = override === "battery";
  const bannerColor = usingGrid
    ? "#16A34A"
    : forcingBattery
      ? "#F97316"
      : c.orange;
  const bannerSoft = usingGrid
    ? "rgba(22,163,74,0.12)"
    : "rgba(249,115,22,0.10)";

  const totalV = batteryV !== null ? batteryV.toFixed(1) : "12.8";
  const cellV = batteryV !== null ? (batteryV / 4).toFixed(2) : "3.20";
  const currentMah =
    batteryPct !== null
      ? Math.floor((batteryPct / 100) * 60000).toLocaleString()
      : "--";
  const pctString = batteryPct !== null ? `${Math.floor(batteryPct)}%` : "--%";

  return (
    <>
      <SectionLabel label="BATTERY ARRAY" action="Live Hardware Sync" c={c} />

      <View
        style={[
          styles.archCard,
          { backgroundColor: c.surface, borderColor: c.line },
        ]}
      >
        <View style={styles.archHeader}>
          <View
            style={[
              styles.archIconBox,
              { backgroundColor: "rgba(249, 115, 22, 0.15)" },
            ]}
          >
            <Ionicons name="hardware-chip" size={scale(22)} color="#F97316" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.archTitle, { color: c.text }]}>
              4s array architecture
            </Text>
            <Text style={[styles.archSubtitle, { color: c.muted }]}>
              active series configuration
            </Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cellsScroll}
        >
          <View style={styles.cellsWrapper}>
            {[1, 2, 3, 4].map((num, idx) => (
              <View key={num} style={styles.cellGroup}>
                <View
                  style={[
                    styles.cellBlock,
                    {
                      backgroundColor: mode === "dark" ? "#1A1D24" : "#F8FAFC",
                      borderColor: c.orange,
                    },
                  ]}
                >
                  <View style={styles.terminalLeft}>
                    <Text style={styles.terminalText}>-</Text>
                  </View>
                  <View style={styles.terminalRight}>
                    <Text style={styles.terminalText}>+</Text>
                  </View>

                  <Text style={[styles.cellType, { color: c.orange }]}>
                    s168
                  </Text>
                  <Text style={[styles.cellVolt, { color: c.text }]}>
                    {cellV}v
                  </Text>
                  <Text style={[styles.cellLabel, { color: c.muted }]}>
                    lipo
                  </Text>
                  <View style={styles.cellMahBadge}>
                    <Text style={styles.cellMahText}>60k</Text>
                    <Text style={styles.cellMahUnit}>mah</Text>
                  </View>
                </View>
                {idx < 3 && (
                  <View style={styles.seriesConnection}>
                    <View
                      style={[styles.wire, { backgroundColor: c.orange }]}
                    />
                  </View>
                )}
              </View>
            ))}
          </View>
        </ScrollView>

        <View
          style={[
            styles.totalsBox,
            {
              backgroundColor:
                mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
            },
          ]}
        >
          <View style={styles.totalRow}>
            <Ionicons name="flash" size={scale(14)} color="#F97316" />
            <Text style={[styles.totalLabel, { color: c.muted }]}>
              total real voltage:
            </Text>
            <Text style={[styles.totalValue, { color: c.text }]}>
              {totalV}v
            </Text>
          </View>
          <View style={styles.totalRow}>
            <Ionicons
              name="battery-charging"
              size={scale(14)}
              color="#22C55E"
            />
            <Text style={[styles.totalLabel, { color: c.muted }]}>
              current capacity:
            </Text>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.totalValue, { color: c.text }]}>
                {currentMah} / 60,000mah
              </Text>
              <Text style={[styles.subValue, { color: c.orange }]}>
                {pctString} full
              </Text>
            </View>
          </View>
          <Text style={[styles.totalsNote, { color: c.muted }]}>
            cells wired in series (+ to -). voltage scales dynamically, mass
            capacity remains at 60,000mah limit.
          </Text>
        </View>
      </View>

      <Glass
        mode={mode}
        style={[
          styles.featureCard,
          { borderColor: c.line, backgroundColor: c.surface },
        ]}
      >
        <View style={[styles.switchGlow, { backgroundColor: c.accentSoft }]} />
        <View style={styles.switchHeader}>
          <View
            style={[
              styles.switchIcon,
              { backgroundColor: c.accentSoft, borderColor: c.line },
            ]}
          >
            <Ionicons
              name="git-compare-outline"
              size={scale(19)}
              color={c.orange}
            />
          </View>
          <View style={styles.switchHeading}>
            <Text style={[styles.switchEyebrow, { color: c.orange }]}>
              Power Intelligence
            </Text>
            <Text style={[styles.switchTitle, { color: c.text }]}>
              Smart Auto-Switching
            </Text>
          </View>
          <Pressable
            onPress={() => setEnabled(!enabled)}
            style={[
              styles.toggle,
              { backgroundColor: enabled ? c.accent : c.surfaceMuted },
            ]}
            accessibilityRole="switch"
            accessibilityState={{ checked: enabled }}
            accessibilityLabel="Smart Auto-Switching"
          >
            <View style={[styles.toggleKnob, !enabled && styles.toggleOff]} />
          </Pressable>
        </View>

        <Text style={[styles.switchCopy, { color: c.muted }]}>
          Automatically balances grid power, battery capacity, and campus load.
        </Text>
      </Glass>

      <View
        style={[
          styles.notice,
          {
            backgroundColor: mode === "dark" ? "#17120D" : "#F4F0E9",
            borderColor:
              mode === "dark" ? "rgba(251,146,60,0.25)" : "transparent",
          },
        ]}
      >
        <Text style={[styles.noticeTitle, { color: c.orange }]}>
          4S Batteries are at {pctString}
        </Text>
        <Text style={[styles.noticeCopy, { color: c.muted }]}>
          {batteryPct === 100
            ? "Charging stopped automatically to prevent overcharge. Notification sent to admin & maintenance."
            : "System is actively monitoring the state of charge."}
        </Text>
      </View>

      <SectionLabel
        label="CURRENTLY DISCHARGING"
        action="Change In Overrides"
        c={c}
      />

      {(usingGrid || forcingBattery) && (
        <View style={[styles.overrideBanner, { backgroundColor: bannerColor }]}>
          <Ionicons
            name={usingGrid ? "flash" : "battery-charging"}
            size={scale(14)}
            color="#FFFFFF"
          />
          <Text style={styles.overrideBannerText}>
            {usingGrid
              ? "Using Grid — battery on standby"
              : "Using Battery — grid on standby"}
          </Text>
        </View>
      )}

      <Pressable
        onPress={openOverrides}
        accessibilityRole="button"
        accessibilityLabel="power source status — open quick overrides"
        style={({ pressed }) => [pressed && { opacity: 0.94 }]}
      >
        <Card
          mode={mode}
          style={[
            styles.dischargeCard,
            (usingGrid || forcingBattery) && {
              borderColor: bannerColor,
              backgroundColor: bannerSoft,
            },
          ]}
        >
          <View style={styles.dischargeTextWrap}>
            <Text
              style={[
                styles.cardTitle,
                { color: usingGrid ? "#16A34A" : c.text },
              ]}
            >
              {usingGrid
                ? "Grid is supplying the campus"
                : forcingBattery
                  ? "Battery is supplying the campus"
                  : "4S Batteries are supplying the campus"}
            </Text>
            <Text style={[styles.cardCopy, { color: c.muted }]}>
              {usingGrid || forcingBattery
                ? "Manual override active — tap to change in Quick Overrides"
                : "Following Smart Auto-Switching — tap to override manually"}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={scale(18)}
            color={usingGrid ? "#16A34A" : c.muted}
          />
        </Card>
      </Pressable>
    </>
  );
}

function Configure({ c, mode }: { c: ThemeColors; mode: Mode }) {
  const router = useRouter();
  const [autoSync, setAutoSync] = useState(true);

  return (
    <>
      <SectionLabel
        label="BATTERY PROTECTION"
        action="1 Array Configured"
        c={c}
      />

      <View style={styles.thresholdRowCards}>
        <ThresholdCard name="4S BATTERIES" c={c} />
      </View>

      <SectionLabel label="TIME-OF-USE SCHEDULER" c={c} />

      <Card mode={mode} style={styles.schedulerCard}>
        <View style={styles.schedulerHeader}>
          <View
            style={[
              styles.schedulerHeaderIcon,
              { backgroundColor: c.accentSoft },
            ]}
          >
            <Ionicons name="time-outline" size={scale(18)} color={c.orange} />
          </View>
          <View style={styles.schedulerHeaderCopy}>
            <Text style={[styles.schedulerTitle, { color: c.text }]}>
              Daily Power Schedule
            </Text>
            <Text style={[styles.schedulerSubtitle, { color: c.muted }]}>
              Automatic Switching Windows
            </Text>
          </View>
          <View style={[styles.activePill, { backgroundColor: c.accentSoft }]}>
            <View style={[styles.activeDot, { backgroundColor: c.ok }]} />
            <Text style={[styles.activePillText, { color: c.onAccentSoft }]}>
              Active
            </Text>
          </View>
        </View>
        <ScheduleRow
          title="Peak Hours"
          note="Use battery power"
          time="7:00 am - 7:00 pm"
          c={c}
          mode={mode}
        />
        <ScheduleRow
          title="Off-Peak Hours"
          note="Draw from grid"
          time="8:00 pm - 6:00 am"
          c={c}
          mode={mode}
        />

        <View
          style={[
            styles.scheduleDetails,
            {
              borderBottomColor:
                mode === "dark"
                  ? "rgba(255,255,255,0.12)"
                  : "rgba(10,42,74,0.1)",
            },
          ]}
        >
          <View style={styles.scheduleDetailsHeading}>
            <Text style={[styles.smallBold, { color: c.text }]}>
              How This Schedule Is Set?{" "}
            </Text>
          </View>
          <Text style={[styles.scheduleDetailsCopy, { color: c.muted }]}>
            Peak and off-peak windows follow Meralco&apos;s commercial
            Time-of-Use tariff schedule for the UCC — Congressional Campus
            account. Windows sync automatically once a day; manual edits here
            pause auto-sync until it&apos;s turned back on.
          </Text>
          <View style={styles.autoSyncRow}>
            <View style={styles.autoSyncCopy}>
              <Text style={[styles.smallBold, { color: c.text }]}>
                Auto-sync from Meralco
              </Text>
              <Text style={[styles.autoSyncDate, { color: c.muted }]}>
                Last synced Aug 30, 2026 · 6:02 AM
              </Text>
            </View>
            <Pressable
              onPress={() => setAutoSync((current) => !current)}
              style={[
                styles.autoSyncToggle,
                { backgroundColor: autoSync ? "#0755A5" : c.surfaceMuted },
              ]}
              accessibilityRole="switch"
              accessibilityState={{ checked: autoSync }}
              accessibilityLabel="Auto-sync from Meralco"
            >
              <View
                style={[
                  styles.autoSyncKnob,
                  !autoSync && styles.autoSyncKnobOff,
                ]}
              />
            </Pressable>
          </View>
        </View>

        <ActionButton
          label="Check a Zone's Runtime Need Against This Window →"
          onPress={() =>
            router.push("/pages/zones/1/runtime-calculator" as Href)
          }
        />
      </Card>
    </>
  );
}

// target demand per zone
const WANTED_HOURS: Record<string, number> = {
  "1f": 12,
  "2f": 8,
  "3f": 6,
  "4f": 6,
};
const ZONES = ["1f", "2f", "3f", "4f"];

function Allocation({
  c,
  mode,
  batteryPct,
}: {
  c: ThemeColors;
  mode: Mode;
  batteryPct: number | null;
}) {
  const [activeZone, setActiveZone] = useState("1f");
  const [allocs, setAllocs] = useState({ "1f": 0, "2f": 0, "3f": 0, "4f": 0 });

  // max campus pool (assume 24h absolute max for the whole campus at 100%)
  const totalPool =
    batteryPct !== null ? Number(((batteryPct / 100) * 24).toFixed(1)) : 24;

  const totalAssigned = Object.values(allocs).reduce((a, b) => a + b, 0);
  const remaining = Math.max(0, totalPool - totalAssigned);
  const progressPct = totalPool > 0 ? (totalAssigned / totalPool) * 100 : 0;

  const handleAutoAllocate = () => {
    let pool = totalPool;
    const next = { "1f": 0, "2f": 0, "3f": 0, "4f": 0 };
    for (const z of ZONES) {
      const take = Math.min(pool, WANTED_HOURS[z]);
      next[z as keyof typeof next] = Number(take.toFixed(1));
      pool -= take;
    }
    setAllocs(next);
  };

  const setAssignedHours = (val: number) => {
    setAllocs((prev) => ({ ...prev, [activeZone]: val }));
  };
  const [selectedBattery, setSelectedBattery] = useState<"A" | "B" | null>(
    null,
  );
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
                  4S BATTERY ARRAY
                </Text>
              </View>
            </View>
            <Text style={[styles.poolNote, { color: c.muted }]}>
              4S Batteries are {batteryPct ?? "--"}% full{"\n"}
              12.8V nominal total{"\n"}
              60,000mAh mass capacity
            </Text>
          </View>

          <Text style={[styles.poolValue, { color: c.text }]}>
            ~{totalPool}h{"\n"}
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
            {Math.floor(progressPct)}% Assigned So Far
          </Text>
          <Text style={[styles.progressText, { color: c.muted }]}>
            {remaining.toFixed(1)}h Still Free
          </Text>
        </View>

        <Text style={[styles.selectionLabel, { color: c.text }]}>
          Choose a Battery First
        </Text>
        <Text style={[styles.selectionHint, { color: c.muted }]}>
          The system will only allocate power from the battery you select.
        </Text>
        <View style={styles.batteryChoiceRow}>
          {[
            { id: "A" as const, name: "BANK A", detail: "100% full" },
            { id: "B" as const, name: "BANK B", detail: "62% full" },
          ].map((battery) => {
            const selected = selectedBattery === battery.id;
            return (
              <Pressable
                key={battery.id}
                onPress={() => {
                  setSelectedBattery(battery.id);
                  setSystemAllocated(false);
                }}
                style={[
                  styles.batteryChoice,
                  {
                    backgroundColor: c.surfaceMuted,
                    borderColor: selected ? c.orange : c.line,
                  },
                  selected && { backgroundColor: c.accentSoft },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`Select ${battery.name}, ${battery.detail}`}
              >
                <Ionicons
                  name={selected ? "radio-button-on" : "radio-button-off"}
                  size={scale(18)}
                  color={selected ? c.orange : c.muted}
                />
                <View style={styles.batteryChoiceCopy}>
                  <Text style={[styles.batteryChoiceName, { color: c.text }]}>
                    {battery.name}
                  </Text>
                  <Text
                    style={[styles.batteryChoiceDetail, { color: c.muted }]}
                  >
                    {battery.detail}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <ActionButton
          label={
            selectedBattery
              ? `Let System Allocate from Bank ${selectedBattery}`
              : "Choose a Battery to Continue"
          }
          disabled={!selectedBattery}
          onPress={() => setSystemAllocated(true)}
        />

        <Text
          style={[styles.cardCopy, { color: c.muted, marginTop: scale(12) }]}
        >
          {systemAllocated
            ? `System allocation is using Bank ${selectedBattery}.`
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

      <View style={styles.zoneRow}>
        {ZONES.map((item) => {
          const active = activeZone === item;
          return (
            <Pressable
              key={item}
              onPress={() => setActiveZone(item)}
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
                  { color: active ? "#FFFFFF" : c.muted },
                ]}
              >
                {item}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ZoneCard
        c={c}
        mode={mode}
        zone={activeZone}
        wantedHours={WANTED_HOURS[activeZone]}
        assignedHours={allocs[activeZone as keyof typeof allocs]}
        setAssignedHours={setAssignedHours}
        remainingPool={remaining}
      />
      <ActionButton
        label="Confirm Allocation"
        disabled={!selectedBattery}
        onPress={() => setSystemAllocated(true)}
      />
    </>
  );
}

function SectionLabel({
  label,
  action,
  c,
}: {
  label: string;
  action?: string;
  c: ThemeColors;
}) {
  return (
    <View style={styles.sectionLabel}>
      <Text style={[styles.sectionText, { color: c.muted }]}>{label}</Text>
      {action ? (
        <Text style={[styles.sectionAction, { color: c.muted }]}>{action}</Text>
      ) : null}
    </View>
  );
}

function ThresholdCard({ name, c }: { name: string; c: ThemeColors }) {
  const cardColor = name === "4S BATTERIES" ? "#0B63B7" : c.orange;

  return (
    <View
      style={[
        styles.thresholdCard,
        { backgroundColor: cardColor, borderColor: cardColor },
      ]}
    >
      <View style={styles.thresholdHeader}>
        <View
          style={[
            styles.thresholdIcon,
            { backgroundColor: "rgba(255,255,255,0.18)" },
          ]}
        >
          <Ionicons
            name={
              name === "4S BATTERIES"
                ? "battery-full-outline"
                : "battery-half-outline"
            }
            size={scale(18)}
            color="#FFFFFF"
          />
        </View>
        <Text
          style={[styles.thresholdName, { color: "#FFFFFF" }]}
          numberOfLines={1}
        >
          {name}
        </Text>
        <Text
          style={[
            styles.thresholdBadge,
            { color: "#FFFFFF", backgroundColor: "rgba(255,255,255,0.18)" },
          ]}
        >
          {name === "4S BATTERIES" ? "Safe" : "N/A"}
        </Text>
      </View>
      <View style={styles.thresholdRow}>
        <Text
          style={[styles.thresholdCopy, { color: "rgba(255,255,255,0.78)" }]}
        >
          Alert Below
        </Text>
        <Text style={[styles.thresholdValue, { color: "#FFFFFF" }]}>
          {name === "4S BATTERIES" ? "25%" : "--"}
        </Text>
      </View>
      <View
        style={[
          styles.thresholdTrack,
          { backgroundColor: "rgba(255,255,255,0.22)" },
        ]}
      >
        <View
          style={[
            styles.thresholdFill,
            {
              backgroundColor: "#FFFFFF",
              width: name === "4S BATTERIES" ? "25%" : "0%",
            },
          ]}
        />
      </View>
    </View>
  );
}

function ScheduleRow({
  title,
  note,
  time,
  c,
  mode,
}: {
  title: string;
  note: string;
  time: string;
  c: ThemeColors;
  mode: Mode;
}) {
  return (
    <View
      style={[
        styles.scheduleRow,
        {
          borderBottomColor:
            mode === "dark" ? "rgba(255,255,255,0.12)" : "rgba(10,42,74,0.1)",
        },
      ]}
    >
      <View style={[styles.scheduleIcon, { backgroundColor: c.surfaceMuted }]}>
        <Ionicons
          name={
            title === "Peak Hours"
              ? "battery-charging-outline"
              : "flash-outline"
          }
          size={scale(15)}
          color={c.orange}
        />
      </View>
      <View style={styles.scheduleCopy}>
        <Text style={[styles.smallBold, { color: c.text }]}>{title}</Text>
        <Text style={[styles.cardCopy, { color: c.muted }]}>{note}</Text>
      </View>
      <Text style={[styles.scheduleTime, { color: c.orange }]}>{time}</Text>
    </View>
  );
}

function ActionButton({
  label,
  disabled = false,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionButton,
        disabled && styles.actionButtonDisabled,
        pressed && { opacity: 0.82 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: disabled ? "#AAB1C2" : "#F5A220" },
        ]}
      />
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

function ZoneCard({
  c,
  mode,
  zone,
  wantedHours,
  assignedHours,
  setAssignedHours,
  remainingPool,
}: {
  c: ThemeColors;
  mode: Mode;
  zone: string;
  wantedHours: number;
  assignedHours: number;
  setAssignedHours: (val: number) => void;
  remainingPool: number;
}) {
  const progress = Math.min(1, assignedHours / wantedHours);

  return (
    <Card mode={mode} style={styles.zoneCard}>
      <Text style={[styles.zoneHeader, { color: c.text }]}>
        {zone} room mapping
      </Text>

      <View style={styles.chips}>
        <Text
          style={[
            styles.priority,
            { color: c.orange, backgroundColor: c.accentSoft },
          ]}
        >
          {zone === "1f" ? "highest priority" : "standard priority"}
        </Text>
        <Text
          style={[
            styles.batteryChip,
            { color: c.accent, backgroundColor: c.surfaceMuted },
          ]}
        >
          battery
        </Text>
      </View>

      <Text style={[styles.cardCopy, { color: c.muted }]}>
        wants to run {wantedHours}h/day · mon-fri · 6:00 pm-6:00 am
      </Text>

      <View style={styles.allocationControlRow}>
        <View
          style={[
            styles.stepper,
            { backgroundColor: c.surfaceMuted, borderColor: c.line },
          ]}
        >
          <Pressable
            onPress={() => setAssignedHours(Math.max(0, assignedHours - 1))}
            style={styles.stepperButton}
            accessibilityRole="button"
            accessibilityLabel="decrease assigned hours"
          >
            <Ionicons name="remove" size={scale(16)} color={c.text} />
          </Pressable>
          <Text style={[styles.assignedHours, { color: c.text }]}>
            {assignedHours}h
          </Text>
          <Pressable
            onPress={() => {
              if (remainingPool >= 1 && assignedHours < wantedHours) {
                setAssignedHours(assignedHours + 1);
              }
            }}
            style={styles.stepperButton}
            accessibilityRole="button"
            accessibilityLabel="increase assigned hours"
          >
            <Ionicons name="add" size={scale(16)} color={c.text} />
          </Pressable>
        </View>
        <View
          style={[styles.allocationBar, { backgroundColor: c.surfaceMuted }]}
        >
          <View
            style={[
              styles.allocationBarFill,
              { width: `${progress * 100}%`, backgroundColor: c.orange },
            ]}
          />
        </View>
      </View>
      <Text style={[styles.assignedCopy, { color: c.muted }]}>
        {assignedHours}h {assignedHours === 1 ? "is" : "are"} assigned of{" "}
        {wantedHours}h wanted
      </Text>

      <View
        style={[
          styles.batteryStart,
          {
            borderTopColor:
              mode === "dark"
                ? "rgba(255,255,255,0.12)"
                : "rgba(10,42,74,0.10)",
          },
        ]}
      >
        <View>
          <Text style={[styles.startTitle, { color: c.muted }]}>
            starts drawing from battery at
          </Text>
          <Text style={[styles.startHint, { color: c.muted }]}>
            {assignedHours > 0
              ? "battery schedule is ready"
              : "not drawing from battery yet"}
          </Text>
        </View>
        <View style={[styles.timePill, { backgroundColor: c.surfaceMuted }]}>
          <Text style={[styles.timeText, { color: c.text }]}>8:00 am</Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: scale(8),
    paddingBottom: scale(18),
  },
  title: {
    fontSize: scale(27),
    fontFamily: fonts.extrabold,
    letterSpacing: -0.8,
  },
  subtitle: {
    fontSize: scale(12),
    fontFamily: fonts.medium,
    marginTop: scale(2),
  },
  tabs: {
    flexDirection: "row",
    padding: scale(3),
    borderRadius: scale(12),
    marginBottom: scale(16),
    shadowColor: "#000000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  tab: {
    flex: 1,
    minHeight: scale(34),
    borderRadius: scale(9),
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  activeTab: {
    borderRadius: scale(9),
    overflow: "hidden",
  },
  tabText: {
    fontSize: scale(9.5),
    fontFamily: fonts.bold,
  },
  overrideIntro: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(10),
    padding: scale(14),
    borderRadius: scale(16),
    borderWidth: 1,
    marginBottom: scale(14),
  },
  overrideIntroIcon: {
    width: scale(42),
    height: scale(42),
    borderRadius: scale(13),
    alignItems: "center",
    justifyContent: "center",
  },
  overrideIntroCopy: {
    flex: 1,
  },
  overrideTitle: {
    fontSize: scale(14),
    fontFamily: fonts.extrabold,
  },
  overrideCopy: {
    fontSize: scale(10),
    lineHeight: scale(14),
    marginTop: scale(3),
    fontFamily: fonts.medium,
  },
  overrideOptions: {
    gap: scale(9),
  },
  overrideOption: {
    minHeight: scale(52),
    borderRadius: scale(14),
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: scale(10),
    paddingHorizontal: scale(14),
  },
  overrideOptionText: {
    flex: 1,
    fontSize: scale(13),
    fontFamily: fonts.bold,
  },
  overrideStatus: {
    minHeight: scale(48),
    borderRadius: scale(14),
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: scale(8),
    paddingHorizontal: scale(14),
    marginTop: scale(14),
  },
  overrideStatusText: {
    flex: 1,
    fontSize: scale(10),
    fontFamily: fonts.medium,
  },
  featureCard: {
    padding: scale(16),
    marginBottom: scale(14),
    borderRadius: scale(18),
    overflow: "hidden",
    shadowColor: "#0A2A4A",
    shadowOpacity: 0.22,
    shadowRadius: scale(12),
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  switchGlow: {
    position: "absolute",
    width: scale(140),
    height: scale(140),
    borderRadius: scale(70),
    right: scale(-54),
    top: scale(-66),
  },
  switchHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(10),
  },
  switchIcon: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(13),
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  switchHeading: {
    flex: 1,
  },
  switchEyebrow: {
    fontSize: scale(7),
    letterSpacing: 1.15,
    fontFamily: fonts.extrabold,
  },
  switchTitle: {
    fontSize: scale(13),
    marginTop: scale(3),
    fontFamily: fonts.extrabold,
  },
  switchDivider: {
    height: 1,
    marginTop: scale(12),
    marginBottom: scale(11),
  },
  switchBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  switchStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(6),
  },
  switchStatusText: {
    fontSize: scale(9),
    fontFamily: fonts.bold,
  },
  switchCopy: {
    fontSize: scale(8.5),
    lineHeight: scale(12),
    marginTop: scale(8),
    fontFamily: fonts.medium,
  },
  statusDot: {
    width: scale(7),
    height: scale(7),
    borderRadius: scale(4),
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rowTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(6),
  },
  cardTitle: {
    fontSize: scale(12),
    fontFamily: fonts.bold,
  },
  cardCopy: {
    fontSize: scale(9.5),
    fontFamily: fonts.medium,
    lineHeight: scale(13),
    marginTop: scale(6),
  },
  toggle: {
    width: scale(38),
    height: scale(22),
    borderRadius: scale(12),
    padding: scale(3),
    justifyContent: "center",
  },
  toggleKnob: {
    width: scale(16),
    height: scale(16),
    borderRadius: scale(8),
    backgroundColor: "#FFFFFF",
    alignSelf: "flex-end",
  },
  toggleOff: {
    alignSelf: "flex-start",
  },
  sectionLabel: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: scale(2),
    marginTop: scale(4),
    marginBottom: scale(8),
  },
  sectionText: {
    fontSize: scale(10),
    fontFamily: fonts.extrabold,
    letterSpacing: 1.1,
  },
  sectionAction: {
    fontSize: scale(8.5),
    fontFamily: fonts.bold,
  },
  smallBold: {
    fontSize: scale(10),
    fontFamily: fonts.bold,
  },
  notice: {
    borderRadius: scale(16),
    padding: scale(12),
    marginBottom: scale(12),
  },
  noticeTitle: {
    fontSize: scale(10),
    fontFamily: fonts.bold,
  },
  noticeCopy: {
    fontSize: scale(9),
    fontFamily: fonts.medium,
    lineHeight: scale(12),
    marginTop: scale(4),
  },
  dischargeCard: {
    padding: scale(14),
    marginBottom: scale(18),
    borderRadius: scale(16),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dischargeTextWrap: {
    flex: 1,
    paddingRight: scale(10),
  },
  overrideBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: scale(6),
    borderRadius: scale(12),
    paddingVertical: scale(8),
    paddingHorizontal: scale(12),
    marginBottom: scale(10),
    shadowOpacity: 0.3,
    shadowRadius: scale(8),
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  overrideBannerText: {
    color: "#FFFFFF",
    fontSize: scale(10),
    fontFamily: fonts.extrabold,
  },
  thresholdCard: {
    flex: 1,
    padding: scale(11),
    minHeight: scale(126),
    borderRadius: scale(16),
    borderWidth: 1,
    shadowColor: "#0A2A4A",
    shadowOpacity: 0.08,
    shadowRadius: scale(9),
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  configureIntro: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(10),
    padding: scale(13),
    borderRadius: scale(17),
    marginBottom: scale(15),
    backgroundColor: "rgba(249,115,22,0.07)",
    borderWidth: 1,
    borderColor: "rgba(249,115,22,0.16)",
  },
  configureIntroIcon: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(13),
    alignItems: "center",
    justifyContent: "center",
  },
  configureIntroCopy: { flex: 1 },
  configureIntroTitle: { fontSize: scale(12), fontFamily: fonts.extrabold },
  configureIntroText: {
    fontSize: scale(8.5),
    lineHeight: scale(12),
    marginTop: scale(2),
    fontFamily: fonts.medium,
  },
  thresholdRowCards: {
    flexDirection: "row",
    gap: scale(9),
    marginBottom: scale(14),
  },
  thresholdHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(6),
  },
  thresholdIcon: {
    width: scale(30),
    height: scale(30),
    borderRadius: scale(11),
    alignItems: "center",
    justifyContent: "center",
  },
  thresholdName: {
    flex: 1,
    fontSize: scale(9),
    letterSpacing: 0.8,
    fontFamily: fonts.extrabold,
  },
  thresholdBadge: {
    fontSize: scale(6.5),
    letterSpacing: 0.6,
    paddingHorizontal: scale(5),
    paddingVertical: scale(3),
    borderRadius: scale(7),
    fontFamily: fonts.extrabold,
  },
  thresholdRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: scale(15),
  },
  thresholdValue: {
    fontSize: scale(20),
    fontFamily: fonts.extrabold,
  },
  thresholdCopy: {
    fontSize: scale(8),
    fontFamily: fonts.medium,
  },
  thresholdTrack: {
    height: scale(5),
    borderRadius: 99,
    overflow: "hidden",
    marginTop: scale(9),
  },
  thresholdFill: { width: "25%", height: "100%", borderRadius: 99 },
  schedulerCard: {
    padding: scale(12),
    borderRadius: scale(18),
    marginBottom: scale(14),
  },
  schedulerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(9),
    marginBottom: scale(5),
  },
  schedulerHeaderIcon: {
    width: scale(34),
    height: scale(34),
    borderRadius: scale(11),
    alignItems: "center",
    justifyContent: "center",
  },
  schedulerHeaderCopy: { flex: 1 },
  schedulerTitle: { fontSize: scale(11), fontFamily: fonts.extrabold },
  schedulerSubtitle: {
    fontSize: scale(8),
    marginTop: scale(2),
    fontFamily: fonts.medium,
  },
  activePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(4),
    paddingHorizontal: scale(6),
    paddingVertical: scale(4),
    borderRadius: 99,
  },
  activeDot: { width: scale(5), height: scale(5), borderRadius: 99 },
  activePillText: {
    fontSize: scale(6.5),
    letterSpacing: 0.6,
    fontFamily: fonts.extrabold,
  },
  scheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(9),
    paddingVertical: scale(7),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  scheduleIcon: {
    width: scale(29),
    height: scale(29),
    borderRadius: scale(9),
    alignItems: "center",
    justifyContent: "center",
  },
  scheduleCopy: { flex: 1 },
  scheduleTime: {
    fontSize: scale(11),
    fontFamily: fonts.extrabold,
    alignSelf: "center",
    textAlign: "right",
    maxWidth: "43%",
  },
  scheduleDetails: {
    paddingTop: scale(8),
    paddingBottom: scale(7),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.12)",
  },
  scheduleDetailsHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(2),
  },
  scheduleDetailsCopy: {
    fontSize: scale(8.5),
    lineHeight: scale(11),
    marginTop: scale(7),
    fontFamily: fonts.medium,
  },
  autoSyncRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: scale(8),
    marginTop: scale(8),
  },
  autoSyncCopy: {
    flex: 1,
  },
  autoSyncDate: {
    fontSize: scale(8.5),
    marginTop: scale(2),
    fontFamily: fonts.medium,
  },
  autoSyncToggle: {
    width: scale(50),
    height: scale(30),
    borderRadius: scale(16),
    paddingHorizontal: scale(3),
    justifyContent: "center",
  },
  autoSyncKnob: {
    width: scale(24),
    height: scale(24),
    borderRadius: scale(12),
    alignSelf: "flex-end",
    backgroundColor: "#FFFFFF",
  },
  autoSyncKnobOff: {
    alignSelf: "flex-start",
    backgroundColor: "#94A3B8",
  },
  actionButton: {
    minHeight: scale(48),
    borderRadius: scale(14),
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginTop: scale(16),
  },
  actionButtonDisabled: {
    opacity: 0.72,
  },
  actionText: {
    color: "#FFFFFF",
    fontSize: scale(13),
    fontFamily: fonts.bold,
    paddingHorizontal: scale(16),
    textAlign: "center",
  },
  infoBand: {
    borderRadius: scale(18),
    padding: scale(14),
    marginBottom: scale(14),
    backgroundColor: "#F4EFE8",
    borderWidth: 1,
  },
  poolCard: {
    padding: scale(15),
    borderRadius: scale(16),
    marginBottom: scale(12),
    shadowColor: "#0A2A4A",
    shadowOpacity: 0.08,
    shadowRadius: scale(10),
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
    borderWidth: 1,
  },
  poolHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(9),
  },
  poolIcon: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(12),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(249,115,22,0.12)",
  },
  poolTitle: {
    fontSize: scale(12),
    fontFamily: fonts.extrabold,
  },
  poolSubtitle: {
    fontSize: scale(7.5),
    letterSpacing: 1,
    marginTop: scale(2),
    fontFamily: fonts.bold,
  },
  poolNote: {
    fontSize: scale(9),
    fontFamily: fonts.medium,
    lineHeight: scale(12),
    marginTop: scale(4),
  },
  poolValue: {
    fontSize: scale(21),
    lineHeight: scale(22),
    fontFamily: fonts.extrabold,
    textAlign: "right",
  },
  poolValueUnit: {
    fontSize: scale(9),
    fontFamily: fonts.bold,
  },
  selectionLabel: {
    fontSize: scale(13),
    fontFamily: fonts.extrabold,
    marginTop: scale(16),
  },
  selectionHint: {
    fontSize: scale(9.5),
    lineHeight: scale(13),
    fontFamily: fonts.medium,
    marginTop: scale(4),
  },
  batteryChoiceRow: {
    flexDirection: "row",
    gap: scale(8),
    marginTop: scale(10),
  },
  batteryChoice: {
    flex: 1,
    minHeight: scale(48),
    borderRadius: scale(12),
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: scale(7),
    paddingHorizontal: scale(10),
  },
  batteryChoiceCopy: {
    flex: 1,
  },
  batteryChoiceName: {
    fontSize: scale(11),
    fontFamily: fonts.extrabold,
  },
  batteryChoiceDetail: {
    fontSize: scale(9),
    fontFamily: fonts.medium,
    marginTop: scale(2),
  },
  progress: {
    height: scale(10),
    borderRadius: scale(5),
    overflow: "hidden",
    marginTop: scale(16),
  },
  progressFill: {
    width: "0%",
    height: "100%",
  },
  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: scale(6),
  },
  progressText: {
    fontSize: scale(7),
    fontFamily: fonts.bold,
  },
  zoneRow: {
    flexDirection: "row",
    gap: scale(9),
    marginBottom: scale(14),
  },
  zonePill: {
    width: scale(48),
    height: scale(42),
    borderRadius: scale(21),
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  zoneText: {
    fontSize: scale(11),
    fontFamily: fonts.bold,
  },
  zoneCard: {
    padding: scale(14),
    borderRadius: scale(18),
    marginBottom: scale(12),
  },
  zoneHeader: {
    fontSize: scale(11),
    fontFamily: fonts.bold,
  },
  chips: {
    flexDirection: "row",
    gap: scale(6),
    marginVertical: scale(6),
  },
  priority: {
    color: "#F05A16",
    backgroundColor: "#FFF0E4",
    paddingHorizontal: scale(7),
    paddingVertical: scale(3),
    borderRadius: scale(8),
    fontSize: scale(8),
    fontFamily: fonts.bold,
  },
  batteryChip: {
    color: "#5B6A94",
    backgroundColor: "#EEF0F8",
    paddingHorizontal: scale(7),
    paddingVertical: scale(3),
    borderRadius: scale(8),
    fontSize: scale(8),
    fontFamily: fonts.bold,
  },
  allocationControlRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(12),
    marginTop: scale(12),
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: scale(118),
    height: scale(34),
    borderRadius: scale(17),
    borderWidth: 1,
  },
  stepperButton: {
    width: scale(34),
    height: scale(34),
    alignItems: "center",
    justifyContent: "center",
  },
  assignedHours: {
    minWidth: scale(28),
    textAlign: "center",
    fontSize: scale(9),
    fontFamily: fonts.bold,
  },
  allocationBar: {
    flex: 1,
    height: scale(7),
    borderRadius: scale(5),
    overflow: "hidden",
    backgroundColor: "rgba(91,106,148,0.28)",
  },
  allocationBarFill: {
    height: "100%",
    borderRadius: scale(5),
    backgroundColor: "#F97316",
  },
  assignedCopy: {
    fontSize: scale(9),
    fontFamily: fonts.medium,
    marginTop: scale(7),
  },
  batteryStart: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    marginTop: scale(12),
    paddingTop: scale(11),
  },
  startTitle: { fontSize: scale(9), fontFamily: fonts.bold },
  startHint: {
    fontSize: scale(9),
    fontFamily: fonts.medium,
    marginTop: scale(8),
  },
  timePill: {
    minWidth: scale(104),
    alignItems: "center",
    borderRadius: scale(18),
    paddingHorizontal: scale(12),
    paddingVertical: scale(9),
    backgroundColor: "rgba(91,106,148,0.12)",
  },
  timeText: { fontSize: scale(11), fontFamily: fonts.bold },

  /* --- INLINE ARCHITECTURE STYLES --- */
  archCard: {
    borderRadius: scale(18),
    padding: scale(14),
    borderWidth: 1,
    marginBottom: scale(12),
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  archHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(12),
    marginBottom: scale(16),
  },
  archIconBox: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(14),
    alignItems: "center",
    justifyContent: "center",
  },
  archTitle: {
    fontSize: scale(13),
    fontFamily: fonts.extrabold,
  },
  archSubtitle: {
    fontSize: scale(9),
    fontFamily: fonts.medium,
    marginTop: scale(2),
  },
  cellsScroll: {
    paddingBottom: scale(12),
  },
  cellsWrapper: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: scale(8),
  },
  cellGroup: {
    flexDirection: "row",
    alignItems: "center",
  },
  cellBlock: {
    width: scale(64),
    height: scale(106),
    borderWidth: 1.5,
    borderRadius: scale(8),
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  terminalLeft: {
    position: "absolute",
    left: -scale(4),
    width: scale(4),
    height: scale(16),
    backgroundColor: "#3B82F6",
    borderTopLeftRadius: scale(2),
    borderBottomLeftRadius: scale(2),
    alignItems: "center",
    justifyContent: "center",
  },
  terminalRight: {
    position: "absolute",
    right: -scale(4),
    width: scale(4),
    height: scale(16),
    backgroundColor: "#EF4444",
    borderTopRightRadius: scale(2),
    borderBottomRightRadius: scale(2),
    alignItems: "center",
    justifyContent: "center",
  },
  terminalText: {
    color: "#FFFFFF",
    fontSize: scale(9),
    fontFamily: fonts.extrabold,
    lineHeight: scale(9),
  },
  cellType: {
    fontSize: scale(10.5),
    fontFamily: fonts.extrabold,
    letterSpacing: 0.5,
  },
  cellVolt: {
    fontSize: scale(11.5),
    fontFamily: fonts.extrabold,
    marginTop: scale(2),
  },
  cellLabel: {
    fontSize: scale(7.5),
    fontFamily: fonts.bold,
  },
  cellMahBadge: {
    marginTop: scale(10),
    backgroundColor: "rgba(249,115,22,0.15)",
    paddingHorizontal: scale(6),
    paddingVertical: scale(2),
    borderRadius: scale(6),
    alignItems: "center",
  },
  cellMahText: {
    color: "#F97316",
    fontSize: scale(11),
    fontFamily: fonts.extrabold,
  },
  cellMahUnit: {
    color: "#F97316",
    fontSize: scale(6),
    fontFamily: fonts.bold,
  },
  seriesConnection: {
    flexDirection: "row",
    alignItems: "center",
    width: scale(12),
    justifyContent: "center",
    marginHorizontal: scale(4),
  },
  wire: {
    height: scale(3),
    width: "100%",
  },
  totalsBox: {
    borderRadius: scale(12),
    padding: scale(12),
    marginTop: scale(8),
  },
  totalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(6),
    marginBottom: scale(8),
  },
  totalLabel: {
    fontSize: scale(9.5),
    fontFamily: fonts.medium,
    flex: 1,
  },
  totalValue: {
    fontSize: scale(12),
    fontFamily: fonts.extrabold,
    textAlign: "right",
  },
  subValue: {
    fontSize: scale(9.5),
    fontFamily: fonts.extrabold,
    textAlign: "right",
    marginTop: scale(2),
  },
  totalsNote: {
    fontSize: scale(8),
    fontFamily: fonts.medium,
    lineHeight: scale(12),
    marginTop: scale(6),
    paddingTop: scale(8),
    borderTopWidth: 1,
    borderTopColor: "rgba(150,150,150,0.15)",
  },
});
