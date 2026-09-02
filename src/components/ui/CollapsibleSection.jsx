/**
 * Consistent <details> wrapper with a shared chevron for expand/collapse.
 */
export default function CollapsibleSection({
  title,
  meta,
  children,
  defaultOpen,
  variant = 'catalog',
  className = '',
  bodyClassName = '',
}) {
  const isNested = variant === 'nested';
  const isCard = variant === 'card';

  const detailsClassName = [
    'collapsible-section',
    isCard && 'collapsible-section--card cal-collapsible-form dash-card',
    (variant === 'catalog' || isNested) && 'collapsible-section--catalog cur-subject-plan__catalog',
    isNested && 'collapsible-section--nested cur-subject-plan__catalog--nested',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const summaryClassName = isCard
    ? 'collapsible-section__summary cal-collapsible-form__summary cal-browser__summary'
    : 'collapsible-section__summary cur-subject-plan__catalog-summary';

  const contentClassName = [
    'collapsible-section__body',
    isCard ? 'cal-collapsible-form__body' : 'cur-subject-plan__catalog-body',
    bodyClassName,
  ]
    .filter(Boolean)
    .join(' ');

  const titleClassName = isCard ? 'dash-section-title' : 'cur-subject-plan__catalog-title';
  const metaClassName = isCard ? 'dash-hint' : 'cur-subject-plan__catalog-meta';

  return (
    <details className={detailsClassName} defaultOpen={defaultOpen}>
      <summary className={summaryClassName}>
        <span className="collapsible-section__chevron" aria-hidden="true" />
        {isCard ? (
          <span className="cal-browser__summary-text">
            <span className={titleClassName}>{title}</span>
            {meta ? <span className={metaClassName}>{meta}</span> : null}
          </span>
        ) : (
          <span className="cur-subject-plan__catalog-copy">
            <span className={titleClassName}>{title}</span>
            {meta ? <span className={metaClassName}>{meta}</span> : null}
          </span>
        )}
      </summary>
      <div className={contentClassName}>{children}</div>
    </details>
  );
}
