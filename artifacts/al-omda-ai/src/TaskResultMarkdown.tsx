import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Task text is untrusted Markdown. Raw HTML stays disabled. */
export default function TaskResultMarkdown({ content }: { content: string }) {
  return <div className="ai-chat-markdown task-result-markdown">
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
      a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>,
      img: ({ alt }) => <span>{alt}</span>,
    }}>{content}</ReactMarkdown>
  </div>;
}
