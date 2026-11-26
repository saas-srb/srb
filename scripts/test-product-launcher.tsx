/** Which products "All products" and the dashboard list: only the company's own, never ClientOS, ResolveIQ or Sites. */
import assert from "node:assert/strict";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PanelPerformanceMatrix } from "@/components/products/commandos/CommandCenterSections";
import { NOT_LISTED_PRODUCTS } from "@/lib/platform/panels/types";

(globalThis as { React?: unknown }).React = React;
assert.deepEqual([...NOT_LISTED_PRODUCTS].sort(), ["portal", "support", "website"]);
const registry = ["hrms", "cms", "portal", "support", "website"].map((key) => ({ key, name: `name-${key}`, description: "d", route: `/${key}` }));
const html = renderToStaticMarkup(<PanelPerformanceMatrix panels={registry.map((r) => r.key)} registry={registry} />);
assert.ok(html.includes("name-hrms") && html.includes("name-cms"), "products are listed");
for (const key of ["portal", "support", "website"]) assert.ok(!html.includes(`name-${key}`), `${key} is not on the dashboard`);
console.log("product launcher: dashboard list checks passed");
process.exit(0);
