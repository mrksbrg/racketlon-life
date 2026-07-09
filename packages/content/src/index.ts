import type { ContentBundle } from "@racketlon/engine";
import activitiesJson from "../data/activities.json";
import countriesJson from "../data/countries.json";
import namesJson from "../data/names.json";
import tournamentsJson from "../data/tournaments.json";
import traitsJson from "../data/traits.json";
import { activitiesSchema, countriesSchema, namesSchema, tournamentsSchema, traitsSchema } from "./schema.js";

export const CONTENT_VERSION = "0.1.0";

/** The default content bundle, validated once at module load. */
export const defaultContent: ContentBundle = {
  version: CONTENT_VERSION,
  activities: activitiesSchema.parse(activitiesJson) as ContentBundle["activities"],
  names: namesSchema.parse(namesJson),
  countries: countriesSchema.parse(countriesJson),
  tournaments: tournamentsSchema.parse(tournamentsJson) as ContentBundle["tournaments"],
  traits: traitsSchema.parse(traitsJson) as ContentBundle["traits"],
};
