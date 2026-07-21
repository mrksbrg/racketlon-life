import type { ContentBundle } from "@racketlon/engine";
import activitiesJson from "../data/activities.json";
import countriesJson from "../data/countries.json";
import firOfficialsJson from "../data/fir-officials.json";
import namesJson from "../data/names.json";
import portraitCuesMenJson from "../data/portrait-cues-men.json";
import portraitCuesWomenJson from "../data/portrait-cues-women.json";
import rankingMatrixJson from "../data/ranking-matrix.json";
import tournamentsJson from "../data/tournaments.json";
import traitsJson from "../data/traits.json";
import worldBundleJson from "../data/world-bundle.json";
import {
  activitiesSchema,
  countriesSchema,
  firOfficialsSchema,
  namesSchema,
  portraitCuesSchema,
  rankingMatrixSchema,
  tournamentsSchema,
  traitsSchema,
  worldBundleSchema,
} from "./schema.js";
import {
  mergePortraitCueMaps,
  validatePortraitCuePlayerGender,
  validatePortraitCuePlayerIds,
  type PortraitCueMap,
} from "./portraitCues.js";

export const CONTENT_VERSION = "0.1.0";

const parsedWorldPlayers = worldBundleSchema.parse(worldBundleJson).players as ContentBundle["players"];
const parsedMenPortraitCues = portraitCuesSchema.parse(portraitCuesMenJson);
const parsedWomenPortraitCues = portraitCuesSchema.parse(portraitCuesWomenJson);
validatePortraitCuePlayerIds(parsedMenPortraitCues, parsedWorldPlayers);
validatePortraitCuePlayerIds(parsedWomenPortraitCues, parsedWorldPlayers);
validatePortraitCuePlayerGender(parsedMenPortraitCues, parsedWorldPlayers, "m");
validatePortraitCuePlayerGender(parsedWomenPortraitCues, parsedWorldPlayers, "f");
export const defaultPortraitCues: Readonly<PortraitCueMap> = mergePortraitCueMaps(
  parsedMenPortraitCues,
  parsedWomenPortraitCues,
);

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
};

export type { PortraitCueMap } from "./portraitCues.js";
