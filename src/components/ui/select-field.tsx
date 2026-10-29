import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from "react";

import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Radix reserves "" for "nothing chosen"; these selects use it for options like "All" or "None". */
const EMPTY = "__empty__";

const toItemValue = (value: string) => (value === "" ? EMPTY : value);
const fromItemValue = (value: string) => (value === EMPTY ? "" : value);

interface OptionEntry {
  value: string;
  label: ReactNode;
  disabled: boolean;
}

interface GroupEntry {
  label: string;
  options: OptionEntry[];
}

type Entry = OptionEntry | GroupEntry;

interface OptionElementProps {
  value?: string | number;
  disabled?: boolean;
  label?: string;
  children?: ReactNode;
}

/** Spreads fragments and arrays so options can be written exactly as for a native select. */
function elementsOf(children: ReactNode): ReactElement<OptionElementProps>[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<OptionElementProps>(child)) return [];
    if (child.type === Fragment) return elementsOf(child.props.children);
    return [child];
  });
}

function readOption(element: ReactElement<OptionElementProps>): OptionEntry {
  const { value, disabled, children } = element.props;
  return {
    value: value === undefined ? Children.toArray(children).join("") : String(value),
    label: children,
    disabled: Boolean(disabled),
  };
}

function readEntries(children: ReactNode): Entry[] {
  return elementsOf(children).flatMap((element): Entry[] => {
    if (element.type === "option") return [readOption(element)];
    if (element.type === "optgroup") {
      return [{ label: element.props.label ?? "", options: elementsOf(element.props.children).filter((child) => child.type === "option").map(readOption) }];
    }
    return [];
  });
}

function renderOption(option: OptionEntry) {
  return (
    <SelectItem key={option.value} value={toItemValue(option.value)} disabled={option.disabled} data-value={option.value}>
      {option.label}
    </SelectItem>
  );
}

export interface SelectFieldProps {
  /** Controlled value; "" is a regular option value, as on a native select. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** `<option>` (and `<optgroup>`) elements, written as for a native `<select>`. */
  children: ReactNode;
  placeholder?: ReactNode;
  size?: "sm" | "default";
  id?: string;
  name?: string;
  disabled?: boolean;
  className?: string;
  title?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

/**
 * The app's dropdown: a shadcn/ui Select fed with native-style options.
 * The trigger carries the current value in data-value, and takes the id so a
 * <label htmlFor> still names it.
 */
export function SelectField({
  value,
  defaultValue,
  onValueChange,
  children,
  placeholder,
  size = "default",
  id,
  name,
  disabled,
  className,
  title,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: SelectFieldProps) {
  const entries = readEntries(children);

  return (
    <Select
      value={value === undefined ? undefined : toItemValue(value)}
      defaultValue={defaultValue === undefined ? undefined : toItemValue(defaultValue)}
      onValueChange={(next) => onValueChange?.(fromItemValue(next))}
      name={name}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        size={size}
        className={className}
        title={title}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        data-value={value}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" sideOffset={6}>
        {entries.map((entry) =>
          "options" in entry ? (
            <SelectGroup key={`group:${entry.label}`}>
              <SelectLabel>{entry.label}</SelectLabel>
              {entry.options.map(renderOption)}
            </SelectGroup>
          ) : (
            renderOption(entry)
          )
        )}
      </SelectContent>
    </Select>
  );
}
