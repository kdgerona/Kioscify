'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Search, X } from 'lucide-react';

interface Props {
  label: string;
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  allowCustom?: boolean;
  readOnly?: boolean;
  /** Menus couldn't be loaded: show a notice, keep typing enabled. */
  catalogFailed?: boolean;
  error?: string;
  helper?: string;
}

const CUSTOM_TITLE = 'Not in any current menu. It will match once a product with this name exists.';
const lower = (s: string) => s.trim().toLowerCase();

/** Multi-select with chips. Stores names (matched case-insensitively by the API). */
export function NamePicker({
  label,
  options,
  value,
  onChange,
  placeholder = 'Add…',
  allowCustom = true,
  readOnly,
  catalogFailed,
  error,
  helper,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // The list is portalled to <body> with fixed positioning. The editor panel is
  // sticky (its own stacking context) and the builder's sticky save bar sits on
  // top of it, so an in-place absolute list always ends up under that bar.
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const known = useMemo(() => new Set(options.map(lower)), [options]);
  const selected = useMemo(() => new Set(value.map(lower)), [value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!rootRef.current?.contains(t) && !listRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Position the portalled list next to the field: below it, or above when the
  // space below is short. Follows scrolling (any scroll container) and resizes.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const place = () => {
      const rect = fieldRef.current?.getBoundingClientRect();
      if (!rect) return;
      const GAP = 4;
      const MARGIN = 8;
      const below = window.innerHeight - rect.bottom - GAP - MARGIN;
      const above = rect.top - GAP - MARGIN;
      const up = below < 240 && above > below;
      const maxHeight = Math.max(160, Math.min(320, up ? above : below));
      setPos({
        position: 'fixed',
        zIndex: 100,
        left: rect.left,
        width: rect.width,
        maxHeight,
        ...(up ? { bottom: window.innerHeight - rect.top + GAP } : { top: rect.bottom + GAP }),
      });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, value.length]);

  // Focus search once the portalled list has mounted (it renders after positioning).
  const listReady = open && pos !== null;
  useEffect(() => {
    if (listReady) searchRef.current?.focus();
  }, [listReady]);

  const filtered = useMemo(() => {
    const q = lower(query);
    return q ? options.filter(o => o.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const typed = query.trim();
  const canAddTyped = allowCustom && typed.length > 0 && !known.has(lower(typed)) && !selected.has(lower(typed));

  const toggle = (name: string) => {
    if (selected.has(lower(name))) onChange(value.filter(v => lower(v) !== lower(name)));
    else onChange([...value, name]);
  };

  // Select all / Clear act on what the search currently shows.
  const allFilteredSelected = filtered.length > 0 && filtered.every(o => selected.has(lower(o)));
  const selectAllFiltered = () => {
    const toAdd = filtered.filter(o => !selected.has(lower(o)));
    if (toAdd.length) onChange([...value, ...toAdd]);
  };
  const clearFiltered = () => {
    if (!lower(query)) return onChange([]);
    const drop = new Set(filtered.map(lower));
    onChange(value.filter(v => !drop.has(lower(v))));
  };
  const anyFilteredSelected = lower(query) ? filtered.some(o => selected.has(lower(o))) : value.length > 0;

  const addTyped = () => {
    if (!canAddTyped) return;
    onChange([...value, typed]);
    setQuery('');
  };

  const chip = (name: string, removable: boolean) => {
    const custom = !known.has(lower(name));
    return (
      <span
        key={name}
        title={custom ? CUSTOM_TITLE : undefined}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
          custom ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-gray-100 text-gray-700'
        }`}
      >
        {name}
        {removable && (
          <button
            type="button"
            aria-label={`Remove ${name}`}
            onClick={e => {
              e.stopPropagation();
              toggle(name);
            }}
            className="hover:text-gray-900"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </span>
    );
  };

  if (readOnly) {
    return (
      <div>
        <p className="text-sm font-medium text-gray-700 mb-1">{label}</p>
        {value.length ? (
          <div className="flex flex-wrap gap-1.5">{value.map(v => chip(v, false))}</div>
        ) : (
          <p className="text-sm text-gray-400">Any</p>
        )}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <p className="block text-sm font-medium text-gray-700 mb-1">{label}</p>
      <div
        ref={fieldRef}
        role="button"
        tabIndex={0}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`min-h-[38px] w-full flex flex-wrap items-center gap-1.5 px-2 py-1.5 border rounded-lg bg-white cursor-pointer focus:outline-none focus:ring-2 ${
          error ? 'border-red-400' : 'border-gray-300'
        }`}
      >
        {value.map(v => chip(v, true))}
        <span className="inline-flex items-center gap-1 text-xs text-gray-400 px-1">
          <Plus className="w-3 h-3" /> {placeholder}
        </span>
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      {helper && !error && <p className="text-xs text-gray-400 mt-1">{helper}</p>}

      {open && pos && typeof document !== 'undefined' && createPortal(
        <div
          ref={listRef}
          className="bg-white rounded-lg border border-gray-200 shadow-lg overflow-y-auto"
          style={pos}
        >
          <div className="sticky top-0 z-10 bg-white p-2 border-b border-gray-100 space-y-1.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                ref={searchRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') setOpen(false);
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (filtered.length === 1) toggle(filtered[0]);
                    else addTyped();
                  }
                }}
                placeholder="Search…"
                className="w-full pl-7 pr-2 py-1.5 border border-gray-200 rounded text-sm outline-none focus:ring-2 focus:border-transparent"
              />
            </div>
            {filtered.length > 0 && (
              <div className="flex items-center justify-between px-1 text-xs">
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  disabled={allFilteredSelected}
                  className="font-medium text-gray-700 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-default"
                >
                  {lower(query) ? `Select all matches (${filtered.length})` : `Select all (${filtered.length})`}
                </button>
                <button
                  type="button"
                  onClick={clearFiltered}
                  disabled={!anyFilteredSelected}
                  className="text-gray-500 hover:text-gray-900 disabled:text-gray-300 disabled:cursor-default"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
          {catalogFailed && (
            <div className="m-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs p-2 rounded">
              Couldn&apos;t load the menu. You can still type names.
            </div>
          )}
          <ul id={listId} role="listbox" aria-multiselectable="true" className="py-1">
            {filtered.map(o => {
              const checked = selected.has(lower(o));
              return (
                <li key={o} role="option" aria-selected={checked}>
                  <label className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={checked} onChange={() => toggle(o)} className="w-4 h-4 rounded border-gray-300" />
                    {o}
                  </label>
                </li>
              );
            })}
            {filtered.length === 0 && !canAddTyped && (
              <li className="px-3 py-2 text-sm text-gray-400">{options.length ? 'No matches.' : 'Nothing in the menu yet.'}</li>
            )}
            {canAddTyped && (
              <li>
                <button
                  type="button"
                  onClick={addTyped}
                  className="w-full text-left px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-50"
                >
                  + Add “{typed}” anyway
                </button>
              </li>
            )}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}
