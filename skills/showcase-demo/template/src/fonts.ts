// The product's typefaces: swap in its own. Any Google Font is
// `import { loadFont } from "@remotion/google-fonts/<FamilyWithoutSpaces>"`; for font files, put them in
// public/ and load them with @remotion/fonts (`npx remotion add @remotion/fonts`).
import { loadFont as loadSans } from "@remotion/google-fonts/InterTight";
import { loadFont as loadSerif } from "@remotion/google-fonts/DMSerifDisplay";

export const { fontFamily: sans } = loadSans("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] });
// the accent: *starred* words in titles
export const { fontFamily: serif } = loadSerif("italic", { weights: ["400"], subsets: ["latin"] });
