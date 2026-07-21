/**
 * Semantic IDs understood by recipe version 1. A renderer or asset pack maps
 * these IDs to SVGs, PNG layers, canvas instructions, or another medium.
 */
export const PORTRAIT_V1_CATALOG = {
  heads: ["round", "oval", "square", "long", "heart", "diamond", "broad", "narrow"],
  skinPalettes: [
    "skin-01",
    "skin-02",
    "skin-03",
    "skin-04",
    "skin-05",
    "skin-06",
    "skin-07",
    "skin-08",
  ],
  hair: [
    "crop",
    "side-part",
    "swept",
    "curly-short",
    "buzz",
    "shaggy",
    "long-straight",
    "long-wavy",
    "ponytail",
    "bun",
  ],
  matureHair: ["receding", "bald"],
  hairPalettes: ["black", "dark-brown", "brown", "light-brown", "blonde", "auburn"],
  greyHairPalettes: ["salt-and-pepper", "grey"],
  eyes: ["calm", "focused", "bright", "narrow", "wide", "soft"],
  brows: ["straight", "arched", "soft", "strong", "raised", "focused"],
  noses: ["small", "straight", "broad", "long", "rounded", "angular"],
  mouths: ["neutral", "smile", "focused", "tense", "soft-smile", "determined"],
  facialHair: ["stubble", "moustache", "goatee", "short-beard", "full-beard", "chin-beard", "soul-patch"],
  accessories: ["round-glasses", "square-glasses", "sport-glasses", "headband", "earring", "nose-stud"],
  ageMarks: ["freckles", "mole", "cheek-lines", "forehead-lines", "eye-lines", "smile-lines"],
  shirts: ["crew", "v-neck", "polo", "zip", "singlet", "warmup", "collared", "training"],
  shirtPalettes: ["neutral", "accent-01", "accent-02", "accent-03", "accent-04", "accent-05", "accent-06", "accent-07"],
} as const;
