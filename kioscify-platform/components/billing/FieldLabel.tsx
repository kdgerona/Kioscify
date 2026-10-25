import { CircleHelp } from 'lucide-react';

/** A "?" that explains a setting on hover or keyboard focus. */
export function HelpTip({ text, label }: { text: string; label: string }) {
  return (
    <span className="relative inline-flex group align-middle">
      <button
        type="button"
        aria-label={`What does "${label}" do?`}
        className="text-gray-400 hover:text-gray-600 focus:text-gray-600 focus:outline-none"
      >
        <CircleHelp className="w-3.5 h-3.5" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 bottom-full z-50 mb-2 w-72 -translate-x-1/2 rounded-md bg-gray-900 px-3 py-2 text-xs font-normal leading-relaxed text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

/** Field label with a required marker (*) and an optional explanation. */
export function FieldLabel({
  label,
  required = false,
  help,
  htmlFor,
  className = 'mb-1',
}: {
  label: string;
  required?: boolean;
  help?: string;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-gray-700">
        {label}
        {required && (
          <span className="text-red-500 ml-0.5" aria-hidden="true">
            *
          </span>
        )}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {help && <HelpTip text={help} label={label} />}
    </div>
  );
}

/** Label text for a `<label>` that wraps its input (dialogs). */
export function LabelText({ label, required = false, help }: { label: string; required?: boolean; help?: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span>
        {label}
        {required && (
          <span className="text-red-500 ml-0.5" aria-hidden="true">
            *
          </span>
        )}
        {required && <span className="sr-only"> (required)</span>}
      </span>
      {help && <HelpTip text={help} label={label} />}
    </span>
  );
}
