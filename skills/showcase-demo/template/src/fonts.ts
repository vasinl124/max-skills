// The product's typefaces: swap in its own. Any Google Font is
// `import { loadFont } from "@remotion/google-fonts/<FamilyWithoutSpaces>"`; for font files, put them in
// public/ and load them with @remotion/fonts (`npx remotion add @remotion/fonts`). Latin Extended covers
// accented names and transliterations (ā, ñ, ş…); add the subsets the product's own languages need.
import { loadFont as loadSans } from "@remotion/google-fonts/InterTight";
import { loadFont as loadSerif } from "@remotion/google-fonts/DMSerifDisplay";
import { loadFont as loadMono } from "@remotion/google-fonts/DMMono";

export const { fontFamily: sans } = loadSans("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin", "latin-ext"] });
// italic for *starred* words, upright for the stats' numbers
export const { fontFamily: serif } = loadSerif("italic", { weights: ["400"], subsets: ["latin", "latin-ext"] });
loadSerif("normal", { weights: ["400"], subsets: ["latin", "latin-ext"] });
// labels and notes in the drafting style
export const { fontFamily: mono } = loadMono("normal", { weights: ["400", "500"], subsets: ["latin", "latin-ext"] });
