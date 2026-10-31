import assert from "node:assert/strict";
import { test } from "node:test";
import { licenceOk, parse, searchUrl, stripHtml, titleUrl } from "../scripts/food-images";

test("licence filter: free reuse licences pass, NC/ND/GFDL/unknown fail", () => {
  for (const ok of ["CC0", "Public domain", "CC BY 4.0", "CC BY-SA 3.0", "CC BY-SA 4.0", "CC BY 2.0", "PDM 1.0"]) assert.ok(licenceOk(ok), ok);
  for (const no of ["CC BY-NC 4.0", "CC BY-ND 2.0", "CC BY-NC-SA 3.0", "GFDL", "All rights reserved", ""]) assert.ok(!licenceOk(no), no);
});
test("requests are built for the Commons API with the file namespace and an identifying query", () => {
  const u = new URL(searchUrl("jollof rice")); assert.equal(u.origin + u.pathname, "https://commons.wikimedia.org/w/api.php"); assert.equal(u.searchParams.get("gsrnamespace"), "6"); assert.match(u.searchParams.get("gsrsearch")!, /^jollof rice filetype:bitmap$/);
  assert.equal(new URL(titleUrl("File:A b.jpg")).searchParams.get("titles"), "File:A b.jpg"); assert.equal(new URL(titleUrl("File:A.jpg")).searchParams.get("iiurlwidth"), "800");
});
test("parses a Commons imageinfo response (shape from the MediaWiki API documentation) and strips HTML from credits", () => {
  const json = { query: { pages: { "2": { title: "File:B.jpg", index: 2, imageinfo: [{ descriptionurl: "https://commons.wikimedia.org/wiki/File:B.jpg", thumburl: "https://upload.wikimedia.org/t/B.jpg", mime: "image/jpeg", width: 2000, height: 1500, extmetadata: { LicenseShortName: { value: "CC BY-SA 4.0" }, LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" }, Artist: { value: '<a href="x">Ada &amp; Co</a>' }, ImageDescription: { value: "<p>Jollof rice</p>" } } }] }, "1": { title: "File:A.jpg", index: 1, imageinfo: [{ descriptionurl: "u", url: "o", mime: "image/png", width: 1, height: 1, extmetadata: {} }] } } } };
  const c = parse(json); assert.deepEqual(c.map((x) => x.title), ["File:A.jpg", "File:B.jpg"]); assert.equal(c[1].author, "Ada & Co"); assert.equal(c[1].licence, "CC BY-SA 4.0"); assert.match(c[1].text, /Jollof rice/); assert.equal(c[0].author, "Unknown");
  assert.deepEqual(parse({}), []); assert.equal(stripHtml("a&nbsp;b"), "a&nbsp;b".replace(/\s+/g, " "));
});
