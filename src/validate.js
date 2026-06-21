/*
 * validate.js
 *
 * Proves the down-valuation example conforms to the official PDTF v3 schema.
 *
 * Steps:
 *   1. Pull the real base v3 transaction schema from the published @pdtf/schemas package.
 *   2. Deep-merge the proposed dv overlay on top.
 *   3. Compile with Ajv using the same configuration the package uses.
 *   4. Validate the assembled transaction produced by the ingester.
 *
 * If this passes, the dv overlay is a clean, additive extension of the live schema.
 */

const fs = require("fs");
const path = require("path");
const merge = require("deepmerge");
const Ajv = require("ajv");
const addFormats = require("ajv-formats");

const { getTransactionSchema } = require("@pdtf/schemas");

const V3_ID = "https://trust.propdata.org.uk/schemas/v3/pdtf-transaction.json";

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function main() {
  // 1. Base schema straight from the published package (no overlays).
  const baseSchema = getTransactionSchema(V3_ID, []);

  // 2. Proposed overlay merged on top.
  const dvOverlay = loadJson(path.join(__dirname, "..", "overlays", "dv.json"));
  const mergedSchema = merge(baseSchema, dvOverlay);

  // 3. Compile with the same Ajv setup the package itself uses.
  const ajv = new Ajv({ allErrors: true, strictSchema: false, discriminator: true });
  addFormats(ajv);
  const validate = ajv.compile(mergedSchema);

  // 4. Validate the assembled transaction from the ingester.
  const transaction = loadJson(
    path.join(__dirname, "..", "examples", "assembled-transaction.json")
  );
  const valid = validate(transaction);

  if (valid) {
    console.log("PASS: assembled transaction conforms to PDTF v3 base plus dv overlay.");
    const dv = transaction.propertyPack.valuations[0].downValuation;
    console.log("      down-valuation detected: " + dv.isDownValued + ", risk band: " + dv.riskBand);
    process.exit(0);
  } else {
    console.log("FAIL: validation errors:");
    console.log(JSON.stringify(validate.errors, null, 2));
    process.exit(1);
  }
}

main();
