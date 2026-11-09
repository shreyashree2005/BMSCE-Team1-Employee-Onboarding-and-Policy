import { Fragment, type ReactNode } from "react";

const CITATION = /\[(S\d{1,2})\]/g;

interface FormattedAnswerProps {
  text: string;
  /** Renders an inline citation marker such as "[S1]". Markers are left as text when omitted. */
  renderCitation?: (sourceId: string, key: string) => ReactNode;
}

/** Plain text where blank lines separate paragraphs, "- " lines form bullet lists, and [S1] markers become citation chips. */
export function FormattedAnswer({ text, renderCitation }: FormattedAnswerProps) {
  const inline = (line: string, keyPrefix: string): ReactNode[] => {
    if (!renderCitation) return [line];
    const parts = line.split(CITATION);
    return parts.map((part, i) => (i % 2 === 1 ? renderCitation(part, `${keyPrefix}-${i}`) : <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>));
  };

  return (
    <div className="space-y-2.5">
      {text.split(/\n{2,}/).map((block, blockIndex) => {
        const lines = block.split("\n").filter((line) => line.trim());
        const intro = lines.filter((line) => !/^\s*[-•*]\s+/.test(line));
        const bullets = lines.filter((line) => /^\s*[-•*]\s+/.test(line)).map((line) => line.replace(/^\s*[-•*]\s+/, ""));
        return (
          <div key={blockIndex}>
            {intro.length > 0 && <p>{inline(intro.join(" "), `p${blockIndex}`)}</p>}
            {bullets.length > 0 && (
              <ul className="mt-1.5 list-disc space-y-1 pl-5 marker:text-primary-300">
                {bullets.map((bullet, i) => (
                  <li key={i}>{inline(bullet, `b${blockIndex}-${i}`)}</li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
