declare module 'react-calendar-heatmap' {
  import React from 'react';

  interface CalendarHeatmapProps {
    startDate: Date;
    endDate: Date;
    values: Array<{ date: string; count: number }>;
    classForValue: (value: { date: string; count: number } | null) => string;
    titleForValue: (value: { date: string; count: number } | null) => string;
    transformDayElement?: (element: React.ReactElement, value: { date: string; count: number } | null) => React.ReactElement;
  }

  const CalendarHeatmap: React.FC<CalendarHeatmapProps>;
  export default CalendarHeatmap;
} 