import { test } from "node:test";
import assert from "node:assert/strict";
import { ProjectStateStore, projectScope } from "../../shared/project-state";
test("draft cells share by host/project across surfaces and isolate hosts/projects", () => {
  const store = new ProjectStateStore();
  const scope = projectScope("host-a", "project-a");
  const first = store.cell(scope, "editor", () => ({
    text: "human draft",
    base: 3,
  }));
  assert.equal(store.cell(scope, "editor", null), first);
  first.value = { text: "updated draft", base: 3 };
  assert.deepEqual(store.cell(scope, "editor", null).value, {
    text: "updated draft",
    base: 3,
  });
  assert.equal(
    store.cell(projectScope("host-b", "project-a"), "editor", null).value,
    null,
  );
  assert.equal(
    store.cell(projectScope("host-a", "project-b"), "editor", null).value,
    null,
  );
  assert.equal(store.cell(scope, "snapshot", null).value, null);
  assert.notEqual(projectScope("a:b", "c"), projectScope("a", "b:c"));
});
