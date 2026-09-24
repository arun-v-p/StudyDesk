/**
 * Form primitives with real labels.
 *
 * The audited build had 0 `<label>` elements and 0 `htmlFor` across ~20 inputs,
 * labelling everything with a placeholder that disappears on typing (WCAG 3.3.2
 * and 4.1.2). It also applied `focus:outline-none` to 19 inputs, replacing the
 * focus ring with a ~1.2:1 border shift — a WCAG 2.4.7 failure. `field-input`
 * in theme.css restores a compliant ring globally.
 */
import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

interface BaseProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  className?: string;
}

function useFieldIds(hasHint: boolean, hasError: boolean) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy =
    [hasHint && !hasError ? hintId : null, hasError ? errId : null].filter(Boolean).join(' ') ||
    undefined;
  return { id, hintId, errId, describedBy };
}

function Label({
  htmlFor,
  label,
  required,
}: {
  htmlFor: string;
  label: string;
  required?: boolean;
}) {
  return (
    <label className="field-label" htmlFor={htmlFor}>
      {label}
      {required && (
        <>
          <span aria-hidden="true" className="text-danger">
            {' '}
            *
          </span>
          <span className="sr-only"> (required)</span>
        </>
      )}
    </label>
  );
}

function Hint({
  id,
  hint,
  error,
  errId,
}: {
  id: string;
  hint?: ReactNode;
  error?: string;
  errId: string;
}) {
  if (error) {
    return (
      <span id={errId} role="alert" className="field-error">
        {error}
      </span>
    );
  }
  if (hint) {
    return (
      <span id={id} className="text-subtle mt-1.5 block text-xs">
        {hint}
      </span>
    );
  }
  return null;
}

export type TextFieldProps = BaseProps & InputHTMLAttributes<HTMLInputElement>;

export function TextField({
  label,
  hint,
  error,
  required,
  className = '',
  ...input
}: TextFieldProps) {
  const { id, hintId, errId, describedBy } = useFieldIds(Boolean(hint), Boolean(error));
  return (
    <div className={className}>
      <Label htmlFor={id} label={label} required={required} />
      <input
        id={id}
        className="field-input"
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...input}
      />
      <Hint id={hintId} hint={hint} error={error} errId={errId} />
    </div>
  );
}

export type TextAreaProps = BaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>;

export function TextArea({
  label,
  hint,
  error,
  required,
  className = '',
  ...input
}: TextAreaProps) {
  const { id, hintId, errId, describedBy } = useFieldIds(Boolean(hint), Boolean(error));
  return (
    <div className={className}>
      <Label htmlFor={id} label={label} required={required} />
      <textarea
        id={id}
        className="field-input resize-y"
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...input}
      />
      <Hint id={hintId} hint={hint} error={error} errId={errId} />
    </div>
  );
}

export interface SelectProps extends BaseProps, SelectHTMLAttributes<HTMLSelectElement> {
  options: { value: string; label: string }[];
}

export function Select({
  label,
  hint,
  error,
  required,
  options,
  className = '',
  ...select
}: SelectProps) {
  const { id, hintId, errId, describedBy } = useFieldIds(Boolean(hint), Boolean(error));
  return (
    <div className={className}>
      <Label htmlFor={id} label={label} required={required} />
      <select
        id={id}
        className="field-input"
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...select}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Hint id={hintId} hint={hint} error={error} errId={errId} />
    </div>
  );
}
