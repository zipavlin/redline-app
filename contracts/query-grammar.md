# Redline Query Grammar (v1)

Generic REST grammar shared by the collection endpoints of `report` and
`user`. Implemented in `redline-laravel` `src/Http/Query/*`; each resource
declares its whitelist (`querySchema()`) — see `api.md` for the per-resource
schema tables.

## Wire shape

Every group uses the same shape: `<group>[<target>[:<operator>]]=<value>`,
where `<target>` is an attribute, a relationship, or `relationship.attribute`.
Omitting `:<operator>` means equality.

```http
GET /report
  ?filter[status]=unresolved              # eq (default operator)
  &filter[body:like]=There is a bug       # value needs no escaping
  &filter[created_at:from]=2026-05-01     # inclusive lower bound
  &filter[created_at:to]=2026-07-31       # inclusive upper bound
  &filter[author]=<uuid>                  # bare relation == its primary key
  &filter[author.id:in]=<uuid>,<uuid>     # comma-separated OR
  &filter[author.name:like]=Zig           # relation attribute → delegates to the
                                          #   related resource's OWN schema, further
                                          #   narrowed by the owner's allowlist
                                          #   (report only exposes author.name;
                                          #   filter[author.email:like] 422s)
  &filter[comments:exists]=1              # relationship existence — 1/true or 0/false
                                          #   only; anything else 422s
  &include[]=pin
  &include[author]=id,name                # relationship, explicit field list
  &include[]=comments:count               # projection → comments_count
  &include[]=screenshot:exists            # projection → screenshot_exists
  &sort[created_at]=desc                  # repeatable; key order = precedence
  &paginate[per_page]=16                  # omit per_page entirely for every row
  &paginate[page]=1
```

Duplicate keys are significant (multiple `include[]=` entries); the frontend
serializes them with `URLSearchParams.append`.

## Groups

| Group       | Purpose | Notes |
|-------------|---------|-------|
| `filter[]`  | Constrain rows | Whitelisted per resource. `<target>[:<op>]=<value>` |
| `include[]` | Add attributes/relationships to **every** row | Base row is always `id`, `status`, `created_at`; everything else — including `body` and `author` — is include-gated. Widget and dashboard request different payloads from the same endpoint |
| `sort[]`    | `sort[<attr>]=asc\|desc`, repeatable, first key wins ties | Falls back to the resource's `defaultSort` when omitted |
| `paginate[]`| `paginate[per_page]` + `paginate[page]` | Omitting `per_page` returns **every** matching row (bounded only by optional `config('redline.api.max_rows')`, off by default); an explicit `per_page` is capped at **100** (422 outside 1..100) |
| `aggregate[]`| Lives on its own `/aggregate` endpoint only | Deliberately not a param on `index()` — index's response type stays invariant, and aggregates often need *different* filters than the rows |
| `group_by[]`| Nests the grouped-count form of an aggregate by a second column | Only affects a `:count` with no explicit value list |

## Operators

| Group         | Operators |
|---------------|-----------|
| `filter[]`    | `eq` `not` `like` `in` `not_in` `from` `to` `gt` `gte` `lt` `lte` `null` `not_null` `exists` (relationship existence) |
| `include[]`   | bare \| `count` (→ `<target>_count`) \| `exists` (→ `<target>_exists`) |
| `aggregate[]` | `count` \| `unique` |

Operator vocabularies per target type (string/date/boolean/numeric/relation)
are per-resource; a disallowed operator 422s with a message naming the target.

## filter[] semantics

- **Equality is the default**: `filter[status]=new` ≡ `filter[status:eq]=new`.
- **Comma-separated OR** for `in` / `not_in`.
- **Range**: `from`/`to` are inclusive bounds; `gt/gte/lt/lte` are strict.
- **`exists`** on a relationship → `has()` / `doesntHave()`. Only `1`/`true`
  (has) or `0`/`false` (doesn't have) are accepted; anything else 422s rather
  than silently matching neither.
- **Relation filters** (`filter[author]=<uuid>`, `filter[author.name:like]=Z`)
  delegate to the **related resource's own schema** (security boundary), and
  the delegating resource controls which related attributes are reachable via
  `relatedFilters` — `filter[author.email:like]` on /report 422s even though
  the admin /user endpoint can filter email.
- **Status groups vs concrete statuses** (report): `filter[status]` accepts a
  *group* or a *concrete* value —
  - `unresolved` → every open status (`new`, `noticed`, `progress`)
  - `resolved` → every closed status (`resolved`, `done`)
  - `done` → exactly `done`
  - so `filter[status]=resolved` is a superset of `filter[status]=done`.

## include[] semantics

- **Bare include** of a plain attribute/accessor: `include[]=title`.
- **Relation with field list**: `include[author]=id,name` — only those
  attributes are serialized. Bare relation (`include[author]`) uses the
  field's `default` set (e.g. `id,name`).
- **Projections**: `include[]=comments:count` adds `comments_count`;
  `include[]=screenshot:exists` adds `screenshot_exists`.
- **Gates**: some includes are role-gated and *silently omitted* (not an
  error) — e.g. `browser` for non-developers.
- **Accessor dependencies**: requesting an attribute whose accessor reads
  another column auto-includes the dependency (e.g. `initials` needs `name`;
  screenshot `url` needs `report_id` + `id`).
- **Fixed-shape relations** (e.g. report `comments`) ignore per-attribute
  selection and always return their canonical nested shape.

## aggregate[] semantics

- **Bucketed count with value list** — reuses the sibling `filter[]` semantics
  (so status groups resolve here too):
  `aggregate[status:count]=unresolved,resolved` → counts per bucket key.
- **Grouped count without value** — counts rows per distinct value of the
  target's column: `aggregate[location:count]` → `{ "/a": 3, "/b": 1 }`.
- **`unique`** — a distinct-value set, not a scalar:
  `aggregate[location:unique]` → `["/a", "/b"]`;
  `aggregate[author:unique]` → `[{ "id": "...", "name": "..." }]` (per schema).
- **`group_by[]`** nests the grouped-count form:
  `aggregate[location:count]&group_by[]=status` →
  `{ "/a": { "new": 1, "resolved": 1 }, "/b": { "new": 1 } }`.
  The group-by column must itself be a valid plain-column aggregate target.

## Response envelopes

| Call        | Shape |
|-------------|-------|
| `index` (unpaginated — no `per_page`) | `{ "data": [...], "meta": { "total": n } }` |
| `index` (paginated) | `{ "data": [...], "meta": { "total", "per_page", "current_page", "last_page" } }` |
| `show`      | `{ ...resource }` (shaped by `include[]`) |
| `aggregate` | `{ "<target>": { "<operator>": <scalar|object|array> } }` |

## Errors

- Unknown or non-whitelisted group/target/operator → **422**; params are never
  silently ignored. Errors are Laravel-shaped:
  `{ "message": "...", "errors": { "filter.status": ["Unknown status or status group [x]."], ... } }`
  with keys `filter.<key>`, `include.<key>`, `sort.<key>`, `paginate.per_page`,
  `aggregate.<key>`.
- A group excluded via `ResourceQuery::use()` 422s the same way if sent anyway.

## Known bounds

- One constraint per `(target, operator)` pair — `filter[status]=a&filter[status]=b`
  keeps only the last. Use `:in` for OR, `:from`/`:to` for ranges.
- No cross-target OR: `filter[screenshot:exists]=1&filter[video:exists]=1`
  means "has both", not "has either" (filters are always AND-combined).

## Examples

### 1. Widget report list (include-gated minimal payload)
```http
GET /report?include[]=pin&include[]=element&include[]=title
    &include[author]=id,name
    &filter[status]=unresolved
    &sort[created_at]=desc
    &paginate[per_page]=16&paginate[page]=1
```
```json
{
  "data": [
    {
      "id": "1f2c…", "status": "new", "created_at": "2026-07-01T10:00:00Z",
      "pin": { "x": 42.5, "y": 33.1, "prefer_selector": true, "scroll_x": 0, "scroll_y": 0 },
      "element": "div.product-card", "title": "Cart total is wrong",
      "author": { "id": "…", "name": "Jane Smith" }
    }
  ],
  "meta": { "total": 3, "per_page": 16, "current_page": 1, "last_page": 1 }
}
```

### 2. Report tab counts (aggregate, no status filter so tabs stay stable)
```http
GET /report/aggregate?aggregate[status:count]=unresolved,resolved
```
```json
{ "status": { "count": { "unresolved": 3, "resolved": 5 } } }
```

### 3. Filtering by relation attribute + relationship existence
```http
GET /report?filter[author.name:like]=Zig&filter[comments:exists]=1
    &include[]=comments:count&include[]=screenshot:exists
```
```json
{
  "data": [
    {
      "id": "…", "status": "noticed", "created_at": "…",
      "comments_count": 2, "screenshot_exists": true
    }
  ],
  "meta": { "total": 1 }
}
```
(`filter[author.email:like]=…` on this endpoint would 422 — only `name` is
exposed through the report's author filter.)

### 4. Grouped count nested by a second column
```http
GET /report/aggregate?aggregate[location:count]&group_by[]=status
```
```json
{ "location": { "count": { "/a": { "new": 1, "resolved": 1 }, "/b": { "new": 1 } } } }
```

### 5. Admin user list with projections
```http
GET /user?filter[role]=developer&include[]=initials&include[]=reports:count
    &sort[name]=asc&paginate[per_page]=25
```
```json
{
  "data": [
    { "id": "…", "status": "approved", "created_at": "…",
      "initials": "JS", "reports_count": 4 }
  ],
  "meta": { "total": 2, "per_page": 25, "current_page": 1, "last_page": 1 }
}
```