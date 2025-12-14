"use client"

import * as React from "react"
import { CalendarIcon } from "lucide-react"
import { format, subDays, startOfMonth, endOfMonth, startOfDay, endOfDay } from "date-fns"
import { DateRange as DateRangeType } from "react-day-picker"
import { DateRangePicker as ReactDateRangePicker } from "react-date-range"
import "react-date-range/dist/styles.css"
import "react-date-range/dist/theme/default.css"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface DateRangePickerProps {
  date?: DateRangeType
  onDateChange?: (date: DateRangeType | undefined) => void
  className?: string
}

type PresetType = {
  label: string
  getValue: () => DateRangeType
}

const presets: PresetType[] = [
  {
    label: "Today",
    getValue: () => ({
      from: startOfDay(new Date()),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: "Yesterday",
    getValue: () => ({
      from: startOfDay(subDays(new Date(), 1)),
      to: endOfDay(subDays(new Date(), 1)),
    }),
  },
  {
    label: "Last 7 Days",
    getValue: () => ({
      from: startOfDay(subDays(new Date(), 6)),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: "Last 30 Days",
    getValue: () => ({
      from: startOfDay(subDays(new Date(), 29)),
      to: endOfDay(new Date()),
    }),
  },
  {
    label: "This Month",
    getValue: () => ({
      from: startOfMonth(new Date()),
      to: endOfMonth(new Date()),
    }),
  },
]

export function DateRangePicker({
  date,
  onDateChange,
  className,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false)

  const handlePresetClick = (preset: PresetType) => {
    const range = preset.getValue()
    onDateChange?.(range)
    setIsOpen(false)
  }

  const handleReset = () => {
    onDateChange?.(undefined)
    setIsOpen(false)
  }

  const handleSelect = (ranges: any) => {
    const { selection } = ranges
    const range: DateRangeType = {
      from: selection.startDate,
      to: selection.endDate,
    }

    onDateChange?.(range)

    // Close the popover when a complete range is selected
    if (selection.startDate && selection.endDate &&
        selection.startDate.getTime() !== selection.endDate.getTime()) {
      setIsOpen(false)
    }
  }

  const selectionRange = {
    startDate: date?.from || new Date(),
    endDate: date?.to || new Date(),
    key: 'selection',
  }

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              date ? "text-gray-900" : "text-gray-500"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date?.from ? (
              date.to ? (
                <>
                  {format(date.from, "MMM dd, yyyy")} -{" "}
                  {format(date.to, "MMM dd, yyyy")}
                </>
              ) : (
                format(date.from, "MMM dd, yyyy")
              )
            ) : (
              <span>Pick a date range</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex">
            <div className="border-r border-gray-200 p-3 space-y-2">
              <div className="text-xs font-semibold text-gray-700 mb-2 px-2">
                Quick Filters
              </div>
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handlePresetClick(preset)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded-md transition-colors"
                >
                  {preset.label}
                </button>
              ))}
              <button
                onClick={handleReset}
                className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors"
              >
                Clear Filter
              </button>
            </div>
            <div>
              <ReactDateRangePicker
                ranges={[selectionRange]}
                onChange={handleSelect}
                months={2}
                direction="horizontal"
                showDateDisplay={false}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
