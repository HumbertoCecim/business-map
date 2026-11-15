import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

test("native UI never puts raw literal text inside layout primitives", async () => {
  const client = path.resolve("client");
  const errors: string[] = [];
  for (const filename of await readdir(client)) {
    if (!filename.endsWith(".tsx")) continue;
    const source = ts.createSourceFile(
      filename,
      await readFile(path.join(client, filename), "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    function visit(node: ts.Node) {
      if (
        ts.isJsxElement(node) &&
        [
          "View",
          "ScrollView",
          "Pressable",
          "Pane",
          "Row",
          "Disclosure",
        ].includes(node.openingElement.tagName.getText(source))
      ) {
        const children = (items: ts.NodeArray<ts.JsxChild>): ts.JsxChild[] => items.flatMap(child => ts.isJsxFragment(child) ? children(child.children) : [child]);
        for (const child of children(node.children)) {
          const rawText = ts.isJsxText(child)
            ? child.text.trim()
            : ts.isJsxExpression(child) &&
                child.expression &&
                ts.isStringLiteral(child.expression)
              ? child.expression.text
              : "";
          if (rawText) {
            const line =
              source.getLineAndCharacterOfPosition(child.getStart()).line + 1;
            errors.push(`${filename}:${line}: raw text in native layout`);
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  assert.deepEqual(errors, []);
});
