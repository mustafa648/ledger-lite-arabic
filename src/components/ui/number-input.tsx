import * as React from "react";
import { Input } from "@/components/ui/input";

export interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value: number;
  onChange: (n: number) => void;
  allowNegative?: boolean;
}

/**
 * Mobile-friendly numeric input.
 * - type="text" + inputMode="decimal" so the decimal separator is never blocked mid-typing.
 * - Keeps its own string state so intermediate values like "12." or "" work.
 */
export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ value, onChange, allowNegative, ...props }, ref) => {
    const [text, setText] = React.useState<string>(() =>
      value === 0 || value == null || Number.isNaN(value) ? "" : String(value),
    );
    React.useEffect(() => {
      const parsed = parseFloat(text);
      const same = !Number.isNaN(parsed) && parsed === value;
      if (same) return;
      if (text === "" && (!value || value === 0)) return;
      setText(value === 0 || value == null || Number.isNaN(value) ? "" : String(value));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);
    const re = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
    return (
      <Input
        ref={ref}
        {...props}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onFocus={(e) => {
          if (text === "0") setText("");
          props.onFocus?.(e);
        }}
        onChange={(e) => {
          const v = e.target.value.replace(/,/g, ".");
          if (v === "" || re.test(v)) {
            setText(v);
            const n = parseFloat(v);
            onChange(Number.isNaN(n) ? 0 : n);
          }
        }}
      />
    );
  },
);
NumberInput.displayName = "NumberInput";