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
  // Extract just the filename for display
  const shortLabel = label.includes('/') ? label.split('/').pop() || label : label;
  return (
    <div className="w-full bg-gray-100 text-left rounded-md overflow-hidden relative h-3 mt-[-3px]">
      <div
        className="bg-gradient-to-br from-blue-500 to-indigo-500 h-full transition-all duration-300 ease-out"
        style={{ width: `${Math.max(pct, 1)}%` }}
      />
      <div className="absolute inset-0 flex items-center px-2">
        <span className="text-[10px] truncate max-w-[70%] text-white" title={label}>
          {shortLabel}
        </span>
        <span className="text-[10px] ml-auto flex-shrink-0 tabular-nums text-white">
          {pct.toFixed(0)}%{typeof total === "number" && !isNaN(total) ? ` · ${formatBytes(total)}` : ""}
        </span>
      </div>
    </div>
  );
};
