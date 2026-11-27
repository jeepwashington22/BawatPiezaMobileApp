import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import {
  fetchDashboardWeather,
  type DashboardWeatherReport,
} from "../lib/weather";

export type LocatedDashboardWeatherReport = DashboardWeatherReport & {
  locationLabel: string;
};

type WeatherState =
  | { status: "loading" }
  | { status: "ready"; report: LocatedDashboardWeatherReport }
  | { status: "error"; message: string };

function formatCoordinates(latitude: number, longitude: number): string {
  const lat = `${Math.abs(latitude).toFixed(3)}° ${latitude >= 0 ? "N" : "S"}`;
  const lon = `${Math.abs(longitude).toFixed(3)}° ${longitude >= 0 ? "E" : "W"}`;
  return `${lat}, ${lon}`;
}

function formatPlace(
  address: Location.LocationGeocodedAddress | undefined,
): string | null {
  const locality =
    address?.district ??
    address?.city ??
    address?.subregion ??
    address?.region;
  const region =
    address?.region && address.region !== locality
      ? address.region
      : address?.country;
  const parts = [locality, region].filter(
    (part): part is string => typeof part === "string" && part.trim().length > 0,
  );
  return [...new Set(parts)].join(", ") || null;
}

export function useDashboardWeather() {
  const [state, setState] = useState<WeatherState>({ status: "loading" });
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    setState({ status: "loading" });

    try {
      let permission = await Location.getForegroundPermissionsAsync();
      if (!permission.granted) {
        permission = await Location.requestForegroundPermissionsAsync();
      }
      if (!permission.granted) {
        throw new Error(
          permission.canAskAgain
            ? "Allow location access to see your local forecast."
            : "Enable location access in device settings to see your local forecast.",
        );
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      let locationLabel = formatCoordinates(
        location.coords.latitude,
        location.coords.longitude,
      );
      try {
        const addresses = await Location.reverseGeocodeAsync({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
        locationLabel = formatPlace(addresses[0]) ?? locationLabel;
      } catch (error) {
        console.warn("[dashboard weather] Could not resolve location name", error);
      }

      const report = await fetchDashboardWeather(
        location.coords.latitude,
        location.coords.longitude,
      );

      if (currentRequestId === requestId.current) {
        setState({
          status: "ready",
          report: { ...report, locationLabel },
        });
      }
    } catch (error) {
      if (currentRequestId === requestId.current) {
        setState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Could not load today's weather.",
        });
      }
    }
  }, []);

  useEffect(() => {
    const initialLoad = setTimeout(() => {
      void refresh();
    }, 0);
    return () => {
      clearTimeout(initialLoad);
      requestId.current += 1;
    };
  }, [refresh]);

  return { ...state, refresh };
}
