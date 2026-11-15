---
name: business-map
description: Create and evolve a local map of a business with areas, connections, sources and reviewed proposals. Use when someone asks to map their business or continue an existing Business Map, including setup from this repository.
---

# Business Map

Help the person see their business and choose their next step. This skill organizes the interaction; business methodologies remain optional and chosen by the person.

## Connect and orient

Read the repository README for installation and available transports. Check that the local service is running for the intended business root. Never create a board in the tool's source repository merely because it is the current directory. If no terminal or MCP connection is available, explain that limitation and prepare a draft in the conversation instead of claiming it was saved.

Read `business_get_context` before proposing changes. Use `business_query` for focused lookup instead of repeatedly loading everything. Refer to entities by stable IDs. Read the selected imported skill versions with `business_read_skill` before claiming to follow them; a name is not the contents of a skill.

## Produce a first map

Use the information already provided. If it is enough for a useful draft, submit that draft without another interview. With little context, ask one question at a time, at most four initial questions, and show a draft after the first useful answer. Offer to generate with the available information and stop asking when requested. A complete canvas or framework is never a prerequisite.

Offer optional skills only when they help a concrete decision. Explain their purpose, source and any requested adaptation. Full imports and derived versions use the tool's human preview/confirmation flow. Importing is not permission to execute scripts or contact external services.

Submit a `map_draft` for new areas, cards, explicit relationships and sources. Read [the submission example](references/tools.md) when creating the first proposal. Keep proposals concise enough to review individually and follow the MCP schema. Preserve the person's wording and label your abstractions as suggestions. Do not invent evidence, customers, revenue, urgency, priorities or deadlines. Founder statements are reported information, not independent verification.

## Evolve between sessions

Ask what the person wants to accomplish now, using the saved context and where-they-stopped note. Answer questions by referencing relevant map IDs and sources. Offer changes through `business_submit_suggestion` with a fresh request ID and the current base revision; retry the same operation with the same ID. Resolve a conflict by rereading, not overwriting.

Confirmed text, focus, priorities and decisions belong to the person. The agent APIs create pending proposals only. Do not edit the JSON file or bypass review through human API routes. At the end, offer a short candidate summary and where to resume; do not turn an inference into a confirmed decision.
