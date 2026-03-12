#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "npm-search",
  version: "1.0.0",
});

interface NpmSearchPackage {
  name: string;
  version: string;
  description: string;
  keywords: string[];
  date: string;
  links: { npm: string; homepage?: string; repository?: string };
  publisher: { username: string };
}

interface NpmSearchObject {
  package: NpmSearchPackage;
  score: { final: number; detail: { quality: number; popularity: number; maintenance: number } };
  downloads?: { weekly: number; monthly: number };
}

interface NpmPackageInfo {
  name: string;
  "dist-tags": Record<string, string>;
  description?: string;
  license?: string;
  homepage?: string;
  repository?: { url?: string };
  keywords?: string[];
  time?: Record<string, string>;
  versions?: Record<string, { dependencies?: Record<string, string>; dist?: { unpackedSize?: number } }>;
}

interface NpmDownloads {
  downloads: number;
  start: string;
  end: string;
  package: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json() as Promise<T>;
}

server.tool(
  "search_packages",
  "Search the npm registry for packages matching a query. Returns name, description, version, score, and links. Use this to find packages for a specific task or compare options.",
  {
    query: z.string().describe("Search query (e.g. 'markdown parser', 'react state management')"),
    limit: z.number().min(1).max(50).optional().default(10).describe("Max results to return (default 10, max 50)"),
  },
  async ({ query, limit }) => {
    try {
      const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=${limit}`;
      const data = await fetchJson<{ objects: NpmSearchObject[] }>(url);

      if (data.objects.length === 0) {
        return { content: [{ type: "text" as const, text: `No packages found for "${query}".` }] };
      }

      const lines = data.objects.map((obj, i) => {
        const p = obj.package;
        const score = Math.round(obj.score.final);
        const dl = obj.downloads?.weekly;
        return [
          `${i + 1}. **${p.name}** v${p.version}${dl ? ` (${dl.toLocaleString()} DLs/week)` : ""}`,
          `   ${p.description || "No description"}`,
          `   Published: ${p.date.split("T")[0]} | npm: ${p.links.npm}`,
        ].join("\n");
      });

      return {
        content: [{ type: "text" as const, text: `Found ${data.objects.length} packages for "${query}":\n\n${lines.join("\n\n")}` }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Error searching npm: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_package",
  "Get detailed information about a specific npm package including latest version, dependencies, download stats, size, and repository links.",
  {
    name: z.string().describe("Package name (e.g. 'express', '@types/node', 'zod')"),
  },
  async ({ name }) => {
    try {
      const [info, downloads] = await Promise.all([
        fetchJson<NpmPackageInfo>(`https://registry.npmjs.org/${encodeURIComponent(name)}`),
        fetchJson<NpmDownloads>(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(name)}`).catch(() => null),
      ]);

      const latest = info["dist-tags"]?.latest || "unknown";
      const latestVersion = info.versions?.[latest];
      const deps = latestVersion?.dependencies ? Object.keys(latestVersion.dependencies) : [];
      const size = latestVersion?.dist?.unpackedSize;
      const published = info.time?.[latest];

      const lines = [
        `# ${info.name} v${latest}`,
        "",
        info.description || "No description",
        "",
        `- **License:** ${info.license || "unknown"}`,
        `- **Latest:** ${latest} (${published ? published.split("T")[0] : "unknown"})`,
        downloads ? `- **Weekly downloads:** ${downloads.downloads.toLocaleString()}` : null,
        size ? `- **Unpacked size:** ${(size / 1024).toFixed(1)} KB` : null,
        deps.length > 0 ? `- **Dependencies (${deps.length}):** ${deps.slice(0, 15).join(", ")}${deps.length > 15 ? ` (+${deps.length - 15} more)` : ""}` : `- **Dependencies:** none`,
        info.keywords?.length ? `- **Keywords:** ${info.keywords.slice(0, 10).join(", ")}` : null,
        "",
        info.homepage ? `Homepage: ${info.homepage}` : null,
        info.repository?.url ? `Repository: ${info.repository.url.replace(/^git\+/, "")}` : null,
        `npm: https://www.npmjs.com/package/${info.name}`,
      ];

      return {
        content: [{ type: "text" as const, text: lines.filter(Boolean).join("\n") }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Error fetching package "${name}": ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "compare_packages",
  "Compare multiple npm packages side by side. Shows downloads, size, dependencies, and quality scores to help choose between alternatives.",
  {
    names: z.array(z.string()).min(2).max(10).describe("Package names to compare (2-10 packages)"),
  },
  async ({ names }) => {
    try {
      const results = await Promise.all(
        names.map(async (name) => {
          try {
            const [info, downloads, search] = await Promise.all([
              fetchJson<NpmPackageInfo>(`https://registry.npmjs.org/${encodeURIComponent(name)}`),
              fetchJson<NpmDownloads>(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(name)}`).catch(() => null),
              fetchJson<{ objects: NpmSearchObject[] }>(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(name)}&size=1`),
            ]);

            const latest = info["dist-tags"]?.latest || "unknown";
            const latestVersion = info.versions?.[latest];
            const score = search.objects[0]?.score;

            return {
              name: info.name,
              version: latest,
              description: info.description || "",
              downloads: downloads?.downloads || 0,
              deps: latestVersion?.dependencies ? Object.keys(latestVersion.dependencies).length : 0,
              size: latestVersion?.dist?.unpackedSize || 0,
              license: info.license || "unknown",
              score: score ? Math.round(score.final * 100) : 0,
              quality: score ? Math.round(score.detail.quality * 100) : 0,
              popularity: score ? Math.round(score.detail.popularity * 100) : 0,
              maintenance: score ? Math.round(score.detail.maintenance * 100) : 0,
            };
          } catch {
            return { name, version: "not found", description: "Package not found", downloads: 0, deps: 0, size: 0, license: "?", score: 0, quality: 0, popularity: 0, maintenance: 0 };
          }
        })
      );

      const header = `| Package | Version | Weekly DLs | Deps | Size | Score | License |`;
      const sep = `|---------|---------|------------|------|------|-------|---------|`;
      const rows = results.map((r) =>
        `| ${r.name} | ${r.version} | ${r.downloads.toLocaleString()} | ${r.deps} | ${r.size ? `${(r.size / 1024).toFixed(0)} KB` : "?"} | ${r.score}/100 | ${r.license} |`
      );

      const details = results.map((r) =>
        `**${r.name}:** ${r.description}\n  Quality: ${r.quality} | Popularity: ${r.popularity} | Maintenance: ${r.maintenance}`
      );

      return {
        content: [{
          type: "text" as const,
          text: `## Package Comparison\n\n${header}\n${sep}\n${rows.join("\n")}\n\n${details.join("\n\n")}`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Error comparing packages: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
