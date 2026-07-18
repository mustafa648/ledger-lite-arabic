import * as React from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

export type SearchOption = { value: string; label: string; sub?: string };

export interface SearchSelectProps {
  value: string;
  onChange: (v: string) => void;
  options: SearchOption[];
  placeholder?: string;
  emptyText?: string;
  searchPlaceholder?: string;
  onCreate?: (query: string) => void;
  createLabel?: string;
  disabled?: boolean;
  className?: string;
}

export function SearchSelect({
  value,
  onChange,
  options,
  placeholder,
  emptyText,
  searchPlaceholder,
  onCreate,
  createLabel,
  disabled,
  className,
}: SearchSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          className={cn("w-full justify-between font-normal h-9", className)}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected?.label ?? placeholder ?? "—"}
          </span>
          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        align="start"
        style={{ width: "var(--radix-popover-trigger-width)" }}
      >
        <Command>
          <CommandInput
            placeholder={searchPlaceholder ?? placeholder ?? "..."}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>{emptyText ?? "—"}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.sub ?? ""}`}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Check
                    className={cn(
                      "me-2 h-4 w-4",
                      value === o.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{o.label}</div>
                    {o.sub && (
                      <div className="truncate text-xs text-muted-foreground">{o.sub}</div>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            {onCreate && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value={`__create__${query}`}
                    onSelect={() => {
                      onCreate(query);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <Plus className="me-2 h-4 w-4" />
                    <span className="truncate">
                      {createLabel ?? "Create new"}
                      {query ? `: "${query}"` : ""}
                    </span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}