// TeX → self-contained SVG with MathJax 4, imported directly (no global MathJax).
// Loaded lazily by the equation editor because it is large.
import { mathjax } from "@mathjax/src/js/mathjax.js";
import { TeX } from "@mathjax/src/js/input/tex.js";
import { SVG } from "@mathjax/src/js/output/svg.js";
import { liteAdaptor } from "@mathjax/src/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "@mathjax/src/js/handlers/html.js";
import "@mathjax/src/js/input/tex/base/BaseConfiguration.js";
import "@mathjax/src/js/input/tex/ams/AmsConfiguration.js";
import "@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js";
import "@mathjax/src/js/input/tex/noundefined/NoUndefinedConfiguration.js";
import { MathJaxNewcmFont } from "@mathjax/mathjax-newcm-font/js/svg.js";

// Rarer glyph ranges load on demand. MathJax asks for them by package path, which a
// browser can't import, so resolve them through Vite's glob instead.
const dynamicRanges = import.meta.glob("../../../../../node_modules/@mathjax/mathjax-newcm-font/mjs/svg/dynamic/*.js");
mathjax.asyncLoad = async (name: string) => {
  const file = `${name.split("/").pop()!.replace(/\.js$/, "")}.js`;
  const key = Object.keys(dynamicRanges).find((path) => path.endsWith(`/${file}`));
  if (!key) throw new Error(`MathJax font range not found: ${name}`);
  return dynamicRanges[key]();
};

const EM = 16;
const EX = 8;

const adaptor = liteAdaptor({ fontSize: EM });
RegisterHTMLHandler(adaptor);

const doc = mathjax.document("", {
  InputJax: new TeX({ packages: ["base", "ams", "newcommand", "noundefined"] }),
  // No font cache: every glyph is an inline path, so the SVG renders and rasterises on its own.
  OutputJax: new SVG({ fontData: MathJaxNewcmFont, fontCache: "none" }),
});

export interface RenderedMath {
  /** Inner markup of the <svg>. */
  svg: string;
  viewBox: string;
  /** Size in ems; multiply by the font size for world units. */
  width: number;
  height: number;
}

const toEm = (length: string) => parseFloat(length) * (length.endsWith("ex") ? EX / EM : 1);

export async function texToSvg(latex: string): Promise<RenderedMath> {
  const container = await doc.convertPromise(latex, { display: true, em: EM, ex: EX, containerWidth: 80 * EM });
  const svg = adaptor.firstChild(container) as Parameters<typeof adaptor.getAttribute>[0];
  return {
    svg: adaptor.innerHTML(svg),
    viewBox: adaptor.getAttribute(svg, "viewBox"),
    width: toEm(adaptor.getAttribute(svg, "width")),
    height: toEm(adaptor.getAttribute(svg, "height")),
  };
}
