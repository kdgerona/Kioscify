"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";

export type CalendarProps = React.ComponentProps<typeof DayPicker> & {
  mode?: "single" | "range";
};

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      modifiers={{
        today: new Date(),
      }}
      modifiersClassNames={{
        today: "bg-blue-100 text-blue-900 font-bold border-2 border-blue-500",
      }}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0 relative",
        month: "space-y-4",
        month_caption: "flex justify-center pt-1 items-center mb-3 relative h-10",
        caption_label: "text-sm font-semibold text-gray-900 text-center",
        nav: "absolute top-0 left-0 right-0 flex items-center justify-between px-1 h-10 pointer-events-none",
        button_previous: "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 inline-flex items-center justify-center rounded-md transition-opacity pointer-events-auto",
        button_next: "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 inline-flex items-center justify-center rounded-md transition-opacity pointer-events-auto",
        table: "w-full border-collapse space-y-1",
        weekdays: "flex mb-1",
        weekday:
          "text-gray-700 rounded-md w-9 font-semibold text-xs uppercase flex items-center justify-center",
        week: "flex w-full mt-1",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-gray-100/50 [&:has([aria-selected])]:bg-gray-100 first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
        day: cn(
          "h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-gray-100 rounded-md inline-flex items-center justify-center text-gray-900"
        ),
        day_range_end: "day-range-end",
        day_selected:
          "bg-gray-900 text-white hover:bg-gray-900 hover:text-white focus:bg-gray-900 focus:text-white",
        day_outside:
          "day-outside text-gray-400 opacity-50 aria-selected:bg-gray-100/50 aria-selected:text-gray-500 aria-selected:opacity-30",
        day_disabled: "text-gray-400 opacity-50",
        day_range_middle:
          "aria-selected:bg-gray-100 aria-selected:text-gray-900",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
export type { DateRange };
