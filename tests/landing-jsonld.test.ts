import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LandingJsonLd } from "../components/LandingJsonLd";
import type { Plan } from "../services/subscription.service";

function plan(price: number): Plan {
  return {
    id: String(price),
    name: `Plan ${price}`,
    max_collaborators: 1,
    max_monthly_sales: null,
    price,
    annual_charged_months: 0,
    sort_order: 0,
    is_active: true,
  };
}

function graph(plans: Plan[]) {
  const markup = renderToStaticMarkup(createElement(LandingJsonLd, { plans }));
  const json = markup.match(/<script type="application\/ld\+json">(.*?)<\/script>/)?.[1];
  assert.ok(json, "structured data is rendered");
  return JSON.parse(json) as { "@graph": Array<Record<string, unknown>> };
}

test("landing structured data uses the approved brand and current capabilities", () => {
  const nodes = graph([plan(0), plan(29000), plan(49000)])["@graph"];
  const software = nodes.find((node) => node["@type"] === "SoftwareApplication");
  const organization = nodes.find((node) => node["@type"] === "Organization");
  assert.ok(software);
  assert.ok(organization);
  assert.match(String(organization.logo), /\/brand\/ventex-modular\.svg$/);
  assert.equal(software.applicationSubCategory, "Business management software");
  assert.doesNotMatch(String(software.description), /restaurantes|lava-autos/i);
  assert.deepEqual(software.offers, {
    "@type": "AggregateOffer",
    priceCurrency: "COP",
    lowPrice: 0,
    highPrice: 49000,
    offerCount: 3,
    availability: "https://schema.org/InStock",
  });
});

test("landing structured data does not invent an offer for an empty catalog", () => {
  const software = graph([])["@graph"].find((node) => node["@type"] === "SoftwareApplication");
  assert.ok(software);
  assert.equal(software.offers, undefined);
});
