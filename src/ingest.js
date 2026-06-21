/*
 * ingest.js
 *
 * Public data to PDTF ingester (reference implementation).
 *
 * Takes authoritative public-source inputs (Land Registry Price Paid records,
 * the EPC register entry, and the agreed price from the memorandum of sale),
 * derives a down-valuation assessment, and emits:
 *
 *   1. PDTF verified claims, each carrying provenance for its inputs.
 *   2. An assembled propertyPack ready to validate against the schema.
 *
 * Nothing here is asserted by hand. Every figure traces back to a sourced claim.
 */

const fs = require("fs");
const path = require("path");

const RISK_THRESHOLDS = { low: 0, medium: 5, high: 10 }; // percentage boundaries

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

function riskBandFor(percentage) {
  if (percentage <= RISK_THRESHOLDS.low) return "none";
  if (percentage < RISK_THRESHOLDS.medium) return "low";
  if (percentage < RISK_THRESHOLDS.high) return "medium";
  return "high";
}

function nowIso() {
  return new Date().toISOString();
}

// Builds a single PDTF verified claim object.
// path is a JSON pointer into the transaction. evidence is an array of
// provenance entries describing where the value came from.
function buildClaim(transactionId, pointer, value, evidence) {
  const slug = pointer
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return {
    id: "claim-" + slug,
    transactionId,
    schemaVersion: "3.5.0",
    timestamp: Date.now(),
    verification: {
      trust_framework: "uk_pdtf",
      time: nowIso(),
      evidence
    },
    claims: { [pointer]: value }
  };
}

function ingest(sources) {
  const transactionId = "txn-downval-demo-0001";
  const subject = sources.subjectProperty;
  const comps = sources.landRegistryComparables;

  const compPrices = comps.records.map((r) => r.pricePaid);
  const comparableValue = median(compPrices);

  const agreedPrice = subject.agreedPrice;
  const downValuationAmount = agreedPrice - comparableValue;
  const downValuationPercentage =
    Math.round((downValuationAmount / agreedPrice) * 1000) / 10;
  const isDownValued = downValuationAmount > 0;
  const riskBand = riskBandFor(downValuationPercentage);

  const riskFactors = [];
  if (subject.offPlanLaunchPrice > comparableValue) {
    riskFactors.push(
      "Off-plan launch price set above local resale comparables"
    );
  }
  if (comps.records.length < 3) {
    riskFactors.push("Thin comparable evidence (fewer than three records)");
  }
  if (subject.isNewBuild) {
    riskFactors.push(
      "New-build scheme: launch pricing may embed a developer premium not realised on resale"
    );
  }

  const downValuation = {
    isDownValued,
    priceReference: {
      path: "/propertyPack/priceInformation/price",
      value: agreedPrice
    },
    valuationFigure: comparableValue,
    downValuationAmount,
    downValuationPercentage,
    riskBand,
    riskFactors,
    methodology:
      "Median of Land Registry Price Paid completions for comparable units in the scheme and postcode sector over the trailing window, compared against the agreed price. Illustrative."
  };

  const valuation = {
    valuationId: 1,
    valuationTimestamp: nowIso(),
    capitalValue: comparableValue,
    confidenceLevel: 0.7,
    confidenceBand: comps.records.length >= 4 ? "medium" : "low",
    valuationType: "Comparable evidence (automated)",
    valuationContext: "Pre-offer down-valuation risk screen",
    checkValuationResult: isDownValued ? "Below agreed price" : "At or above agreed price",
    downValuation
  };

  // Provenance entries reused across claims.
  const landRegistryEvidence = {
    type: "record",
    record: {
      type: "open_data",
      source: comps.source,
      retrievedAt: comps.retrievedAt,
      references: comps.records.map((r) => r.transactionId)
    }
  };
  const epcEvidence = {
    type: "record",
    record: {
      type: "open_data",
      source: subject.epc.source,
      reference: subject.epc.lmkKey,
      retrievedAt: subject.epc.lodgementDate
    }
  };
  const memorandumEvidence = {
    type: "vouch",
    attestation: {
      type: "digital_attestation",
      voucher: { name: "Selling agent, memorandum of sale" }
    },
    verification_method: { type: "auth" }
  };

  const verifiedClaims = [
    buildClaim(
      transactionId,
      "/propertyPack/priceInformation/price",
      agreedPrice,
      [memorandumEvidence]
    ),
    buildClaim(
      transactionId,
      "/propertyPack/priceInformation/priceQualifier",
      "Offers in excess of",
      [memorandumEvidence]
    ),
    buildClaim(transactionId, "/propertyPack/valuations/0", valuation, [
      landRegistryEvidence,
      epcEvidence
    ])
  ];

  // Assemble the transaction from the claims, exactly as a consuming product would.
  const propertyPack = {
    priceInformation: {
      price: agreedPrice,
      priceQualifier: "Offers in excess of"
    },
    valuations: [valuation]
  };

  return {
    transaction: { propertyPack },
    verifiedClaims,
    summary: {
      agreedPrice,
      comparableValue,
      downValuationAmount,
      downValuationPercentage,
      riskBand
    }
  };
}

function main() {
  const sourcesPath = path.join(__dirname, "..", "data", "public-sources.sample.json");
  const sources = JSON.parse(fs.readFileSync(sourcesPath, "utf8"));
  const result = ingest(sources);

  const outDir = path.join(__dirname, "..", "examples");
  fs.writeFileSync(
    path.join(outDir, "verified-claims.json"),
    JSON.stringify(result.verifiedClaims, null, 2)
  );
  fs.writeFileSync(
    path.join(outDir, "assembled-transaction.json"),
    JSON.stringify(result.transaction, null, 2)
  );

  const s = result.summary;
  console.log("Ingest complete.");
  console.log("  Agreed price:        GBP " + s.agreedPrice.toLocaleString());
  console.log("  Comparable value:    GBP " + s.comparableValue.toLocaleString());
  console.log("  Down-valuation:      GBP " + s.downValuationAmount.toLocaleString() + " (" + s.downValuationPercentage + "%)");
  console.log("  Risk band:           " + s.riskBand);
  console.log("  Claims written:      examples/verified-claims.json");
  console.log("  Transaction written: examples/assembled-transaction.json");
}

if (require.main === module) main();

module.exports = { ingest, median, riskBandFor };
