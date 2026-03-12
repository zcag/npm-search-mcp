# npm-search-mcp

MCP server that searches npm packages and returns live registry data. No API key needed.

## Tools

- **search_packages** — Search npm for packages by keyword. Returns names, descriptions, download counts, and links.
- **get_package** — Get detailed info about a specific package: version, dependencies, size, weekly downloads.
- **compare_packages** — Compare 2-10 packages side by side with download stats, size, and quality scores.

## Why?

AI coding assistants have stale knowledge about npm packages. This MCP server gives them live access to the npm registry — current versions, download trends, and package details updated in real-time.

## Install

### Docker

```bash
docker run -i ghcr.io/zcag/npm-search-mcp:1.0.0
```

### Claude Code

```json
{
  "mcpServers": {
    "npm-search": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "ghcr.io/zcag/npm-search-mcp:1.0.0"]
    }
  }
}
```

### From source

```bash
git clone https://github.com/zcag/npm-search-mcp.git
cd npm-search-mcp
npm install && npm run build
node dist/index.js
```

## License

MIT
