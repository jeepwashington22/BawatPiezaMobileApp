export type SkyKind = "sunny" | "rainy" | "breezy";

export type DashboardWeatherReport = {
  date: string;
  currentCondition: string;
  forecastCondition: string;
  currentTemperatureC: number;
  minimumTemperatureC: number;
  maximumTemperatureC: number;
  precipitationProbability: number;
  isRainy: boolean;
  /** Current wind speed at 10 m, km/h. */
  windSpeedKmh: number;
  /** Strongest wind forecast for today, km/h. */
  maximumWindKmh: number;
  /** 0-100. Drives how much cloud the sky scene draws. */
  cloudCoverPct: number;
  isDay: boolean;
  isThunderstorm: boolean;
  /** Which sky the dashboard scene should show: rain beats wind beats sun. */
  sky: SkyKind;
};

/** Breezy when it is blowing now, or when today's peak wind is clearly strong. */
const BREEZY_NOW_KMH = 20;
const BREEZY_PEAK_KMH = 30;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function weatherDescription(code: number): string {
  if (code === 0) return "Clear";
  if (code === 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code === 51 || code === 53 || code === 55) return "Drizzle";
  if (code === 56 || code === 57) return "Freezing drizzle";
  if (code === 61 || code === 63 || code === 65) return "Rain";
  if (code === 66 || code === 67) return "Freezing rain";
  if (code === 71 || code === 73 || code === 75 || code === 77) return "Snow";
  if (code === 80 || code === 81 || code === 82) return "Rain showers";
  if (code === 85 || code === 86) return "Snow showers";
  if (code === 95 || code === 96 || code === 99) return "Thunderstorm";
  return "Unknown conditions";
}

function isRainCode(code: number): boolean {
  return (
    (code >= 51 && code <= 67) ||
    (code >= 80 && code <= 82) ||
    (code >= 95 && code <= 99)
  );
}

function pickSky(
  isRainy: boolean,
  windSpeedKmh: number,
  maximumWindKmh: number,
): SkyKind {
  if (isRainy) return "rainy";
  if (windSpeedKmh >= BREEZY_NOW_KMH || maximumWindKmh >= BREEZY_PEAK_KMH) {
    return "breezy";
  }
  return "sunny";
}

export function skyLabel(sky: SkyKind): string {
  if (sky === "rainy") return "Rainy";
  if (sky === "breezy") return "Breezy";
  return "Sunny";
}

export async function fetchDashboardWeather(
  latitude: number,
  longitude: number,
): Promise<DashboardWeatherReport> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set(
    "current",
    "temperature_2m,weather_code,wind_speed_10m,cloud_cover,is_day",
  );
  url.searchParams.set(
    "daily",
    "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max",
  );
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "1");

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Weather forecast request failed (HTTP ${response.status}).`);
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !isRecord(payload.current) || !isRecord(payload.daily)) {
    throw new Error("The weather service returned an invalid forecast.");
  }

  const currentTemperatureC = readNumber(payload.current.temperature_2m);
  const currentWeatherCode = readNumber(payload.current.weather_code);
  const dates = payload.daily.time;
  const codes = payload.daily.weather_code;
  const maximums = payload.daily.temperature_2m_max;
  const minimums = payload.daily.temperature_2m_min;
  const probabilities = payload.daily.precipitation_probability_max;
  const peakWinds = payload.daily.wind_speed_10m_max;
  const date =
    Array.isArray(dates) && typeof dates[0] === "string" ? dates[0] : null;
  const code = Array.isArray(codes) ? readNumber(codes[0]) : null;
  const maximumTemperatureC = Array.isArray(maximums)
    ? readNumber(maximums[0])
    : null;
  const minimumTemperatureC = Array.isArray(minimums)
    ? readNumber(minimums[0])
    : null;
  const precipitationProbability = Array.isArray(probabilities)
    ? readNumber(probabilities[0])
    : null;

  if (
    currentTemperatureC === null ||
    currentWeatherCode === null ||
    date === null ||
    code === null ||
    maximumTemperatureC === null ||
    minimumTemperatureC === null ||
    precipitationProbability === null
  ) {
    throw new Error("The weather service returned an incomplete daily forecast.");
  }

  // Wind, cloud and day/night only shape the visuals, so a missing value
  // falls back to calm / clear / daytime instead of failing the whole report.
  const windSpeedKmh = readNumber(payload.current.wind_speed_10m) ?? 0;
  const maximumWindKmh = Array.isArray(peakWinds)
    ? (readNumber(peakWinds[0]) ?? windSpeedKmh)
    : windSpeedKmh;
  const cloudCoverPct = readNumber(payload.current.cloud_cover) ?? 0;
  const isDay = (readNumber(payload.current.is_day) ?? 1) === 1;
  const isRainy = isRainCode(currentWeatherCode);

  return {
    date,
    currentCondition: weatherDescription(currentWeatherCode),
    forecastCondition: weatherDescription(code),
    currentTemperatureC,
    minimumTemperatureC,
    maximumTemperatureC,
    precipitationProbability,
    isRainy,
    windSpeedKmh,
    maximumWindKmh,
    cloudCoverPct,
    isDay,
    isThunderstorm:
      currentWeatherCode >= 95 && currentWeatherCode <= 99,
    sky: pickSky(isRainy, windSpeedKmh, maximumWindKmh),
  };
}