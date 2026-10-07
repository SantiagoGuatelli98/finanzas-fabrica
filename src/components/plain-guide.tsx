type GuideItem = { term: string; meaning: string };

export function PlainGuide({ title, items }: { title: string; items: GuideItem[] }) {
  return <aside className="plain-guide" aria-label={title}>
    <strong className="plain-guide-title">En simple · {title}</strong>
    <div className="plain-guide-items">{items.map((item) => <p key={item.term}><b>{item.term}</b><span>{item.meaning}</span></p>)}</div>
  </aside>;
}
