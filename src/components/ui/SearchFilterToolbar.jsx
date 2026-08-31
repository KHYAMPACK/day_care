import { useId, useState } from 'react';

export default function SearchFilterToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Ara…',
  searchAriaLabel,
  disabled = false,
  activeFilterCount = 0,
  hasActiveFilters = false,
  onClearFilters,
  resultHint,
  children,
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="search-filter-toolbar">
      <div className="search-filter-toolbar__row">
        <input
          className="dash-input search-filter-toolbar__search"
          type="search"
          value={searchValue}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchAriaLabel ?? searchPlaceholder}
          disabled={disabled}
        />
        {children ? (
          <button
            type="button"
            className={`demo-btn demo-btn--ghost search-filter-toolbar__toggle${
              filtersOpen ? ' search-filter-toolbar__toggle--open' : ''
            }`}
            onClick={() => setFiltersOpen((open) => !open)}
            aria-expanded={filtersOpen}
            aria-controls={panelId}
            disabled={disabled}
          >
            Filtreler
            {activeFilterCount > 0 ? (
              <span className="search-filter-toolbar__badge" aria-hidden="true">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
        ) : null}
        {hasActiveFilters && onClearFilters ? (
          <button
            type="button"
            className="demo-btn demo-btn--ghost search-filter-toolbar__clear"
            onClick={onClearFilters}
            disabled={disabled}
          >
            Temizle
          </button>
        ) : null}
        {resultHint ? (
          <span className="search-filter-toolbar__hint dash-hint">{resultHint}</span>
        ) : null}
      </div>
      {children && filtersOpen ? (
        <div id={panelId} className="search-filter-toolbar__panel">
          {children}
        </div>
      ) : null}
    </div>
  );
}
