import "katex/dist/katex.min.css";
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

/** Tutor replies: markdown with $inline$ and $$display$$ maths. */
export const TutorMarkdown = memo(function TutorMarkdown({ text }: { text: string }) {
  return (
    <div className="tutor-markdown">
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[[rehypeKatex, { throwOnError: false }]]}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
