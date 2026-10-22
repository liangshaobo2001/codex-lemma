# Connector registry

The MCP servers Codexia offers as one-click connectors, one
[`server.json`](https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json)
file each. The connectors page shows **Featured** first, then the rest grouped by category.

## Layout

```
index.json         display order and categories
servers/<id>.json  one server
icons/<id>.svg     its icon, optional
schema/            vendored server.json schema
```

## Adding a server

1. Copy an existing `servers/<id>.json`. `<id>` is lowercase kebab-case.
2. Set `name` to `io.github.milisp.codexia/<id>`, keep `description` at most 100
   characters, and use an `https` remote.
3. Fill `_meta["io.modelcontextprotocol.registry/publisher-provided"]["io.github.milisp.codexia"]`:

   | Field | Meaning |
   |---|---|
   | `configName` | Key written into client config, same as `<id>` |
   | `category` | One of `index.json` `categories` |
   | `official` | `true` only if the product's own vendor publishes this server |
   | `featured` | Maintainers only. A pull request does not put a server here |
   | `access` | Short note shown on the card, e.g. "No account required" |
   | `authorizationRequired` | `true` if the user must sign in after adding |

   Never commit a real token; secret headers need `isSecret: true` and no value.
4. Optionally add `icons/<id>.svg` (plain vector with a `viewBox`, brand color in `fill`, at most 32 KB) and set `icons` to
   `[{ "src": "https://cdn.jsdelivr.net/gh/milisp/codexia@master/registry/icons/<id>.svg", "mimeType": "image/svg+xml", "sizes": ["any"] }]`.
5. Append `<id>` to `servers` in `index.json`.
6. Run `bun run validate-registry`.
7. Open a pull request. Say why it fits Codexia, what users see after clicking **Add**,
   what data is sent to your service, and your affiliation with it. Pull requests
   without this are not reviewed.

Listing is free and reviewed when a maintainer has time. For featured placement or a
joint announcement, contact the maintainer at [milisp@proton.me](mailto:milisp@proton.me) first.
