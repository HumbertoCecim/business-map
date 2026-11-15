import { test } from "node:test";
import assert from "node:assert/strict";
import { ProjectObservations } from "../../shared/observations";
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const settle = () => new Promise<void>((r) => setImmediate(r));
const fail = (error: unknown) => assert.fail(String(error));

test("project observations share one pending read and stop after the final surface closes", async () => {
  const observations = new ProjectObservations<number>();
  const read = deferred<number>();
  let calls = 0;
  const load = () => {
    calls++;
    return read.promise;
  };
  const a: number[] = [],
    b: number[] = [];
  const stopA = observations.watch(
    "host/project",
    load,
    (v) => a.push(v),
    fail,
  );
  const stopB = observations.watch(
    "host/project",
    load,
    (v) => b.push(v),
    fail,
  );
  assert.equal(calls, 1);
  stopA();
  read.resolve(3);
  await settle();
  assert.deepEqual(a, []);
  assert.deepEqual(b, [3]);
  await observations.refresh("host/project");
  assert.equal(calls, 2);
  stopB();
  await observations.refresh("host/project");
  assert.equal(calls, 2);
  observations.dispose();
});
test("a committed mutation cannot be replaced by an older in-flight read", async () => {
  const observations = new ProjectObservations<number>();
  const read = deferred<number>();
  const received: number[] = [];
  observations.watch(
    "host/project",
    () => read.promise,
    (v) => received.push(v),
    fail,
  );
  observations.publish("host/project", 2);
  read.resolve(1);
  await settle();
  assert.deepEqual(received, [2]);
  observations.dispose();
});
test("observation errors preserve the last good snapshot and remain isolated by host and project", async () => {
  const observations = new ProjectObservations<number>((next, previous) => {
    if (next < 0 && previous !== undefined)
      throw new Error("canonical file disappeared");
  });
  const values: number[] = [],
    errors: unknown[] = [];
  let next = 1;
  const stop = observations.watch(
    "hostA/project",
    async () => next,
    (v) => values.push(v),
    (e) => errors.push(e),
  );
  const other: number[] = [];
  observations.watch(
    "hostB/project",
    async () => 50,
    (v) => other.push(v),
    fail,
  );
  await settle();
  next = -1;
  await observations.refresh("hostA/project");
  assert.deepEqual(values, [1]);
  assert.equal(errors.length, 1);
  assert.deepEqual(other, [50]);
  const replay: number[] = [];
  observations.watch(
    "hostA/project",
    async () => 999,
    (v) => replay.push(v),
    () => {},
  );
  assert.deepEqual(replay, [1]);
  stop();
  observations.dispose();
  await settle();
});
test("dispose suppresses late reads even when a new observation reuses its key", async () => {
  const observations = new ProjectObservations<number>();
  const read = deferred<number>(),
    values: number[] = [];
  observations.watch(
    "host/project",
    () => read.promise,
    (v) => values.push(v),
    fail,
  );
  observations.dispose();
  observations.watch(
    "host/project",
    async () => 2,
    (v) => values.push(v),
    fail,
  );
  read.resolve(1);
  await settle();
  assert.deepEqual(values, [2]);
  observations.dispose();
});

test("the live project reader replaces a closed or outdated panel reader", async () => {
  const observations = new ProjectObservations<number>();
  let panelReads = 0,
    directoryReads = 0;
  const stopPanel = observations.watch(
    "host/project",
    async () => {
      panelReads++;
      return 1;
    },
    () => {},
    fail,
  );
  await settle();
  const stopDirectory = observations.watch(
    "host/project",
    async () => {
      directoryReads++;
      return 2;
    },
    () => {},
    fail,
    6000,
    1,
  );
  await settle();
  assert.equal(panelReads, 1);
  assert.equal(directoryReads, 1);
  stopPanel();
  await observations.refresh("host/project");
  assert.equal(panelReads, 1);
  assert.equal(directoryReads, 2);
  stopDirectory();
  await observations.refresh("host/project");
  assert.equal(directoryReads, 2);
  observations.dispose();
});
