import type { ContentBundle } from "@racketlon/engine";
import activitiesJson from "../data/activities.json";
import countriesJson from "../data/countries.json";
import firOfficialsJson from "../data/fir-officials.json";
import illnessesJson from "../data/illnesses.json";
import injuriesJson from "../data/injuries.json";
import namesJson from "../data/names.json";
import portraitCuesJson from "../data/portrait-cues.json";
import rankingMatrixJson from "../data/ranking-matrix.json";
import tournamentsJson from "../data/tournaments.json";
import traitsJson from "../data/traits.json";
import worldBundleJson from "../data/world-bundle.json";
import {
  activitiesSchema,
  countriesSchema,
  firOfficialsSchema,
  illnessesSchema,
  injuriesSchema,
  namesSchema,
  portraitCuesSchema,
  rankingMatrixSchema,
  tournamentsSchema,
  traitsSchema,
  worldBundleSchema,
} from "./schema.js";
import { validatePortraitCuePlayerIds, type PortraitCueMap } from "./portraitCues.js";

export const CONTENT_VERSION = "0.1.0";

const parsedWorldPlayers = worldBundleSchema.parse(worldBundleJson).players as ContentBundle["players"];
export const defaultPortraitCues: Readonly<PortraitCueMap> = portraitCuesSchema.parse(portraitCuesJson);
validatePortraitCuePlayerIds(defaultPortraitCues, parsedWorldPlayers);

/** The default content bundle, validated once at module load. */
export const defaultContent: ContentBundle = {
  version: CONTENT_VERSION,
  activities: activitiesSchema.parse(activitiesJson) as ContentBundle["activities"],
  names: namesSchema.parse(namesJson),
  countries: countriesSchema.parse(countriesJson),
  firOfficials: firOfficialsSchema.parse(firOfficialsJson),
  tournaments: tournamentsSchema.parse(tournamentsJson) as ContentBundle["tournaments"],
  traits: traitsSchema.parse(traitsJson) as ContentBundle["traits"],
  players: parsedWorldPlayers,
  rankingMatrix: rankingMatrixSchema.parse(rankingMatrixJson) as ContentBundle["rankingMatrix"],
  injuries: injuriesSchema.parse(injuriesJson) as ContentBundle["injuries"],
  illnesses: illnessesSchema.parse(illnessesJson) as ContentBundle["illnesses"],
};

export type { PortraitCueMap } from "./portraitCues.js";
