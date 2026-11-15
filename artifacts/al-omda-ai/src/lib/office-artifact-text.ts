export type WordArtifactText = {
  title: string;
  paragraphs: string[];
  columns: string[];
  rows: string[][];
};

/** Text as it is emitted into Word runs after Markdown-style paragraph markers are removed. */
export function getWordArtifactExpectedText(document: WordArtifactText): string[] {
  return [
    document.title,
    ...document.paragraphs.map((value) => value.replace(/^#{1,3}\s+/, "").replace(/^[-*]\s+/, "")),
    ...document.columns,
    ...document.rows.flat(),
  ];
}
