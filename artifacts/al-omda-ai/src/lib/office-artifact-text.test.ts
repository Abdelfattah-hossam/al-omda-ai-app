import test from "node:test";
import assert from "node:assert/strict";
import { getWordArtifactExpectedText } from "./office-artifact-text.js";

test("Word validation expects rendered heading and bullet text without Markdown markers", () => {
  assert.deepEqual(getWordArtifactExpectedText({
    title: "Project report",
    paragraphs: ["# Main heading", "## Secondary heading", "- First task", "* Second task", "Plain paragraph"],
    columns: ["Task", "Owner"],
    rows: [["Design", "Team A"]],
  }), [
    "Project report",
    "Main heading",
    "Secondary heading",
    "First task",
    "Second task",
    "Plain paragraph",
    "Task",
    "Owner",
    "Design",
    "Team A",
  ]);
});

test("Word validation preserves ordinary text and does not strip non-heading markers", () => {
  assert.deepEqual(getWordArtifactExpectedText({
    title: "Notes",
    paragraphs: ["### Heading", "#### Not a supported heading", "- Item"],
    columns: [],
    rows: [],
  }), ["Notes", "Heading", "#### Not a supported heading", "Item"]);
});
