import { type KeyboardEvent, type ReactNode, useId, useMemo } from 'react';
import { renderMarkdown } from '../../lib/markdown.ts';
import styles from './editor.module.css';

export type ContentTab = 'write' | 'preview';

/** Accessible tabs (WAI-ARIA tabs pattern): arrow keys switch, only the active tab is in the tab order. */
export function ContentTabs({
  tab,
  onTabChange,
  writePanel,
  markdown,
}: {
  tab: ContentTab;
  onTabChange: (tab: ContentTab) => void;
  writePanel: ReactNode;
  markdown: string;
}) {
  const id = useId();
  const tabs: { key: ContentTab; label: string }[] = [
    { key: 'write', label: 'Write' },
    { key: 'preview', label: 'Preview' },
  ];

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const next: ContentTab = tab === 'write' ? 'preview' : 'write';
      onTabChange(next);
      document.getElementById(`${id}-${next}-tab`)?.focus();
    }
  }

  return (
    <div>
      <div role="tablist" aria-label="Content" className={styles.tabs}>
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            id={`${id}-${key}-tab`}
            type="button"
            role="tab"
            className={styles.tab}
            aria-selected={tab === key}
            aria-controls={`${id}-${key}-panel`}
            tabIndex={tab === key ? 0 : -1}
            onKeyDown={onKeyDown}
            onClick={() => {
              onTabChange(key);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        id={`${id}-write-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-write-tab`}
        hidden={tab !== 'write'}
      >
        {writePanel}
      </div>
      <div
        id={`${id}-preview-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-preview-tab`}
        hidden={tab !== 'preview'}
      >
        {tab === 'preview' && <Preview markdown={markdown} />}
      </div>
    </div>
  );
}

function Preview({ markdown }: { markdown: string }) {
  const html = useMemo(() => renderMarkdown(markdown), [markdown]);
  if (markdown.trim() === '') {
    return <p className={styles.preview}>Nothing to preview yet.</p>;
  }
  return (
    <>
      <p className={styles.hint}>
        Preview rendered in your browser; the published page is rendered by the server and may
        differ slightly.
      </p>
      {/* renderMarkdown sanitizes its output. */}
      <div className={`prose ${styles.preview}`} dangerouslySetInnerHTML={{ __html: html }} />
    </>
  );
}
