import { Config } from "@remotion/cli/config";

// Frames at high JPEG quality keep the recorded UI's text sharp in the final H.264.
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
Config.setOverwriteOutput(true);
