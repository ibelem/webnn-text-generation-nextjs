import React from "react";

function formatBytes(size: number) {
  if (typeof size !== "number" || isNaN(size)) return "0B";
  const i = size === 0 ? 0 : Math.floor(Math.log(size) / Math.log(1024));
  return `${(size / Math.pow(1024, i)).toFixed(2)}${["B", "kB", "MB", "GB", "TB"][i]}`;
}

export interface ProgressProps {
  text: string;
  total?: number;
  // For multi-file progress
  file?: string;
  progress?: number;
}

export const Progress: React.FC<ProgressProps> = ({ text, total, file, progress }) => {
  const pct = typeof progress === "number" ? progress * 100 : 0;
  const label = file || text || "";
  return (
    <div className="w-full bg-gray-100 dark:bg-gray-700 text-left rounded-md overflow-hidden mb-0.5">
      <div
        className="bg-blue-400 whitespace-nowrap px-2 text-xs transition-all duration-300"
        style={{ width: `${pct}%` }}
        title={label}
      >
        {label} ({pct.toFixed(2)}%
        {typeof total === "number" && !isNaN(total) ? ` of ${formatBytes(total)}` : ""})
      </div>
    </div>
  );
};
