import {
  defaultPortraitProvider,
  portraitSeedFor,
  type PortraitProvider,
} from "@racketlon/portraits";

import adelineKilchenmann from "../../../../packages/portraits/assets/generated/pilot-v1/adeline-kilchenmann-v1.png";
import annaKlaraAhlmer from "../../../../packages/portraits/assets/generated/pilot-v1/anna-klara-ahlmer-v1.png";
import bastianBohm from "../../../../packages/portraits/assets/generated/pilot-v1/bastian-bohm-v2.png";
import hollyRanson from "../../../../packages/portraits/assets/generated/pilot-v1/holly-ranson-v1.png";
import joergKanonenberg from "../../../../packages/portraits/assets/generated/pilot-v1/joerg-kanonenberg-v3.png";
import julienCastel from "../../../../packages/portraits/assets/generated/pilot-v1/julien-castel-v2.png";
import keithLesser from "../../../../packages/portraits/assets/generated/pilot-v1/keith-lesser-v2.png";
import kirstenKaptein from "../../../../packages/portraits/assets/generated/pilot-v1/kirsten-kaptein-v1.png";
import koenHageraats from "../../../../packages/portraits/assets/generated/pilot-v1/koen-hageraats-v2.png";
import krestenHougaard from "../../../../packages/portraits/assets/generated/pilot-v1/kresten-hougaard-v2.png";
import leonGriffiths from "../../../../packages/portraits/assets/generated/pilot-v1/leon-griffiths-v5.png";
import lukeGriffiths from "../../../../packages/portraits/assets/generated/pilot-v1/luke-griffiths-v2.png";
import malteThyregod from "../../../../packages/portraits/assets/generated/pilot-v1/malte-thyregod-v2.png";
import molliePatterson from "../../../../packages/portraits/assets/generated/pilot-v1/mollie-patterson-v1.png";
import myriamEnmer from "../../../../packages/portraits/assets/generated/pilot-v1/myriam-enmer-v1.png";
import nicolasLenggenhager from "../../../../packages/portraits/assets/generated/pilot-v1/nicolas-lenggenhager-v2.png";
import paulineCave from "../../../../packages/portraits/assets/generated/pilot-v1/pauline-cave-v1.png";
import sandraEttenauer from "../../../../packages/portraits/assets/generated/pilot-v1/sandra-ettenauer-v1.png";
import stephanieChung from "../../../../packages/portraits/assets/generated/pilot-v1/stephanie-chung-v1.png";
import stineJacobsen from "../../../../packages/portraits/assets/generated/pilot-v1/stine-jacobsen-v1.png";
import sylvainTernon from "../../../../packages/portraits/assets/generated/pilot-v1/sylvain-ternon-v2.png";

/**
 * Authored portraits are keyed by the same stable seed used by recipes. This
 * keeps asset selection behind the provider boundary and lets every unlisted
 * player fall back to the deterministic renderer.
 */
const authoredPortraitsBySeed: Readonly<Partial<Record<string, string>>> = Object.freeze({
  [portraitSeedFor("name:leon-griffiths:GBR")]: leonGriffiths,
  [portraitSeedFor("name:luke-griffiths:GBR")]: lukeGriffiths,
  [portraitSeedFor("name:sylvain-ternon:FRA")]: sylvainTernon,
  [portraitSeedFor("name:koen-hageraats:NED")]: koenHageraats,
  [portraitSeedFor("name:joerg-kanonenberg:GER")]: joergKanonenberg,
  [portraitSeedFor("name:nicolas-lenggenhager:SUI")]: nicolasLenggenhager,
  [portraitSeedFor("name:malte-thyregod:DEN")]: malteThyregod,
  [portraitSeedFor("name:kresten-hougaard:DEN")]: krestenHougaard,
  [portraitSeedFor("name:bastian-bohm:GER")]: bastianBohm,
  [portraitSeedFor("name:keith-lesser:GBR")]: keithLesser,
  [portraitSeedFor("name:julien-castel:FRA")]: julienCastel,
  [portraitSeedFor("name:pauline-cave:FRA")]: paulineCave,
  [portraitSeedFor("name:anna-klara-ahlmer:SWE")]: annaKlaraAhlmer,
  [portraitSeedFor("name:stine-jacobsen:DEN")]: stineJacobsen,
  [portraitSeedFor("name:myriam-enmer:FRA")]: myriamEnmer,
  [portraitSeedFor("name:mollie-patterson:GBR")]: molliePatterson,
  [portraitSeedFor("name:kirsten-i-kaptein:NED")]: kirstenKaptein,
  [portraitSeedFor("name:holly-ranson:GBR")]: hollyRanson,
  [portraitSeedFor("name:adeline-kilchenmann:SUI")]: adelineKilchenmann,
  [portraitSeedFor("name:stephanie-chung:USA")]: stephanieChung,
  [portraitSeedFor("name:sandra-ettenauer:AUT")]: sandraEttenauer,
});

const hybridPortraitProvider: PortraitProvider<string> = {
  recipeFor: (input) => defaultPortraitProvider.recipeFor(input),
  assetUrlFor: (recipe) => authoredPortraitsBySeed[recipe.seed],
  render: (recipe) => defaultPortraitProvider.render?.(recipe) ?? "",
};

export const appPortraitProvider = Object.freeze(hybridPortraitProvider);
