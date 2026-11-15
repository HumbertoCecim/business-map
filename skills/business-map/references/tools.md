# Submitting a first map

Read `business_get_context` first. Use the returned `board.revision` as `baseRevision` and the board ID as a target when needed. The transport can be MCP or a JSON file passed to `business suggest --root <path> --file <file>`.

This minimal example contains a proposed area and card. Replace IDs and content for the current business; IDs must be stable within the proposal and distinct from existing entities.

```json
{
  "requestId": "initial-map-unique-operation-id",
  "sourceAgentId": "my-agent:self-declared",
  "baseRevision": 0,
  "suggestion": {
    "kind": "map_draft",
    "title": "A first business map",
    "text": "An incomplete draft for review.",
    "rationale": "Based on information already provided.",
    "mapDraft": {
      "sections": [{
        "id": "area-customers",
        "title": "People we serve",
        "questions": "Who already benefits from this offer?",
        "cards": [{
          "id": "card-first-customer",
          "title": "A possible first customer",
          "text": "Keep the founder's actual wording here.",
          "firstStep": "",
          "lane": "later",
          "done": false,
          "important": false,
          "urgent": false
        }]
      }],
      "relations": [],
      "sources": []
    }
  }
}
```

Relations use `{id,fromId,toId,label}` and must reference existing or proposed area/card IDs. Sources use `{id,kind,label,text,createdAt,url?}`; kind is `founder_statement`, `github_issue`, `log_excerpt`, `url` or `note`. Optional card `semanticType` is a free label and `sourceIds` references sources. Do not equate a founder statement or technical log with independently verified business results.

An insight can use only `kind`, `title`, `text` and `rationale`; it targets the board by default. A specific target uses `{kind:"board"|"section"|"card",id}`. All submissions remain pending. New cards are confirmed with neutral priorities; focus and priority changes belong to the person.

Retries reuse the same request ID and content. A different operation needs another ID. Read a changed revision before constructing a new proposal. Existing confirmed text is never part of a replacement map draft.
