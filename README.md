# PDTF down-valuation reference implementation

A small, runnable reference implementation showing how a **down-valuation assessment** can be derived from authoritative public property data and expressed on the Property Data Trust Framework (PDTF) v3 schema, with provenance attached to every input.

It is built against the published `@pdtf/schemas` package (v3.5.0) and validates against the live base schema.

## Why this exists

PDTF v3.5 introduced a top-level `propertyPack.valuations[]` array (capital value, confidence band, valuation type and context, check valuation result). The base schema also carries `priceInformation.price` and a `saleAtUndervalue` flag.

What the schema does not yet express is the relationship between the two. A down-valuation, where a lending or comparable valuation comes in below the agreed price, is one of the more common causes of late-stage fall-throughs, renegotiation and chain collapse. Today it cannot be represented, scored, or traced back to evidence inside a property pack.

This repository does two things:

1. Proposes a minimal, additive `dv` overlay that adds a derived `downValuation` object to each valuation entry.
2. Demonstrates the trust-framework vision end to end: public data in, PDTF verified claims out, with each figure traceable to its source.

Nothing in the output is hand-asserted. The down-valuation is computed from sourced, timestamped claims.

## What it produces

Running the demo against the sample inputs yields:

```
Agreed price:        GBP 640,000
Comparable value:    GBP 571,500
Down-valuation:      GBP 68,500 (10.7%)
Risk band:           high
```

and confirms:

```
PASS: assembled transaction conforms to PDTF v3 base plus dv overlay.
```

## How it works

```
data/public-sources.sample.json   Illustrative public-source inputs
        |
        v
src/ingest.js                      Derives the down-valuation, emits verified claims
        |
        +--> examples/verified-claims.json        One claim per input, each with provenance
        +--> examples/assembled-transaction.json  The propertyPack assembled from those claims
        |
        v
src/validate.js                    Merges the dv overlay onto the real base schema and validates
```

### Provenance model

Provenance lives where PDTF intends it: on the verified claims, not inside the data object. Each claim carries a `verification.evidence` array describing its source. In this example:

* The **agreed price** is vouched by the memorandum of sale.
* The **comparable valuation** is evidenced by HM Land Registry Price Paid Data, an open dataset under the Open Government Licence, with the individual comparable record references listed.
* The **EPC** entry is evidenced by the EPC Register.

The `downValuation` object holds only the derived figures, the risk band, the contributing factors, and a short methodology note. Anyone consuming the pack can trace each input back to an authoritative record.

## The proposed `dv` overlay

`overlays/dv.json` follows the same convention as the existing extension overlays (for example `jk.json` for Japanese knotweed): a JSON Schema fragment that deep-merges onto the base transaction schema. It adds a single `downValuation` object under `propertyPack.valuations[].items`, with:

| Field | Meaning |
| --- | --- |
| `isDownValued` | True when the valuation figure is below the agreed price |
| `priceReference` | JSON pointer and value of the price claim compared against |
| `valuationFigure` | The valuation used in the comparison |
| `downValuationAmount` | Agreed price minus valuation figure |
| `downValuationPercentage` | The amount as a percentage of the agreed price |
| `riskBand` | none, low, medium, or high |
| `riskFactors` | Contributing factors, for example an off-plan launch premium |
| `methodology` | Short note on how the comparable value was derived |

The overlay is additive and backward compatible. It does not change or require any existing field.

## Run it

```
npm install
npm run demo
```

`npm run demo` runs the ingester and then the validator. You can also run them separately with `npm run ingest` and `npm run validate`.

Node 18 or later is recommended.

## Scope and honesty about the data

The sample inputs are synthetic and illustrative. They are shaped to exercise the schema, not to describe a real property. A production ingester would call the relevant public APIs directly (HM Land Registry, the EPC Open Data service, and so on) and would apply a more careful comparable selection and adjustment model than the median used here. The point of this repository is the data path and the provenance model, not the valuation method.

This is a personal, independent contribution by Siya Ahuja, intended to support the work of the Open Property Data Association and the wider Digital Property Market Steering Group. It is offered under the MIT licence. Note that the BASPI, PIQ and Law Society TA form fields referenced by the official PDTF overlays carry their own licence terms; this repository does not reproduce them.

## Possible next steps

* Live adapters for the HM Land Registry and EPC public APIs.
* A property-pack level risk summary that aggregates across multiple valuations.
* Migration of the provenance envelope to W3C Verifiable Credentials, in line with the framework roadmap.
* Discussion with maintainers on whether `downValuation` belongs as an extension overlay or in the base valuations object.
