import type {
  PixelFaceArtKit,
  PixelAnatomySprite,
  PixelAccessorySprite,
  PixelHairSprite,
  PixelHeadSprite,
  PixelLayer,
  PixelPoint,
  PixelPrimitive,
} from "./contracts.js";

const layer = (...primitives: readonly PixelPrimitive[]): PixelLayer => ({ primitives });
const rect = (x: number, y: number, width: number, height: number, ink: PixelPrimitive["ink"]): PixelPrimitive => ({
  kind: "rect", x, y, width, height, ink,
});
const polygon = (
  points: readonly PixelPoint[],
  ink: PixelPrimitive["ink"],
  outlineInk?: PixelPrimitive["ink"],
  outlineWidth?: number,
): PixelPrimitive => ({
  kind: "polygon", points, ink, ...(outlineInk === undefined ? {} : { outlineInk }), ...(outlineWidth === undefined ? {} : { outlineWidth }),
});
const line = (from: PixelPoint, to: PixelPoint, ink: PixelPrimitive["ink"], size = 2): PixelPrimitive => ({
  kind: "line", from, to, ink, size,
});

const SOFT_LIGHTING = layer(
  polygon([[27, 49], [30, 51], [30, 63], [34, 71], [41, 77], [44, 80], [42, 82], [36, 78], [30, 72], [27, 63]], "skin-shadow"),
  rect(31, 58, 2, 5, "skin-shadow"),
  rect(34, 64, 2, 2, "skin-shadow"),
  rect(38, 28, 16, 1, "skin-highlight"),
  rect(39, 29, 12, 1, "skin-highlight"),
  rect(62, 55, 2, 7, "skin-highlight"),
  rect(59, 64, 3, 2, "skin-highlight"),
  rect(56, 70, 3, 1, "skin-highlight"),
);

const ANGULAR_LIGHTING = layer(
  polygon([[26, 48], [30, 51], [31, 64], [37, 72], [45, 78], [45, 82], [40, 80], [32, 73], [27, 64]], "skin-shadow"),
  polygon([[31, 62], [36, 65], [40, 69], [36, 69], [32, 66]], "skin-shadow"),
  rect(33, 54, 2, 6, "skin-shadow"),
  rect(40, 27, 14, 1, "skin-highlight"),
  rect(60, 54, 3, 2, "skin-highlight"),
  rect(62, 56, 2, 7, "skin-highlight"),
  rect(57, 66, 4, 2, "skin-highlight"),
  rect(54, 72, 3, 1, "skin-highlight"),
);

const LONG_LIGHTING = layer(
  polygon([[29, 48], [32, 51], [32, 67], [38, 77], [45, 83], [43, 85], [37, 81], [31, 73], [28, 61]], "skin-shadow"),
  rect(34, 59, 2, 7, "skin-shadow"),
  rect(37, 70, 2, 3, "skin-shadow"),
  rect(41, 27, 13, 1, "skin-highlight"),
  rect(61, 55, 2, 9, "skin-highlight"),
  rect(57, 68, 3, 2, "skin-highlight"),
  rect(54, 75, 2, 1, "skin-highlight"),
);

function head(silhouette: readonly PixelPoint[], lighting: PixelLayer): PixelHeadSprite {
  return { silhouette, lighting };
}

const heads = {
  round: head([[29, 29], [35, 23], [42, 20], [54, 20], [61, 23], [67, 30], [69, 47], [67, 64], [61, 75], [53, 81], [48, 83], [43, 81], [35, 75], [29, 64], [27, 47]], SOFT_LIGHTING),
  oval: head([[30, 27], [37, 21], [43, 19], [54, 19], [61, 22], [66, 28], [68, 48], [65, 68], [57, 79], [49, 84], [41, 80], [32, 70], [28, 50]], SOFT_LIGHTING),
  square: head([[28, 28], [35, 22], [41, 20], [57, 20], [64, 23], [69, 29], [69, 61], [64, 73], [55, 80], [42, 80], [33, 74], [27, 62]], ANGULAR_LIGHTING),
  broad: head([[25, 30], [33, 22], [41, 19], [57, 19], [65, 22], [72, 30], [71, 59], [65, 71], [56, 79], [40, 79], [30, 70], [24, 58]], ANGULAR_LIGHTING),
  diamond: head([[31, 26], [39, 20], [55, 19], [65, 26], [71, 49], [66, 65], [58, 76], [48, 84], [38, 76], [30, 65], [25, 49]], ANGULAR_LIGHTING),
  heart: head([[28, 30], [35, 22], [47, 19], [60, 22], [68, 30], [66, 58], [60, 72], [48, 83], [36, 73], [30, 59]], SOFT_LIGHTING),
  long: head([[32, 27], [39, 21], [57, 21], [64, 27], [68, 55], [64, 72], [56, 83], [48, 87], [40, 83], [32, 72], [28, 55]], LONG_LIGHTING),
  narrow: head([[33, 26], [40, 21], [56, 21], [63, 26], [67, 54], [62, 71], [55, 81], [48, 85], [41, 81], [34, 71], [29, 54]], LONG_LIGHTING),
} as const;

const eyes = {
  calm: layer(
    polygon([[31, 49], [34, 47], [41, 47], [44, 49], [41, 52], [34, 52]], "skin-line"),
    polygon([[34, 49], [36, 48], [40, 48], [42, 49], [40, 51], [35, 51]], "eye-white"),
    rect(37, 48, 3, 4, "iris"), rect(38, 49, 1, 2, "pupil"), rect(37, 48, 1, 1, "catchlight"),
    polygon([[53, 49], [56, 47], [63, 47], [66, 49], [63, 52], [56, 52]], "skin-line"),
    polygon([[55, 49], [57, 48], [61, 48], [64, 49], [62, 51], [56, 51]], "eye-white"),
    rect(58, 48, 3, 4, "iris"), rect(59, 49, 1, 2, "pupil"), rect(58, 48, 1, 1, "catchlight"),
  ),
  focused: layer(
    polygon([[31, 47], [35, 48], [42, 50], [44, 51], [41, 53], [34, 51]], "skin-line"),
    polygon([[34, 49], [36, 49], [41, 50], [42, 51], [40, 52], [35, 50]], "eye-white"),
    rect(37, 49, 3, 3, "iris"), rect(38, 50, 1, 2, "pupil"),
    polygon([[53, 51], [55, 50], [62, 48], [66, 47], [63, 51], [56, 53]], "skin-line"),
    polygon([[55, 51], [57, 50], [62, 49], [64, 49], [62, 52], [56, 52]], "eye-white"),
    rect(58, 49, 3, 3, "iris"), rect(59, 50, 1, 2, "pupil"),
  ),
  bright: layer(
    polygon([[31, 49], [34, 46], [41, 46], [44, 49], [41, 54], [34, 54]], "skin-line"),
    polygon([[34, 49], [36, 47], [40, 47], [42, 49], [40, 53], [35, 53]], "eye-white"),
    rect(37, 47, 3, 6, "iris"), rect(38, 48, 1, 4, "pupil"), rect(37, 47, 1, 1, "catchlight"),
    polygon([[53, 49], [56, 46], [63, 46], [66, 49], [63, 54], [56, 54]], "skin-line"),
    polygon([[55, 49], [57, 47], [61, 47], [64, 49], [62, 53], [56, 53]], "eye-white"),
    rect(58, 47, 3, 6, "iris"), rect(59, 48, 1, 4, "pupil"), rect(58, 47, 1, 1, "catchlight"),
  ),
  narrow: layer(
    line([32, 46], [42, 47], "skin-shadow", 1),
    polygon([[31, 49], [35, 48], [41, 48], [44, 50], [41, 52], [35, 51]], "skin-line"),
    polygon([[34, 49], [40, 49], [42, 50], [40, 51], [35, 50]], "eye-white"),
    rect(37, 49, 3, 2, "iris"), rect(38, 49, 1, 2, "pupil"), rect(37, 49, 1, 1, "catchlight"),
    line([54, 47], [64, 46], "skin-shadow", 1),
    polygon([[53, 50], [56, 48], [62, 48], [66, 49], [62, 51], [56, 52]], "skin-line"),
    polygon([[55, 50], [57, 49], [63, 49], [64, 50], [62, 50], [56, 51]], "eye-white"),
    rect(58, 49, 3, 2, "iris"), rect(59, 49, 1, 2, "pupil"), rect(58, 49, 1, 1, "catchlight"),
  ),
  wide: layer(
    polygon([[31, 48], [35, 45], [41, 45], [44, 48], [41, 55], [34, 55]], "skin-line"),
    polygon([[34, 48], [36, 46], [40, 46], [42, 48], [40, 54], [35, 54]], "eye-white"),
    rect(37, 46, 3, 6, "iris"), rect(38, 47, 1, 4, "pupil"), rect(37, 46, 1, 1, "catchlight"),
    polygon([[53, 48], [56, 45], [62, 45], [66, 48], [63, 55], [56, 55]], "skin-line"),
    polygon([[55, 48], [57, 46], [61, 46], [64, 48], [62, 54], [56, 54]], "eye-white"),
    rect(58, 46, 3, 6, "iris"), rect(59, 47, 1, 4, "pupil"), rect(58, 46, 1, 1, "catchlight"),
  ),
  soft: layer(
    line([32, 45], [42, 46], "skin-shadow", 1),
    polygon([[31, 48], [35, 47], [41, 48], [44, 50], [41, 53], [34, 52]], "skin-line"),
    polygon([[34, 49], [36, 48], [40, 49], [42, 50], [40, 52], [35, 51]], "eye-white"),
    rect(37, 48, 3, 4, "iris"), rect(38, 49, 1, 3, "pupil"), rect(37, 48, 1, 1, "catchlight"),
    line([54, 46], [64, 45], "skin-shadow", 1),
    polygon([[53, 50], [56, 48], [62, 47], [66, 48], [63, 52], [56, 53]], "skin-line"),
    polygon([[55, 50], [57, 49], [61, 48], [64, 49], [62, 51], [56, 52]], "eye-white"),
    rect(58, 48, 3, 4, "iris"), rect(59, 49, 1, 3, "pupil"), rect(58, 48, 1, 1, "catchlight"),
  ),
} as const;

const noses = {
  small: layer(
    rect(48, 55, 1, 5, "skin-shadow"), rect(47, 60, 1, 2, "skin-shadow"), rect(46, 62, 5, 1, "skin-shadow"),
    rect(46, 62, 1, 1, "skin-line"), rect(51, 62, 1, 1, "skin-line"), rect(50, 57, 1, 3, "skin-highlight"),
  ),
  straight: layer(
    rect(48, 53, 1, 4, "skin-shadow"), rect(47, 57, 1, 5, "skin-shadow"), rect(46, 62, 1, 2, "skin-shadow"),
    rect(46, 64, 6, 1, "skin-shadow"), rect(46, 64, 1, 1, "skin-line"), rect(52, 64, 1, 1, "skin-line"), rect(50, 56, 1, 6, "skin-highlight"),
  ),
  broad: layer(
    rect(48, 54, 1, 7, "skin-shadow"), rect(47, 61, 1, 3, "skin-shadow"), rect(43, 64, 4, 1, "skin-shadow"),
    rect(50, 64, 4, 1, "skin-shadow"), rect(46, 65, 6, 1, "skin-shadow"), rect(43, 64, 2, 1, "skin-line"),
    rect(53, 64, 2, 1, "skin-line"), rect(50, 57, 1, 5, "skin-highlight"),
  ),
  long: layer(
    rect(48, 52, 1, 5, "skin-shadow"), rect(47, 57, 1, 6, "skin-shadow"), rect(46, 63, 1, 3, "skin-shadow"),
    rect(46, 66, 6, 1, "skin-shadow"), rect(46, 66, 1, 1, "skin-line"), rect(52, 66, 1, 1, "skin-line"), rect(50, 55, 1, 8, "skin-highlight"),
  ),
  rounded: layer(
    rect(48, 54, 1, 7, "skin-shadow"), rect(47, 61, 1, 3, "skin-shadow"), rect(45, 64, 8, 1, "skin-shadow"),
    rect(46, 65, 6, 1, "skin-shadow"), rect(45, 64, 2, 1, "skin-line"), rect(52, 64, 2, 1, "skin-line"),
    rect(48, 65, 2, 1, "skin-highlight"), rect(50, 57, 1, 5, "skin-highlight"),
  ),
  angular: layer(
    rect(48, 53, 1, 4, "skin-shadow"), rect(47, 57, 1, 3, "skin-shadow"), rect(46, 60, 1, 2, "skin-shadow"),
    rect(45, 62, 1, 2, "skin-shadow"), rect(46, 64, 2, 1, "skin-shadow"), rect(48, 65, 5, 1, "skin-shadow"),
    rect(45, 63, 1, 1, "skin-line"), rect(52, 65, 1, 1, "skin-line"), rect(50, 56, 1, 5, "skin-highlight"),
  ),
} as const;

const mouths = {
  neutral: layer(
    rect(42, 69, 13, 1, "skin-line"), rect(45, 70, 7, 1, "skin-shadow"), rect(47, 68, 4, 1, "skin-highlight"),
  ),
  smile: layer(
    rect(40, 68, 2, 1, "skin-line"), rect(42, 69, 2, 1, "skin-line"), rect(44, 70, 2, 1, "skin-line"),
    rect(46, 71, 5, 1, "skin-line"), rect(51, 70, 2, 1, "skin-line"), rect(53, 69, 2, 1, "skin-line"), rect(55, 68, 2, 1, "skin-line"),
    rect(44, 69, 9, 1, "mouth-light"), rect(46, 72, 5, 1, "skin-shadow"),
  ),
  focused: layer(
    rect(41, 70, 15, 1, "skin-line"), rect(45, 71, 7, 1, "skin-shadow"), rect(47, 69, 4, 1, "skin-highlight"),
  ),
  tense: layer(
    rect(41, 71, 3, 1, "skin-line"), rect(44, 70, 3, 1, "skin-line"), rect(47, 69, 3, 1, "skin-line"),
    rect(50, 70, 3, 1, "skin-line"), rect(53, 71, 3, 1, "skin-line"), rect(46, 72, 6, 1, "skin-shadow"),
  ),
  "soft-smile": layer(
    rect(41, 69, 3, 1, "skin-line"), rect(44, 70, 3, 1, "skin-line"), rect(47, 71, 4, 1, "skin-line"),
    rect(51, 70, 3, 1, "skin-line"), rect(54, 69, 2, 1, "skin-line"), rect(46, 70, 6, 1, "skin-highlight"),
  ),
  determined: layer(
    rect(41, 68, 4, 1, "skin-line"), rect(45, 69, 6, 1, "skin-line"), rect(51, 70, 5, 1, "skin-line"),
    rect(45, 71, 7, 1, "skin-shadow"), rect(47, 68, 4, 1, "skin-highlight"),
  ),
} as const;

const EMPTY_LAYER = layer();
const STANDARD_FRONT: readonly PixelPoint[] = [[25, 42], [23, 29], [29, 20], [40, 15], [57, 15], [68, 21], [72, 31], [70, 41], [65, 34], [62, 27], [55, 31], [48, 25], [41, 33], [34, 29], [29, 42]];

function hairSprite(front: PixelLayer, back: PixelLayer = EMPTY_LAYER): PixelHairSprite {
  return { front, back };
}

const standardHair = (points: readonly PixelPoint[] = STANDARD_FRONT): PixelLayer => layer(
  polygon(points, "hair-base", "hair-shadow", 2),
  line([30, 25], [43, 18], "hair-highlight", 1),
  line([46, 17], [61, 20], "hair-highlight", 1),
  rect(48, 18, 5, 2, "hair-highlight"),
  line([47, 20], [47, 25], "hair-shadow", 1),
);

const hair = {
  crop: hairSprite(layer(
    polygon([[26, 41], [24, 29], [29, 21], [38, 16], [57, 16], [67, 20], [72, 29], [70, 40], [65, 33], [59, 28], [53, 31], [47, 26], [41, 31], [35, 27], [30, 39]], "hair-base", "hair-shadow", 2),
    rect(31, 22, 6, 1, "hair-highlight"), rect(42, 19, 8, 2, "hair-highlight"), rect(56, 22, 6, 1, "hair-highlight"),
    rect(38, 25, 3, 2, "hair-shadow"), rect(52, 24, 3, 2, "hair-shadow"),
  )),
  "side-part": hairSprite(layer(
    polygon([[25, 42], [23, 29], [29, 20], [40, 15], [57, 15], [68, 21], [72, 31], [70, 41], [65, 33], [63, 25], [53, 22], [44, 22], [35, 29], [30, 42]], "hair-base", "hair-shadow", 2),
    line([46, 18], [64, 24], "hair-highlight", 1), line([40, 19], [30, 30], "hair-highlight", 1),
    rect(43, 18, 2, 8, "hair-shadow"), line([48, 22], [61, 26], "hair-shadow", 1),
  )),
  swept: hairSprite(standardHair([[25, 43], [23, 29], [29, 21], [41, 15], [61, 14], [70, 21], [73, 34], [68, 39], [62, 32], [53, 25], [47, 25], [41, 32], [30, 40]])),
  "curly-short": hairSprite(layer(
    polygon([[25, 42], [21, 33], [25, 25], [29, 22], [29, 17], [37, 16], [42, 12], [50, 15], [56, 12], [64, 17], [69, 18], [70, 24], [75, 29], [71, 41], [65, 34], [59, 32], [52, 34], [45, 31], [38, 34], [31, 32]], "hair-base", "hair-shadow", 2),
    rect(29, 23, 4, 3, "hair-highlight"), rect(42, 18, 5, 3, "hair-highlight"), rect(57, 20, 4, 3, "hair-highlight"),
    rect(35, 18, 3, 3, "hair-shadow"), rect(49, 23, 4, 3, "hair-shadow"), rect(64, 25, 3, 3, "hair-shadow"),
    rect(32, 29, 3, 2, "hair-highlight"), rect(53, 16, 3, 2, "hair-highlight"),
  )),
  buzz: hairSprite(layer(
    polygon([[27, 40], [25, 28], [31, 20], [41, 16], [56, 17], [66, 21], [71, 30], [69, 40], [64, 30], [55, 25], [40, 24], [32, 30]], "hair-base", "hair-shadow", 2),
    rect(34, 21, 7, 1, "hair-highlight"), rect(45, 19, 6, 1, "hair-highlight"), rect(55, 21, 6, 1, "hair-highlight"),
    rect(30, 27, 4, 1, "hair-highlight"), rect(38, 26, 5, 1, "hair-shadow"), rect(48, 26, 4, 1, "hair-highlight"), rect(58, 27, 5, 1, "hair-shadow"),
    rect(34, 30, 2, 1, "hair-shadow"), rect(62, 31, 2, 1, "hair-highlight"),
  )),
  shaggy: hairSprite(layer(
    polygon([[24, 44], [21, 29], [28, 20], [39, 16], [47, 12], [59, 16], [68, 20], [73, 31], [71, 44], [64, 35], [61, 45], [54, 32], [48, 43], [41, 30], [34, 42], [30, 34]], "hair-base", "hair-shadow", 2),
    line([29, 25], [44, 17], "hair-highlight", 1), line([48, 16], [64, 22], "hair-highlight", 1),
    line([35, 24], [41, 31], "hair-shadow", 1), line([55, 22], [61, 31], "hair-shadow", 1),
    rect(30, 34, 3, 2, "hair-highlight"), rect(62, 33, 3, 2, "hair-highlight"),
  )),
  "long-straight": hairSprite(
    standardHair([[24, 45], [22, 29], [28, 20], [40, 15], [56, 14], [68, 20], [73, 32], [70, 45], [64, 35], [61, 24], [49, 21], [36, 27], [31, 45]]),
    layer(
      polygon([[22, 29], [28, 17], [42, 12], [58, 14], [70, 22], [74, 39], [74, 82], [62, 86], [58, 52], [36, 52], [32, 86], [20, 80]], "hair-shadow", "hair-line", 2),
      rect(24, 40, 6, 35, "hair-base"), rect(67, 42, 5, 34, "hair-base"),
      line([27, 46], [27, 69], "hair-highlight", 1), line([69, 47], [69, 70], "hair-highlight", 1),
      rect(24, 67, 2, 6, "hair-shadow"), rect(70, 64, 2, 8, "hair-shadow"),
    ),
  ),
  "long-wavy": hairSprite(
    standardHair([[24, 45], [22, 29], [28, 20], [40, 15], [56, 14], [68, 20], [73, 32], [70, 45], [64, 35], [61, 24], [49, 21], [36, 27], [31, 45]]),
    layer(
      polygon([[23, 29], [29, 17], [43, 12], [59, 14], [70, 23], [75, 39], [71, 49], [75, 59], [70, 70], [73, 81], [62, 86], [57, 54], [37, 54], [33, 86], [21, 80], [25, 68], [20, 58], [25, 47], [21, 38]], "hair-shadow", "hair-line", 2),
      rect(24, 40, 6, 35, "hair-base"), rect(67, 42, 5, 34, "hair-base"),
      line([27, 45], [25, 57], "hair-highlight", 1), line([25, 58], [28, 68], "hair-highlight", 1),
      line([69, 47], [72, 58], "hair-highlight", 1), line([72, 59], [69, 70], "hair-highlight", 1),
      rect(23, 64, 3, 3, "hair-shadow"), rect(69, 70, 3, 3, "hair-shadow"),
    ),
  ),
  ponytail: hairSprite(standardHair(), layer(
    polygon([[63, 23], [76, 28], [81, 42], [77, 66], [70, 73], [65, 66], [70, 49], [67, 34]], "hair-shadow", "hair-line", 2),
    rect(71, 35, 6, 22, "hair-base"), rect(70, 34, 8, 3, "hair-shadow"),
    line([74, 39], [74, 55], "hair-highlight", 1), rect(72, 58, 3, 3, "hair-shadow"),
  )),
  bun: hairSprite(standardHair(), layer(
    polygon([[54, 13], [57, 7], [63, 4], [70, 7], [73, 13], [70, 20], [61, 22], [55, 18]], "hair-shadow", "hair-line", 2),
    rect(60, 8, 8, 8, "hair-base"), rect(62, 8, 4, 2, "hair-highlight"),
    rect(58, 13, 3, 3, "hair-highlight"), rect(67, 13, 3, 4, "hair-shadow"),
  )),
  receding: hairSprite(layer(
    polygon([[27, 42], [25, 29], [31, 21], [40, 17], [48, 15], [56, 18], [66, 22], [71, 31], [69, 43], [64, 35], [61, 30], [57, 27], [53, 29], [48, 33], [43, 29], [39, 27], [35, 30], [31, 35]], "hair-base", "hair-shadow", 2),
    line([29, 28], [39, 20], "hair-highlight", 1), line([50, 18], [63, 24], "hair-highlight", 1),
    rect(44, 18, 6, 1, "hair-highlight"), rect(31, 31, 3, 2, "hair-shadow"), rect(63, 31, 3, 2, "hair-shadow"),
  )),
  bald: hairSprite(layer(
    rect(27, 31, 3, 13, "hair-shadow"), rect(67, 31, 3, 13, "hair-shadow"),
    rect(31, 25, 4, 3, "hair-highlight"), rect(62, 25, 4, 3, "hair-highlight"),
  )),
} as const;

const facialHair = {
  stubble: layer(
    line([34, 63], [39, 75], "hair-base", 1), line([57, 75], [62, 63], "hair-base", 1),
    rect(40, 78, 2, 1, "hair-base"), rect(44, 80, 2, 1, "hair-base"), rect(49, 81, 2, 1, "hair-base"), rect(54, 78, 2, 1, "hair-base"),
    rect(38, 69, 1, 1, "hair-base"), rect(58, 68, 1, 1, "hair-base"), rect(42, 73, 1, 1, "hair-base"), rect(54, 74, 1, 1, "hair-base"),
    rect(36, 66, 1, 1, "hair-shadow"), rect(60, 66, 1, 1, "hair-shadow"), rect(40, 76, 1, 1, "hair-shadow"),
    rect(47, 79, 1, 1, "hair-shadow"), rect(52, 77, 1, 1, "hair-shadow"),
  ),
  moustache: layer(
    polygon([[38, 64], [44, 62], [48, 65], [52, 62], [58, 64], [54, 69], [48, 67], [42, 69]], "hair-base", "hair-shadow", 1),
    rect(47, 64, 2, 4, "hair-shadow"), rect(42, 64, 3, 1, "hair-highlight"), rect(52, 64, 3, 1, "hair-highlight"),
  ),
  goatee: layer(
    polygon([[39, 64], [45, 62], [48, 65], [52, 62], [57, 64], [53, 68], [51, 78], [48, 82], [44, 78], [45, 68]], "hair-base", "hair-shadow", 1),
    rect(47, 64, 2, 4, "hair-shadow"), line([48, 70], [48, 78], "hair-highlight", 1), rect(45, 75, 2, 2, "hair-shadow"),
  ),
  "chin-beard": layer(
    polygon([[41, 70], [48, 73], [55, 70], [53, 80], [48, 85], [43, 80]], "hair-base", "hair-shadow", 1),
    line([45, 76], [48, 82], "hair-highlight", 1), rect(51, 76, 2, 4, "hair-shadow"),
  ),
  "soul-patch": layer(
    polygon([[45, 70], [51, 70], [50, 78], [48, 81], [46, 78]], "hair-base", "hair-shadow", 1),
    rect(47, 72, 1, 5, "hair-highlight"), rect(49, 76, 1, 3, "hair-shadow"),
  ),
  "short-beard": layer(
    polygon([[34, 61], [38, 65], [39, 74], [44, 80], [48, 82], [52, 80], [57, 74], [58, 65], [62, 61], [60, 76], [53, 83], [43, 83], [36, 76]], "hair-base", "hair-shadow", 1),
    rect(39, 67, 1, 3, "hair-highlight"), rect(57, 68, 1, 3, "hair-highlight"), rect(43, 79, 2, 1, "hair-highlight"),
    rect(37, 71, 2, 2, "hair-shadow"), rect(58, 73, 2, 2, "hair-shadow"), line([47, 76], [50, 81], "hair-shadow", 1),
  ),
  "full-beard": layer(
    polygon([[32, 58], [37, 62], [38, 74], [43, 82], [48, 86], [53, 82], [58, 74], [59, 62], [64, 58], [62, 77], [54, 86], [42, 86], [34, 77]], "hair-base", "hair-shadow", 2),
    rect(38, 66, 1, 4, "hair-highlight"), rect(58, 67, 1, 4, "hair-highlight"), rect(43, 80, 2, 1, "hair-highlight"),
    rect(35, 70, 2, 3, "hair-shadow"), rect(60, 71, 2, 3, "hair-shadow"), line([47, 76], [51, 83], "hair-shadow", 1),
  ),
} as const;

const brows = {
  straight: layer(rect(31, 41, 13, 2, "hair-base"), rect(52, 41, 13, 2, "hair-base")),
  arched: layer(
    line([31, 43], [37, 40], "hair-base"), line([37, 40], [43, 42], "hair-base"),
    line([53, 42], [59, 40], "hair-base"), line([59, 40], [65, 43], "hair-base"),
  ),
  soft: layer(line([31, 41], [43, 42], "hair-base", 1), line([53, 42], [65, 41], "hair-base", 1)),
  strong: layer(rect(31, 41, 13, 3, "hair-base"), rect(52, 41, 13, 3, "hair-base")),
  raised: layer(rect(31, 39, 13, 2, "hair-base"), rect(52, 39, 13, 2, "hair-base")),
  focused: layer(line([31, 40], [42, 44], "hair-base"), line([53, 44], [64, 40], "hair-base")),
} as const;

const ageDetails = {
  freckles: layer(
    rect(33, 57, 1, 1, "skin-shadow"), rect(37, 59, 1, 1, "skin-shadow"), rect(40, 57, 1, 1, "skin-shadow"),
    rect(57, 58, 1, 1, "skin-shadow"), rect(61, 56, 1, 1, "skin-shadow"), rect(64, 59, 1, 1, "skin-shadow"),
  ),
  mole: layer(rect(60, 62, 1, 1, "skin-line")),
  "cheek-lines": layer(line([31, 62], [36, 65], "skin-shadow", 1), line([60, 65], [65, 62], "skin-shadow", 1)),
  "forehead-lines": layer(
    rect(40, 33, 7, 1, "skin-shadow"), rect(49, 33, 7, 1, "skin-shadow"),
    rect(43, 36, 11, 1, "skin-shadow"),
  ),
  "eye-lines": layer(
    line([30, 52], [27, 53], "skin-shadow", 1), line([29, 54], [26, 56], "skin-shadow", 1),
    line([66, 52], [69, 53], "skin-shadow", 1), line([67, 54], [70, 56], "skin-shadow", 1),
  ),
  "smile-lines": layer(line([37, 66], [35, 71], "skin-shadow", 1), line([59, 66], [61, 71], "skin-shadow", 1)),
} as const;

function glasses(height: number): PixelLayer {
  return layer(
    rect(28, 42, 18, 2, "accessory-dark"), rect(28, 44, 2, height, "accessory-dark"),
    rect(44, 44, 2, height, "accessory-dark"), rect(30, 42 + height, 14, 2, "accessory-dark"),
    rect(50, 42, 18, 2, "accessory-dark"), rect(50, 44, 2, height, "accessory-dark"),
    rect(66, 44, 2, height, "accessory-dark"), rect(52, 42 + height, 14, 2, "accessory-dark"),
    rect(46, 47, 4, 2, "accessory-dark"),
  );
}

const roundGlasses = layer(
  rect(32, 42, 10, 2, "accessory-dark"), rect(29, 44, 3, 2, "accessory-dark"),
  rect(27, 46, 2, 5, "accessory-dark"), rect(29, 51, 3, 2, "accessory-dark"),
  rect(32, 53, 10, 2, "accessory-dark"), rect(42, 51, 3, 2, "accessory-dark"),
  rect(45, 46, 2, 5, "accessory-dark"), rect(42, 44, 3, 2, "accessory-dark"),
  rect(54, 42, 10, 2, "accessory-dark"), rect(51, 44, 3, 2, "accessory-dark"),
  rect(49, 46, 2, 5, "accessory-dark"), rect(51, 51, 3, 2, "accessory-dark"),
  rect(54, 53, 10, 2, "accessory-dark"), rect(64, 51, 3, 2, "accessory-dark"),
  rect(67, 46, 2, 5, "accessory-dark"), rect(64, 44, 3, 2, "accessory-dark"),
  rect(47, 47, 2, 2, "accessory-dark"),
);

const glassesArms = layer(
  line([25, 45], [30, 46], "accessory-dark", 1), line([67, 46], [72, 45], "accessory-dark", 1),
  rect(23, 45, 3, 2, "accessory-dark"), rect(72, 45, 3, 2, "accessory-dark"),
);

function accessorySprite(front: PixelLayer, behindHair: PixelLayer = EMPTY_LAYER): PixelAccessorySprite {
  return { behindHair, front };
}

const accessories = {
  "round-glasses": accessorySprite(roundGlasses, glassesArms),
  "square-glasses": accessorySprite(glasses(12), glassesArms),
  "sport-glasses": accessorySprite(layer(
    polygon([[27, 42], [39, 40], [48, 44], [57, 40], [70, 42], [66, 53], [56, 55], [48, 49], [39, 55], [30, 53]], "accessory-mid", "hair-line", 2),
    rect(32, 44, 12, 2, "accessory-highlight"), rect(54, 44, 12, 2, "accessory-highlight"),
  ), glassesArms),
  headband: accessorySprite(
    layer(
      polygon([[36, 27], [40, 25], [56, 25], [61, 27], [59, 30], [38, 30]], "accessory-light", "accessory-dark", 1),
      rect(41, 26, 14, 1, "accessory-highlight"),
    ),
    layer(polygon([[27, 29], [38, 24], [58, 24], [69, 29], [68, 34], [58, 29], [38, 29], [28, 34]], "accessory-light", "accessory-dark", 1)),
  ),
  earring: accessorySprite(EMPTY_LAYER, layer(
    rect(69, 57, 3, 3, "metal-gold"), rect(70, 60, 2, 4, "metal-gold"), rect(70, 57, 1, 1, "metal-light"),
  )),
  "nose-stud": accessorySprite(layer(rect(52, 60, 2, 2, "metal-light"))),
} as const;

const anatomy = {
  neck: layer(
    polygon([[40, 68], [56, 68], [58, 81], [53, 86], [48, 88], [43, 86], [38, 81]], "skin-base", "skin-line", 2),
    polygon([[39, 72], [44, 81], [52, 84], [48, 87], [43, 85], [39, 81]], "skin-shadow"),
    rect(54, 72, 2, 8, "skin-highlight"),
  ),
  ears: layer(
    polygon([[27, 45], [23, 47], [21, 51], [22, 59], [26, 64], [30, 60], [30, 49]], "skin-base", "skin-line", 2),
    polygon([[69, 45], [73, 47], [75, 51], [74, 59], [70, 64], [66, 60], [66, 49]], "skin-base", "skin-line", 2),
    rect(24, 51, 2, 7, "skin-shadow"), rect(26, 49, 2, 3, "skin-highlight"),
    rect(71, 51, 2, 7, "skin-shadow"), rect(69, 49, 2, 3, "skin-highlight"),
  ),
} as const;

const shirtBase: readonly PixelPrimitive[] = [
  polygon([[17, 96], [20, 85], [31, 78], [40, 75], [48, 82], [56, 75], [65, 78], [76, 85], [79, 96]], "shirt-primary", "body-line", 2),
  line([21, 87], [37, 78], "shirt-secondary", 3), line([75, 87], [59, 78], "shirt-secondary", 3),
  line([22, 92], [37, 83], "shirt-tertiary", 2), line([74, 92], [59, 83], "shirt-tertiary", 2),
];

const standardShirt = (...details: readonly PixelPrimitive[]): PixelLayer => layer(...shirtBase, ...details);
const crewCollar: readonly PixelPrimitive[] = [
  rect(39, 76, 4, 4, "shirt-secondary"), rect(43, 80, 10, 3, "shirt-secondary"), rect(53, 76, 4, 4, "shirt-secondary"),
];
const shirtCollar = polygon([[37, 76], [44, 85], [48, 79], [52, 85], [59, 76], [55, 75], [48, 81], [41, 75]], "shirt-secondary", "body-line", 1);

const shirts = {
  crew: standardShirt(...crewCollar),
  "v-neck": standardShirt(line([39, 76], [48, 85], "shirt-secondary", 3), line([48, 85], [57, 76], "shirt-secondary", 3)),
  polo: standardShirt(shirtCollar, rect(47, 82, 2, 9, "shirt-tertiary"), rect(50, 85, 2, 2, "shirt-tertiary")),
  zip: standardShirt(...crewCollar, rect(47, 82, 3, 14, "shirt-tertiary"), rect(50, 84, 2, 2, "shirt-tertiary")),
  singlet: layer(
    polygon([[18, 96], [22, 86], [33, 79], [39, 77], [42, 83], [48, 87], [54, 83], [57, 77], [63, 79], [74, 86], [78, 96]], "shirt-primary", "body-line", 2),
    line([23, 88], [38, 79], "shirt-secondary", 3), line([73, 88], [58, 79], "shirt-secondary", 3),
    line([39, 78], [48, 87], "shirt-tertiary", 2), line([48, 87], [57, 78], "shirt-tertiary", 2),
  ),
  warmup: standardShirt(
    polygon([[38, 76], [43, 84], [48, 81], [53, 84], [58, 76], [55, 73], [41, 73]], "shirt-secondary", "body-line", 1),
    rect(47, 79, 3, 17, "shirt-tertiary"), rect(50, 82, 2, 2, "shirt-tertiary"),
  ),
  collared: standardShirt(shirtCollar, rect(46, 82, 4, 7, "shirt-tertiary"), rect(47, 83, 2, 2, "shirt-secondary")),
  training: standardShirt(
    ...crewCollar,
    polygon([[18, 96], [21, 86], [29, 81], [33, 96]], "shirt-secondary"),
    polygon([[78, 96], [75, 86], [67, 81], [63, 96]], "shirt-secondary"),
    rect(19, 93, 13, 3, "shirt-tertiary"), rect(64, 93, 13, 3, "shirt-tertiary"),
  ),
} as const;

export const PIXEL_FACE_ART_KIT_V1: PixelFaceArtKit = Object.freeze({
  version: 1,
  canvas: { width: 96, height: 96 },
  heads,
  eyes,
  noses,
  mouths,
  hair,
  facialHair,
  brows,
  ageDetails,
  accessories,
  anatomy,
  shirts,
});

export function headSpriteFor(id: string): PixelHeadSprite {
  return PIXEL_FACE_ART_KIT_V1.heads[id] ?? PIXEL_FACE_ART_KIT_V1.heads.oval!;
}

export function eyeLayerFor(id: string): PixelLayer {
  return PIXEL_FACE_ART_KIT_V1.eyes[id] ?? PIXEL_FACE_ART_KIT_V1.eyes.calm!;
}

export function noseLayerFor(id: string): PixelLayer {
  return PIXEL_FACE_ART_KIT_V1.noses[id] ?? PIXEL_FACE_ART_KIT_V1.noses.straight!;
}

export function mouthLayerFor(id: string): PixelLayer {
  return PIXEL_FACE_ART_KIT_V1.mouths[id] ?? PIXEL_FACE_ART_KIT_V1.mouths.neutral!;
}

export function hairSpriteFor(id: string | undefined): PixelHairSprite {
  return (id === undefined ? undefined : PIXEL_FACE_ART_KIT_V1.hair[id]) ?? PIXEL_FACE_ART_KIT_V1.hair.crop!;
}

export function facialHairLayerFor(id: string | undefined): PixelLayer {
  return id === undefined ? EMPTY_LAYER : PIXEL_FACE_ART_KIT_V1.facialHair[id] ?? EMPTY_LAYER;
}

export function browLayerFor(id: string): PixelLayer {
  return PIXEL_FACE_ART_KIT_V1.brows[id] ?? PIXEL_FACE_ART_KIT_V1.brows.straight!;
}

export function ageDetailLayerFor(id: string): PixelLayer {
  return PIXEL_FACE_ART_KIT_V1.ageDetails[id] ?? EMPTY_LAYER;
}

const EMPTY_ACCESSORY: PixelAccessorySprite = { behindHair: EMPTY_LAYER, front: EMPTY_LAYER };

export function accessorySpriteFor(id: string | undefined): PixelAccessorySprite {
  return id === undefined ? EMPTY_ACCESSORY : PIXEL_FACE_ART_KIT_V1.accessories[id] ?? EMPTY_ACCESSORY;
}

export function shirtLayerFor(id: string): PixelLayer {
  return PIXEL_FACE_ART_KIT_V1.shirts[id] ?? PIXEL_FACE_ART_KIT_V1.shirts.crew!;
}

export function anatomySpriteForPortrait(): PixelAnatomySprite {
  return PIXEL_FACE_ART_KIT_V1.anatomy;
}
