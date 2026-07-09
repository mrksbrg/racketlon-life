import { BALANCE } from "../balance.js";
import type { ContentBundle } from "../content.js";
import type { TournamentDef } from "../tournament/engine.js";

/**
 * TravelSystem's cost model (docs/06 M2, pulled forward alongside the real
 * tournament calendar) — flights scale with great-circle distance from home,
 * hotel/food scale with trip length × the host country's cost-of-living
 * index. Pure functions; the caller (tournament/engine.ts) charges the
 * result alongside the entry fee, and the facade forecasts it ahead of time.
 */

export interface TravelCost {
  flight: number;
  stay: number;
  total: number;
}

const ZERO: TravelCost = { flight: 0, stay: 0, total: 0 };

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance in km between two lat/lon points (haversine). */
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Flights + hotel/food for a trip from `homeCountry` to a tournament.
 * Domestic events (the tournament's country matches home) are simplified to
 * zero cost — you're not booking a flight within your own country, and
 * modeling intra-country city distances is out of scope for now. Falls back
 * to zero (rather than throwing) if either country is missing coordinates,
 * since content gaps shouldn't crash a forecast.
 */
export function travelCost(
  homeCountry: string,
  def: TournamentDef,
  content: ContentBundle,
): TravelCost {
  if (def.country === homeCountry) return ZERO;

  const home = content.countries[homeCountry];
  const host = content.countries[def.country];
  if (!home || !host) return ZERO;

  const km = distanceKm(home.lat, home.lon, def.lat, def.lon);
  const flight = Math.round(BALANCE.travel.baseFare + BALANCE.travel.perKm * km);
  const stay = Math.round(BALANCE.travel.dailyCostBase * def.nights * host.costIndex);
  return { flight, stay, total: flight + stay };
}
